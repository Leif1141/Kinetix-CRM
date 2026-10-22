import {ACTIVE_STAGES, LIVE} from '../constants.js';
import {GRP_DEF, S, allOrgs, allRecs, cadDue, cadenceOf, dispName, fixUml, grpOf, isDismissed, isIgnoredRec, isStale, isSysNote, lastTouch, orgPeople, parseFlag, touchList} from '../state.js';
import {actBtns} from './actions.js';
import {autoCats, catOf} from './lists.js';
import {cleanPrev, daysAgo, esc, fmtAgo, fmtD, fmtDe, fmtM, toast, today, weekStart} from '../util.js';
import {dueDe} from './pipeline.js';
import {grpChip, stagePill, starHtml} from './ui.js';
import {renderAll} from '../main.js';
import {save, undoLast} from '../store/firebase.js';
import {sugHead, suggestions} from './home.js';


// ═══════════════════════════════════════════════════════════════
// RENDER: OVERVIEW
// ═══════════════════════════════════════════════════════════════
export function renderOverview(){
  const orgs=allOrgs(),live=S.companies.filter(c=>ACTIVE_STAGES.includes(c.stage));
  const due=allRecs().filter(r=>!isIgnoredRec(r)&&((r.nextDate&&r.nextDate<=today())||cadDue(r))).length;
  const sug=suggestions().filter(x=>ovMatch(x.rec));
  const k=[['Organizations',orgs.length,'orgs'],['People',(S.people||[]).length,'people'],['Live deals',live.length,'pipeline'],['Due or overdue',due,'followups']];
  document.getElementById('ovKpis').innerHTML=k.map(x=>'<div class="kpi'+(x[0]==='Due or overdue'&&x[1]?' warn':'')+'" onclick="goTab(\''+x[2]+'\')"><div class="v">'+x[1]+'</div><div class="l">'+x[0]+'</div></div>').join('');
  const b=document.getElementById('sugBadge');b.style.display=sug.length?'inline-block':'none';b.textContent=sug.length;
  document.getElementById('suggBody').innerHTML=sug.length?sug.map(s=>'<div class="sugg"><span class="tag" style="background:'+s.color+'">'+s.tag+'</span><div><b style="cursor:pointer" onclick="openProfile(findRec(\''+s.rec.id+'\'))">'+esc(sugHead(s.rec))+'</b><div class="why">'+esc(s.why)+(s.also&&s.also.length?'<div style="margin-top:3px">'+s.also.map(a=>'<span class="chip" style="background:'+a.color+';color:#fff">'+a.tag+'</span> '+esc(a.why)).join('<br>')+'</div>':'')+'</div></div>'+actBtns(s.rec.id,s.key)+'</div>').join(''):'<p class="muted" style="padding:12px">No suggested actions right now.</p>';
  const favs=allRecs().filter(r=>r.fav);
  document.getElementById('favBody').innerHTML=favs.length?'<table>'+favs.map(r=>'<tr class="rowlink" onclick="openProfile(findRec(\''+r.id+'\'))"><td>'+starHtml(r)+' <b>'+esc(dispName(r))+'</b></td><td class="muted">'+fmtAgo(lastTouch(r))+'</td></tr>').join('')+'</table>':'<p class="muted" style="padding:12px">Star records to pin them here.</p>';
  document.getElementById('listsBody').innerHTML='<div style="padding:8px 12px;border-bottom:1px solid #E8E8EC"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959;margin-bottom:5px">Categories</div>'+autoCats().map(c=>{const n=allOrgs().filter(o=>catOf(o)===c).length;return '<button class="sm" style="margin:0 4px 4px 0" onclick="goCat(\''+esc(c).replace(/'/g,"\\'")+'\')">'+esc(c)+' ('+n+')</button>'}).join('')+'</div>'+(((S.customLists||[]).length?'':'<p class="muted" style="padding:12px 12px 0">No custom lists yet.</p>')+(S.customLists||[]).map(l=>{const items=allRecs().filter(r=>(r.lists||[]).includes(l));const open=(S._openLists||[]).includes(l);return '<div style="padding:8px 12px;border-bottom:1px solid #E8E8EC">'+'<b style="cursor:pointer" onclick="toggleListOpen(\''+esc(l)+'\')">'+(open?'&#9662; ':'&#9656; ')+esc(l)+'</b> <span class="muted">('+items.length+')</span>'+'<button class="sm" onclick="delList(\''+esc(l)+'\')" style="float:right">&times;</button>'+'<button class="sm" onclick="goList(\''+esc(l)+'\')" style="float:right;margin-right:4px">Orgs tab</button>'+(open?'<table style="margin-top:6px">'+items.map(r=>'<tr class="rowlink" onclick="openProfile(findRec(\''+r.id+'\'))"><td><b>'+esc(dispName(r))+'</b></td><td class="muted">'+esc(r.kind==='person'?(r.firm||''):(r.contact||''))+'</td><td class="muted">'+esc(r.kind==='person'?(r.title||''):(r.category||''))+'</td></tr>').join('')+'</table>':'')+'</div>'}).join(''));
  const _seenT=new Set();
  const recent=allRecs().map(r=>{const ts=touchList(r).filter(t=>!isSysNote(t));if(!ts.length)return null;const wk=ts.filter(t=>daysAgo(t.date)<7).length;return {r,t:ts[0],n:wk}}).filter(Boolean)
    .sort((a,b)=>((b.t.date||'').localeCompare(a.t.date||''))||((a.r.kind==='person'?0:1)-(b.r.kind==='person'?0:1)))
    .filter(x=>{const k=(x.t.date||'')+'|'+(x.t.subject||'');if(_seenT.has(k))return false;_seenT.add(k);return true})
    .slice(0,30);
  document.getElementById('recentBody').innerHTML=recent.length?'<table><tr><th style="width:64px">Date</th><th style="width:20%">Name</th><th style="width:30%">Subject</th><th>Summary</th></tr>'+recent.map(x=>{
    const _ai=x.r.lastSummary&&x.r.lastSummaryDate&&x.r.lastSummaryDate>=(x.t.date||'').slice(0,10);
    const _base=cleanPrev(x.t.prev)||x.t.note||'';
    const sum=_ai?(x.r.lastSummary):((_base?(x.t.dir==='out'?'You: ':'They: ')+_base:'')+(x.r.nextAction?' → Next: '+x.r.nextAction.slice(0,90):''));
    let sec='';
    if(x.r.kind==='person')sec=x.r.firm||'';
    else{const pp=orgPeople(x.r);sec=(pp[0]&&pp[0].name)||x.r.contact||''}
    const subj=(x.t.dir==='out'?'<span style="color:#2E3C65" title="Sent by you">\u2191</span> ':'<span style="color:#C6943E" title="Received">\u2193</span> ')+(x.t.link?'<a href="'+esc(x.t.link)+'" target="_blank" onclick="event.stopPropagation()">'+esc(x.t.subject)+'</a>':esc(x.t.subject));
    return '<tr class="rowlink" onclick="openProfile(findRec(\''+x.r.id+'\'))"><td class="muted" style="white-space:nowrap;vertical-align:top">'+fmtD(x.t.date)+'</td><td style="vertical-align:top"><b>'+esc(x.r.kind==='person'?dispName(x.r):(sec||dispName(x.r)))+'</b><div class="muted" style="font-size:11px">'+esc(x.r.kind==='person'?sec:dispName(x.r))+'</div>'+(x.n>1?' <span class="chip">+'+(x.n-1)+' this wk</span>':'')+'</td><td style="vertical-align:top">'+subj+'</td><td class="muted" style="vertical-align:top">'+esc(sum.slice(0,180))+'</td></tr>'}).join('')+'</table>':'<p class="muted" style="padding:12px">No activity yet. Sync to pull emails.</p>';
}

// ═══════════════════════════════════════════════════════════════
// RESEARCHED, NOT YET APPROACHED
// ═══════════════════════════════════════════════════════════════
export function renderQueue(){
  const el=document.getElementById('queueBody');if(!el)return;
  const q=(S.companies||[]).filter(c=>c.stage==='Identified').map(parseFlag)
    .sort((a,b)=>((b.score??-1)-(a.score??-1))||dispName(a).localeCompare(dispName(b)));
  const vChip=v=>v?'<span class="chip">'+esc(v)+'</span>':'';
  el.innerHTML=q.length
    ? '<table><tr><th style="width:56px;text-align:center">Score</th><th style="width:24%">Company</th><th style="width:92px">Verdict</th><th style="width:120px">Location</th><th style="width:130px;text-align:right">Rev / EBIT (€m)</th><th>Business</th><th style="width:70px"></th></tr>'+q.map(c=>
        '<tr class="rowlink" onclick="openProfile(findRec(\''+c.id+'\'))"><td style="text-align:center"><b>'+(c.score!=null?Math.round(c.score):'<span class="muted">-</span>')+'</b></td><td><b>'+esc(fixUml(dispName(c)))+'</b></td><td>'+vChip(c.verdict)+'</td><td class="muted">'+esc(c.location||'')+'</td><td class="muted" style="text-align:right">'+fmtM(c.revenue)+' / '+fmtM(c.ebit)+'</td><td class="muted" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.description||'')+'</td><td><button class="sm" onclick="event.stopPropagation();quickSetAction(\''+c.id+'\',event)">Work it</button></td></tr>'
      ).join('')+'</table>'
    : '<p class="muted" style="padding:12px">No researched targets waiting.</p>';
}
// ═══ OVERVIEW v4/v5 (21.10.2026): Gruppen, Filter, Spaltenköpfe, Undo, Spalten ziehen ═══
export function ovDashDone(id,ev){if(ev)ev.stopPropagation();const t=(S.dash&&S.dash.todos||[]).find(x=>x.id===id);if(!t)return;t.done=true;t.doneAt=today();save();renderAll();toast('To-do erledigt')}
export let _ovOrder=null,_ovW=null;
export function ovLoadPrefs(){try{_ovOrder=JSON.parse(localStorage.getItem('kxOvOrder')||'null');_ovW=JSON.parse(localStorage.getItem('kxOvW')||'{}')}catch(e){_ovOrder=null;_ovW={}}}
export function ovSavePrefs(){try{localStorage.setItem('kxOvOrder',JSON.stringify(_ovOrder));localStorage.setItem('kxOvW',JSON.stringify(_ovW||{}))}catch(e){}}
export function ovEnhance(){
  if(!_ovW)ovLoadPrefs();
  document.querySelectorAll('#fuBody table.ovt').forEach(tbl=>{
    const ths=[...tbl.querySelectorAll('th[data-c]')];if(!ths.length)return;
    const keys=ths.map(t=>t.dataset.c);
    if(_ovOrder&&_ovOrder.length===keys.length&&_ovOrder.every(k=>keys.includes(k))){
      tbl.querySelectorAll('tr').forEach(tr=>{const cells=[...tr.children];const byKey={};cells.forEach(c=>{if(c.dataset.c)byKey[c.dataset.c]=c});if(Object.keys(byKey).length!==keys.length)return;_ovOrder.forEach(k=>tr.appendChild(byKey[k]))});
    }
    tbl.querySelectorAll('th[data-c]').forEach(th=>{
      const k=th.dataset.c;if(_ovW&&_ovW[k])th.style.width=_ovW[k]+'px';
      th.draggable=true;
      th.ondragstart=e=>{e.dataTransfer.setData('text/col',k);e.stopPropagation()};
      th.ondragover=e=>{e.preventDefault();th.classList.add('dragover')};
      th.ondragleave=()=>th.classList.remove('dragover');
      th.ondrop=e=>{e.preventDefault();th.classList.remove('dragover');const from=e.dataTransfer.getData('text/col');if(!from||from===k)return;const cur=[...tbl.querySelectorAll('th[data-c]')].map(t=>t.dataset.c);const o=cur.filter(x=>x!==from);o.splice(o.indexOf(k),0,from);_ovOrder=o;ovSavePrefs();renderFollowups()};
      const rz=th.querySelector('.rz');if(rz){rz.draggable=false;rz.onmousedown=e=>{e.preventDefault();e.stopPropagation();const x0=e.clientX,w0=th.offsetWidth;const mv=ev=>{th.style.width=Math.max(50,w0+ev.clientX-x0)+'px'};const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);_ovW=_ovW||{};_ovW[k]=th.offsetWidth;ovSavePrefs()};document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up)}}
    });
  });
}
export let ovGrp='',ovQ='';
export function setOvGrp(g){ovGrp=ovGrp===g?'':g;try{localStorage.setItem('kxOvGrp',ovGrp)}catch(e){}renderAll()}
export function ovMatch(r){if(ovGrp&&grpOf(r)!==ovGrp)return false;if(ovQ){const h=(dispName(r)+' '+(r.contact||'')+' '+(r.firm||'')+' '+(r.nextAction||'')).toLowerCase();if(!h.includes(ovQ))return false}return true}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){const t=e.target;const tag=(t&&t.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select'||(t&&t.isContentEditable))return;e.preventDefault();undoLast()}});
export function renderFollowups(){
  const t=today();
  try{if(!ovGrp&&localStorage.getItem('kxOvGrp'))ovGrp=localStorage.getItem('kxOvGrp')||''}catch(e){}
  ovQ=((document.getElementById('ovSearch')||{}).value||'').toLowerCase().trim();
  const live=(S.companies||[]).filter(c=>LIVE.includes(c.stage));
  const all=allRecs().filter(r=>!isIgnoredRec(r));
  const withDates=all.filter(r=>r.nextDate);
  const overdue=withDates.filter(r=>r.nextDate<t);
  const dueToday=withDates.filter(r=>r.nextDate===t);
  const week=withDates.filter(r=>r.nextDate>t&&daysAgo(r.nextDate)>-8);
  const cad=(S.companies||[]).filter(c=>cadDue(c)&&!(c.nextDate&&c.nextDate<=t));
  const stale=live.filter(c=>isStale(c)&&!c.nextDate&&!isDismissed('stale_'+c.id));
  const noAction=live.filter(c=>c.stage!=='Identified'&&!c.nextDate&&!isStale(c)&&!cadenceOf(c));
  const resurrect=(S.companies||[]).filter(c=>(c.stage==='Dead'||c.stage==='On hold')&&c.revisitDate&&c.revisitDate<=t&&!isDismissed('rev_'+c.id));
  const n=overdue.length+dueToday.length+cad.length;
  const badge=document.getElementById('fuBadge');if(badge){badge.style.display=n?'inline-block':'none';badge.textContent=n}
  // Gruppenleiste
  const counts={};[...overdue,...dueToday,...cad].forEach(r=>{const g=grpOf(r);counts[g]=(counts[g]||0)+1});
  const bar=document.getElementById('ovGroups');
  if(bar)bar.innerHTML='<button class="sm'+(ovGrp?'':' vbtn on')+'" onclick="setOvGrp(\'\')">All ('+n+')</button>'+GRP_DEF.map(g=>'<button class="sm'+(ovGrp===g.k?' vbtn on':'')+'" style="border-left:4px solid '+g.c+'" onclick="setOvGrp(\''+g.k+'\')">'+g.t+' ('+(counts[g.k]||0)+')</button>').join('');
  const f=a=>a.filter(ovMatch);
  const dsort=(a,b)=>(a.nextDate||'9').localeCompare(b.nextDate||'9')||dispName(a).localeCompare(dispName(b));
  const OVC=[['act','Actions',230],['name','Name',260],['type','Type',120],['next','Next step',0],['due','Due',130],['last','Last contact',90]];const head='<tr>'+OVC.map(c=>'<th data-c="'+c[0]+'"'+(c[2]?' style="width:'+c[2]+'px"':'')+'>'+c[1]+'<span class="rz"></span></th>').join('')+'</tr>';
  const sec=(title,items,color,render,hd)=>items.length?'<div class="section"><div class="section-hdr" style="background:'+color+'">'+title+' ('+items.length+')</div><table class="ovt">'+(hd||'')+items.map(render).join('')+'</table></div>':'';
  const row=r=>'<tr class="rowlink" onclick="openProfile(findRec(\''+r.id+'\'))"><td data-c="act">'+actBtns(r.id)+'</td><td data-c="name"><b>'+esc(fixUml(dispName(r)))+'</b>'+(r.kind==='person'?(r.firm?'<div class="muted" style="font-size:10px">'+esc(r.firm)+'</div>':''):(r.contact?'<div class="muted" style="font-size:10px">'+esc(r.contact)+'</div>':''))+'</td><td data-c="type">'+grpChip(r)+'</td><td data-c="next">'+esc(r.nextAction||'')+'</td><td data-c="due">'+dueDe(r.nextDate,r.id)+'</td><td data-c="last" class="muted">'+(lastTouch(r)?fmtDe(lastTouch(r)):'-')+'</td></tr>';
  const rowC=c=>{const cd=cadenceOf(c);return '<tr class="rowlink" onclick="openProfile(findRec(\''+c.id+'\'))"><td data-c="act">'+actBtns(c.id,'cdz_'+c.id+'_'+cd.next.k)+'</td><td data-c="name"><b>'+esc(fixUml(dispName(c)))+'</b></td><td data-c="type">'+grpChip(c)+'</td><td data-c="next">Brief vom '+fmtDe(cd.sent)+(cd.via?' über '+esc(cd.via):'')+': jetzt '+cd.next.label+'</td><td data-c="due">'+dueDe(cd.next.due)+'</td><td data-c="last" class="muted">'+(lastTouch(c)?fmtDe(lastTouch(c)):'-')+'</td></tr>'};
  const acts=(id,key)=>'<td style="width:180px;text-align:right;white-space:nowrap"><button class="sm" onclick="quickSetAction(\''+id+'\',event)">Set action</button> <button class="sm" onclick="snoozeSugg(\''+key+'\',event)">Dismiss</button></td>';
  const rowS=c=>'<tr class="rowlink" onclick="openProfile(findRec(\''+c.id+'\'))"><td style="width:30%"><b>'+esc(fixUml(c.name))+'</b></td><td>'+stagePill(c.stage)+'</td><td class="muted">Letzter Kontakt: '+(lastTouch(c)?fmtDe(lastTouch(c)):'-')+'</td>'+acts(c.id,'stale_'+c.id)+'</tr>';
  const rowR=c=>'<tr class="rowlink" onclick="openProfile(findRec(\''+c.id+'\'))"><td style="width:30%"><b>'+esc(fixUml(c.name))+'</b></td><td class="muted">Wiedervorlage: '+fmtDe(c.revisitDate)+(c.deadReason?' · '+esc(c.deadReason.slice(0,90)):'')+'</td>'+acts(c.id,'rev_'+c.id)+'</tr>';
  const _mon=weekStart(t);const _wc='w/c '+fmtDe(_mon);
  const more=sec('Stale deals (no scheduled action)',f(stale),'#434F80',rowS)+sec('No action scheduled',f(noAction),'#8C97B8',rowS)+sec('Revisit date reached',f(resurrect),'var(--green)',rowR);
  document.getElementById('fuBody').innerHTML=
    (sec('⚠ Overdue',f(overdue).sort(dsort),'var(--red)',row,head)+
    sec('Due today',f(dueToday).sort(dsort),'#C6943E',row,head)+
    sec('Letter cadence due',f(cad),'#B86E1B',rowC,head)+
    (f(week).length?'<details class="psec"><summary>This week ('+_wc+') <span style="font-weight:400">('+f(week).length+')</span></summary>'+sec('Due this week',f(week).sort(dsort),'var(--navy)',row,head)+'</details>':'')||'<p class="muted" style="padding:14px">Nothing due.</p>')+
    (more?'<details class="psec"><summary>More hints (stale, no action, revisit)</summary>'+more+'</details>':'');
  const ign=allRecs().filter(isIgnoredRec);
  if(ign.length)document.getElementById('fuBody').innerHTML+='<p class="muted" style="font-size:11px;padding:4px 8px">Ignoriert bis zur nächsten Aktivität: '+ign.map(r=>esc(dispName(r))+' <a href="#" onclick="unignoreRec(\''+r.id+'\',event);return false">zurückholen</a>').join(' &middot; ')+'</p>';
  try{ovEnhance()}catch(e){console.warn('ovEnhance',e)}
}
