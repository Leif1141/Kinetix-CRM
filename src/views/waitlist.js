// The Waiting tab: loaded when the tab opens, so the app's start stays small. The lists it shows beyond the
// unanswered mails (waiting.js) come from the wording of the next step (Leif 22.11.2026).
import {allOrgs, dispName, fixUml, isDeadRec, orgPeople, rowLabel, tType} from '../state.js';
import {addDays, daysAgo, esc, fmtDe, today} from '../util.js';
import {WAIT_MAX, WAIT_MIN, lastReal, liveUnits, nm, parked, waitingItems} from './waiting.js';

// What a next step says about who has the ball: wait, chase, partner, fair (a stand visit after an unanswered
// mail) or '' (Leif's own action, an appointment, a closed thread).
export function stepKind(text,unanswered){
  const a=String(text||'').trim();if(!a||/^kein offener punkt/i.test(a))return '';
  if(a.split('|').some(s=>/^\s*(warten? auf|waiting for|wait for|awaiting)\b/i.test(s)))return 'wait';
  if(/^promised\b/i.test(a))return '';
  if(/^beim partner\b/i.test(a))return 'partner';
  if(/^(termin|treffen|call|mittagessen|kaffee) mit\b/i.test(a))return '';
  if(/(^|[^\wäöü])(antwort|rückmeldung|feedback)\b[^|]{0,120}\babwarten\b|\bmeldet sich\b/i.test(a))return 'wait';
  if(/^(messe-termin|sps \d|auf der )/i.test(a))return unanswered?'fair':'';
  if(/^nachfass(en\b|-mail)|^follow-up-mail an\b|^kadenz:|\bkadenz: (follow-up|anruf)/i.test(a))return 'chase';
  return /^[^|]{0,90}\b(nachfassen|nachfragen|nachhaken)\b/i.test(a)?'chase':'';
}
// Threads whose next step is waiting or chasing, whatever its date. hidden: the same on hidden or on-hold records.
export function plannedWaiting(hidden){
  const out=[],seen=new Set();
  liveUnits().forEach(u=>{
    const recs=[u].concat(u.kind==='person'?[]:orgPeople(u)).filter(r=>(r.nextAction||'').trim()),texts=new Set();
    if(!recs.length)return;
    const t=lastReal(u),d=t?(t.date||'').slice(0,10):'';
    const un=!!(d&&t.dir==='out'&&['Email','Letter'].includes(tType(t))&&daysAgo(d)>=WAIT_MIN);
    recs.forEach(r=>{
      if(seen.has(r.id)||texts.has(r.nextAction)||isDeadRec(r)||!!hidden!==(parked(u)||parked(r)))return;
      const kind=stepKind(r.nextAction,un);if(!kind)return;
      seen.add(r.id);texts.add(r.nextAction);
      out.push({rec:u,step:r,key:'plan_'+r.id,kind,due:r.nextDate||'',date:d,days:d?daysAgo(d):null,text:fixUml(r.nextAction),
        who:r!==u?fixUml(dispName(r)):fixUml(rowLabel(u).sub||''),subject:t?String(t.subject||'').trim():'',link:t&&t.dir==='out'?t.link||'':'',
        wrote:!!(t&&t.dir==='in'&&r.nextSet&&d>r.nextSet)});
    });
  });
  return out.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
}
// "Beim Partner nachfragen" is one question per partner, however many names lie there
export function partnerGroups(items){
  const g=new Map();
  items.filter(i=>i.kind==='partner').forEach(i=>{
    const name=String((i.rec.kind==='target'&&i.rec.channelVia)||dispName(i.rec)).replace(/\s*\(.*$/,'').trim(),k=nm(name);
    if(!g.has(k))g.set(k,{name,due:'',names:[],open:i.rec});
    const x=g.get(k);
    if(i.due&&(!x.due||i.due<x.due))x.due=i.due;
    if(i.rec.kind==='target')x.names.push(fixUml(dispName(i.rec)));
  });
  g.forEach((x,k)=>{const o=allOrgs().find(r=>r.kind==='advisor'&&!r.archived&&nm(dispName(r))===k);if(o)x.open=o});
  return [...g.values()].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
}
let wQ='';const wOpen=new Set(); // folded lists the user opened
export function renderWaiting(){
  const body=document.getElementById('thBody');if(!body)return;
  wQ=((document.getElementById('thSearch')||{}).value||'').toLowerCase().trim();
  const has=(...a)=>!wQ||a.join(' ').toLowerCase().includes(wQ);
  const hit=i=>has(dispName(i.rec),i.who,i.subject,i.text||'');
  const plan=plannedWaiting(),A=waitingItems().filter(hit),B=plan.filter(i=>i.kind!=='partner'&&hit(i));
  const C=partnerGroups(plan).filter(g=>has(g.name,g.names.join(' '))),D=waitingItems(true).filter(hit),E=plannedWaiting(true).filter(hit);
  const cnt=document.getElementById('thCount');if(cnt)cnt.textContent=(A.length+B.length+C.length)+' waiting';
  const t0=today();
  const btn=(act,i,label,tip)=>'<button class="sm'+(act==='follow'||act==='now'?' primary':'')+'" data-wact="'+act+'" data-key="'+esc(i.key)+'" data-id="'+i.rec.id+'" title="'+tip+'">'+label+'</button> ';
  const row=(id,acts,top,sub,step,q,last)=>'<div class="qrow wrow" data-open="'+id+'"><div class="q-acts">'+acts+'</div><div class="q-name"><b>'+esc(fixUml(top))+'</b>'
    +(sub&&sub!==top?'<div class="muted" style="font-size:10px">'+esc(sub)+'</div>':'')+'</div><div class="q-step">'+step+'</div><div class="q-due">'+q+'</div><div class="q-last muted">'+last+'</div></div>';
  const a=(link,txt)=>link?'<a href="'+esc(link)+'" target="_blank">'+txt+'</a>':txt;
  const loose=i=>row(i.rec.id,btn('follow',i,'Follow up','Put a follow-up on Today')+btn('2w',i,'+2w','Ask again in two weeks')+btn('park',i,'Park','Stop tracking this mail'),
    rowLabel(i.rec).top,i.who,(i.type==='Letter'?'Letter: ':'')+a(i.link,esc(i.subject||'(no subject)')),i.days+' days',fmtDe(i.date));
  const planned=i=>row(i.rec.id,(i.due&&i.due<=t0&&!parked(i.rec)&&!parked(i.step)?'<span class="muted" style="font-size:11px">On Today</span> ':btn('now',i,'Follow up','Move this step to Today'))+btn('later',i,'+2w','Move the follow-up two weeks later'),
    rowLabel(i.rec).top,i.who,esc(i.text)+(i.link?' '+a(i.link,'your mail'):'')+(i.wrote?' <b>They wrote '+fmtDe(i.date)+'.</b>':''),i.days==null?'-':i.days+' days',i.due?fmtDe(i.due):'no date');
  const partner=g=>row(g.open.id,'',g.name,g.names.length?g.names.length+(g.names.length>1?' names':' name'):'',esc(g.names.join(', ')||'Open question'),'',g.due?fmtDe(g.due):'no date');
  const head=(x,y,z)=>'<div class="qhead wrow"><div></div><div>Name</div><div>'+x+'</div><div>'+y+'</div><div>'+z+'</div></div>';
  const sec=(title,list,fn,h)=>list.length?'<div class="section"><div class="section-hdr">'+title+' ('+list.length+')</div>'+h+list.map(fn).join('')+'</div>':'';
  const fold=(k,title,list,fn,h)=>list.length?'<details data-wfold="'+k+'"'+(wOpen.has(k)||wQ?' open':'')+' class="section"><summary class="section-hdr" style="cursor:pointer">'+title+' ('+list.length+')</summary>'+h+list.map(fn).join('')+'</details>':'';
  const hMail=head('Your last mail','Quiet','Sent'),hPlan=head('Waiting for','Quiet','Follow up on');
  body.innerHTML=(sec('No follow-up set',A,loose,hMail)+sec('Follow-up set',B,planned,hPlan)+sec('With partners',C,partner,head('Names','','Ask on'))
    +fold('old','Older than '+WAIT_MAX+' days, no follow-up set',D,loose,hMail)+fold('off','Hidden or on hold',E,planned,hPlan))
    ||'<div class="section"><p class="muted" style="padding:14px">'+(wQ?'No match.':'Nobody owes you an answer.')+'</p></div>';
  body.querySelectorAll('details[data-wfold]').forEach(d=>d.querySelector('summary').addEventListener('click',()=>{if(d.open)wOpen.delete(d.dataset.wfold);else wOpen.add(d.dataset.wfold)}));
}
export function moveStep(act,key,{save,renderAll,toast}){ // the step already exists: only its date moves
  const x=plannedWaiting().concat(plannedWaiting(true)).find(v=>v.key===key);if(!x)return;
  const t0=today(),r=x.step;
  r.nextDate=act==='now'?t0:addDays(r.nextDate>t0?r.nextDate:t0,14);r.nextSet=r.nextSet||t0;
  if(act==='now'){if(r.ignored)r.ignored='';if(x.rec.ignored)x.rec.ignored=''} // asked for on Today, so no longer hidden
  toast(act==='now'?'On Today':'Follow-up on '+fmtDe(r.nextDate));save();renderAll();return;
}
