import {openDialog, confirmDialog} from './dialog.js';
import {CAD_LABEL, DEADREASONS} from '../constants.js';
import {S, deadMail, dismissSugg, dispName, findRec, fixUml, orgPeople} from '../state.js';
import {addDays, fmtDe, toast, today, uid} from '../util.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';
import {suggestionsRaw} from './home.js';
import {THREADS_LIVE} from './threads.js';


// ═══════════════════════════════════════════════════════════════
// RENDER: FOLLOW-UPS
// ═══════════════════════════════════════════════════════════════
export function logDone(r,what){
  if(!what)return;
  r.touches=r.touches||{};
  r.touches['done_'+uid()]={date:today()+'T12:00:00Z',dir:'out',src:'Note',subject:'\u2714 '+what,who:'',note:'Marked done '+today()};
  r.actionLog=r.actionLog||[];
  r.actionLog.push({done:today(),due:r.nextDate||'',set:r.nextSet||'',what:what});
}
export function completeAction(id,ev){
  if(ev)ev.stopPropagation();
  const r=findRec(id);if(!r)return;
  logDone(r,r.nextAction);
  r.nextDate='';r.nextAction='';r.nextSet='';
  if(S.dismissed)delete S.dismissed['due_'+r.id];
  save();renderAll();toast('Logged as done');
}
export async function quickSetAction(id,ev){
  if(ev)ev.stopPropagation();
  const r=findRec(id);if(!r)return;
  const def=addDays(today(),7);
  const v=await openDialog({title:'Next action',text:dispName(r),fields:[{key:'a',label:'Next action',type:'textarea',value:r.nextAction||'',required:true},{key:'d',label:'Due',type:'date',value:r.nextDate||def}],ok:'Set'});
  if(!v)return;
  r.nextAction=v.a.trim();
  r.nextDate=/^\d{4}-\d{2}-\d{2}$/.test((v.d||'').trim())?v.d.trim():def;
  r.nextSet=today();
  save();renderAll();
}
export function snoozeAction(id,ev,days){
  if(ev)ev.stopPropagation();
  const r=findRec(id);if(!r)return;days=days||7;
  const d=new Date((r.nextDate&&r.nextDate>=today())?r.nextDate:today());d.setDate(d.getDate()+days);
  r.nextDate=d.toISOString().slice(0,10);
  save();renderAll();toast('Pushed to '+r.nextDate);
}
export function ignoreRec(id,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;r.ignored=today();save();renderAll();toast('Hidden until the next activity')}
export function unignoreRec(id,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;delete r.ignored;save();renderAll()}
// Open Items keeps its state under the thread id, which can differ from the record id (alias).
function threadIdOf(r){const t=THREADS_LIVE().find(x=>x.id===r.id||(x.alias||[]).includes(r.id));return t?t.id:r.id}
// Dead: one save, so one Undo takes back the record, its people and its Open Items state together.
export async function markDead(id,ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const r=findRec(id);if(!r)return;
  const fields=[{key:'why',label:'Reason (optional)',type:'text'}];
  if(r.kind==='target')fields.push({key:'cat',label:'Dead category',type:'select',options:[{value:'',label:'(not set)'}].concat(DEADREASONS),value:r.deadCat||''});
  const v=await openDialog({title:'Mark '+fixUml(dispName(r))+' as dead',fields,ok:'Mark dead'});
  if(!v)return;
  const clear=x=>{x.nextAction='';x.nextDate='';x.nextSet=''};
  if(r.kind==='target'){r.stage='Dead';r.stageLog=r.stageLog||[];r.stageLog.push({stage:'Dead',date:today()});if(v.cat)r.deadCat=v.cat;else delete r.deadCat}
  else r.status='Dead';
  const why=(v.why||'').trim(),day=today().split('-').reverse().join('.');
  r.deadReason='Leif '+day+(why?': '+why:'');
  r.deadAt=new Date().toISOString();delete r.deadSeen;delete r.ignored;
  if(r.revisitDate)r.revisitDate='';
  clear(r);
  if(r.kind!=='person')orgPeople(r).forEach(clear);
  const tid=threadIdOf(r);
  S.threadsState=S.threadsState||{};S.threadsDone=S.threadsDone||{};
  S.threadsState[tid]=Object.assign({},S.threadsState[tid],{v:'DEAD'});S.threadsDone[tid]=today();
  save();renderAll();toast(fixUml(dispName(r))+' is dead');
}
// Back to the previous stage, an adviser to In dialogue. A person has no status of their own.
export function reviveRec(id,ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const r=findRec(id);if(!r)return;
  if(r.kind==='target'){const prev=[...(r.stageLog||[])].reverse().find(l=>l.stage!=='Dead');r.stage=prev?prev.stage:'Identified';r.stageLog=r.stageLog||[];r.stageLog.push({stage:r.stage,date:today()})}
  else if(r.kind==='advisor')r.status='In dialogue';
  else delete r.status;
  delete r.deadCat;delete r.deadReason;delete r.deadAt;delete r.deadSeen;
  const tid=threadIdOf(r);
  if(S.threadsState&&S.threadsState[tid])delete S.threadsState[tid].v;
  if(S.threadsDone)delete S.threadsDone[tid];
  save();renderAll();toast(fixUml(dispName(r))+' is back');
}
// Ok on the Today line: this mail is seen, the next new one shows again.
export function deadMailOk(id,ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const r=findRec(id),t=r&&deadMail(r);if(!t)return;
  r.deadSeen=t.date;save();renderAll();
}
export function sugKeysOf(id){const r=findRec(id);return r?suggestionsRaw(r).map(s=>s.key):[]}
export function sugAct(kind,id,key,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;
  if(kind==='done'){
    if(key.startsWith('cdz_')){const step=key.split('_').pop();r.cadDone=r.cadDone||{};r.cadDone[step]=today();logDone(r,'Cadence: '+(CAD_LABEL[step]||step));save();renderAll();toast('Cadence step done');return}
    if(r.nextAction){completeAction(id);return}
    S.dismissed=S.dismissed||{};sugKeysOf(id).forEach(k=>S.dismissed[k]=today());save();renderAll();toast('Done');return}
  if(kind==='ignore'){ignoreRec(id);return}
  const days=kind==='1m'?30:kind==='2w'?14:7;
  if(r.nextDate&&r.nextDate<=addDays(today(),days)){const d=new Date((r.nextDate>=today())?r.nextDate:today());d.setDate(d.getDate()+days);r.nextDate=d.toISOString().slice(0,10)}
  S.snoozeUntil=S.snoozeUntil||{};const until=addDays(today(),days);sugKeysOf(id).forEach(k=>S.snoozeUntil[k]=until);
  save();renderAll();toast('Pushed to '+fmtDe(until));
}
export function actBtns(id,key){key=key||('due_'+id);return '<span style="white-space:nowrap"><button class="sm primary" data-click="sugAct|done|'+id+'|'+key+'|$e" title="Log as done">Done</button> <button class="sm" data-click="sugAct|2w|'+id+'|'+key+'|$e" title="Push by two weeks">+2w</button> <button class="sm" data-click="sugAct|ignore|'+id+'|'+key+'|$e" title="bis zur nächsten Aktivität">Hide</button> <button class="sm" data-click="markDead|'+id+'|$e">Dead</button></span>'}
export function snoozeSugg(k,ev){if(ev)ev.stopPropagation();dismissSugg(k)}
