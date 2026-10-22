import {CHANNELS, DEADREASONS, LIVE, STAGES} from '../constants.js';
import {S, allRecs, deadCatOf, dispName, fixUml, isSysNote, lastTouch, liveOnly, orgTouches, stageDate, tType, touchList} from '../state.js';
import {catOf} from './lists.js';
import {daysAgo, esc, fmtAgo, foldSearch} from '../util.js';
import {shareIndex, sharedByRec} from '../shares.js';
import {stagePill} from './ui.js';

export let charts={};

// ═══════════════════════════════════════════════════════════════
// YIELD  -  where the effort actually pays
// ═══════════════════════════════════════════════════════════════
export function realTouches(r,days){
  return orgTouches(r).filter(t=>(!days||daysAgo(t.date)<days));
}
export function partnerStats(a){
  const ts=realTouches(a);
  const out=ts.filter(t=>t.dir==='out').length, inn=ts.filter(t=>t.dir==='in').length;
  const dates=ts.map(t=>(t.date||'').slice(0,10)).filter(Boolean).sort();
  const first=dates[0]||'', last=dates[dates.length-1]||'';
  const nm=foldSearch(dispName(a));
  const sourced=(S.companies||[]).filter(c=>{const via=foldSearch(c.channelVia||'');return via.length>2&&nm&&(via.includes(nm)||nm.includes(via))});
  const given=sharedByRec(a);
  return {a,out,inn,tot:out+inn,first,last,age:first?daysAgo(first):0,sourced,given};
}
export function renderYield(){
  const el=document.getElementById('yieldBody');if(!el)return;
  const D=90;
  const stats=liveOnly(S.advisors||[]).map(partnerStats);
  const link=x=>'<b style="cursor:pointer" onclick="openProfile(findRec(\''+x.a.id+'\'))">'+esc(fixUml(dispName(x.a)))+'</b>';
  const hdr=cols=>'<tr>'+cols.map((c,i)=>'<th'+(i?' style="text-align:right"':'')+'>'+c+'</th>').join('')+'</tr>';
  const sub=t=>'<div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959;margin:10px 0 4px">'+t+'</div>';
  const none=(n,msg)=>'<tr><td colspan="'+n+'" class="muted">'+msg+'</td></tr>';

  // A. partners who have actually put a name in front of you
  const producing=stats.filter(x=>x.sourced.length).sort((a,b)=>b.sourced.length-a.sourced.length);
  const prodRows=producing.length?producing.map(x=>
    '<tr class="rowlink" onclick="openProfile(findRec(\''+x.a.id+'\'))"><td>'+link(x)+'</td><td class="muted">'+esc(catOf(x.a)||'')+'</td><td style="text-align:right">'+x.sourced.length+'</td><td style="text-align:right">'+x.tot+'</td><td class="muted" style="text-align:right">'+esc(x.sourced.map(c=>fixUml(dispName(c))).join(', ').slice(0,60))+'</td></tr>').join('')
    :none(5,'No target yet names a partner in Via. Fill in Via on a target and this table starts working.');

  // B. long two-way conversations that have produced nothing
  const talk=stats.filter(x=>x.tot>=10&&x.inn>=3&&x.age>=90&&!x.sourced.length)
    .sort((a,b)=>b.tot-a.tot).slice(0,12);
  const talkRows=talk.length?talk.map(x=>
    '<tr class="rowlink" onclick="openProfile(findRec(\''+x.a.id+'\'))"><td>'+link(x)+'</td><td class="muted">'+esc(catOf(x.a)||'')+'</td><td style="text-align:right">'+x.tot+'</td><td style="text-align:right">'+Math.round(x.age/30)+'m</td><td style="text-align:right">'+x.given.length+'</td><td class="muted">'+fmtAgo(lastTouch(x.a))+'</td></tr>').join('')
    :none(6,'Nothing here.');

  // C. approached, no answer - a channel problem, not a write-off
  const silent=stats.filter(x=>x.out>=3&&x.inn===0).sort((a,b)=>b.out-a.out).slice(0,12);
  const silRows=silent.length?silent.map(x=>
    '<tr class="rowlink" onclick="openProfile(findRec(\''+x.a.id+'\'))"><td>'+link(x)+'</td><td class="muted">'+esc(catOf(x.a)||'')+'</td><td style="text-align:right">'+x.out+'</td><td class="muted">'+fmtAgo(lastTouch(x.a))+'</td><td class="muted">'+esc(x.a.phone?'phone on file':'no phone on file')+'</td></tr>').join('')
    :none(5,'Everyone you have written to more than twice has answered.');

  // headline
  const out90=stats.reduce((n,x)=>n+realTouches(x.a,D).filter(t=>t.dir==='out').length,0);
  const in90=stats.reduce((n,x)=>n+realTouches(x.a,D).filter(t=>t.dir==='in').length,0);
  const sourcedN=(S.companies||[]).filter(c=>(c.channelVia||'').trim()).length, tot=(S.companies||[]).length;
  const givenN=Object.keys(shareIndex()).length;

  el.innerHTML=
    '<div style="padding:10px 12px;font-size:11px" class="muted">Last '+D+' days: <b style="color:#000">'+out90+'</b> messages out, <b style="color:#000">'+in90+'</b> in, across <b style="color:#000">'+stats.filter(x=>realTouches(x.a,D).length).length+'</b> of '+stats.length+' partners. You have put <b style="color:#000">'+givenN+'</b> target names into the network. Sourcing route recorded on <b style="color:#000">'+sourcedN+' of '+tot+'</b> targets'+(sourcedN<tot*0.5?' - fill in Via (the partner) on a target and the first table below tells you who actually delivers.':'.')+'</div>'+
    '<div style="padding:0 12px 12px">'+
      sub('Partners who have put a name in front of you')+
      '<table>'+hdr(['Partner','Type','Targets sourced','Touches','Which'])+prodRows+'</table>'+
      sub('Long conversation, nothing sourced - at least 10 exchanges both ways over 3+ months')+
      '<table>'+hdr(['Partner','Type','Touches','Known for','Names given','Last contact'])+talkRows+'</table>'+
      '<div class="muted" style="font-size:11px;margin-top:3px">These are real relationships, not wasted time. But if you have given someone names and months have passed, the honest move is to ask directly what they can do, or drop the cadence and stop spending the hours.</div>'+
      sub('Approached, no answer yet - three or more messages out, nothing back')+
      '<table>'+hdr(['Partner','Type','Sent','Last attempt','Phone'])+silRows+'</table>'+
      '<div class="muted" style="font-size:11px;margin-top:3px">Silence on email usually means the channel is wrong, not that the person is uninterested. Try a call or an introduction through someone they know before writing them off.</div>'+
    '</div>';
}

