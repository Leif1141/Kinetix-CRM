// ═══════════════════════════════════════════════════════════════
// REPORTS (Leif 13.11.2026): a dashboard that answers what to change, not a log of counts.
//  1. Am I doing enough?      KPI tiles with trend and change against the previous period
//  2. Is it working?          weekly outreach against the target, conversations per week
//  3. Where does it break?    target funnel with conversion from step to step
//  4. What works best?        sources compared by response, conversations, NDA and live deals
//  5. What needs me now?      live deals by days without contact, partners by effort and yield
//  6. What do I learn?        why targets drop out
// Every bar, row and tile opens the records behind it in a side list; a record opens from there.
// ═══════════════════════════════════════════════════════════════
import {ACTIVE_STAGES, STALE_DAYS} from '../constants.js';
import {S, deadCatOf, dispName, fixUml, lastTouch, liveOnly, orgTouches, tType} from '../state.js';
import {addDays, daysAgo, esc, fmtAgo, fmtDe, today, weekStart} from '../util.js';
import {weekScore, pastWeeks} from './home.js';
import {partnerStats} from './reports.js';
import {catOf} from './lists.js';
import {stagePill} from './ui.js';

const NAVY='#2E3C65',NAVY_L='#8C97B8',GRID='#ECECF1',INK='#000',MUTED='#595959';
const STEPS=[['Approached',0],['Replied',1],['Meeting / call',2],['NDA / info',3],['LOI',4],['Diligence',5]];
const RANK={Contacted:0,Replied:1,Meeting:2,NDA:3,LOI:4,Diligence:5,Closed:6};
const PERIODS=[['4','4 weeks'],['12','12 weeks'],['all','Since start']];
let period='12',charts=[],drill=null,showAllPartners=false;
try{period=localStorage.getItem('kxRepPeriod')||'12'}catch(e){}

// ---------- data ----------
const cos=()=>(S.companies||[]).filter(c=>!c.archived&&!c.mergedInto);
const realT=t=>t&&tType(t)!=='Note'&&!/^✔/.test(String(t.subject||''));
// first contact: the earliest real exchange, or the first stage beyond Identified
function approached(c){
  let d='';orgTouches(c).forEach(t=>{if(!realT(t))return;const x=(t.date||'').slice(0,10);if(x&&(!d||x<d))d=x});
  (c.stageLog||[]).forEach(l=>{if(l.stage&&l.stage!=='Identified'&&l.date&&(!d||l.date<d))d=String(l.date).slice(0,10)});
  return d;
}
// furthest step ever reached, from the stage history, today's stage and the exchanges themselves
function reached(c){
  let r=approached(c)?0:-1;
  [c.stage,...(c.stageLog||[]).map(l=>l.stage)].forEach(s=>{if(s in RANK)r=Math.max(r,RANK[s])});
  orgTouches(c).forEach(t=>{if(!realT(t))return;const ty=tType(t);if(ty==='Meeting'||ty==='Call')r=Math.max(r,2);else if(t.dir==='in')r=Math.max(r,1)});
  return r;
}
function firstReply(c,from){let d='';orgTouches(c).forEach(t=>{if(realT(t)&&t.dir==='in'){const x=(t.date||'').slice(0,10);if(x>=from&&(!d||x<d))d=x}});return d}
function source(c){
  const ch=(c.channel||'').trim();
  if(!ch)return '(not set)';
  if(/^succession signal|^press monitor/i.test(ch))return 'Own research';
  return ch;
}
const LIVE_NOW=['Replied','Meeting','NDA','LOI','Diligence'];
const isLive=c=>LIVE_NOW.includes(c.stage);

function weeksOf(p){
  const cur=weekStart(today());
  const past=pastWeeks();
  const n=p==='all'?past.length+1:+p;
  return [cur,...past].slice(0,n).reverse(); // oldest first
}
function win(p){const w=weeksOf(p);return {from:w[0],to:addDays(w[w.length-1],7),weeks:w}}
function prevWindow(p){if(p==='all')return null;const n=+p,w=win(p);return {from:addDays(w.from,-7*n),to:w.from}}
const inW=(d,w)=>d&&d>=w.from&&d<w.to;

