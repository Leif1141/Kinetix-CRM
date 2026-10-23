// Per-record store layout.
//
// In memory the app keeps the historical state shape S (arrays of records with their touches inside,
// maps and flags at the top level). In Firebase the same data lives sharded:
//
//   crm/companies/{id}   crm/advisors/{id}   crm/people/{id}     record without touches
//   crm/touches/{recId}/{touchKey}                                one touch per node
//   crm/threads/{threadId}                                        open-items threads
//   crm/inbox/{key}                                               unmatched sender items
//   crm/dash/todos/{id}  crm/dash/progress/{k}  crm/dash/decisions/{k}  crm/dash/meta/{field}
//   crm/meta/{mapName}/{key}   crm/meta/flags/{flag}   crm/meta/lists/{name}   crm/meta/extra/{key}
//
// shard(S) builds that tree, unshard(tree) rebuilds S, diffTree(prev,next) yields the multi-location
// update for the fields that changed, legacyExport(S) is the historical KinetixCRM Backup.json shape.
// List order inside threads and the dash lists is kept in a per-item `_ord` number.

const ENC=k=>String(k).replace(/\./g,'__dot__').replace(/\$/g,'__dlr__').replace(/#/g,'__hash__').replace(/\[/g,'__lb__').replace(/\]/g,'__rb__').replace(/\//g,'__sl__');
const DEC=k=>String(k).replace(/__dot__/g,'.').replace(/__dlr__/g,'$').replace(/__hash__/g,'#').replace(/__lb__/g,'[').replace(/__rb__/g,']').replace(/__sl__/g,'/');
export function encodeKey(k){return ENC(k)}
export function decodeKey(k){return DEC(k)}
export function encodeKeys(o){if(o===null||o===undefined||typeof o!=='object')return o;if(Array.isArray(o))return o.map(encodeKeys);const out={};for(const[k,v]of Object.entries(o))out[ENC(k)]=encodeKeys(v);return out}
export function decodeKeys(o){if(o===null||o===undefined||typeof o!=='object')return o;if(Array.isArray(o))return o.map(decodeKeys);const out={};for(const[k,v]of Object.entries(o))out[DEC(k)]=decodeKeys(v);return out}
export function encodePath(p){return p.split('/').map(ENC).join('/')}

export const REC_COLLS={companies:'target',advisors:'advisor',people:'person'};
export const META_MAPS=['senderMap','geoCache','dismissed','dismissedUnmatched','ignoredSenders','ignoredDomains','appliedPatchTitles','appliedPatches','threadsDone','threadsState','emailMap','snoozeUntil'];
export const META_FLAGS=['lastSync','lastBackup','lastDriveBackup','_lastSnapshotWeek','_driveArchiveId','granolaFolderId','seedVer','chanMigV1','prevCleanV1','showArchived','locRadius','outreachTarget'];
export const META_LISTS=['customLists','_openLists'];
export const DASH_LISTS={todos:t=>'t'+String(t.id),progress:p=>'p'+hash((p.d||'')+'|'+(p.desc||'')),decisions:d=>'d'+hash(d.decision||'')};
export const DASH_LIST_NAMES=Object.keys(DASH_LISTS);

export function hash(s){let h=5381;s=String(s);for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)}
export const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function stableStringify(v){
  if(v===undefined)return 'null';
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stableStringify).join(',')+']';
  const ks=Object.keys(v).filter(k=>v[k]!==undefined).sort();
  return '{'+ks.map(k=>JSON.stringify(k)+':'+stableStringify(v[k])).join(',')+'}';
}
// Firebase drops null, undefined, empty arrays and empty objects. The tree mirrors that so that the echo of
// our own write compares equal to what we sent.
export function prune(v){
  if(v===null||v===undefined)return undefined;
  if(Array.isArray(v)){const a=v.map(prune);while(a.length&&a[a.length-1]===undefined)a.pop();const b=a.map(x=>x===undefined?null:x);return b.length?b:undefined}
  if(typeof v==='object'){const o={};for(const[k,x]of Object.entries(v)){const p=prune(x);if(p!==undefined)o[k]=p}return Object.keys(o).length?o:undefined}
  return v;
}