// ═══════════════════════════════════════════════════════════════
// RENDER: REPORTS
// ═══════════════════════════════════════════════════════════════
export function renderReports(){
  const live=(S.companies||[]).filter(c=>LIVE.includes(c.stage));
  const _seenT=new Set(),allT=[];allRecs().forEach(r=>Object.entries(r.touches||{}).forEach(([k,t])=>{if(!_seenT.has(k)){_seenT.add(k);allT.push(t)}}));
  const thisWeek=allT.filter(t=>daysAgo(t.date)<7);
  const k=[['Emails out (7d)',thisWeek.filter(t=>t.dir==='out'&&tType(t)==='Email').length],['Replies in (7d)',thisWeek.filter(t=>t.dir==='in'&&tType(t)==='Email').length],['Meetings (7d)',thisWeek.filter(t=>tType(t)==='Meeting').length],['Total touches',allT.length]];
  document.getElementById('repKpis').innerHTML=k.map(x=>'<div class="kpi"><div class="v">'+x[1]+'</div><div class="l">'+x[0]+'</div></div>').join('');
  Object.values(charts).forEach(c=>{try{c.destroy()}catch(e){}});charts={};
  const mk=(id,cfg)=>{const el=document.getElementById(id);if(!el)return;if(window.ChartDataLabels&&!Chart._kxDL){Chart.register(window.ChartDataLabels);Chart._kxDL=1}charts[id]=new Chart(el,{...cfg,options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:{anchor:cfg.type==='doughnut'?'center':'end',align:cfg.type==='doughnut'?'center':'end',color:cfg.type==='doughnut'?'#fff':'#000',font:{size:9,family:'Arial'},formatter:v=>v||'',display:ctx=>!(ctx.dataset.type==='line')}}}})};
  const fc=STAGES.filter(s=>s!=='Closed'&&s!=='Dead').map(s=>(S.companies||[]).filter(c=>c.stage===s).length);
  mk('chFunnel',{type:'bar',data:{labels:STAGES.filter(s=>s!=='Closed'&&s!=='Dead'),datasets:[{data:fc,backgroundColor:'#434F80'}]}});
  const weeks=[...Array(8)].map((_,i)=>{const d=new Date(Date.now()-(7-i)*7*864e5);return d.toISOString().slice(0,10)});
  // A target counts in the week of its FIRST outbound touch. That is the number Leif wants to hold at 10 a week.
  const firstOut={};liveOnly(S.companies||[]).forEach(c=>{const o=orgTouches(c).filter(t=>t.dir==='out').map(t=>t.date).sort();if(o.length)firstOut[c.id]=o[0]});
  const wkNew=weeks.map((w,i)=>Object.values(firstOut).filter(d=>{const dd=daysAgo(d);return dd<(8-i)*7&&dd>=(7-i)*7}).length);
  const TARGET_PER_WEEK=S.outreachTarget||10;
  mk('chActivity',{type:'bar',data:{labels:weeks.map(w=>w.slice(5)),datasets:[{type:'line',label:'Target',data:weeks.map(()=>TARGET_PER_WEEK),borderColor:'#C00000',borderDash:[5,4],pointRadius:0,borderWidth:1.5},{label:'Targets approached',data:wkNew,backgroundColor:'#2E3C65'}]}});
  const chs=CHANNELS.filter(Boolean);
  mk('chChannel',{type:'doughnut',data:{labels:chs,datasets:[{data:chs.map(ch=>(S.companies||[]).filter(c=>c.channel===ch).length),backgroundColor:['#2E3C65','#434F80','#6B7AAF','#A9A4C6','#C6943E','#2E7D32','#1565C0','#C00000','#888']}]}});
  const dr=DEADREASONS.map(r=>(S.companies||[]).filter(c=>c.stage==='Dead'&&deadCatOf(c)===r).length);
  mk('chDead',{type:'bar',data:{labels:DEADREASONS,datasets:[{data:dr,backgroundColor:'#999'}]}});
  const tis=live.filter(c=>c.stage!=='Identified').map(c=>({c,d:daysAgo(stageDate(c))})).sort((a,b)=>b.d-a.d);
  document.getElementById('tisTable').innerHTML='<tr><th>Company</th><th style="width:140px">Stage</th><th style="width:110px;text-align:right">Days in stage</th></tr>'+tis.map(x=>'<tr class="rowlink" onclick="openProfile(findRec(\''+x.c.id+'\'))"><td><b>'+esc(fixUml(x.c.name))+'</b></td><td>'+stagePill(x.c.stage)+'</td><td style="text-align:right">'+x.d+'</td></tr>').join('');
}
export async function weeklyDigest(){
  const D=14,t0=Date.now()-D*864e5;const inWin=t=>t&&t.date&&new Date(t.date).getTime()>=t0;
  const seen=new Set();const recent=[];
  allRecs().forEach(r=>Object.entries(r.touches||{}).forEach(([k,t])=>{if(seen.has(k)||!inWin(t)||isSysNote(t))return;seen.add(k);recent.push({r,t})}));
  const n=f=>recent.filter(f).length;
  const lines=[];
  lines.push('Last '+D+' days: '+n(x=>x.t.dir==='out'&&tType(x.t)==='Email')+' emails out, '+n(x=>x.t.dir==='in'&&tType(x.t)==='Email')+' replies in, '+n(x=>tType(x.t)==='Meeting')+' meetings, '+n(x=>tType(x.t)==='Call')+' calls, '+n(x=>tType(x.t)==='Letter')+' letters.');
  const moves=[];(S.companies||[]).forEach(c=>(c.stageLog||[]).forEach(l=>{if(l.date&&new Date(l.date).getTime()>=t0)moves.push(fixUml(c.name)+' to '+l.stage+' ('+String(l.date).slice(5,10)+')')}));
  if(moves.length)lines.push('Stage moves ('+moves.length+'): '+moves.slice(0,15).join('; ')+(moves.length>15?'; and '+(moves.length-15)+' more':'')+'.');
  const dead=(S.companies||[]).filter(c=>c.stage==='Dead'&&(c.stageLog||[]).some(l=>l.stage==='Dead'&&l.date&&new Date(l.date).getTime()>=t0));
  if(dead.length)lines.push('Passed: '+dead.map(c=>fixUml(c.name)+' ('+(deadCatOf(c)||'no category')+')').join('; ')+'.');
  const replied=[...new Set(recent.filter(x=>x.t.dir==='in'&&x.r.kind!=='person').map(x=>fixUml(dispName(x.r))))];
  if(replied.length)lines.push('Replies from: '+replied.slice(0,25).join(', ')+(replied.length>25?' and '+(replied.length-25)+' more':'')+'.');
  const cnt={};recent.filter(x=>x.r.kind==='advisor').forEach(x=>{const k=fixUml(dispName(x.r));cnt[k]=(cnt[k]||0)+1});
  const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(top.length)lines.push('Most exchanges: '+top.map(([k,v])=>k+' ('+v+')').join(', ')+'.');
  const quiet=liveOnly(S.companies||[]).filter(c=>LIVE.includes(c.stage)&&c.stage!=='Identified'&&!orgTouches(c).some(inWin));
  if(quiet.length)lines.push('Live deals with no contact in '+D+' days: '+quiet.map(c=>fixUml(c.name)).join(', ')+'.');
  const due=allRecs().filter(r=>r.nextDate&&r.nextDate<new Date().toISOString().slice(0,10)).length;
  lines.push('Overdue next actions right now: '+due+'.');
  document.getElementById('dig_out').textContent=lines.join('\n');
}
