// SCREENING (Leif 08.11.2026): the old CapIQ screening page, rebuilt on the companies in the CRM only.
// Figures come from the CRM (revenue, EBITDA, EBIT, score) and from MASTER Scoring via `metrics` (margins,
// growth, FTE, ownership type, owner year of birth); all read-only. Score = MASTER Scoring /100.
import {S, dispName, fixUml, findRec} from '../state.js';
import {esc} from '../util.js';
import {stagePill} from './ui.js';
import {openProfile} from './record.js';

let f={dead:false,stage:'',own:'',minScore:'',q:'',sort:'score',dir:-1};
let charts={};
const AGE_BINS=[['< 55',0,54],['55 to 59',55,59],['60 to 64',60,64],['65 to 69',65,69],['70+',70,200]];
const STAGE_GRP=s=>['Replied','Meeting','NDA','LOI','Diligence'].includes(s)?'Live deal':['Contacted','On hold'].includes(s)?'Approached':s==='Dead'?'Dead':'Identified';
const GRP_COL={'Live deal':'#2E3C65','Approached':'#888888','Identified':'#CCCCCC','Dead':'#E0B4B4'};

function row(c){
  const m=c.metrics||{},rev=num(c.revenue),eb=num(c.ebitda);
  const ebM=m.ebitdaM!=null?m.ebitdaM:(rev&&eb!=null?eb/rev:null);
  const age=m.ownerYob?new Date().getFullYear()-m.ownerYob:null;
  return {c,name:fixUml(dispName(c)),stage:c.stage||'',grp:STAGE_GRP(c.stage),score:num(c.score),rev,eb,ebM,gp:m.gp,growth:m.growth,fte:m.fte!=null?m.fte:num(c.fte),own:m.ownType||'',age,ndE:m.ndEbitda,basis:m.basis||'',src:m.src||''};
}
const num=v=>{if(v==null||v==='')return null;const n=+v;return isNaN(n)?null:n};
const med=a=>{a=a.filter(v=>v!=null).sort((x,y)=>x-y);if(!a.length)return null;const k=a.length>>1;return a.length%2?a[k]:(a[k-1]+a[k])/2};
const pct=v=>v==null?'-':(v*100).toFixed(1).replace('.',',')+'%';
const m1=v=>v==null?'-':(+v).toFixed(1).replace('.',',');
const n0=v=>v==null?'-':Math.round(v).toLocaleString('de-DE');

function rows(){
  return (S.companies||[]).filter(c=>!c.archived&&!c.mergedInto&&(f.dead||c.stage!=='Dead')).map(row).filter(r=>
    (!f.stage||r.grp===f.stage)&&(!f.own||r.own===f.own)&&(f.minScore===''||(r.score!=null&&r.score>=+f.minScore))&&(!f.q||r.name.toLowerCase().includes(f.q)));
}
export function setScrFilter(k,v){f[k]=v;renderScreening()}
export function sortScr(k){if(f.sort===k)f.dir=-f.dir;else{f.sort=k;f.dir=k==='name'||k==='stage'||k==='own'?1:-1}renderScreening()}