// Give every item of a list an `_ord` so the stored object can be read back in order. Items that
// already carry a consistent order keep it; a new item gets a number between its neighbours; only a
// genuinely reordered list is renumbered (which rewrites every item once).
export function ensureOrder(arr){
  arr=arr||[];
  const ords=arr.map(x=>(x&&typeof x._ord==='number')?x._ord:undefined);
  for(let i=0;i<arr.length;i++){
    if(ords[i]!==undefined||!isObj(arr[i]))continue;
    let lo=null,hi=null;
    for(let j=i-1;j>=0;j--)if(ords[j]!==undefined){lo=ords[j];break}
    for(let j=i+1;j<arr.length;j++)if(ords[j]!==undefined){hi=ords[j];break}
    ords[i]=lo===null&&hi===null?0:lo===null?hi-1:hi===null?lo+1:(lo+hi)/2;
    arr[i]._ord=ords[i];
  }
  let ok=true;for(let i=1;i<arr.length;i++)if(!(ords[i]>ords[i-1])){ok=false;break}
  if(!ok)arr.forEach((x,i)=>{if(isObj(x))x._ord=i});
  return arr;
}
export function keyList(arr,keyFn){const out={};ensureOrder(arr).forEach(x=>{if(isObj(x))out[keyFn(x)]=x});return out}
export function listFromKeyed(obj){return Object.values(obj||{}).filter(isObj).sort((a,b)=>(a._ord??0)-(b._ord??0))}

export function shard(S){
  const t={};
  for(const coll of Object.keys(REC_COLLS)){
    t[coll]={};
    for(const r of (S[coll]||[])){
      if(!r||!r.id)continue;
      const {touches,...rest}=r;
      t[coll][r.id]=rest;
      if(touches&&Object.keys(touches).length){t.touches=t.touches||{};t.touches[r.id]=touches}
    }
  }
  t.threads=keyList(S.threads,x=>x.id||('h'+hash(x.name||'')));
  t.inbox={};(S.unmatched||[]).forEach(u=>{if(isObj(u))t.inbox[u.key||('h'+hash((u.date||'')+(u.subject||'')))]=u});
  const d=S.dash||{};
  t.dash={meta:{}};
  for(const name of DASH_LIST_NAMES)t.dash[name]=keyList(d[name],DASH_LISTS[name]);
  for(const[k,v]of Object.entries(d))if(!DASH_LIST_NAMES.includes(k))t.dash.meta[k]=v;
  t.meta={flags:{},lists:{},extra:{}};
  for(const m of META_MAPS)if(S[m]!==undefined)t.meta[m]=S[m];
  for(const f of META_FLAGS)if(S[f]!==undefined)t.meta.flags[f]=S[f];
  for(const l of META_LISTS)if(S[l]!==undefined)t.meta.lists[l]=S[l];
  const known=new Set([...Object.keys(REC_COLLS),'threads','unmatched','dash',...META_MAPS,...META_FLAGS,...META_LISTS]);
  for(const[k,v]of Object.entries(S))if(!known.has(k))t.meta.extra[k]=v;
  return prune(t)||{};
}

export function unshard(tree){
  tree=tree||{};
  const S={};
  for(const coll of Object.keys(REC_COLLS)){
    S[coll]=Object.values(tree[coll]||{}).filter(isObj).map(r=>{const tc=(tree.touches||{})[r.id];return tc?{...r,touches:tc}:{...r}});
  }
  S.threads=listFromKeyed(tree.threads);
  S.unmatched=Object.values(tree.inbox||{}).filter(isObj);
  const d=tree.dash||{};
  S.dash={...(d.meta||{})};
  for(const name of DASH_LIST_NAMES)S.dash[name]=listFromKeyed(d[name]);
  const m=tree.meta||{};
  for(const name of META_MAPS)if(m[name]!==undefined)S[name]=m[name];
  Object.assign(S,m.flags||{},m.lists||{},m.extra||{});
  return S;
}

