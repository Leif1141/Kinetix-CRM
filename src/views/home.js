import {letterDoneStep, primaryName} from '../state.js';
import {ACTIVE_STAGES, LETTER_TARGET_WEEK, LIVE} from '../constants.js';
import {S, allRecs, cadenceOf, cadDue, deadMail, dispName, findRec, fixUml, grpOf, GRP_DEF, isDeadRec, isDeadSelf, isDismissed, isIgnoredRec, isStale, isSysNote, lastTouch, liveOnly, orgPeople, orgTouches, rowLabel, tType, touchList, meetMode, foldConv} from '../state.js';
import {addDays, cleanPrev, daysAgo, esc, fmtD, fmtDe, today, weekStart} from '../util.js';
import {grpChip, stagePill} from './ui.js';
import {deadMailOk, markDead, reviveRec, sugAct, unignoreRec} from './actions.js';
import {openProfile} from './record.js';
import {goTab} from '../main.js';
import {replyOwedItems} from './waiting.js';

// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS ENGINE (keys drive Done / snooze / ignore)
// ═══════════════════════════════════════════════════════════════
export function sugHead(r){
  const n=dispName(r);
  const extra = r.kind==='advisor' ? primaryName(r) : (r.kind==='person' ? (r.firm||'') : (r.location||''));
  const t = r.category||r.ptype||r.type||'';
  const bits=[extra,t].filter(Boolean).join(', ');
  return bits ? n+' ('+bits+')' : n;
}
export function suggestions(){
  const byRec=new Map();
  suggestionsRaw().filter(s=>!isDismissed(s.key)&&!isIgnoredRec(s.rec)&&(s.tag==='Revisit'||!isDeadRec(s.rec))).forEach(s=>{const g=byRec.get(s.rec.id);if(!g){s.also=[];byRec.set(s.rec.id,s)}else{g.also.push(s)}});
  return [...byRec.values()];
}
export function suggestionsRaw(only){
  const out=[];const t=today();
  const pick=a=>only?a.filter(r=>r===only):a;
  pick(S.companies||[]).forEach(c=>{const cd=cadenceOf(c);if(cd&&cd.next&&cd.next.due<=t)out.push({rec:c,why:'Letter of '+fmtDe(cd.sent)+': '+cd.next.label+' now'+(cd.via?' (via '+cd.via+')':''),tag:'Cadence',color:'#B86E1B',key:'cdz_'+c.id+'_'+cd.next.k})});
  pick(allRecs()).filter(r=>r.nextDate&&r.nextDate<=t).forEach(r=>{out.push({rec:r,why:'Due: '+(r.nextAction||'follow up'),tag:'Due',color:'var(--red)',key:'due_'+r.id})});
  pick(S.companies).filter(c=>LIVE.includes(c.stage)&&c.stage!=='Identified'&&isStale(c)).forEach(c=>{out.push({rec:c,why:c.stage+' for '+daysAgo(lastTouch(c)||(c.stageLog?.slice(-1)[0]?.date)||null)+'d with no activity',tag:'Stale',color:'#C6943E',key:'stale_'+c.id})});
  pick(liveOnly(S.advisors||[])).filter(a=>{const lt=lastTouch(a);return lt&&daysAgo(lt)>(a.cadence||30)}).forEach(a=>{out.push({rec:a,why:'Last contact '+daysAgo(lastTouch(a))+' days ago (rhythm '+(a.cadence||30)+' days)',tag:'Check-in',color:'var(--navy)',key:'cad_'+a.id})});
  pick(S.companies).filter(c=>c.stage==='Dead'&&c.revisitDate&&c.revisitDate<=t).forEach(c=>{out.push({rec:c,why:'Revisit date reached: approach again or move the date',tag:'Revisit',color:'var(--green)',key:'rev_'+c.id})});
  pick(allRecs()).filter(r=>r.nextAction&&r.nextSet&&lastTouch(r)&&lastTouch(r).slice(0,10)>r.nextSet).forEach(r=>{out.push({rec:r,why:'Next step may be overtaken, there has been activity since. Current: "'+r.nextAction+'"',tag:'Overtaken',color:'#7030A0',key:'ovt_'+r.id+'_'+lastTouch(r).slice(0,10)})});
  return out;
}

