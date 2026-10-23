import {invalidateShares} from './shares.js';
import {ALLOWED_EMAILS} from './config.js';
import {S, migrateChannels, migrateStages, withRenderCache} from './state.js';

import {invalidateThreads, renderThreads, threadsMyMoveCount} from './views/threads.js';
import {auth, currentUser, initFirebase, showApp} from './store/firebase.js';
import {dashRefresh, dashBadge} from './views/dash.js';
import {migratePrevClean} from './sync/triage.js';
import {renderData} from './views/data.js';
import {renderHome, initHome, homeUrgentCount} from './views/home.js';
import {initRecordPage, refreshRecordPage} from './views/record.js';
import {initPalette} from './views/palette.js';
import {undoLast} from './store/firebase.js';
import {renderGlobalSearch} from './views/search.js';
import {renderInbox} from './views/inbox.js';
import {renderLocations} from './views/map.js';
import {renderOrgs} from './views/orgs.js';
import {renderPeople} from './views/people.js';
import {renderPipeline} from './views/pipeline.js';
import {renderReports, renderYield} from './views/reports.js';
import * as _m0 from './config.js';
import * as _m1 from './seed.js';
import * as _m2 from './constants.js';
import * as _m3 from './state.js';
import * as _m4 from './store/firebase.js';
import * as _m5 from './views/record.js';
import * as _m6 from './views/reports.js';
import * as _m7 from './views/orgs.js';
import * as _m8 from './views/people.js';
import * as _m9 from './sync/google.js';
import * as _m10 from './sync/outlook.js';
import * as _m11 from './util.js';
import * as _m12 from './sync/match.js';
import * as _m13 from './sync/triage.js';
import * as _m14 from './sync/granola.js';
import * as _m15 from './sync/index.js';
import * as _m16 from './views/ui.js';
import * as _m17 from './views/home.js';
import * as _m18 from './views/home.js';
import * as _m19 from './shares.js';
import * as _m20 from './views/search.js';
import * as _m21 from './views/lists.js';
import * as _m22 from './views/pipeline.js';
import * as _m23 from './views/actions.js';
import * as _m24 from './data/threads-seed.js';
import * as _m25 from './views/threads.js';
import * as _m26 from './views/inbox.js';
import * as _m27 from './views/data.js';
import * as _m28 from './store/export.js';
import * as _m29 from './sync/patch.js';
import * as _m30 from './sync/drive.js';
import * as _m31 from './views/map.js';
import * as _m32 from './views/dash.js';
// Compatibility layer: the markup still uses inline onclick handlers, so every module export is reachable as a
// window property (live getter, read-only). New views use addEventListener and do not need this.
const _mods=[_m0, _m1, _m2, _m3, _m4, _m5, _m6, _m7, _m8, _m9, _m10, _m11, _m12, _m13, _m14, _m15, _m16, _m17, _m18, _m19, _m20, _m21, _m22, _m23, _m24, _m25, _m26, _m27, _m28, _m29, _m30, _m31, _m32];
function _expose(ns){for(const k of Object.keys(ns)){try{Object.defineProperty(window,k,{get:()=>ns[k],configurable:true})}catch(e){console.warn('expose',k,e)}}}
_mods.forEach(_expose);
_expose({goTab,renderAll,renderView,updateBadges,viewIsStale,activeView});
// inline filter fields call these renderers directly; run them inside the render cache too
{const C=fn=>(...a)=>withRenderCache(()=>fn(...a));_expose({renderOrgs:C(renderOrgs),renderPeople:C(renderPeople),renderPipeline:C(renderPipeline),renderThreads:C(renderThreads),renderGlobalSearch:C(renderGlobalSearch),renderLocations:C(renderLocations),renderHome:C(renderHome)})}


