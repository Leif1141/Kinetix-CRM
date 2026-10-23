import {CAD_LABEL} from '../constants.js';
import {S, dismissSugg, dispName, findRec} from '../state.js';
import {addDays, fmtDe, toast, today, uid} from '../util.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';
import {suggestionsRaw} from './home.js';


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
export function quickSetAction(id,ev){
  if(ev)ev.stopPropagation();
  const r=findRec(id);if(!r)return;
  const a=prompt('Next action for '+dispName(r)+':',r.nextAction||'');
  if(a===null||!a.trim())return;
  const d=new Date();d.setDate(d.getDate()+7);const def=d.toISOString().slice(0,10);
  const dt=prompt('Due date (YYYY-MM-DD):',def);
  if(dt===null)return;
  r.nextAction=a.trim();
  r.nextDate=/^\d{4}-\d{2}-\d{2}$/.test((dt||'').trim())?dt.trim():def;
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
export function ignoreRec(id,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;r.ignored=today();save();renderAll();toast('Ignored until the next activity')}
export function unignoreRec(id,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;delete r.ignored;save();renderAll()}
export function sugKeysOf(id){const r=findRec(id);return r?suggestionsRaw(r).map(s=>s.key):[]}
export function sugAct(kind,id,key,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;
  if(kind==='done'){
    if(key.startsWith('cdz_')){const step=key.split('_').pop();r.cadDone=r.cadDone||{};r.cadDone[step]=today();logDone(r,'Cadence: '+(CAD_LABEL[step]||step));save();renderAll();toast('Cadence step done');return}
    if(r.nextAction){completeAction(id);return}
    S.dismissed=S.dismissed||{};sugKeysOf(id).forEach(k=>S.dismissed[k]=today());save();renderAll();toast('Done');return}
  if(kind==='ignore'){ignoreRec(id);return}
  const days=kind==='1m'?30:7;
  if(r.nextDate&&r.nextDate<=addDays(today(),days)){const d=new Date((r.nextDate>=today())?r.nextDate:today());d.setDate(d.getDate()+days);r.nextDate=d.toISOString().slice(0,10)}
  S.snoozeUntil=S.snoozeUntil||{};const until=addDays(today(),days);sugKeysOf(id).forEach(k=>S.snoozeUntil[k]=until);
  save();renderAll();toast('Pushed to '+fmtDe(until));
}
export function actBtns(id,key){key=key||('due_'+id);return '<span style="white-space:nowrap"><button class="sm primary" onclick="sugAct(\'done\',\''+id+'\',\''+key+'\',event)" title="Log as done">Done</button> <button class="sm" onclick="sugAct(\'1w\',\''+id+'\',\''+key+'\',event)">+1w</button> <button class="sm" onclick="sugAct(\'1m\',\''+id+'\',\''+key+'\',event)">+1m</button> <button class="sm" onclick="sugAct(\'ignore\',\''+id+'\',\''+key+'\',event)" title="Hide until there is new activity">Ignore</button></span>'}
export function snoozeSugg(k,ev){if(ev)ev.stopPropagation();dismissSugg(k)}
