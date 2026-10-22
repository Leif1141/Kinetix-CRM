import {setOutlookToken} from '../sync/outlook.js';
import {FIREBASE_CONFIG} from '../config.js';
import {S, buildInitialState, setS, findRec} from '../state.js';
import {autoConnect, setGmailToken} from '../sync/google.js';
import {renderAll} from '../main.js';
import {toast} from '../util.js';
import {invalidateThreads} from '../views/threads.js';
import {shard, unshard, diffTree, encodeKeys, decodeKeys, encodePath, decodeKey, stableStringify, isLegacyBlob, ensureDefaults, REC_COLLS, DASH_LIST_NAMES, DASH_LISTS, META_MAPS, isObj, listFromKeyed} from './shards.js';

// ═══════════════════════════════════════════════════════════════
// FIREBASE INIT
// ═══════════════════════════════════════════════════════════════
export let fbApp=null, db=null, auth=null, stateRef=null, currentUser=null;
export let _listenActive=false;
export let legacyMode=false;   // database still holds the pre-phase-1 blob: read-only until tools/migrate.html has run
let lastTree=null;             // the server tree as this client last knew it (decoded keys)

export function initFirebase(){
  if(!FIREBASE_CONFIG.apiKey){
    document.getElementById('authError').innerHTML='<b>Setup required:</b> fill in FIREBASE_CONFIG in src/config.js.';
    return false;
  }
  fbApp=firebase.initializeApp(FIREBASE_CONFIG);
  db=firebase.database();
  auth=firebase.auth();
  try{auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)}catch(e){console.warn('persistence',e)}
  stateRef=db.ref('crm');
  return true;
}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
export function signIn(){
  const provider=new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(()=>auth.signInWithPopup(provider))
    .catch(e=>{
      const c=(e&&e.code)||'';
      if(c.indexOf('popup')>-1||c.indexOf('cancelled-popup')>-1){auth.signInWithRedirect(provider);return}
      document.getElementById('authError').textContent='Sign-in failed: '+e.message;
    });
}
export function signOut(){
  auth.signOut();
  setGmailToken(null);setOutlookToken(null);
  document.getElementById('appScreen').style.display='none';
  document.getElementById('authScreen').style.display='flex';
}
export function showApp(user){
  currentUser=user;
  document.getElementById('authScreen').style.display='none';
  document.getElementById('appScreen').style.display='block';
  document.getElementById('userName').textContent=user.displayName||user.email;
  startListening();
  setTimeout(autoConnect,900);
}

// ═══════════════════════════════════════════════════════════════
// FIREBASE REALTIME DB: per-record store (see shards.js for the layout)
// ═══════════════════════════════════════════════════════════════
export const fbEncode=encodeKeys;
export const fbDecode=decodeKeys;

export async function startListening(){
  if(_listenActive)return;
  _listenActive=true;
  let data;
  try{data=(await stateRef.once('value')).val()}catch(e){toast('Database read failed: '+e.message);console.error(e);return}
  if(!data){
    setS(ensureDefaults(buildInitialState()));
    lastTree=shard(S);
    await stateRef.set(encodeKeys(lastTree));
  }else if(isLegacyBlob(data)){
    legacyMode=true;
    setS(ensureDefaults(decodeKeys(data)));
    setSyncStatus('Database in old layout: read-only until the migration (tools/migrate.html) has run');
    renderAll();
    return;
  }else{
    lastTree=decodeKeys(data);
    setS(ensureDefaults(unshard(lastTree)));
  }
  renderAll();
  attachListeners();
}
function setSyncStatus(txt){const el=document.getElementById('syncStatus');if(el)el.textContent=txt}

// Collections listened to per child. Each event carries one record, one record's touch map, one thread,
// one inbox item, one dash item, one dash meta field or one meta map.
const CHILD_COLLS=['companies','advisors','people','touches','threads','inbox','dash/todos','dash/progress','dash/decisions','dash/meta','meta'];
function attachListeners(){
  for(const path of CHILD_COLLS){
    const ref=stateRef.child(path);
    ref.on('child_added',s=>onRemote(path,s.key,s.val()));
    ref.on('child_changed',s=>onRemote(path,s.key,s.val()));
    ref.on('child_removed',s=>onRemote(path,s.key,null));
  }
}
function treeGet(path){let n=lastTree;for(const s of path.split('/')){if(!isObj(n))return undefined;n=n[s]}return n}
function treeSet(path,value){
  const ss=path.split('/');let n=lastTree;
  for(let i=0;i<ss.length-1;i++){if(!isObj(n[ss[i]]))n[ss[i]]={};n=n[ss[i]]}
  if(value===null||value===undefined)delete n[ss[ss.length-1]];else n[ss[ss.length-1]]=value;
}
let _renderTimer=null;
function scheduleRender(){clearTimeout(_renderTimer);_renderTimer=setTimeout(()=>{try{renderAll()}catch(e){console.error(e)}},120)}