// Multi-location update: {path: value|null}. Records, touches, threads and dash items diff per field,
// meta maps per key, dash meta per field, inbox items whole.
// Same equality as comparing stableStringify() output, without building strings: undefined and null are
// equal as values, object keys holding undefined are ignored, a null-valued key differs from a missing one.
export function sameValue(a,b){
  if(a===b)return true;
  const nul=v=>v===undefined||v===null||(typeof v==='number'&&!isFinite(v)); // JSON writes all of these as null
  const an=nul(a),bn=nul(b);
  if(an||bn)return an&&bn;
  if(typeof a!=='object'||typeof b!=='object')return false;
  const aa=Array.isArray(a),ba=Array.isArray(b);if(aa!==ba)return false;
  if(aa){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!sameValue(a[i],b[i]))return false;return true}
  let na=0,nb=0;
  for(const k in a){if(a[k]===undefined)continue;na++;if(!(k in b)||b[k]===undefined)return false;if(!sameValue(a[k],b[k]))return false}
  for(const k in b){if(b[k]!==undefined)nb++}
  return na===nb;
}
const DEPTH={companies:3,advisors:3,people:3,touches:3,threads:3,inbox:2,dash:{todos:3,progress:3,decisions:3,meta:2},meta:3};
export function diffTree(prev,next){
  const ops={};
  const walk=(a,b,path,limit)=>{
    if(limit===0||!isObj(a)&&!isObj(b)||(isObj(a)!==isObj(b))){
      if(!sameValue(a,b))ops[path]=b===undefined?null:b;
      return;
    }
    if(isObj(a)&&isObj(b)&&sameValue(a,b))return;
    if(!isObj(a)||!isObj(b)){ // one side missing: emit children of the other
      const src=isObj(b)?b:a;
      for(const k of Object.keys(src))walk(isObj(a)?a[k]:undefined,isObj(b)?b[k]:undefined,path?path+'/'+k:k,typeof limit==='number'?limit-1:limit[k]);
      return;
    }
    for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],path?path+'/'+k:k,typeof limit==='number'?limit-1:(limit&&limit[k])||2);
  };
  prev=prev||{};next=next||{};
  for(const k of new Set([...Object.keys(prev),...Object.keys(next)]))walk(prev[k],next[k],k,DEPTH[k]||2);
  return ops;
}

// The historical blob layout stores the record arrays under crm/companies etc. The SDK hands arrays
// back as arrays; a raw tree has numeric keys.
export function isLegacyBlob(data){
  if(!data||typeof data!=='object')return false;
  const c=data.companies;
  if(Array.isArray(c))return true;
  if(isObj(c)){const ks=Object.keys(c);return ks.length>0&&ks.every(k=>/^\d+$/.test(k))}
  return Array.isArray(data.advisors)||Array.isArray(data.people);
}

// Today's KinetixCRM Backup.json shape: S without the internal `_ord` fields.
export function legacyExport(S){
  const strip=arr=>(arr||[]).map(x=>{if(!isObj(x))return x;const {_ord,...rest}=x;return rest});
  const out={...S};
  if(out.threads)out.threads=strip(out.threads);
  if(out.dash){out.dash={...out.dash};for(const name of DASH_LIST_NAMES)if(out.dash[name])out.dash[name]=strip(out.dash[name])}
  return out;
}
export function ensureDefaults(S){
  S.companies=S.companies||[];S.advisors=S.advisors||[];S.people=S.people||[];
  S.unmatched=S.unmatched||[];S.customLists=S.customLists||[];
  S.dismissed=S.dismissed||{};S.dismissedUnmatched=S.dismissedUnmatched||{};S.senderMap=S.senderMap||{};
  S.threadsDone=S.threadsDone||{};S.threadsState=S.threadsState||{};
  return S;
}
