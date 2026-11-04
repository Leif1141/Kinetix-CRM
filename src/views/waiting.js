// ═══════════════════════════════════════════════════════════════
// REPLY OWED and WAITING ON THEM (Leif 04.11.2026). The old Open Items tab repeated Today: every record with a
// next action counted as "my move". What Today could not see were mail threads without a next step:
//  - reply owed: the last real exchange is a mail TO Leif and he has not answered (shown as rows on Today)
//  - waiting: the last real exchange is Leif's own mail or letter and nobody answered (the Waiting tab)
// A meeting or call after a mail counts as the answer. Done-notes (✔), notes, calendar acceptances,
// auto-replies and sign-up confirmations are not an exchange.
// ═══════════════════════════════════════════════════════════════
import {S, allOrgs, dispName, fixUml, isDeadRec, isIgnoredRec, orgPeople, rowLabel, tType, touchList} from '../state.js';
import {addDays, daysAgo, esc, fmtDe, today} from '../util.js';

export const NOISE_RE=/^(zugesagt|angenommen|abgelehnt|mit vorbehalt|accepted|declined|tentative|automatische antwort|automatic reply|auto(matic)?[- ]?reply|abwesenheit|out of office|undeliverable|unzustellbar|mail delivery|delivery status)\b|newsletter|anmeldebestätigung|bestätigen sie ihre|confirm your (subscription|email)|registrierungsbestätigung|lesebestätigung|read receipt|ihre [\w-]*anmeldung|seminaranmeldung/i;
export const REPLY_DAYS=60, WAIT_MIN=10, WAIT_MAX=60;

export function realTouch(t){
  if(!t||t.src==='Note')return false;
  const ty=tType(t);if(ty==='Note'||ty==='LinkedIn')return false;
  const s=String(t.subject||'').replace(/^[^\wÄÖÜäöü]+/,'').replace(/^((re|aw|wg|fw|fwd)\s*:\s*)+/i,'').trim();
  return !NOISE_RE.test(s)&&!NOISE_RE.test(String(t.subject||''));
}
// the organisation with its people, or a person without an organisation
function units(){
  const out=allOrgs().filter(o=>!o.archived&&!o.mergedInto&&!isDeadRec(o)&&!isIgnoredRec(o));
  (S.people||[]).forEach(p=>{if(!p.orgId&&!p.archived&&!p.mergedInto&&!isDeadRec(p)&&!isIgnoredRec(p))out.push(p)});
  return out;
}
function lastReal(u){
  const seen=new Set();const ts=[];
  const add=(t,who)=>{const k=(t.date||'')+'|'+(t.subject||'');if(seen.has(k))return;seen.add(k);ts.push(Object.assign({},t,{_rec:who}))};
  touchList(u).forEach(t=>add(t,u));
  if(u.kind!=='person')orgPeople(u).forEach(p=>touchList(p).forEach(t=>add(t,p)));
  ts.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return ts.find(realTouch)||null;
}
// a next step on the organisation or on one of its people already covers the thread
// "Kein offener Punkt" closes the thread only up to the day it was set (nextSet): a mail after it counts again
const planOf=(r,d)=>{const a=(r.nextAction||'').trim();if(r.nextDate)return true;if(!a)return false;
  return !/^kein offener punkt/i.test(a)||!r.nextSet||r.nextSet>=d};
