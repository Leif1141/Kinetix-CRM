import {ADV_STATUS, STAGES} from '../constants.js';
import {S, allOrgs, dispName, findRec, isSysNote, lastTouch, orgPeople, tType, touchList} from '../state.js';
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
    (!q||dispName(o).toLowerCase().includes(q)||(o.description||'').toLowerCase().includes(q)||(o.contact||'').toLowerCase().includes(q))&&
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
  const detailCell=o=>{
    if(o.kind==='advisor')return [o.city,(o.notes||o.detail||o.introPath||'').slice(0,110)].filter(Boolean).join(' · ');
    return [o.location,(o.revenue?fmtM(o.revenue)+' rev / '+fmtM(o.ebit)+' EBIT (€m)':''),(o.description||o.ownership||'').slice(0,110)].filter(Boolean).join(' · ');
  };
  const statusSel=o=>{
    const opts=o.kind==='target'?STAGES:ADV_STATUS;
    const cur=statusOf(o)||'';
    return '<select class="stagesel" data-click="!" data-change="setStatusInline|'+o.id+'|$v">'+opts.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+(opts.includes(cur)?'':'<option selected>'+esc(cur||'-')+'</option>')+'</select>';
  };
  document.getElementById('orgTable').innerHTML='<table>'+hdr('name','Organization')+hdr('status','Stage / Status')+'<th>Type</th><th>Contact</th>'+hdr('lastc','Last contact')+'<th>Address</th><th>Detail</th><th style="text-align:right">Priority</th>'+rows.map(o=>'<tr class="rowlink" data-click="openRec|'+o.id+'|$e"><td>'+starHtml(o)+' <b>'+esc(dispName(o))+'</b></td><td>'+statusSel(o)+'</td><td class="muted">'+esc(typeShort(o))+'</td><td class="muted">'+esc(o.contact||orgPeople(o).map(p=>p.name).join(', ')||'-')+'</td><td class="muted">'+fmtAgo(lastTouch(o))+'</td><td class="muted" style="max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(shortLoc(o))+'</td><td class="muted" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(detailCell(o))+'</td><td style="text-align:right">'+prioChip(o)+'</td></tr>').join('')+'</table>';
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
