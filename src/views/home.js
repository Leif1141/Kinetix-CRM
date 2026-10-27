import {letterDoneStep} from '../state.js';
import {ACTIVE_STAGES, LETTER_TARGET_WEEK, LIVE} from '../constants.js';
import {S, allRecs, cadenceOf, cadDue, dispName, findRec, fixUml, grpOf, GRP_DEF, isDismissed, isIgnoredRec, isStale, isSysNote, lastTouch, liveOnly, orgPeople, orgTouches, rowLabel, tType, touchList} from '../state.js';
import {addDays, cleanPrev, daysAgo, esc, fmtD, fmtDe, today, weekStart} from '../util.js';
import {grpChip, stagePill} from './ui.js';
import {sugAct, unignoreRec} from './actions.js';
import {openProfile} from './record.js';
import {goTab} from '../main.js';

// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS ENGINE (keys drive Done / snooze / ignore)
// ═══════════════════════════════════════════════════════════════
export function sugHead(r){
  const n=dispName(r);
  const extra = r.kind==='advisor' ? (r.contact||'') : (r.kind==='person' ? (r.firm||'') : (r.location||''));
  const t = r.category||r.ptype||r.type||'';
  const bits=[extra,t].filter(Boolean).join(', ');
  return bits ? n+' ('+bits+')' : n;
}
export function suggestions(){
  const byRec=new Map();
  suggestionsRaw().filter(s=>!isDismissed(s.key)&&!isIgnoredRec(s.rec)).forEach(s=>{const g=byRec.get(s.rec.id);if(!g){s.also=[];byRec.set(s.rec.id,s)}else{g.also.push(s)}});
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
export const QUEUE_KINDS={overdue:'Overdue',promise:'Promise made',due:'Due today',cadence:'Letter cadence',noaction:'Live deal without next step',stale:'Stale live deal',revisit:'Revisit date reached'};
let homeGrp='',homeQ='',homeKind='';
try{homeGrp=localStorage.getItem('kxHomeGrp')||''}catch(e){}

export function buildQueue(){
  const t=today();
  const items=[];
  const all=allRecs().filter(r=>!isIgnoredRec(r));
  all.filter(r=>r.nextDate&&r.nextDate<=t&&!letterDoneStep(r)).forEach(r=>{
    const kind=isPromise(r)?'promise':(r.nextDate<t?'overdue':'due');
    items.push({rec:r,kind,key:'due_'+r.id,text:r.nextAction||'follow up',due:r.nextDate,sort:(kind==='promise'?'0':'1')+r.nextDate});
  });
  (S.companies||[]).filter(c=>!isIgnoredRec(c)&&cadDue(c)&&!(c.nextDate&&c.nextDate<=t&&!letterDoneStep(c))).forEach(c=>{
    const cd=cadenceOf(c);
    items.push({rec:c,kind:'cadence',key:'cdz_'+c.id+'_'+cd.next.k,text:'Letter of '+fmtDe(cd.sent)+(cd.via?' via '+cd.via:'')+': '+cd.next.label,due:cd.next.due,sort:'2'+cd.next.due});
  });
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
  return allRecs().filter(r=>!isIgnoredRec(r)&&r.nextDate&&r.nextDate>t&&!letterDoneStep(r)&&r.nextDate<=(end>addDays(t,6)?end:addDays(t,6))).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
}

export function weekScore(){
  const ws=weekStart(today());
  const inWeek=t=>(t.date||'').slice(0,10)>=ws;
  const seen=new Set();const allT=[];
  allRecs().forEach(r=>Object.entries(r.touches||{}).forEach(([k,t])=>{if(!seen.has(k)){seen.add(k);allT.push(t)}}));
  const week=allT.filter(inWeek).filter(t=>!isSysNote(t));
  const letters=week.filter(t=>tType(t)==='Letter'&&t.dir!=='in').length;
  const replied=new Set();
  (S.companies||[]).forEach(c=>{if(orgTouches(c).some(t=>inWeek(t)&&t.dir==='in'&&tType(t)==='Email'))replied.add(c.id)});
  const meetings=week.filter(t=>tType(t)==='Meeting').length;
  const names=(S.companies||[]).filter(c=>{const first=(c.stageLog||[])[0];return first&&first.date>=ws&&PARTNER_CH.includes(c.channel||'')}).length;
  const noNext=buildQueue().filter(i=>i.kind==='noaction').length;
  return {letters,target:LETTER_TARGET_WEEK,replies:replied.size,meetings,names,noNext,weekStart:ws};
}

export function setHomeGrp(g){homeGrp=homeGrp===g?'':g;try{localStorage.setItem('kxHomeGrp',homeGrp)}catch(e){}renderHome()}
export function setHomeKind(k){homeKind=homeKind===k?'':k;renderHome()}
function matches(item){
  if(homeGrp&&grpOf(item.rec)!==homeGrp)return false;
  if(homeKind&&item.kind!==homeKind)return false;
  if(homeQ){const r=item.rec;const h=(dispName(r)+' '+(r.contact||'')+' '+(r.firm||'')+' '+(item.text||'')).toLowerCase();if(!h.includes(homeQ))return false}
  return true;
}
function dueTxt(d){
  if(!d)return '';
  const n=-daysAgo(d);
  const t=n<0?Math.abs(n)+'d overdue':n===0?'due today':'in '+n+'d';
  const c=n<0?'var(--red)':n===0?'#C6943E':'#2E7D32';
  return '<span class="duechip" style="background:'+c+'22;color:'+c+'">'+t+' · '+fmtDe(d)+'</span>';
}
function rowHtml(it){
  const r=it.rec;
  const lab=rowLabel(r),sub=lab.sub;
  const kindTag='<span class="qk qk-'+it.kind+'">'+QUEUE_KINDS[it.kind]+'</span>';
  const acts=it.kind==='stale'||it.kind==='noaction'||it.kind==='revisit'
    ?'<button class="sm" data-act="set" data-id="'+r.id+'">Set action</button> <button class="sm" data-act="dismiss" data-id="'+r.id+'" data-key="'+it.key+'">Dismiss</button>'
    :'<button class="sm primary" data-act="done" data-id="'+r.id+'" data-key="'+it.key+'" title="Log as done">Done</button> <button class="sm" data-act="1w" data-id="'+r.id+'" data-key="'+it.key+'">+1w</button> <button class="sm" data-act="1m" data-id="'+r.id+'" data-key="'+it.key+'">+1m</button> <button class="sm" data-act="ignore" data-id="'+r.id+'" data-key="'+it.key+'" title="Hide until there is new activity">Ignore</button>';
  return '<div class="qrow" data-open="'+r.id+'">'
    +'<div class="q-acts">'+acts+'</div>'
    +'<div class="q-name"><b>'+esc(fixUml(lab.top))+'</b>'+(sub?'<div class="muted" style="font-size:10px">'+esc(fixUml(sub))+'</div>':'')+(r.kind==='target'?'<div>'+stagePill(r.stage)+'</div>':'')+'</div>'
    +'<div class="q-type">'+grpChip(r)+'</div>'
    +'<div class="q-step">'+kindTag+' '+esc(fixUml(it.text||''))+'</div>'
    +'<div class="q-due">'+dueTxt(it.due)+'</div>'
    +'<div class="q-last muted">'+(lastTouch(r)?fmtDe(lastTouch(r)):'-')+'</div>'
    +'</div>';
}
export function homeUrgentCount(){return buildQueue().filter(i=>['overdue','promise','due','cadence'].includes(i.kind)).length}
export function renderHome(){
  const body=document.getElementById('homeQueue');if(!body)return;
  homeQ=((document.getElementById('homeSearch')||{}).value||'').toLowerCase().trim();
  const items=buildQueue();
  const urgent=items.filter(i=>['overdue','promise','due','cadence'].includes(i.kind));
  const badge=document.getElementById('homeBadge');if(badge){badge.style.display=urgent.length?'inline-block':'none';badge.textContent=urgent.length}
  const counts={};items.forEach(i=>{const g=grpOf(i.rec);counts[g]=(counts[g]||0)+1});
  const bar=document.getElementById('homeGroups');
  if(bar)bar.innerHTML='<button class="sm'+(homeGrp?'':' vbtn on')+'" data-grp="">All ('+items.length+')</button>'+GRP_DEF.map(g=>'<button class="sm'+(homeGrp===g.k?' vbtn on':'')+'" style="border-left:4px solid '+g.c+'" data-grp="'+g.k+'">'+g.t+' ('+(counts[g.k]||0)+')</button>').join('');
  const shown=items.filter(matches);
  const sections=[['overdue','promise','due','cadence'],['noaction','stale','revisit']];
  let h='';
  const first=shown.filter(i=>sections[0].includes(i.kind)),rest=shown.filter(i=>sections[1].includes(i.kind));
  const hd='<div class="qhead"><div></div><div>Name</div><div>Type</div><div>Step</div><div>Due</div><div>Last contact</div></div>';
  h+='<div class="section"><div class="section-hdr">Today ('+first.length+')'+(homeKind?' <button class="sm" style="background:#fff" data-kind="">Clear filter: '+QUEUE_KINDS[homeKind]+'</button>':'')+'</div>'+(first.length?hd+first.map(rowHtml).join(''):'<p class="muted" style="padding:14px">Nothing due. '+(items.length?'':'Enjoy it.')+'</p>')+'</div>';
  if(rest.length)h+='<div class="section"><div class="section-hdr" style="background:#434F80">Needs a decision ('+rest.length+')</div>'+hd+rest.map(rowHtml).join('')+'</div>';
  const later=laterThisWeek().filter(r=>!homeGrp||grpOf(r)===homeGrp);
  if(later.length)h+='<details class="psec"><summary>Later this week ('+later.length+')</summary>'+hd+later.map(r=>rowHtml({rec:r,kind:isPromise(r)?'promise':'due',key:'due_'+r.id,text:r.nextAction||'',due:r.nextDate})).join('')+'</details>';
  const ign=allRecs().filter(isIgnoredRec);
  if(ign.length)h+='<p class="muted" style="font-size:11px;padding:4px 8px">Ignored until the next activity: '+ign.map(r=>esc(dispName(r))+' <a href="#" data-unignore="'+r.id+'">bring back</a>').join(' &middot; ')+'</p>';
  body.innerHTML=h;
  renderScore();
  renderRecent();
}
function renderScore(){
  const el=document.getElementById('homeScore');if(!el)return;
  const s=weekScore();
  const tile=(v,l,k,warn)=>'<div class="kpi'+(warn?' warn':'')+(homeKind===k?' on':'')+'"'+(k?' data-kind="'+k+'"':' data-go="pipeline"')+'><div class="v">'+v+'</div><div class="l">'+l+'</div></div>';
  el.innerHTML='<div class="score">'
    +tile(s.letters+' / '+s.target,'Letters out','',s.letters<s.target&&new Date().getDay()>=4)
    +tile(s.replies,'Replies','')
    +tile(s.meetings,'Meetings','')
    +tile(s.names,'Names from partners','')
    +tile(s.noNext,'Live deals without next step','noaction',s.noNext>0)
    +'</div><div class="muted" style="font-size:10px;padding:4px 8px">Week of '+fmtDe(s.weekStart)+'</div>';
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
    else{const pp=orgPeople(x.r);sec=(pp[0]&&pp[0].name)||x.r.contact||''}
    const subj=(x.t.dir==='out'?'<span style="color:#2E3C65" title="Sent by you">↑</span> ':'<span style="color:#C6943E" title="Received">↓</span> ')+(x.t.link?'<a href="'+esc(x.t.link)+'" target="_blank" data-click="!">'+esc(x.t.subject)+'</a>':esc(x.t.subject));
    return '<tr class="rowlink" data-open="'+x.r.id+'"><td class="muted" style="white-space:nowrap;vertical-align:top">'+fmtD(x.t.date)+'</td><td style="vertical-align:top"><b>'+esc(x.r.kind==='person'?dispName(x.r):(sec||dispName(x.r)))+'</b><div class="muted" style="font-size:11px">'+esc(x.r.kind==='person'?sec:dispName(x.r))+'</div>'+(x.n>1?' <span class="chip">+'+(x.n-1)+' this wk</span>':'')+'</td><td style="vertical-align:top">'+subj+'</td><td class="muted" style="vertical-align:top">'+esc(sum.slice(0,180))+'</td></tr>'}).join('')+'</table>':'<p class="muted" style="padding:12px">No activity yet. Sync to pull emails.</p>';
}
// One delegated listener for the whole panel: row actions, filters, opening records.
export function initHome(){
  const panel=document.getElementById('p-home');if(!panel||panel._wired)return;panel._wired=true;
  panel.addEventListener('click',e=>{
    const b=e.target.closest('button[data-act]');
    if(b){e.stopPropagation();const id=b.dataset.id,key=b.dataset.key;
      if(b.dataset.act==='set'){import('./actions.js').then(m=>m.quickSetAction(id))}
      else if(b.dataset.act==='dismiss'){S.dismissed=S.dismissed||{};S.dismissed[key]=today();import('../store/firebase.js').then(m=>{m.save();renderHome()})}
      else sugAct(b.dataset.act,id,key);
      return}
    const g=e.target.closest('[data-grp]');if(g){setHomeGrp(g.dataset.grp);return}
    const k=e.target.closest('[data-kind]');if(k){setHomeKind(k.dataset.kind);return}
    const go=e.target.closest('[data-go]');if(go){goTab(go.dataset.go);return}
    const u=e.target.closest('a[data-unignore]');if(u){e.preventDefault();unignoreRec(u.dataset.unignore);return}
    if(e.target.closest('a[href]'))return;
    const row=e.target.closest('[data-open]');if(row){const r=findRec(row.dataset.open);if(r)openProfile(r)}
  });
  const s=document.getElementById('homeSearch');if(s)s.addEventListener('input',renderHome);
}