// ═══════════════════════════════════════════════════════════════
// HOME: one queue for today plus the weekly scorecard
// ═══════════════════════════════════════════════════════════════
export const PROMISE_RE=/(^|\|\s*)Promised\b/;
export function isPromise(r){return !!(r&&r.nextAction&&PROMISE_RE.test(r.nextAction))}
export function openPromises(r){
  // promise lines inside the next action: "Promised (Call 12 Oct): send the teaser | ..."
  return (r&&r.nextAction?r.nextAction.split('|'):[]).map(s=>s.trim()).filter(s=>/^Promised\b/.test(s));
}
const PARTNER_CH=['Partner letter','M&A house / advisor','Tax adviser / auditor','Network / referral','Bank','Platform'];
export const QUEUE_KINDS={deadmail:'Dead',reply:'Reply owed',overdue:'Overdue',promise:'Promise made',due:'Due today',cadence:'Letter cadence',noaction:'Live deal without next step',stale:'Stale live deal',revisit:'Revisit date reached'};
let homeGrp='',homeQ='',homeKind='';
try{homeGrp=localStorage.getItem('kxHomeGrp')||''}catch(e){}

export function buildQueue(){
  const t=today();
  const items=[];
  allRecs().filter(isDeadSelf).forEach(r=>{
    const m=deadMail(r);
    if(m)items.push({rec:r,kind:'deadmail',key:'deadmail_'+r.id,text:fixUml(dispName(r))+' (Dead) hat geschrieben: '+(m.subject||''),due:'',sort:'0z'+m.date});
  });
  const all=allRecs().filter(r=>!isIgnoredRec(r));
  all.filter(r=>r.nextDate&&r.nextDate<=t&&!letterDoneStep(r)&&!isDeadRec(r)).forEach(r=>{
    const kind=isPromise(r)?'promise':(r.nextDate<t?'overdue':'due');
    items.push({rec:r,kind,key:'due_'+r.id,text:r.nextAction||'follow up',due:r.nextDate,sort:(kind==='promise'?'0':'1')+r.nextDate});
  });
  (S.companies||[]).filter(c=>!isIgnoredRec(c)&&cadDue(c)&&!(c.nextDate&&c.nextDate<=t&&!letterDoneStep(c))).forEach(c=>{
    const cd=cadenceOf(c);
    items.push({rec:c,kind:'cadence',key:'cdz_'+c.id+'_'+cd.next.k,text:'Letter of '+fmtDe(cd.sent)+(cd.via?' via '+cd.via:'')+': '+cd.next.label,due:cd.next.due,sort:'2'+cd.next.due});
  });
  replyOwedItems().forEach(i=>items.push(i));
  const live=(S.companies||[]).filter(c=>ACTIVE_STAGES.includes(c.stage)&&!isIgnoredRec(c));
  live.filter(c=>isStale(c)&&!c.nextDate&&!isDismissed('stale_'+c.id)).forEach(c=>{
    items.push({rec:c,kind:'stale',key:'stale_'+c.id,text:c.stage+', last contact '+(lastTouch(c)?fmtDe(lastTouch(c)):'never'),due:'',sort:'4'+(lastTouch(c)||'')});
  });
  live.filter(c=>!c.nextDate&&!isStale(c)&&!(cadenceOf(c)&&(cadenceOf(c).next||cadenceOf(c).partner))&&!isDismissed('noact_'+c.id)).forEach(c=>{
    items.push({rec:c,kind:'noaction',key:'noact_'+c.id,text:c.stage+', no next step scheduled',due:'',sort:'3'+(lastTouch(c)||'')});
  });
  (S.companies||[]).filter(c=>(c.stage==='Dead'||c.stage==='On hold')&&c.revisitDate&&c.revisitDate<=t&&!isDismissed('rev_'+c.id)).forEach(c=>{
    items.push({rec:c,kind:'revisit',key:'rev_'+c.id,text:'Revisit: '+(c.deadReason||c.lastSummary||'').slice(0,120),due:c.revisitDate,sort:'5'+c.revisitDate});
  });
  items.sort((a,b)=>a.sort.localeCompare(b.sort)||dispName(a.rec).localeCompare(dispName(b.rec)));
  return items;
}
export function laterThisWeek(){
  const t=today(),end=addDays(weekStart(t),6);
  return allRecs().filter(r=>!isIgnoredRec(r)&&r.nextDate&&r.nextDate>t&&!letterDoneStep(r)&&r.nextDate<=(end>addDays(t,6)?end:addDays(t,6))&&!isDeadRec(r)).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
}