// ---------- drill-down ----------
function openDrill(title,rows,note){drill={title,rows,note};renderDrill()}
export function closeRepDrill(){drill=null;renderDrill()}
function renderDrill(){
  const el=document.getElementById('rpDrill');if(!el)return;
  if(!drill){el.hidden=true;el.innerHTML='';return}
  el.hidden=false;
  el.innerHTML='<div class="rp-dh"><b>'+esc(drill.title)+'</b><span class="muted">'+drill.rows.length+'</span><button class="sm" data-click="closeRepDrill">Close</button></div>'
    +(drill.note?'<div class="rp-dn">'+esc(drill.note)+'</div>':'')
    +(drill.rows.length?drill.rows.map(x=>'<div class="rp-di" data-click="openRec|'+x.rec.id+'|$e"><div><b>'+esc(fixUml(dispName(x.rec)))+'</b>'+(x.rec.kind==='target'&&x.rec.stage?' '+stagePill(x.rec.stage):'')+'</div>'
      +'<div class="rp-dm">'+(x.date?fmtDe(x.date)+' · ':'')+esc(fixUml(x.text||''))+'</div></div>').join(''):'<div class="rp-dn">Nothing in this selection.</div>');
}
export function setRepPeriod(p){period=p;try{localStorage.setItem('kxRepPeriod',p)}catch(e){}drill=null;renderInsights()}
export function toggleRepPartners(){showAllPartners=!showAllPartners;renderInsights()}

// ---------- small render helpers ----------
const pct=(a,b)=>b?Math.round(100*a/b)+'%':'-';
function spark(vals){
  if(!vals.length)return '';
  const w=120,h=28,max=Math.max(1,...vals),step=vals.length>1?w/(vals.length-1):0;
  const pts=vals.map((v,i)=>(i*step).toFixed(1)+','+(h-2-(v/max)*(h-6)).toFixed(1)).join(' ');
  return '<svg class="rp-spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+NAVY+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
}
function delta(cur,prev,unit){
  if(prev==null)return '';
  const d=cur-prev;if(!d)return '<span class="rp-delta">same as previous period</span>';
  return '<span class="rp-delta '+(d>0?'up':'down')+'">'+(d>0?'▲ +':'▼ ')+(unit==='pp'?d+' pp':d)+' vs previous period</span>';
}
function chart(id,cfg){
  const el=document.getElementById(id);if(!el||!window.Chart)return;
  const c=new Chart(el,cfg);charts.push(c);return c;
}
const baseOpts=(onPick,extra)=>Object.assign({responsive:true,maintainAspectRatio:false,animation:false,
  onClick:(e,els)=>{if(els&&els.length)onPick(els[0].index)},
  onHover:(e,els)=>{e.native&&(e.native.target.style.cursor=els&&els.length?'pointer':'default')},
  plugins:{legend:{display:false},datalabels:{display:false},tooltip:{backgroundColor:'#fff',titleColor:INK,bodyColor:INK,borderColor:'#BBBBBB',borderWidth:1,titleFont:{family:'Arial',size:11},bodyFont:{family:'Arial',size:11},displayColors:false}},
  scales:{x:{grid:{display:false},ticks:{color:INK,font:{family:'Arial',size:10}}},y:{beginAtZero:true,grid:{color:GRID},border:{display:false},ticks:{color:INK,font:{family:'Arial',size:10},precision:0}}}},extra||{});

