import {GRP_DEF, S, allOrgs, dispName, grpOf, lastTouch, personOrg} from '../state.js';
import {esc, fmtAgo, normName} from '../util.js';
import {starHtml} from './ui.js';

export let psortK='lastc';
export let psortD=-1;

// ═══════════════════════════════════════════════════════════════
// RENDER: PEOPLE
// ═══════════════════════════════════════════════════════════════
export function contactRows(){
  const out=[];
  allOrgs().forEach(o=>{
    const c=(o.contact||'').trim();if(!c)return;
    const nc=normName(c);
    if((S.people||[]).some(p=>(p.orgId===o.id||normName(p.firm||'')===normName(dispName(o)))&&normName(p.name||'')===nc))return;
    out.push({__org:true,id:o.id,kind:'person',name:c,title:'Primary contact',firm:dispName(o),
      email:o.email||'',phone:o.phone||'',mobile:o.mobile||'',linkedin:'',city:o.city||'',
      networkPath:o.introPath||'',ptype:o.category||'',angle:o.notes||o.detail||'',
      touches:o.touches||{},fav:o.fav,lists:o.lists||[],nextAction:o.nextAction,nextDate:o.nextDate,priority:o.priority});
  });
  return out;
}
export function allPeopleRows(){return [...(S.people||[]),...contactRows()]}
export let pGrp='';
export function setPGrp(g){pGrp=pGrp===g?'':g;renderPeople()}
export function personGrp(p){const o=personOrg(p);if(o)return grpOf(o);return grpOf(p)}
export function renderPeople(){
  const tsel=document.getElementById('pType');
  if(tsel.options.length<3){const types=[...new Set(allPeopleRows().map(p=>p.ptype).filter(Boolean))].sort();types.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;tsel.appendChild(o)})}
  const q=(document.getElementById('pSearch').value||'').toLowerCase();
  const ty=tsel.value,has=document.getElementById('pHas').value;
  const BASE=allPeopleRows();
  let rows=BASE.filter(p=>
    (!q||(p.name||'').toLowerCase().includes(q)||(p.firm||'').toLowerCase().includes(q)||(p.title||'').toLowerCase().includes(q))&&
    (!ty||p.ptype===ty)&&(!pGrp||personGrp(p)===pGrp)&&
    (!has||(has==='email'&&p.email)||(has==='linkedin'&&p.linkedin)||(has==='path'&&p.networkPath)||(has==='touch'&&Object.keys(p.touches||{}).length))
  );
  const val=p=>{switch(psortK){case 'name':return (p.name||'').toLowerCase();case 'firm':return (p.firm||'').toLowerCase();case 'lastc':return lastTouch(p)||'';default:return ''}};
  rows.sort((a,b)=>{const va=val(a),vb=val(b);return va<vb?-psortD:va>vb?psortD:0});
  document.getElementById('pCount').textContent=rows.length+' of '+BASE.length;
  {const cnt={};BASE.forEach(p=>{const g=personGrp(p);cnt[g]=(cnt[g]||0)+1});const pg=document.getElementById('pGroups');if(pg)pg.innerHTML='<button class="sm'+(pGrp?'':' vbtn on')+'" onclick="setPGrp(\'\')">All</button>'+GRP_DEF.map(g=>'<button class="sm'+(pGrp===g.k?' vbtn on':'')+'" onclick="setPGrp(\''+g.k+'\')">'+g.t+' ('+(cnt[g.k]||0)+')</button>').join('')}
  const hdr=(k,label)=>'<th onclick="sortPeople(\''+k+'\')">'+label+(psortK===k?' <span class="arr">'+(psortD>0?'▲':'▼')+'</span>':'')+'</th>';
  document.getElementById('peopleTable').innerHTML='<table>'+hdr('name','Name')+'<th style="width:110px">Type</th>'+hdr('firm','Organization')+'<th>Title</th><th>Email</th>'+hdr('lastc','Last contact')+'<th>Network path</th>'+rows.slice(0,400).map(p=>'<tr class="rowlink" onclick="openProfile(findRec(\''+p.id+'\'))"><td>'+starHtml(p)+' <b>'+esc(p.name)+'</b></td><td>'+(function(){const g=GRP_DEF.find(x=>x.k===personGrp(p))||GRP_DEF[5];return '<span class="gchip" style="background:'+g.c+'">'+g.t+'</span>'})()+'</td><td class="muted">'+esc(p.firm||'—')+'</td><td class="muted">'+esc(p.title||'')+'</td><td class="muted">'+esc(p.email||'')+'</td><td class="muted">'+fmtAgo(lastTouch(p))+'</td><td class="muted" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.networkPath||'')+'</td></tr>').join('')+'</table>';
}
export function sortPeople(k){if(psortK===k)psortD*=-1;else{psortK=k;psortD=k==='lastc'?-1:1}renderPeople()}