// A remote change (or the echo of our own write). Anything equal to what we already hold is ignored,
// so our own writes never re-render and never clobber unsaved local edits.
export function onRemote(path,rawKey,rawValue){
  if(!lastTree||!S)return;
  const key=decodeKey(rawKey);const value=rawValue===null?undefined:decodeKeys(rawValue);
  const prev=treeGet(path+'/'+key);
  if(stableStringify(prev)===stableStringify(value))return;
  treeSet(path+'/'+key,value);
  try{applyRemote(path,key,value,prev)}catch(e){console.error('applyRemote',path,key,e)}
  scheduleRender();
}
function syncFields(target,prev,next,skip){
  // set the fields that differ between prev and next on target; leave everything else (local, unsaved) alone
  const keys=new Set([...Object.keys(prev||{}),...Object.keys(next||{})]);
  for(const k of keys){
    if(skip&&skip.includes(k))continue;
    const a=prev?prev[k]:undefined,b=next?next[k]:undefined;
    if(stableStringify(a)===stableStringify(b))continue;
    if(b===undefined)delete target[k];else target[k]=b;
  }
}
function replaceInList(arr,idx,item){if(item===undefined){if(idx>=0)arr.splice(idx,1)}else if(idx>=0){syncFields(arr[idx],arr[idx],item)}else arr.push(item)}
function applyRemote(path,key,value,prev){
  if(REC_COLLS[path]){
    const arr=S[path];const idx=arr.findIndex(r=>r&&r.id===key);
    if(value===undefined){if(idx>=0)arr.splice(idx,1);return}
    if(idx>=0){syncFields(arr[idx],prev,value,['touches']);return}
    const rec={...value};const tc=treeGet('touches/'+key);if(tc)rec.touches={...tc};
    if(!rec.touches)rec.touches={};
    arr.push(rec);return;
  }
  if(path==='touches'){
    const rec=findRec(key);if(!rec)return;   // record not here yet; its touches arrive with it
    rec.touches=rec.touches||{};
    syncFields(rec.touches,prev,value);
    return;
  }
  if(path==='threads'){
    S.threads=S.threads||[];
    replaceInList(S.threads,S.threads.findIndex(t=>t&&t.id===key),value);
    S.threads.sort((a,b)=>(a._ord??0)-(b._ord??0));invalidateThreads();return;
  }
  if(path==='inbox'){
    S.unmatched=S.unmatched||[];
    replaceInList(S.unmatched,S.unmatched.findIndex(u=>u&&(u.key||'')===key),value);return;
  }
  if(path.startsWith('dash/')){
    const name=path.slice(5);S.dash=S.dash||{};
    if(name==='meta'){if(value===undefined)delete S.dash[key];else S.dash[key]=value;return}
    S.dash[name]=S.dash[name]||[];
    const keyFn=DASH_LISTS[name];
    replaceInList(S.dash[name],S.dash[name].findIndex(x=>x&&keyFn(x)===key),value);
    S.dash[name].sort((a,b)=>(a._ord??0)-(b._ord??0));return;
  }
  if(path==='meta'){
    if(key==='flags'||key==='lists'||key==='extra'){syncFields(S,prev,value);return}
    if(value===undefined)delete S[key];else{S[key]=S[key]&&isObj(S[key])?S[key]:{};syncFields(S[key],prev,value)}
    return;
  }
}

// Write only what changed: the in-memory state is sharded and diffed against the last known server tree,
// and the differing fields go out as one multi-location update.
export function save(){
  if(!stateRef)return;
  if(legacyMode){toast('Read-only: the database is still in the old layout. Run tools/migrate.html first.');return}
  const next=shard(S);
  const ops=diffTree(lastTree||{},next);
  const paths=Object.keys(ops);
  if(!paths.length)return;
  recordUndo(ops);
  const enc={};for(const p of paths)enc[encodePath(p)]=encodeKeys(ops[p]);
  window.__lastOps=ops;
  // The server tree advances only once the write is accepted. A rejected write (rules, invalid data, offline)
  // is reported and stays pending: the next save diffs against the old tree and sends it again.
  const base=lastTree;lastTree=next;
  const fail=e=>{if(lastTree===next)lastTree=base;window.__lastSaveError=String(e&&e.message||e);console.error('save rejected',paths,e);toast('Save failed: '+(e&&e.message||e)+'. It is sent again with the next change.')};
  try{Promise.resolve(stateRef.update(enc)).then(()=>{window.__lastSaveOk=new Date().toISOString()},fail)}catch(e){fail(e)}
}
// Read one path straight from the server, bypassing the local tree. Used to confirm that a write landed.
export async function serverGet(path){if(!stateRef)return undefined;const v=(await stateRef.child(encodePath(path)).once('value')).val();return v===null?undefined:decodeKeys(v)}

// Debounced save for rapid edits
export let _saveTimer=null;
export function saveDebounced(){
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(save,300);
}
// ── Undo: before each save the fields about to change are stored with their previous values (from the last
// known server tree). An undo writes those values back as one small update instead of rewriting the state. ──
export const _undoStack=[];let _undoBusy=false;
function updateUndoBtn(){const b=document.getElementById('undoBtn');if(!b)return;b.textContent='Undo ('+_undoStack.length+')';b.style.display=_undoStack.length?'inline-block':'none'}
function recordUndo(ops){try{if(_undoBusy)return;const paths=Object.keys(ops);if(!paths.length)return;const inv={};for(const p of paths){const v=treeGet(p);inv[p]=v===undefined?null:JSON.parse(JSON.stringify(v))}_undoStack.push(inv);if(_undoStack.length>25)_undoStack.shift();updateUndoBtn()}catch(e){}}
function treeApply(tree,path,value){const parts=path.split('/');let n=tree;for(const s of parts.slice(0,-1)){if(!isObj(n[s]))n[s]={};n=n[s]}const last=parts[parts.length-1];if(value===null||value===undefined)delete n[last];else n[last]=value}
export function pushUndo(){} // kept for callers; undo entries are recorded inside save()
export function undoLast(){if(!_undoStack.length){toast('Nothing to undo');return}const inv=_undoStack.pop();_undoBusy=true;try{const tree=JSON.parse(JSON.stringify(lastTree||{}));for(const [p,v] of Object.entries(inv))treeApply(tree,p,v);const prev=ensureDefaults(unshard(tree));Object.keys(S).forEach(k=>delete S[k]);Object.assign(S,prev);save();renderAll();toast('Last change undone')}finally{_undoBusy=false}updateUndoBtn()}
export function lastKnownTree(){return lastTree}