// ---------- main ----------
export function renderInsights(){
  const root=document.getElementById('rpRoot');if(!root)return;
  charts.forEach(c=>{try{c.destroy()}catch(e){}});charts=[];
  const W=win(period),P=prevWindow(period);
  const weeks=W.weeks.map(w=>weekScore(w));
  const sum=k=>weeks.reduce((a,s)=>a+s[k],0);
  const prevWeeks=P?Array.from({length:+period},(_,i)=>weekScore(addDays(P.from,7*i))):null;
  const psum=k=>prevWeeks?prevWeeks.reduce((a,s)=>a+s[k],0):null;
  const allC=cos();
  const cohort=allC.filter(c=>inW(approached(c),W));
  const pcohort=P?allC.filter(c=>inW(approached(c),P)):null;
  const respRate=list=>{const a=list.length,r=list.filter(c=>reached(c)>=1).length;return {a,r,p:a?Math.round(100*r/a):0}};
  const RR=respRate(cohort),PRR=pcohort?respRate(pcohort):null;
  const liveNow=allC.filter(isLive);
  const liveStart=weeks[0]?weeks[0].live:0;
  const target=(weeks[0]&&weeks[0].target)||10;

  // KPI tiles
  const tiles=[
    {k:'letters',v:sum('letters'),l:'Companies lettered',sub:'target '+(target*weeks.length)+' ('+target+' a week)',d:delta(sum('letters'),psum('letters')),sp:weeks.map(s=>s.letters),
      pick:()=>openDrill('Companies lettered',weeks.flatMap(s=>s.lists.letters))},
    {k:'resp',v:RR.a?RR.p+'%':'-',l:'Owner response rate',sub:RR.r+' of '+RR.a+' targets first contacted in the period',d:PRR&&PRR.a>=10&&RR.a>=10?delta(RR.p,PRR.p,'pp'):'',sp:null,
      pick:()=>openDrill('Targets first contacted in the period',cohort.map(c=>({rec:c,date:approached(c),text:(reached(c)>=1?'answered':'no answer yet')+' · '+source(c)})).sort((a,b)=>b.date.localeCompare(a.date)))},
    {k:'meet',v:sum('meetings'),l:'Meetings and calls',sub:'owners, partners and advisers',d:delta(sum('meetings'),psum('meetings')),sp:weeks.map(s=>s.meetings),
      pick:()=>openDrill('Meetings and calls',weeks.flatMap(s=>s.lists.meetings))},
    {k:'names',v:sum('namesOut')+' / '+sum('dealsIn'),l:'Names to partners / deals from partners',sub:'what the network gives and gets',d:delta(sum('dealsIn'),psum('dealsIn')).replace('vs previous','deals vs previous'),sp:weeks.map(s=>s.namesOut+s.dealsIn),
      pick:()=>openDrill('Names given and deals received',[...weeks.flatMap(s=>s.lists.dealsIn.map(x=>Object.assign({},x,{text:'deal in · '+(x.text||'')}))),...weeks.flatMap(s=>s.lists.namesOut.map(x=>Object.assign({},x,{text:'name given · '+(x.text||'')})))])},
    {k:'live',v:liveNow.length,l:'Live deals now',sub:'replied or further, not dead or on hold',d:delta(liveNow.length,liveStart).replace('previous period','start of period'),sp:weeks.map(s=>s.live),
      pick:()=>openDrill('Live deals',liveNow.map(c=>({rec:c,date:lastTouch(c)||'',text:c.stage+(c.channelVia?' · '+c.channelVia:'')})))}
  ];

  // sources
  const bySrc={};cos().filter(c=>approached(c)&&(period==='all'||inW(approached(c),W))).forEach(c=>{const s=source(c);(bySrc[s]=bySrc[s]||[]).push(c)});
  const src=Object.entries(bySrc).map(([s,l])=>{
    const r=l.map(reached);const days=l.map(c=>{const a=approached(c),f=firstReply(c,a);return f?(new Date(f)-new Date(a))/864e5:null}).filter(x=>x!=null).sort((a,b)=>a-b);
    return {s,l,n:l.length,rep:r.filter(x=>x>=1).length,meet:r.filter(x=>x>=2).length,nda:r.filter(x=>x>=3).length,live:l.filter(isLive).length,dead:l.filter(c=>c.stage==='Dead').length,med:days.length?Math.round(days[Math.floor(days.length/2)]):null};
  }).sort((a,b)=>b.n-a.n);
  const solid=src.filter(x=>x.n>=5&&x.s!=='(not set)');
  const best=solid.slice().sort((a,b)=>b.rep/b.n-a.rep/a.n)[0];
  const mostLive=src.slice().sort((a,b)=>b.live-a.live)[0];
  const unset=bySrc['(not set)']?bySrc['(not set)'].length:0;

  // funnel on the cohort of the period (all approached targets for Since start)
  const fc=period==='all'?cos().filter(c=>approached(c)):cohort;
  const fr=fc.map(c=>({c,r:reached(c)}));
  const fn=STEPS.map(([lab,i])=>({lab,i,list:fr.filter(x=>x.r>=i).map(x=>x.c)}));
  const maxF=Math.max(1,fn[0].list.length);

  // live deals needing attention
  const att=cos().filter(c=>ACTIVE_STAGES.includes(c.stage)&&(c.stage!=='Contacted'||reached(c)>=1)).map(c=>{
    const lt=lastTouch(c),d=lt?daysAgo(lt):999,lim=STALE_DAYS[c.stage]||14;
    return {c,d,lim,over:d/lim,next:(c.nextAction||'').trim(),nd:c.nextDate||''};
  }).sort((a,b)=>b.over-a.over);

  // partners: effort in the period against what came of it
  const days=period==='all'?0:Math.max(1,Math.round((new Date(today())-new Date(W.from))/864e5)+1);
  const parts=liveOnly(S.advisors||[]).map(a=>{const x=partnerStats(a);x.eff=orgTouches(a).filter(t=>realT(t)&&(!days||daysAgo(t.date)<days)).length;x.liveVia=x.sourced.filter(isLive).length;return x})
    .filter(x=>x.eff||x.sourced.length||x.given.length)
    .sort((a,b)=>(b.liveVia-a.liveVia)||(b.sourced.length-a.sourced.length)||(b.eff-a.eff));
  const partsShown=showAllPartners?parts:parts.slice(0,12);

  // drop-outs
  const dead=cos().filter(c=>c.stage==='Dead'&&(period==='all'||inW(String(((c.stageLog||[]).filter(l=>l.stage==='Dead').slice(-1)[0]||{}).date||'').slice(0,10),W)));
  const dc={};dead.forEach(c=>{const k=deadCatOf(c)||'Not recorded';(dc[k]=dc[k]||[]).push(c)});
  const dk=Object.entries(dc).sort((a,b)=>b[1].length-a[1].length);
  const sizeOut=(dc['Too small']||[]).length+(dc['Too large']||[]).length;

  const title=(t,s)=>'<div class="rp-ct"><span>'+t+'</span>'+(s?'<span class="rp-cs">'+s+'</span>':'')+'</div>';
  root.innerHTML=
    '<div class="rp-bar"><div class="rp-seg">'+PERIODS.map(([k,l])=>'<button class="sm'+(period===k?' primary':'')+'" data-click="setRepPeriod|'+k+'">'+l+'</button>').join('')+'</div>'
      +'<span class="muted">'+fmtDe(W.from)+' to '+fmtDe(addDays(W.to,-1))+(P?' · compared with the '+period+' weeks before':'')+' · click any number, bar or row for the records</span></div>'
    +'<div class="rp-kpis">'+tiles.map((t,i)=>'<div class="rp-kpi" data-rpk="'+i+'"><div class="rp-kl">'+t.l+'</div><div class="rp-kv">'+t.v+'</div>'+(t.sp?spark(t.sp):'<div class="rp-spark-ph"></div>')+'<div class="rp-ks">'+esc(t.sub)+'</div>'+(t.d||'')+'</div>').join('')+'</div>'
    +'<div class="rp-g2">'
      +'<div class="rp-card">'+title('Companies lettered per week','own letters against the target of '+target)+'<div class="rp-ch"><canvas id="rpLetters"></canvas></div></div>'
      +'<div class="rp-card">'+title('Meetings and calls per week','every conversation, one per organisation and day')+'<div class="rp-ch"><canvas id="rpMeet"></canvas></div></div>'
    +'</div>'
    +'<div class="rp-g2">'
      +'<div class="rp-card">'+title('Target funnel',period==='all'?'all '+fn[0].list.length+' targets ever contacted':fn[0].list.length+' targets first contacted in the period')
        +'<div class="rp-fun">'+fn.map((f,i)=>{const n=f.list.length,prev=i?fn[i-1].list.length:0;
          return '<div class="rp-fr" data-rpf="'+i+'"><div class="rp-fl">'+f.lab+'</div><div class="rp-fb"><div style="width:'+Math.max(n?2:0,100*n/maxF)+'%"></div></div><div class="rp-fn">'+n+'</div><div class="rp-fp">'+(i?pct(n,prev)+' of previous':'')+'</div></div>'}).join('')+'</div>'
        +'<div class="rp-take">'+funnelTake(fn)+'</div></div>'
      +'<div class="rp-card">'+title('Why targets drop out',dead.length+' marked dead'+(period==='all'?'':' in the period'))
        +(dk.length?'<div class="rp-fun">'+dk.map(([k,l],i)=>'<div class="rp-fr" data-rpd="'+i+'"><div class="rp-fl">'+esc(k)+'</div><div class="rp-fb"><div class="lt" style="width:'+(100*l.length/dk[0][1].length)+'%"></div></div><div class="rp-fn">'+l.length+'</div><div class="rp-fp">'+pct(l.length,dead.length)+'</div></div>').join('')+'</div>':'<div class="rp-empty">No drop-outs in this period.</div>')
        +(dead.length?'<div class="rp-take">'+(sizeOut?sizeOut+' of '+dead.length+' ('+pct(sizeOut,dead.length)+') failed on size: a sharper size screen before the letter saves that effort.':'Size is not what loses targets in this period.')+'</div>':'')+'</div>'
    +'</div>'
    +'<div class="rp-card">'+title('Which sources work','targets by how they came in · answered, conversation, NDA and live as share of contacted')
      +'<table class="rp-t"><tr><th>Source</th><th class="r">Contacted</th><th class="r">Answered</th><th class="r">Conversation</th><th class="r">NDA / info</th><th class="r">Live now</th><th class="r">Dead</th><th class="r">Median days to answer</th></tr>'
      +src.map((x,i)=>'<tr class="rowlink" data-rps="'+i+'"><td>'+esc(x.s)+'</td><td class="r">'+x.n+'</td>'+[x.rep,x.meet,x.nda].map(v=>'<td class="r"><span class="rp-mb"><span style="width:'+(x.n?100*v/x.n:0)+'%"></span></span>'+v+' <span class="muted">'+pct(v,x.n)+'</span></td>').join('')+'<td class="r">'+(x.live||'-')+'</td><td class="r">'+(x.dead||'-')+'</td><td class="r">'+(x.med==null?'-':x.med)+'</td></tr>').join('')
      +'</table><div class="rp-take">'+[best?'Best response: '+esc(best.s)+' ('+best.rep+' of '+best.n+', '+pct(best.rep,best.n)+').':'',mostLive&&mostLive.live?'Most live deals: '+esc(mostLive.s)+' ('+mostLive.live+').':'',unset?unset+' contacted targets have no source set; set the channel on the record so this table is complete.':''].filter(Boolean).join(' ')+'</div></div>'
    +'<div class="rp-g2">'
      +'<div class="rp-card">'+title('Live deals: time since last contact','longest over the norm for the stage first')
        +(att.length?'<table class="rp-t"><tr><th>Deal</th><th>Stage</th><th class="r">Days</th><th class="r">Norm</th><th>Next step</th></tr>'+att.map(x=>'<tr class="rowlink" data-click="openRec|'+x.c.id+'|$e"><td><b>'+esc(fixUml(dispName(x.c)))+'</b></td><td>'+stagePill(x.c.stage)+'</td><td class="r'+(x.over>1?' rp-over':'')+'">'+(x.d>=999?'-':x.d)+'</td><td class="r">'+x.lim+'</td><td class="rp-nx">'+(x.nd?'<span class="rp-nd">'+fmtDe(x.nd)+'</span> ':'')+'<span class="rp-clamp" title="'+esc(fixUml(x.next))+'">'+(x.next?esc(fixUml(x.next)):'<b>none set</b>')+'</span></td></tr>').join('')+'</table>':'<div class="rp-empty">No live deals.</div>')+'</div>'
      +'<div class="rp-card">'+title('Partners: effort and result',(period==='all'?'all time':'exchanges in the period')+' · names given and targets that came through them')
        +'<table class="rp-t"><tr><th>Partner</th><th>Type</th><th class="r">Exchanges</th><th class="r">Names given</th><th class="r">Targets via</th><th class="r">Live via</th><th>Last contact</th></tr>'
        +partsShown.map(x=>'<tr class="rowlink" data-click="openRec|'+x.a.id+'|$e"><td><b>'+esc(fixUml(dispName(x.a)))+'</b></td><td class="muted">'+esc(catOf(x.a)||'')+'</td><td class="r">'+(x.eff||'-')+'</td><td class="r">'+(x.given.length||'-')+'</td><td class="r">'+(x.sourced.length||'-')+'</td><td class="r">'+(x.liveVia||'-')+'</td><td class="muted">'+fmtAgo(lastTouch(x.a))+'</td></tr>').join('')
        +'</table>'+(parts.length>12?'<div class="rp-more"><button class="sm" data-click="toggleRepPartners">'+(showAllPartners?'Show top 12':'Show all '+parts.length)+'</button></div>':'')+'</div>'
    +'</div>';

  // interactions
  root.querySelectorAll('[data-rpk]').forEach(el=>el.addEventListener('click',()=>tiles[+el.dataset.rpk].pick()));
  root.querySelectorAll('[data-rpf]').forEach(el=>el.addEventListener('click',()=>{const f=fn[+el.dataset.rpf];openDrill('Funnel: '+f.lab,f.list.map(c=>({rec:c,date:approached(c),text:'first contact · '+source(c)})))}));
  root.querySelectorAll('[data-rpd]').forEach(el=>el.addEventListener('click',()=>{const [k,l]=dk[+el.dataset.rpd];openDrill('Dropped out: '+k,l.map(c=>({rec:c,date:'',text:(c.deadReason||'').slice(0,140)})))}));
  root.querySelectorAll('[data-rps]').forEach(el=>el.addEventListener('click',()=>{const x=src[+el.dataset.rps];openDrill('Source: '+x.s,x.l.map(c=>({rec:c,date:approached(c),text:['no answer','answered','conversation','NDA / info','LOI','diligence','closed'][Math.max(0,reached(c))]})).sort((a,b)=>b.date.localeCompare(a.date)))}));

  const labels=W.weeks.map(w=>fmtDe(w).slice(0,5));
  chart('rpLetters',{type:'bar',data:{labels,datasets:[
      {type:'line',label:'Target',data:W.weeks.map(()=>target),borderColor:MUTED,borderDash:[4,4],borderWidth:1.5,pointRadius:0,pointHitRadius:0},
      {label:'Companies lettered',data:weeks.map(s=>s.letters),backgroundColor:weeks.map(s=>s.letters>=target?NAVY:NAVY_L),borderRadius:4,maxBarThickness:28}]},
    options:baseOpts(i=>openDrill('Lettered in week of '+fmtDe(W.weeks[i]),weeks[i].lists.letters))});
  chart('rpMeet',{type:'bar',data:{labels,datasets:[{label:'Meetings and calls',data:weeks.map(s=>s.meetings),backgroundColor:NAVY,borderRadius:4,maxBarThickness:28}]},
    options:baseOpts(i=>openDrill('Meetings and calls in week of '+fmtDe(W.weeks[i]),weeks[i].lists.meetings))});
  renderDrill();
}
function funnelTake(fn){
  const n=fn.map(f=>f.list.length);if(!n[0])return 'No target contacted in this period.';
  let worst=null;for(let i=1;i<4;i++){if(!n[i-1])break;const r=n[i]/n[i-1];if(!worst||r<worst.r)worst={i,r}}
  const a='Of '+n[0]+' contacted, '+n[1]+' answered ('+pct(n[1],n[0])+'), '+n[2]+' had a conversation, '+n[3]+' reached NDA or information.';
  return a+(worst?' Biggest loss: '+fn[worst.i-1].lab+' to '+fn[worst.i].lab+' ('+pct(n[worst.i],n[worst.i-1])+' get through).':'');
}