// "This week" (Leif 07.11.2026): every tile counts this week only, and a click lists exactly what it counts.
// Letters count companies (two letters to one company are one). Replies are real answers, no auto-replies.
// Meetings count one per organisation and day, so the Granola note and the run's entry of the same conversation
// count once. Live deals is a standing count (Replied to Diligence), not a weekly one.
const AUTO_RE=/automatische antwort|abwesend|abwesenheit|out of office|automatic reply|auto-reply|autoreply|unzustellbar|undeliverable/i;
// Any week, for the comparison box and the Reports table (Leif 08.11.2026); ws is that week's Monday.
const LIVE_ST=['Replied','Meeting','NDA','LOI','Diligence'];
function stageAt(c,day){const l=(c.stageLog||[]).filter(x=>(x.date||'')<day);return l.length?l[l.length-1].stage:''}
export function weekScore(ws){
  ws=ws||weekStart(today());
  const we=addDays(ws,7),cur=ws===weekStart(today());
  const inWeek=t=>{const d=(t.date||'').slice(0,10);return d>=ws&&d<we};
  const cos=(S.companies||[]).filter(c=>!c.archived&&!c.mergedInto);
  const lists={letters:[],replies:[],meetings:[],dealsIn:[],namesOut:[],live:[]};
  // Meetings and calls (Leif 08.11.2026): every conversation of the week, advisers and partners included, in person,
  // video or a logged call, one per organisation and day
  [...cos,...(S.advisors||[]).filter(a=>!a.archived&&!a.mergedInto)].forEach(o=>{
    foldConv(orgTouches(o).filter(t=>inWeek(t)&&meetMode(t))).forEach(t=>lists.meetings.push({rec:o,date:t.date,text:(meetMode(t)==='meeting'?'Meeting: ':'Call: ')+String(t.subject||'').replace(/^📞\s*/,'')}));
  });
  // live deals at the end of that week: today's stage for the current week, the stage history for earlier weeks
  cos.forEach(c=>{const st=cur?c.stage:stageAt(c,we);if(LIVE_ST.includes(st))lists.live.push({rec:c,date:((c.stageLog||[]).filter(x=>(x.date||'')<we).slice(-1)[0]||{}).date||'',text:st+(c.channelVia?' · '+c.channelVia:'')})});
  cos.forEach(c=>{
    const ts=orgTouches(c).filter(t=>inWeek(t)&&!isSysNote(t));
    // own letters only: a letter a partner sent does not count against Leif's weekly target
    const let1=c.channel==='Partner letter'?null:ts.filter(t=>tType(t)==='Letter'&&t.dir!=='in').pop();
    if(let1)lists.letters.push({rec:c,date:let1.date,text:let1.subject});
    const rep=ts.find(t=>t.dir==='in'&&tType(t)==='Email'&&!AUTO_RE.test(t.subject||''));
    if(rep)lists.replies.push({rec:c,date:rep.date,text:rep.subject});
    // a partner brings a deal (teaser, project name, already past first contact) or Leif gives a partner a name
    const first=(c.stageLog||[])[0];
    if(first&&first.date>=ws&&first.date<we&&PARTNER_CH.includes(c.channel||'')){
      const inbound=/^proje[ck]t\b/i.test(c.name||'')||(first.stage&&first.stage!=='Identified');
      (inbound?lists.dealsIn:lists.namesOut).push({rec:c,date:first.date,text:c.channelVia||c.channel});
    }
  });
  Object.values(lists).forEach(l=>l.sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
  const n=k=>lists[k].length;
  return {letters:n('letters'),target:LETTER_TARGET_WEEK,replies:n('replies'),meetings:n('meetings'),dealsIn:n('dealsIn'),namesOut:n('namesOut'),live:n('live'),weekStart:ws,lists};
}
let wkOpen='',wkOpenPrev='',prevWs='';
export function toggleWeekList(k,box){if(box==='prev')wkOpenPrev=wkOpenPrev===k?'':k;else wkOpen=wkOpen===k?'':k;renderScore()}
export function setPrevWeek(ws){prevWs=ws;wkOpenPrev='';prevCache=null;renderScore()}
// A past week barely changes: its counts are kept for a minute so Today stays fast on every redraw
let prevCache=null,firstDay='';
function prevScore(ws){const now=Date.now();if(!prevCache||prevCache.ws!==ws||now-prevCache.at>60000)prevCache={ws,at:now,s:weekScore(ws)};return prevCache.s}
// Mondays from the first recorded activity up to last week, newest first
export function pastWeeks(){
  let first=firstDay||today();
  if(!firstDay){allRecs().forEach(r=>Object.values(r.touches||{}).forEach(t=>{const d=(t.date||'').slice(0,10);if(d&&d>='2026-01-01'&&d<first)first=d}));firstDay=first}
  const out=[];let w=addDays(weekStart(today()),-7);const stop=weekStart(first);
  while(w>=stop&&out.length<104){out.push(w);w=addDays(w,-7)}
  return out;
}

export function resetHomeView(){homeGrp='';homeKind='';try{localStorage.setItem('kxHomeGrp','')}catch(e){}}
export function setHomeGrp(g){homeGrp=homeGrp===g?'':g;try{localStorage.setItem('kxHomeGrp',homeGrp)}catch(e){}renderHome()}
export function setHomeKind(k){homeKind=homeKind===k?'':k;renderHome()}
function matches(item){
  if(homeGrp&&grpOf(item.rec)!==homeGrp)return false;
  if(homeKind&&item.kind!==homeKind)return false;
  if(homeQ){const r=item.rec;const h=(dispName(r)+' '+primaryName(r)+' '+(r.firm||'')+' '+(item.text||'')).toLowerCase();if(!h.includes(homeQ))return false}
  return true;
}
function dueTxt(d){
  if(!d)return '';
  const n=-daysAgo(d);
  const t=n<0?Math.abs(n)+'d overdue':n===0?'due today':'in '+n+'d';
  const c=n<0?'var(--red)':n===0?'#C6943E':'#2E7D32';
  return '<span class="duechip" style="background:'+c+'22;color:'+c+'">'+t+' · '+fmtDe(d)+'</span>';
}
function rowHtml(it,sec){
  const r=it.rec;
  const lab=rowLabel(r),sub=lab.sub;
  const kindTag='<span class="qk qk-'+it.kind+'">'+QUEUE_KINDS[it.kind]+'</span>';
  const deadBtn=isDeadSelf(r)?'':' <button class="sm" data-act="dead" data-id="'+r.id+'">Dead</button>';
  const acts=it.kind==='deadmail'
    ?'<button class="sm primary" data-act="revive" data-id="'+r.id+'">Zurückholen</button> <button class="sm" data-act="deadok" data-id="'+r.id+'">Ok</button>'
    :it.kind==='reply'
    // same four buttons as every other row (Leif 08.11.2026): Done = answered, +2w = remind again in two weeks
    ?'<button class="sm primary" data-act="dismiss" data-id="'+r.id+'" data-key="'+it.key+'" title="Answered or nothing to answer">Done</button> <button class="sm" data-act="rsnooze" data-id="'+r.id+'" data-key="'+it.key+'" title="Remind me again in two weeks">+2w</button> <button class="sm" data-act="ignore" data-id="'+r.id+'" data-key="'+it.key+'" title="bis zur nächsten Aktivität">Hide</button>'+deadBtn
    :it.kind==='stale'||it.kind==='noaction'||it.kind==='revisit'
    ?'<button class="sm" data-act="set" data-id="'+r.id+'">Set action</button> <button class="sm" data-act="dismiss" data-id="'+r.id+'" data-key="'+it.key+'">Dismiss</button>'+deadBtn
    :'<button class="sm primary" data-act="done" data-id="'+r.id+'" data-key="'+it.key+'" title="Log as done">Done</button> <button class="sm" data-act="2w" data-id="'+r.id+'" data-key="'+it.key+'" title="Push by two weeks">+2w</button> <button class="sm" data-act="ignore" data-id="'+r.id+'" data-key="'+it.key+'" title="bis zur nächsten Aktivität">Hide</button>'+deadBtn;
  return '<div class="qrow" data-open="'+r.id+'" data-key="'+esc(it.key)+'"'+(sec?' data-sec="'+sec+'" draggable="true"':'')+'>'
    +'<div class="q-acts">'+(sec?'<span class="q-grip" title="Drag to reorder">⋮⋮</span>':'')+acts+'</div>'
    +'<div class="q-name"><b>'+esc(fixUml(lab.top))+'</b>'+(sub?'<div class="muted" style="font-size:10px">'+esc(fixUml(sub))+'</div>':'')+(r.kind==='target'?'<div>'+stagePill(r.stage)+'</div>':'')+'</div>'
    +'<div class="q-type">'+grpChip(r)+'</div>'
    +'<div class="q-step">'+kindTag+' '+(it.link?'<a href="'+esc(it.link)+'" target="_blank">'+esc(fixUml(it.text||''))+'</a>':esc(fixUml(it.text||'')))+'</div>'
    +'<div class="q-due">'+dueTxt(it.due)+'</div>'
    +'<div class="q-last muted">'+(lastTouch(r)?fmtDe(lastTouch(r)):'-')+'</div>'
    +'</div>';
}
const URGENT_KINDS=['deadmail','overdue','promise','reply','due','cadence'];
const DECIDE_KINDS=['noaction','stale','revisit'];
// Manual order (Leif 04.11.2026): rows are dragged up and down within Today and within Needs a decision.
// S.homeOrder holds a rank per queue key. An item without a rank (new in the queue) keeps its default slot;
// the ranked items fill the other slots in rank order. Done, +2w, Hide, Dismiss and Dead drop the rank.
function ordered(list){
  const o=S.homeOrder||{};
  const ranked=list.filter(i=>o[i.key]!=null).sort((a,b)=>o[a.key]-o[b.key]);
  let j=0;return list.map(i=>o[i.key]!=null?ranked[j++]:i);
}
export function moveQueueItem(from,to,after){
  const items=buildQueue();
  const sec=[URGENT_KINDS,DECIDE_KINDS].find(s=>items.some(i=>i.key===from&&s.includes(i.kind)));
  if(!sec||from===to)return false;
  const list=ordered(items.filter(i=>sec.includes(i.kind))).map(i=>i.key);
  if(!list.includes(to))return false;
  list.splice(list.indexOf(from),1);
  list.splice(list.indexOf(to)+(after?1:0),0,from);
  const o={};const old=S.homeOrder||{};
  items.filter(i=>!sec.includes(i.kind)).forEach(i=>{if(old[i.key]!=null)o[i.key]=old[i.key]});
  list.forEach((k,n)=>o[k]=n);
  S.homeOrder=o;return true;
}
export function homeUrgentCount(){return buildQueue().filter(i=>URGENT_KINDS.includes(i.kind)).length}
export function renderHome(){
  const body=document.getElementById('homeQueue');if(!body)return;
  homeQ=((document.getElementById('homeSearch')||{}).value||'').toLowerCase().trim();
  const items=buildQueue();
  const urgent=items.filter(i=>URGENT_KINDS.includes(i.kind));
  const badge=document.getElementById('homeBadge');if(badge){badge.style.display=urgent.length?'inline-block':'none';badge.textContent=urgent.length}
  const counts={};items.forEach(i=>{const g=grpOf(i.rec);counts[g]=(counts[g]||0)+1});
  const bar=document.getElementById('homeGroups');
  if(bar)bar.innerHTML='<button class="sm'+(homeGrp?'':' vbtn on')+'" data-grp="">All ('+items.length+')</button>'+GRP_DEF.map(g=>'<button class="sm'+(homeGrp===g.k?' vbtn on':'')+'" style="border-left:4px solid '+g.c+'" data-grp="'+g.k+'">'+g.t+' ('+(counts[g.k]||0)+')</button>').join('');
  const shown=items.filter(matches);
  const sections=[URGENT_KINDS,DECIDE_KINDS];
  let h='';
  const first=ordered(items.filter(i=>sections[0].includes(i.kind))).filter(matches),rest=ordered(items.filter(i=>sections[1].includes(i.kind))).filter(matches);
  const hd='<div class="qhead"><div></div><div>Name</div><div>Type</div><div>Step</div><div>Due</div><div>Last contact</div></div>';
  h+='<div class="section"><div class="section-hdr">Today ('+first.length+')'+(homeKind?' <button class="sm" style="background:#fff" data-kind="">Clear filter: '+QUEUE_KINDS[homeKind]+'</button>':'')+'</div>'+(first.length?hd+first.map(i=>rowHtml(i,'t')).join(''):'<p class="muted" style="padding:14px">Nothing due. '+(items.length?'':'Enjoy it.')+'</p>')+'</div>';
  if(rest.length)h+='<div class="section"><div class="section-hdr" style="background:#434F80">Needs a decision ('+rest.length+')</div>'+hd+rest.map(i=>rowHtml(i,'d')).join('')+'</div>';
  const later=laterThisWeek().filter(r=>!homeGrp||grpOf(r)===homeGrp);
  if(later.length)h+='<details class="psec"><summary>Later this week ('+later.length+')</summary>'+hd+later.map(r=>rowHtml({rec:r,kind:isPromise(r)?'promise':'due',key:'due_'+r.id,text:r.nextAction||'',due:r.nextDate})).join('')+'</details>';
  const ign=allRecs().filter(isIgnoredRec);
  if(ign.length)h+='<p class="muted" style="font-size:11px;padding:4px 8px">Hidden until the next activity: '+ign.map(r=>esc(dispName(r))+' <a href="#" data-unignore="'+r.id+'">bring back</a>').join(' &middot; ')+'</p>';
  body.innerHTML=h;
  renderScore();
  renderRecent();
}
function scoreBox(s,open,box,lettersWarn){
  const tile=(v,l,k,warn)=>'<div class="kpi'+(warn?' warn':'')+(open===k?' on':'')+'" data-wk="'+k+'" data-wb="'+box+'" title="Show what this counts"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>';
  const lst=open&&s.lists[open];
  return '<div class="score">'
    +tile(s.letters+' / '+s.target,'Companies lettered','letters',lettersWarn)
    +tile(s.replies,'Replies','replies')
    +tile(s.meetings,'Meetings and calls','meetings')
    +tile(s.dealsIn,'Deals from partners','dealsIn')
    +tile(s.namesOut,'Names given to partners','namesOut')
    +tile(s.live,'Live deals','live')
    +'</div>'
    +(lst?'<div class="wklist">'+(lst.length?lst.map(i=>'<div class="wkrow" data-open="'+i.rec.id+'"><span class="muted">'+fmtDe((i.date||'').slice(0,10))+'</span> <b>'+esc(fixUml(dispName(i.rec)))+'</b>'+(i.text?'<div class="muted">'+esc(fixUml(i.text))+'</div>':'')+'</div>').join(''):'<div class="muted">Nothing in this week.</div>')+'</div>':'');
}
function renderScore(){
  const el=document.getElementById('homeScore');if(!el)return;
  const s=weekScore();
  el.innerHTML=scoreBox(s,wkOpen,'cur',s.letters<s.target&&new Date().getDay()>=4)+'<div class="muted" style="font-size:10px;padding:4px 8px">Week of '+fmtDe(s.weekStart)+'</div>';
  // the comparison box: last week by default, any earlier week from the picker
  const ep=document.getElementById('homeScorePrev');if(!ep)return;
  const weeks=pastWeeks();if(!weeks.length){ep.innerHTML='<p class="muted" style="padding:8px">No earlier week yet.</p>';return}
  if(!prevWs||!weeks.includes(prevWs))prevWs=weeks[0];
  const p=prevScore(prevWs);
  ep.innerHTML='<div style="padding:6px 8px 0"><select id="homeWeekSel" class="sm" aria-label="Week to compare">'+weeks.map(w=>'<option value="'+w+'"'+(w===prevWs?' selected':'')+'>Week of '+fmtDe(w)+(w===weeks[0]?' (last week)':'')+'</option>').join('')+'</select></div>'
    +scoreBox(p,wkOpenPrev,'prev',p.letters<p.target);
  const sel=document.getElementById('homeWeekSel');if(sel)sel.addEventListener('change',()=>setPrevWeek(sel.value));
}
function renderRecent(){
  const el=document.getElementById('recentBody');if(!el)return;
  const _seenT=new Set();
  const recent=allRecs().map(r=>{const ts=touchList(r).filter(t=>!isSysNote(t));if(!ts.length)return null;const wk=ts.filter(t=>daysAgo(t.date)<7).length;return {r,t:ts[0],n:wk}}).filter(Boolean)
    .sort((a,b)=>((b.t.date||'').localeCompare(a.t.date||''))||((a.r.kind==='person'?0:1)-(b.r.kind==='person'?0:1)))
    .filter(x=>{const k=(x.t.date||'')+'|'+(x.t.subject||'');if(_seenT.has(k))return false;_seenT.add(k);return true})
    .slice(0,30);
  el.innerHTML=recent.length?'<table><tr><th style="width:64px">Date</th><th style="width:20%">Name</th><th style="width:30%">Subject</th><th>Summary</th></tr>'+recent.map(x=>{
    const _ai=x.r.lastSummary&&x.r.lastSummaryDate&&x.r.lastSummaryDate>=(x.t.date||'').slice(0,10);
    const _base=cleanPrev(x.t.prev)||x.t.note||'';
    const sum=_ai?(x.r.lastSummary):((_base?(x.t.dir==='out'?'You: ':'They: ')+_base:'')+(x.r.nextAction?' → Next: '+x.r.nextAction.slice(0,90):''));
    let sec='';
    if(x.r.kind==='person')sec=x.r.firm||'';
    else sec=primaryName(x.r)
    const subj=(x.t.dir==='out'?'<span style="color:#2E3C65" title="Sent by you">↑</span> ':'<span style="color:#C6943E" title="Received">↓</span> ')+(x.t.link?'<a href="'+esc(x.t.link)+'" target="_blank" data-click="!">'+esc(x.t.subject)+'</a>':esc(x.t.subject));
    return '<tr class="rowlink" data-open="'+x.r.id+'"><td class="muted" style="white-space:nowrap;vertical-align:top">'+fmtD(x.t.date)+'</td><td style="vertical-align:top"><b>'+esc(x.r.kind==='person'?dispName(x.r):(sec||dispName(x.r)))+'</b><div class="muted" style="font-size:11px">'+esc(x.r.kind==='person'?sec:dispName(x.r))+'</div>'+(x.n>1?' <span class="chip">+'+(x.n-1)+' this wk</span>':'')+'</td><td style="vertical-align:top">'+subj+'</td><td class="muted" style="vertical-align:top">'+esc(sum.slice(0,180))+'</td></tr>'}).join('')+'</table>':'<p class="muted" style="padding:12px">No activity yet. Sync to pull emails.</p>';
}
// One delegated listener for the whole panel: row actions, filters, opening records.
export function initHome(){
  const panel=document.getElementById('p-home');if(!panel||panel._wired)return;panel._wired=true;
  panel.addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]');
    if(b){e.stopPropagation();const id=b.dataset.id,key=b.dataset.key;
      const rk=b.closest('.qrow')?.dataset.key;if(rk&&S.homeOrder&&S.homeOrder[rk]!=null&&b.dataset.act!=='set')delete S.homeOrder[rk];
      if(b.dataset.act==='set'){import('./actions.js').then(m=>m.quickSetAction(id))}
      else if(b.dataset.act==='dead')markDead(id);
      else if(b.dataset.act==='revive')reviveRec(id);
      else if(b.dataset.act==='deadok')deadMailOk(id);
      else if(b.dataset.act==='rsnooze'){S.snoozeUntil=S.snoozeUntil||{};S.snoozeUntil[key]=addDays(today(),14);import('../store/firebase.js').then(m=>{m.save();renderHome()})}
      else if(b.dataset.act==='dismiss'){S.dismissed=S.dismissed||{};S.dismissed[key]=today();import('../store/firebase.js').then(m=>{m.save();renderHome()})}
      else sugAct(b.dataset.act,id,key);
      return}
    const g=e.target.closest('[data-grp]');if(g){setHomeGrp(g.dataset.grp);return}
    const k=e.target.closest('[data-kind]');if(k){setHomeKind(k.dataset.kind);return}
    const wk=e.target.closest('[data-wk]');if(wk){toggleWeekList(wk.dataset.wk,wk.dataset.wb);return}
    if(e.target.closest('#homeWeekSel'))return;
    const go=e.target.closest('[data-go]');if(go){goTab(go.dataset.go);return}
    const u=e.target.closest('a[data-unignore]');if(u){e.preventDefault();unignoreRec(u.dataset.unignore);return}
    if(e.target.closest('a[href]'))return;
    const row=e.target.closest('[data-open]');if(row){const r=findRec(row.dataset.open);if(r)openProfile(r)}
  });
  const s=document.getElementById('homeSearch');if(s)s.addEventListener('input',renderHome);
  let dragKey=null,dragSec=null;
  const clearMarks=()=>panel.querySelectorAll('.dragging,.drop-a,.drop-b').forEach(x=>x.classList.remove('dragging','drop-a','drop-b'));
  panel.addEventListener('dragstart',e=>{const r=e.target.closest&&e.target.closest('.qrow[data-sec]');if(!r)return;
    dragKey=r.dataset.key;dragSec=r.dataset.sec;r.classList.add('dragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',dragKey)}catch(_){}});
  panel.addEventListener('dragover',e=>{const r=e.target.closest('.qrow[data-sec]');if(!dragKey||!r||r.dataset.sec!==dragSec)return;e.preventDefault();
    if(r.dataset.key===dragKey)return;const after=e.clientY>r.getBoundingClientRect().top+r.offsetHeight/2;
    panel.querySelectorAll('.drop-a,.drop-b').forEach(x=>x.classList.remove('drop-a','drop-b'));r.classList.add(after?'drop-a':'drop-b')});
  panel.addEventListener('drop',e=>{const r=e.target.closest('.qrow[data-sec]');if(!dragKey||!r||r.dataset.sec!==dragSec)return;e.preventDefault();
    const after=r.classList.contains('drop-a'),from=dragKey;dragKey=null;clearMarks();
    if(moveQueueItem(from,r.dataset.key,after))import('../store/firebase.js').then(m=>{m.save();renderHome()})});
  panel.addEventListener('dragend',()=>{dragKey=null;clearMarks()});
}
