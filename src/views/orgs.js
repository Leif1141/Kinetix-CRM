import {ADV_STATUS, STAGES} from '../constants.js';
import {S, allOrgs, dispName, findRec, isSysNote, lastTouch, orgPeople, tType, touchList, primaryName} from '../state.js';
import {autoCats, catOf} from './lists.js';
import {esc, fmtAgo, fmtM, shortLoc, today} from '../util.js';
import {prioChip, starHtml, statusOf} from './ui.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';

export let sortK='lastc';
export let sortD=-1;
export function renderOrgs(){
  const sel=document.getElementById('oStage');
  if(sel.options.length<3){STAGES.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o)});ADV_STATUS.filter(s=>!STAGES.includes(s)).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o)})}
  const lsel=document.getElementById('oList');
  const keepList=lsel.value;
  while(lsel.options.length>2)lsel.remove(2);
  (S.customLists||[]).forEach(l=>{const o=document.createElement('option');o.value=l;o.textContent=l;lsel.appendChild(o)});
  {const g=document.createElement('optgroup');g.label='By category';autoCats().forEach(c=>{const o=document.createElement('option');o.value='cat:'+c;o.textContent=c;g.appendChild(o)});if(g.children.length)lsel.appendChild(g)}
  if(keepList&&[...lsel.options].some(o=>o.value===keepList))lsel.value=keepList;
  const q=(document.getElementById('oSearch').value||'').toLowerCase();
  const kind=document.getElementById('oKind').value,stg=sel.value,list=lsel.value;
  let rows=allOrgs().filter(o=>
    (!q||dispName(o).toLowerCase().includes(q)||(o.description||'').toLowerCase().includes(q)||orgPeople(o).some(p=>(p.name||'').toLowerCase().includes(q)))&&
    (!kind||(kind==='target'?o.kind==='target':o.kind==='advisor'))&&
    (!stg||statusOf(o)===stg)&&
    (!list||(list==='__fav'?o.fav:list.slice(0,4)==='cat:'?catOf(o)===list.slice(4):(o.lists||[]).includes(list)))
  );
  const val=o=>{switch(sortK){case 'name':return dispName(o).toLowerCase();case 'status':return statusOf(o)||'';case 'lastc':return lastTouch(o)||'';case 'geo':return o.geo||'';default:return ''}};
  rows.sort((a,b)=>{const va=val(a),vb=val(b);return va<vb?-sortD:va>vb?sortD:0});
  document.getElementById('oCount').textContent=rows.length+' of '+allOrgs().length;
  const hdr=(k,label)=>'<th data-click="sortOrgs|'+k+'">'+label+(sortK===k?' <span class="arr">'+(sortD>0?'▲':'▼')+'</span>':'')+'</th>';
  const geoDisp=g=>({'DE':'Germany','UK':'United Kingdom','EU':'','US':'United States','CH':'Switzerland','AT':'Austria','FR':'France','NL':'Netherlands','LU':'Luxembourg'}[g]||g||'');
  const typeShort=o=>o.kind==='target'?'Target':({'M&A sourcing intermediaries':'M&A / Sourcing','Financing partners':'Financing','DD advisors':'DD advisor','Investors & family office':'Investor / FO','HR, universities & interns':'HR / Talent','Admin & infrastructure':'Admin / Infra','Personal network':'Network'}[o.category]||o.category||'Advisor');
  // Detail (Leif 13.11.2026): where things stand now, not how the contact came about, and no city (Address has it).
  // The open next step first, else the last summary; targets lead with revenue and EBIT.
  const nowText=o=>{const na=String(o.nextAction||'').replace(/^kein offener punkt:\s*/i,'').trim();return na||String(o.lastSummary||'').trim()||String(o.description||o.notes||'').trim()};
  const detailCell=o=>[(o.kind==='target'&&o.revenue?fmtM(o.revenue)+' rev / '+fmtM(o.ebit)+' EBIT':''),nowText(o)].filter(Boolean).join(' · ');
  // Contact (Leif 13.11.2026): the person of the most recent exchange, the primary contact only when there is none;
  // someone from another firm (the sell-side adviser on a deal) shows with that firm
  const byMail=new Map();(S.people||[]).forEach(p=>{if(p.email)byMail.set(String(p.email).toLowerCase(),p)});
  const byDom=new Map();allOrgs().forEach(x=>{const d=String(x.domain||'').toLowerCase().replace(/^www\./,'');if(d)byDom.set(d,x)});
  const contactCell=o=>{
    const t=touchList(o).find(t=>!isSysNote(t)&&tType(t)!=='Note'&&/@/.test(t.who||''));
    if(t){const em=String(t.who).toLowerCase().replace(/.*</,'').replace(/>.*/,'').trim(),p=byMail.get(em);
      if(p){const po=p.orgId&&findRec(p.orgId);return dispName(p)+(po&&po!==o?' ('+dispName(po)+')':'')}
      const d=byDom.get(em.split('@')[1]||'');if(d&&d!==o)return 'via '+dispName(d)}
    return primaryName(o)||'-';
  };
  const statusSel=o=>{
    const opts=o.kind==='target'?STAGES:ADV_STATUS;
    const cur=statusOf(o)||'';
    return '<select class="stagesel" data-click="!" data-change="setStatusInline|'+o.id+'|$v">'+opts.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+(opts.includes(cur)?'':'<option selected>'+esc(cur||'-')+'</option>')+'</select>';
  };
  document.getElementById('orgTable').innerHTML='<table class="otab"><colgroup><col style="width:20%"><col style="width:120px"><col style="width:110px"><col style="width:13%"><col style="width:82px"><col style="width:11%"><col><col style="width:64px"></colgroup>'+hdr('name','Organization')+hdr('status','Stage / Status')+'<th>Type</th><th>Contact</th>'+hdr('lastc','Last contact')+'<th>Address</th><th>Detail</th><th style="text-align:right">Priority</th>'+rows.map(o=>'<tr class="rowlink" data-click="openRec|'+o.id+'|$e"><td>'+starHtml(o)+' <b>'+esc(dispName(o))+'</b></td><td>'+statusSel(o)+'</td><td class="muted">'+esc(typeShort(o))+'</td><td class="muted">'+esc(contactCell(o))+'</td><td class="muted">'+fmtAgo(lastTouch(o))+'</td><td class="muted oclip">'+esc(shortLoc(o))+'</td><td class="muted odet" title="'+esc(detailCell(o))+'"><div>'+esc(detailCell(o))+'</div></td><td style="text-align:right">'+prioChip(o)+'</td></tr>').join('')+'</table>';
}
export function sortOrgs(k){if(sortK===k)sortD*=-1;else{sortK=k;sortD=k==='name'?1:-1}renderOrgs()}
export function setStatusInline(id,val){
  const r=findRec(id);if(!r)return;
  if(r.kind==='target'){if(val!==r.stage){r.stage=val;r.stageLog=r.stageLog||[];r.stageLog.push({stage:val,date:today()})}}
  else r.status=val;
  save();renderAll();
}
export function reconcileStatuses(){
  let n=0;const rank={'To call':0,'Emailed':1,'Contact known':2,'In dialogue':3};
  (S.advisors||[]).forEach(a=>{
    if(!(a.status in rank))return; // never touch Active relationship / Dormant / custom statuses
    const ts=touchList(a).filter(t=>!isSysNote(t)&&t.src!=='Note');
    const hasIn=ts.some(t=>t.dir==='in'||tType(t)==='Meeting'||tType(t)==='Call');
    const hasOut=ts.some(t=>t.dir==='out');
    const want=hasIn?'In dialogue':(hasOut?'Emailed':a.status);
    if(rank[want]>rank[a.status]){a.status=want;n++}
  });
  return n;
}
