import {S, allRecs, findRec, fixUml, dispName, isDeadRec, isIgnoredRec, orgTouches, rawRecs, lastTouch, primaryName} from '../state.js';
import {daysAgo} from '../util.js';
import {openProfile} from './record.js';
import {renderWaiting, waitAct} from './waiting.js';

// The thread list (S.threads, seeded 15.09.2026) stays as data: patches add threads, Dead marks their verdict.
// The tab itself shows the Waiting list (views/waiting.js) since 04.11.2026; the old Open Items view was removed.
// Live thread list: the seeded snapshot (recommendations, drafts) plus every record with recent
// activity that the snapshot does not know. Verdict and days-quiet come from the CRM, not the snapshot.
// The thread list lives only in the database (seeded 15.09.2026); the snapshot file was taken out of the public
// code on 08.11.2026. An empty list stays empty and grows through patches.
export async function ensureThreadSeed(){seedThreads()}
export function seedThreads(){if(!Array.isArray(S.threads))S.threads=[]}
export function autoThread(r){
  return {id:r.id,name:fixUml(dispName(r)),contact:r.kind==='person'?'':primaryName(r),email:r.email||'',v:'',p:(r.priority==='Urgent'||r.priority==='High')?'Hoch':(r.priority==='Medium'?'Mittel':'Niedrig'),cat:r.kind==='target'?'Targets':(r.category||''),auto:true};
}
export let _threadsCache=null,_threadsCacheKey='';
export function invalidateThreads(){_threadsCache=null}
export function THREADS_LIVE(){
  seedThreads();
  const key=(S.lastSync||'')+'|'+rawRecs().length;
  if(_threadsCache&&_threadsCacheKey===key)return _threadsCache;
  const known=new Set();S.threads.forEach(t=>{known.add(t.id);(t.alias||[]).forEach(a=>known.add(a))});
  const extra=allRecs().filter(r=>!known.has(r.id)&&lastTouch(r)&&daysAgo(lastTouch(r))<=90).map(autoThread);
  _threadsCache=S.threads.filter(t=>{const r=thRec(t);return !(r&&r.archived)}).concat(extra);
  _threadsCacheKey=key;return _threadsCache;
}
export function thState(id){return (S&&S.threadsState&&S.threadsState[id])||{}}
export function liveVerdict(t){
  // 1. a manual override wins; 2. otherwise read the record: an open action or an unanswered inbound = my move,
  // my own message unanswered = their move, silence for four months = done.
  const st=thState(t.id);if(st.v)return st.v;
  const r=thRec(t);if(!r)return t.v||'UNCLEAR';
  if(isDeadRec(r))return 'DEAD';
  const ts=orgTouches(r);const last=ts[0];
  if(!last)return t.v||'UNCLEAR';
  if(daysAgo(last.date)>120&&!r.nextDate)return 'CLOSED';
  if((r.nextAction||'').trim())return 'OPEN_LEIF';
  return last.dir==='in'?'OPEN_LEIF':'OPEN_THEM';
}
export function thV(t){return liveVerdict(t)}
export function thRec(t){let r=findRec(t.id);if(!r)(t.alias||[]).some(a=>(r=findRec(a)));return r||null}
export function thDone(id){return !!(S&&S.threadsDone&&S.threadsDone[id])}
export function thIsOpen(t){const v=thV(t);return v==='OPEN_LEIF'||v==='OPEN_THEM'}
// Hidden on Today (until the next activity) means hidden here too, and Dead never shows in the open lists.
export function thIgnored(t){const r=thRec(t);return !!(r&&(isIgnoredRec(r)||isDeadRec(r)))}
export function threadsMyMoveCount(){return 0}
export function resetThreadsView(){const s=document.getElementById('thSearch');if(s)s.value=''}
export function renderThreads(){
  const p=document.getElementById('p-threads');
  if(p&&!p._wwired){p._wwired=true;p.addEventListener('click',e=>{
    const b=e.target.closest('button[data-wact]');if(b){e.stopPropagation();waitAct(b.dataset.wact,b.dataset.key,b.dataset.id);return}
    if(e.target.closest('a[href]'))return;
    const row=e.target.closest('[data-open]');if(row){const r=findRec(row.dataset.open);if(r)openProfile(r)}})}
  renderWaiting();
}