function hasPlan(u,d){
  if(planOf(u,d))return true;
  return u.kind!=='person'&&orgPeople(u).some(p=>planOf(p,d));
}
function whoOf(t,u){
  const p=t._rec&&t._rec.kind==='person'?t._rec:null;
  return fixUml(p?dispName(p):(rowLabel(u).sub||String(t.who||'').replace(/<.*>/,'').trim()));
}
export function replyOwedItems(){
  const out=[];
  units().forEach(u=>{
    const t=lastReal(u);if(!t||t.dir!=='in'||tType(t)!=='Email')return;
    const d=(t.date||'').slice(0,10);if(!d||daysAgo(d)>REPLY_DAYS||hasPlan(u,d))return;
    const key='reply_'+u.id+'_'+d;
    if(S.dismissed&&S.dismissed[key])return;
    const who=whoOf(t,u);
    out.push({rec:u,kind:'reply',key,due:'',sort:'1'+d,
      text:(who?who+': ':'')+'"'+String(t.subject||'(no subject)').trim()+'" from '+fmtDe(d)+' is unanswered',link:t.link||''});
  });
  return out;
}
export function waitingItems(){
  const out=[];const snooze=S.snoozeUntil||{},t0=today();
  units().forEach(u=>{
    const t=lastReal(u);if(!t||t.dir!=='out')return;
    const ty=tType(t);if(ty!=='Email'&&ty!=='Letter')return;
    const d=(t.date||'').slice(0,10);const n=daysAgo(d);if(!d||n<WAIT_MIN||n>WAIT_MAX||hasPlan(u,d))return;
    const key='wait_'+u.id+'_'+d;
    if(S.dismissed&&S.dismissed[key])return;
    if(snooze[key]&&snooze[key]>t0)return;
    out.push({rec:u,key,date:d,days:n,type:ty,subject:String(t.subject||'').trim(),who:whoOf(t,u),link:t.link||''});
  });
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}
export function waitingCount(){return waitingItems().length}

let wQ='';
export function renderWaiting(){
  const body=document.getElementById('thBody');if(!body)return;
  wQ=((document.getElementById('thSearch')||{}).value||'').toLowerCase().trim();
  const all=waitingItems();
  const items=wQ?all.filter(i=>(dispName(i.rec)+' '+i.who+' '+i.subject).toLowerCase().includes(wQ)):all;
  const cnt=document.getElementById('thCount');if(cnt)cnt.textContent=items.length+' of '+all.length;
  const row=i=>{const L=rowLabel(i.rec);
    return '<div class="qrow wrow" data-open="'+i.rec.id+'">'
      +'<div class="q-acts"><button class="sm primary" data-wact="follow" data-key="'+esc(i.key)+'" data-id="'+i.rec.id+'" title="Put a follow-up on Today">Follow up</button> <button class="sm" data-wact="2w" data-key="'+esc(i.key)+'" title="Ask again in two weeks">+2w</button> <button class="sm" data-wact="park" data-key="'+esc(i.key)+'" title="Stop tracking this mail">Park</button></div>'
      +'<div class="q-name"><b>'+esc(fixUml(L.top))+'</b>'+(i.who&&i.who!==L.top?'<div class="muted" style="font-size:10px">'+esc(i.who)+'</div>':'')+'</div>'
      +'<div class="q-step">'+(i.type==='Letter'?'Letter: ':'')+(i.link?'<a href="'+esc(i.link)+'" target="_blank">'+esc(i.subject||'(no subject)')+'</a>':esc(i.subject||'(no subject)'))+'</div>'
      +'<div class="q-due">'+i.days+' days</div>'
      +'<div class="q-last muted">'+fmtDe(i.date)+'</div></div>'};
  body.innerHTML='<div class="section"><div class="section-hdr">Waiting on them ('+items.length+')</div>'
    +(items.length?'<div class="qhead wrow"><div></div><div>Name</div><div>Your last mail</div><div>Quiet</div><div>Sent</div></div>'+items.map(row).join('')
      :'<p class="muted" style="padding:14px">Nobody owes you an answer from the last '+WAIT_MAX+' days.</p>')+'</div>';
}
// Follow up: puts the thread on Today now. +2w: back on this list in two weeks. Park: off the list until a new mail.
export async function waitAct(act,key,id){
  const {save}=await import('../store/firebase.js');const {renderAll}=await import('../main.js');const {toast}=await import('../util.js');
  const i=waitingItems().find(x=>x.key===key);if(!i)return;
  if(act==='follow'){const r=i.rec;r.nextAction='Nachfassen: "'+i.subject+'" vom '+fmtDe(i.date)+' ist unbeantwortet'+(i.who?' ('+i.who+')':'');r.nextDate=today();r.nextSet=today();toast('On Today')}
  else if(act==='2w'){S.snoozeUntil=S.snoozeUntil||{};S.snoozeUntil[key]=addDays(today(),14);toast('Back on the list on '+fmtDe(addDays(today(),14)))}
  else {S.dismissed=S.dismissed||{};S.dismissed[key]=today();toast('Parked')}
  save();renderAll();
}
