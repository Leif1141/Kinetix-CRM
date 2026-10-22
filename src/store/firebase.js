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
  pushUndo();
  const next=shard(S);
  const ops=diffTree(lastTree||{},next);
  lastTree=next;
  const paths=Object.keys(ops);
  if(!paths.length)return;
  const enc={};for(const p of paths)enc[encodePath(p)]=encodeKeys(ops[p]);
  window.__lastOps=ops;
  stateRef.update(enc).catch(e=>{toast('Save failed: '+e.message);console.error('save',e)});
}

// Debounced save for rapid edits
export let _saveTimer=null;
export function saveDebounced(){
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(save,300);
}
// ── Undo: snapshot before every save ──
export const _undoStack=[];let _undoBusy=false;
export function pushUndo(){try{if(_undoBusy)return;const snap=JSON.stringify(S);if(_undoStack.length&&_undoStack[_undoStack.length-1]===snap)return;_undoStack.push(snap);if(_undoStack.length>25)_undoStack.shift();const b=document.getElementById('undoBtn');if(b){b.style.display='inline-block';b.textContent='Undo ('+_undoStack.length+')'}}catch(e){}}
export function undoLast(){if(!_undoStack.length){toast('Nothing to undo');return}const snap=_undoStack.pop();_undoBusy=true;try{const prev=JSON.parse(snap);Object.keys(S).forEach(k=>delete S[k]);Object.assign(S,prev);save();renderAll();toast('Last change undone')}finally{_undoBusy=false}const b=document.getElementById('undoBtn');if(b){b.textContent='Undo ('+_undoStack.length+')';if(!_undoStack.length)b.style.display='none'}}
export function lastKnownTree(){return lastTree}
