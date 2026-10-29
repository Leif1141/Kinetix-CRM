import {registerActions, initEvents, helperActions} from './events.js';
import {invalidateShares} from './shares.js';
import {ALLOWED_EMAILS} from './config.js';
import {S, migrateChannels, migrateStages, withRenderCache} from './state.js';

import {invalidateThreads, renderThreads, resetThreadsView, threadsMyMoveCount} from './views/threads.js';
import {auth, currentUser, initFirebase, showApp} from './store/firebase.js';
import {dashRefresh, dashBadge} from './views/dash.js';
import {migratePrevClean} from './sync/triage.js';
import {renderData} from './views/data.js';
import {renderHome, initHome, homeUrgentCount, resetHomeView} from './views/home.js';
import {closeProfile, initRecordPage, refreshRecordPage} from './views/record.js';
import {initPalette} from './views/palette.js';
import {undoLast} from './store/firebase.js';
import {renderGlobalSearch} from './views/search.js';
import {renderInbox} from './views/inbox.js';
import {renderLocations} from './views/map.js';
import {renderOrgs} from './views/orgs.js';
import {renderPeople, resetPeopleView} from './views/people.js';
import {renderPipeline, resetPipeView} from './views/pipeline.js';
import {renderReports, renderYield} from './views/reports.js';
import * as _m0 from './config.js';
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
import * as _m25 from './views/threads.js';
import * as _m26 from './views/inbox.js';
import * as _m27 from './views/data.js';
import * as _m28 from './store/export.js';
import * as _m29 from './sync/patch.js';
import * as _m30 from './sync/drive.js';
import * as _m31 from './views/map.js';
import * as _m32 from './views/dash.js';
// Actions for the data-click, data-change, data-input, data-enter, data-toggle and drag attributes
// (src/events.js). Module exports are registered by name; nothing is put on window.
[['config',_m0], ['constants',_m2], ['state',_m3], ['store/firebase',_m4], ['views/record',_m5], ['views/reports',_m6], ['views/orgs',_m7], ['views/people',_m8], ['sync/google',_m9], ['sync/outlook',_m10], ['util',_m11], ['sync/match',_m12], ['sync/triage',_m13], ['sync/granola',_m14], ['sync/index',_m15], ['views/ui',_m16], ['views/home',_m17], ['views/home',_m18], ['shares',_m19], ['views/search',_m20], ['views/lists',_m21], ['views/pipeline',_m22], ['views/actions',_m23], ['views/threads',_m25], ['views/inbox',_m26], ['views/data',_m27], ['store/export',_m28], ['sync/patch',_m29], ['sync/drive',_m30], ['views/map',_m31], ['views/dash',_m32]].forEach(([src,ns])=>registerActions(ns,src));
registerActions({goTab,renderAll,renderView,updateBadges,viewIsStale,activeView},'main');
registerActions(helperActions,'events');
// filter fields call these renderers directly; run them inside the render cache
{const C=fn=>(...a)=>withRenderCache(()=>fn(...a));registerActions({renderOrgs:C(renderOrgs),renderPeople:C(renderPeople),renderPipeline:C(renderPipeline),renderThreads:C(renderThreads),renderGlobalSearch:C(renderGlobalSearch),renderLocations:C(renderLocations),renderHome:C(renderHome)},'main (render cache)',true)}
initEvents();


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
  // a tab always opens the base view of its section (Leif 29.10.2026): an open record closes,
  // searches, filters and drill-downs reset
  const v=t.dataset.t;
  ({home:['homeSearch'],orgs:['oSearch','oKind','oStage','oList'],people:['pSearch','pType','pHas'],pipeline:['fSearch','fChan'],threads:['thSearch','thCat'],locations:['locKind']}[v]||[]).forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  if(v==='pipeline'){const f=document.getElementById('fFav');if(f)f.checked=false}
  ({home:resetHomeView,people:resetPeopleView,pipeline:resetPipeView,threads:resetThreadsView}[v]||(()=>{}))();
  if(document.body.classList.contains('rec-open'))closeProfile();
  if(t.classList.contains('active')){renderAll();window.scrollTo(0,0);return}
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('p-'+t.dataset.t).classList.add('active');
  // the map needs a visible container to size itself, so it always renders on opening
  renderView(v);window.scrollTo(0,0);
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