export function goTab(t){if(t==='followups'||t==='overview')t='home';document.querySelector('.tab[data-t="'+t+'"]')?.click()}
// Views by tab. A change marks every view stale; only the visible one renders at once, the others
// render when their tab is opened. Badges are counted separately so hidden tabs stay current.
export const VIEWS={
  home:()=>{renderHome();renderGlobalSearch()},
  orgs:renderOrgs, people:renderPeople, pipeline:renderPipeline, threads:renderThreads, inbox:renderInbox,
  locations:renderLocations, reports:()=>{renderYield();renderReports()}, data:renderData, dash:dashRefresh
};
const _stale=new Set(Object.keys(VIEWS));
export function activeView(){const t=document.querySelector('#tabs .tab.active');return t?t.dataset.t:'home'}
export function viewIsStale(name){return _stale.has(name)}
export function renderView(name){const fn=VIEWS[name];if(!fn)return;_stale.delete(name);withRenderCache(()=>{try{fn()}catch(e){console.error('render '+name,e)}})}
function setBadge(id,n){const b=document.getElementById(id);if(!b)return;b.textContent=n;b.style.display=n?'inline-block':'none'}
export function updateBadges(){
  try{setBadge('homeBadge',homeUrgentCount())}catch(e){console.warn('home badge',e)}
  try{setBadge('thBadge',threadsMyMoveCount())}catch(e){console.warn('threads badge',e)}
  setBadge('inbBadge',(S.unmatched||[]).length);
  try{dashBadge()}catch(e){console.warn('dashboard badge',e)}
}
export function renderAll(){
  if(!S)return;
  try{if(!document.body.dataset.winit){document.body.dataset.winit='1';const w=localStorage.getItem('kxWide');if(w===null||w==='1'){document.body.classList.add('wide');const b=document.getElementById('wideBtn');if(b)b.textContent='Normal width'}}}catch(e){}
  try{const dt=document.getElementById('dataTab');if(dt&&(/[?#]data/.test(location.href)||localStorage.getItem('kxShowData')==='1'))dt.style.display=''}catch(e){}
  invalidateShares();invalidateThreads();
  try{migrateStages()}catch(e){}try{migratePrevClean()}catch(e){}try{migrateChannels()}catch(e){}
  initHome();initRecordPage();initPalette();
  Object.keys(VIEWS).forEach(v=>_stale.add(v));
  withRenderCache(()=>{
    updateBadges();
    if(document.body.classList.contains('rec-open')){try{refreshRecordPage()}catch(e){console.warn('record page',e)}return}
    renderView(activeView());
  });
}

document.getElementById('tabs').addEventListener('click',e=>{
  const t=e.target.closest('.tab');if(!t)return;
  if(t.classList.contains('active')){
    // second click on the active tab resets all its filters
    const reset={orgs:['oSearch','oKind','oStage','oList'],people:['pSearch','pType','pHas'],pipeline:['fSearch'],threads:['thSearch','thCat'],locations:['locKind']}[t.dataset.t]||[];
    reset.forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
    renderAll();
    return;
  }
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('p-'+t.dataset.t).classList.add('active');
  // the map needs a visible container to size itself, so it always renders on opening
  if(t.dataset.t==='locations'||_stale.has(t.dataset.t))renderView(t.dataset.t);
});

// BOOT
if(initFirebase()){
  window.__authGate=setTimeout(()=>{const a=document.getElementById('authScreen');if(a&&!currentUser)a.style.display='flex'},6000);
  auth.getRedirectResult().catch(()=>{});
  auth.onAuthStateChanged(user=>{
    clearTimeout(window.__authGate);
    if(user){
      if(ALLOWED_EMAILS.length&&!ALLOWED_EMAILS.includes(user.email)){
        auth.signOut();
        document.getElementById('authError').textContent='Access denied for '+user.email+'. Only authorized emails can sign in.';
        return;
      }
      showApp(user);
    } else {
      document.getElementById('authScreen').style.display='flex';
      document.getElementById('appScreen').style.display='none';
    }
  });
} else {
  document.getElementById('authScreen').style.display='flex';
}

// Undo with Ctrl+Z outside input fields
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){const t=e.target;const tag=(t&&t.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select'||(t&&t.isContentEditable))return;e.preventDefault();undoLast()}});