export function renderScreening(){
  const el=document.getElementById('scrBody');if(!el)return;
  const all=(S.companies||[]).filter(c=>!c.archived&&!c.mergedInto).map(row);
  const owns=[...new Set(all.map(r=>r.own).filter(Boolean))].sort();
  const rs=rows();
  const withData=rs.filter(r=>r.src).length;
  const sel=(k,opts,lab)=>'<label class="muted" style="font-size:11px">'+lab+' <select data-scr="'+k+'" class="sm"><option value="">All</option>'+opts.map(o=>'<option'+(f[k]===o?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select></label>';
  const kpi=(v,l)=>'<div class="kpi"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>';
  let h='<div class="filterbar" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:8px">'
    +sel('stage',['Live deal','Approached','Identified'].concat(f.dead?['Dead']:[]),'Stage')
    +sel('own',owns,'Ownership')
    +'<label class="muted" style="font-size:11px">Min score <input data-scr="minScore" type="number" min="0" max="100" style="width:60px" value="'+esc(f.minScore)+'"></label>'
    +'<input data-scr="q" placeholder="Search company" style="width:180px" value="'+esc(f.q)+'">'
    +'<label class="muted" style="font-size:11px"><input type="checkbox" data-scr="dead"'+(f.dead?' checked':'')+'> Include Dead</label>'
    +'</div>'
    +'<div class="kpis">'+kpi(rs.length,'Companies')+kpi(m1(med(rs.map(r=>r.rev))),'Median revenue €mn')+kpi(m1(med(rs.map(r=>r.eb))),'Median EBITDA €mn')+kpi(pct(med(rs.map(r=>r.ebM))),'Median EBITDA margin')+kpi(m1(med(rs.map(r=>r.score))),'Median score')+kpi(withData+' / '+rs.length,'With MASTER Scoring ratios')+'</div>'
    +'<div class="charts">'
    +'<div class="chartbox"><h4>Revenue vs EBITDA margin <span class="muted" style="font-weight:400">(dot colour = stage)</span></h4><canvas id="scrScatter"></canvas></div>'
    +'<div class="chartbox"><h4>Gross margin vs EBITDA margin</h4><canvas id="scrGp"></canvas></div>'
    +'<div class="chartbox"><h4>Score distribution</h4><canvas id="scrScore"></canvas></div>'
    +'<div class="chartbox"><h4>EBITDA margin distribution</h4><canvas id="scrMargin"></canvas></div>'
    +'</div>';
  // ownership analysis: medians per ownership type and the owner age profile
  const byOwn={};rs.forEach(r=>{const k=r.own||'Not in MASTER Scoring';(byOwn[k]=byOwn[k]||[]).push(r)});
  const ownRows=Object.entries(byOwn).sort((a,b)=>b[1].length-a[1].length);
  h+='<div class="section" style="margin-top:14px"><div class="section-hdr">Ownership analysis</div><div style="display:flex;gap:16px;flex-wrap:wrap"><div style="flex:2;min-width:420px;overflow-x:auto"><table><tr><th>Ownership type</th><th style="text-align:right">Companies</th><th style="text-align:right">Median revenue €mn</th><th style="text-align:right">Median EBITDA margin</th><th style="text-align:right">Median gross margin</th><th style="text-align:right">Median owner age</th><th style="text-align:right">Median score</th></tr>'
    +ownRows.map(([k,l])=>'<tr><td>'+esc(k)+'</td><td style="text-align:right">'+l.length+'</td><td style="text-align:right">'+m1(med(l.map(r=>r.rev)))+'</td><td style="text-align:right">'+pct(med(l.map(r=>r.ebM)))+'</td><td style="text-align:right">'+pct(med(l.map(r=>r.gp)))+'</td><td style="text-align:right">'+n0(med(l.map(r=>r.age)))+'</td><td style="text-align:right">'+m1(med(l.map(r=>r.score)))+'</td></tr>').join('')
    +'</table></div><div class="chartbox" style="flex:1;min-width:280px"><h4>Age of the oldest owner</h4><canvas id="scrAge"></canvas></div></div></div>';
  // ranking table
  const cols=[['score','Score','r',m1],['name','Company','l'],['stage','Stage','l'],['rev','Revenue €mn','r',m1],['eb','EBITDA €mn','r',m1],['ebM','EBITDA margin','r',pct],['gp','Gross margin','r',pct],['growth','Growth','r',pct],['fte','FTE','r',n0],['own','Ownership','l'],['age','Owner age','r',n0],['basis','Basis','l']];
  const sorted=rs.slice().sort((a,b)=>{const x=a[f.sort],y=b[f.sort];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (typeof x==='string'?x.localeCompare(y):x-y)*f.dir});
  h+='<div class="section" style="margin-top:14px"><div class="section-hdr">Company ranking ('+rs.length+')</div><div style="overflow-x:auto"><table class="scr-tab"><tr>'+cols.map(c=>'<th data-scrsort="'+c[0]+'" style="cursor:pointer;text-align:'+(c[2]==='r'?'right':'left')+'">'+c[1]+(f.sort===c[0]?(f.dir<0?' ▼':' ▲'):'')+'</th>').join('')+'</tr>'
    +sorted.map(r=>'<tr class="rowlink" data-scropen="'+r.c.id+'">'+cols.map(c=>c[0]==='stage'?'<td>'+stagePill(r.stage)+'</td>':c[0]==='name'?'<td><b>'+esc(r.name)+'</b></td>':'<td style="text-align:'+(c[2]==='r'?'right':'left')+'">'+(c[3]?c[3](r[c[0]]):esc(r[c[0]]||'-'))+'</td>').join('')+'</tr>').join('')
    +'</table></div></div>';
  el.innerHTML=h;
  wire(el);drawCharts(rs);
}
function wire(el){
  el.querySelectorAll('[data-scr]').forEach(x=>{const k=x.dataset.scr;x.addEventListener(x.type==='checkbox'?'change':(x.tagName==='SELECT'?'change':'input'),()=>{if(k==='dead'){f.dead=x.checked;if(!f.dead&&f.stage==='Dead')f.stage=''}else f[k]=k==='q'?x.value.toLowerCase().trim():x.value;renderScreening();if(k==='q'||k==='minScore'){const y=document.querySelector('[data-scr="'+k+'"]');if(y){y.focus();try{y.setSelectionRange(y.value.length,y.value.length)}catch(e){}}}})});
  el.querySelectorAll('[data-scrsort]').forEach(x=>x.addEventListener('click',()=>sortScr(x.dataset.scrsort)));
  el.querySelectorAll('[data-scropen]').forEach(x=>x.addEventListener('click',()=>{const r=findRec(x.dataset.scropen);if(r)openProfile(r)}));
}
function hist(vals,edges,fmt){const lab=[],cnt=[];for(let i=0;i<edges.length-1;i++){lab.push(fmt(edges[i])+' to '+fmt(edges[i+1]));cnt.push(vals.filter(v=>v>=edges[i]&&(i===edges.length-2?v<=edges[i+1]:v<edges[i+1])).length)}return {lab,cnt}}
function drawCharts(rs){
  Object.values(charts).forEach(c=>{try{c.destroy()}catch(e){}});charts={};
  if(typeof Chart==='undefined')return;
  const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false,labels:{font:{size:9}}},datalabels:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:9}}},y:{grid:{color:'#EEEEEE'},ticks:{font:{size:9}}}}};
  const opt=(x,y,legend,fx,fy)=>Object.assign({},base,{plugins:Object.assign({},base.plugins,{legend:{display:!!legend,position:'bottom',labels:{font:{size:9},boxWidth:10}},tooltip:{callbacks:{label:ctx=>ctx.raw.n+': '+fx(ctx.raw.x)+', '+fy(ctx.raw.y)}}}),scales:{x:Object.assign({},base.scales.x,{title:{display:true,text:x,font:{size:9}}}),y:Object.assign({},base.scales.y,{title:{display:true,text:y,font:{size:9}}})}});
  const grps=['Live deal','Approached','Identified','Dead'];
  const sets=(fx,fy)=>grps.map(g=>({label:g,data:rs.filter(r=>r.grp===g&&fx(r)!=null&&fy(r)!=null).map(r=>({x:fx(r),y:fy(r),n:r.name})),backgroundColor:GRP_COL[g],pointRadius:4})).filter(s=>s.data.length);
  const pc=v=>(v).toFixed(1)+'%';
  const mk=(id,cfg)=>{const c=document.getElementById(id);if(c)charts[id]=new Chart(c,cfg)};
  mk('scrScatter',{type:'scatter',data:{datasets:sets(r=>r.rev,r=>r.ebM!=null?r.ebM*100:null)},options:opt('Revenue €mn','EBITDA margin %',true,v=>m1(v)+' €mn',pc)});
  mk('scrGp',{type:'scatter',data:{datasets:sets(r=>r.gp!=null?r.gp*100:null,r=>r.ebM!=null?r.ebM*100:null)},options:opt('Gross margin %','EBITDA margin %',true,pc,pc)});
  const sc=hist(rs.map(r=>r.score).filter(v=>v!=null),[0,40,50,60,70,80,100],v=>v);
  mk('scrScore',{type:'bar',data:{labels:sc.lab,datasets:[{data:sc.cnt,backgroundColor:'#2E3C65'}]},options:base});
  const mg=hist(rs.map(r=>r.ebM).filter(v=>v!=null).map(v=>v*100),[-1e6,0,5,10,15,20,1e6],v=>v);
  mk('scrMargin',{type:'bar',data:{labels:['< 0%','0 to 5%','5 to 10%','10 to 15%','15 to 20%','20%+'],datasets:[{data:mg.cnt,backgroundColor:'#2E3C65'}]},options:base});
  mk('scrAge',{type:'bar',data:{labels:AGE_BINS.map(b=>b[0]),datasets:[{data:AGE_BINS.map(b=>rs.filter(r=>r.age!=null&&r.age>=b[1]&&r.age<=b[2]).length),backgroundColor:'#2E3C65'}]},options:base});
}
