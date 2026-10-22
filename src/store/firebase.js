import {setOutlookToken} from '../sync/outlook.js';
import {FIREBASE_CONFIG} from '../config.js';
import {S, buildInitialState, setS} from '../state.js';
import {autoConnect, setGmailToken} from '../sync/google.js';

import {renderAll} from '../main.js';
import {toast} from '../util.js';


// ═══════════════════════════════════════════════════════════════
// FIREBASE INIT
// ═══════════════════════════════════════════════════════════════
export let fbApp=null, db=null, auth=null, stateRef=null, currentUser=null;
export let _saving=false, _listenActive=false;

export function initFirebase(){
  if(!FIREBASE_CONFIG.apiKey){
    document.getElementById('authError').innerHTML='<b>Setup required:</b> Open this file in a text editor and fill in FIREBASE_CONFIG at the top. See the setup guide.';
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
// FIREBASE REALTIME DB
// ═══════════════════════════════════════════════════════════════
// Firebase key sanitization — dots/$/#/[/] are illegal in RTDB keys
export function fbEncode(obj){
  if(obj===null||obj===undefined||typeof obj!=='object')return obj;
  if(Array.isArray(obj))return obj.map(fbEncode);
  const out={};
  for(const[k,v]of Object.entries(obj)){
    const ek=k.replace(/\./g,'__dot__').replace(/\$/g,'__dlr__').replace(/#/g,'__hash__').replace(/\[/g,'__lb__').replace(/\]/g,'__rb__');
    out[ek]=fbEncode(v);
  }
  return out;
}
export function fbDecode(obj){
  if(obj===null||obj===undefined||typeof obj!=='object')return obj;
  if(Array.isArray(obj))return obj.map(fbDecode);
  const out={};
  for(const[k,v]of Object.entries(obj)){
    const dk=k.replace(/__dot__/g,'.').replace(/__dlr__/g,'$').replace(/__hash__/g,'#').replace(/__lb__/g,'[').replace(/__rb__/g,']');
    out[dk]=fbDecode(v);
  }
  return out;
}

export function startListening(){
  if(_listenActive)return;
  _listenActive=true;
  stateRef.on('value',snap=>{
    if(_saving){_saving=false;return;}
    const data=snap.val();
    if(!data){
      setS(buildInitialState());
      _saving=true;
      stateRef.set(fbEncode(S));
    } else {
      setS(fbDecode(data));
      // ensure arrays exist (Firebase drops empty arrays)
      S.companies=S.companies||[];
      S.advisors=S.advisors||[];
      S.people=S.people||[];
      S.unmatched=S.unmatched||[];
      S.customLists=S.customLists||[];
      S.dismissed=S.dismissed||{};
      S.dismissedUnmatched=S.dismissedUnmatched||{};
      S.senderMap=S.senderMap||{};
      S.threadsDone=S.threadsDone||{};
      S.threadsState=S.threadsState||{};
    }
    renderAll();
  });
}

export function save(){
  if(!stateRef)return;
  pushUndo();
  _saving=true;
  stateRef.set(fbEncode(S));
}

// Debounced save for rapid edits
export let _saveTimer=null;
export function saveDebounced(){
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(save,300);
}
// ── Rückgängig: Schnappschuss vor jedem Speichern ──
export const _undoStack=[];let _undoBusy=false;
export function pushUndo(){try{if(_undoBusy)return;const snap=JSON.stringify(S);if(_undoStack.length&&_undoStack[_undoStack.length-1]===snap)return;_undoStack.push(snap);if(_undoStack.length>25)_undoStack.shift();const b=document.getElementById('undoBtn');if(b){b.style.display='inline-block';b.textContent='Undo ('+_undoStack.length+')'}}catch(e){}}
export function undoLast(){if(!_undoStack.length){toast('Nothing to undo');return}const snap=_undoStack.pop();_undoBusy=true;try{const prev=JSON.parse(snap);Object.keys(S).forEach(k=>delete S[k]);Object.assign(S,prev);save();renderAll();toast('Letzte Änderung rückgängig gemacht')}finally{_undoBusy=false}const b=document.getElementById('undoBtn');if(b){b.textContent='Undo ('+_undoStack.length+')';if(!_undoStack.length)b.style.display='none'}}
