import {ACTIVE_STAGES, STAGES} from '../constants.js';
import {S, dispName, fixUml, lastTouch, orgDomain, orgPeople, primaryOf} from '../state.js';
import {esc, fmtAgo, fmtDe, shortLoc} from '../util.js';
import {addrParts} from '../addr.js';
import {wasApproached} from './pipeline.js';

// ═══════════════════════════════════════════════════════════════
// DATA GAPS (Leif 04.11.2026): organisations in active contact where domain, street address, contact person or
// email is missing. The CRM only lists them; the daily Claude run researches up to 10 a day (legal notice,
// contact page) and sends the values back by patch. Loaded on demand, not at start.
// ═══════════════════════════════════════════════════════════════
// German cities by population, largest first (Destatis 2023); a city not listed comes after all of them.
const BIG=['berlin','hamburg','münchen','köln','frankfurt','stuttgart','düsseldorf','leipzig','dortmund','essen','bremen','dresden','hannover','nürnberg','duisburg','bochum','wuppertal','bielefeld','bonn','münster','mannheim','karlsruhe','augsburg','wiesbaden','mönchengladbach','gelsenkirchen','aachen','braunschweig','kiel','chemnitz','halle','magdeburg','freiburg','krefeld','mainz','lübeck','erfurt','oberhausen','rostock','kassel','hagen','potsdam','saarbrücken','hamm','ludwigshafen','oldenburg','mülheim','osnabrück','leverkusen','darmstadt','heidelberg','solingen','herne','neuss','regensburg','paderborn','ingolstadt','offenbach','fürth','würzburg','ulm','heilbronn','pforzheim','wolfsburg','göttingen','bottrop','reutlingen','koblenz','recklinghausen','bremerhaven','bergisch gladbach','jena','remscheid','erlangen','moers','siegen','hildesheim','salzgitter','cottbus'];
const ALIAS={'cologne':'köln','munich':'münchen','nuremberg':'nürnberg','koeln':'köln','muenchen':'münchen','duesseldorf':'düsseldorf','nuernberg':'nürnberg'};
function cityOf(r){return (addrParts(r).city||shortLoc(r).replace(/,.*$/,'')||'').trim()}
function cityRank(c){c=(c||'').toLowerCase().replace(/\s*\(.*?\)/g,'').trim();c=ALIAS[c]||c;const i=BIG.findIndex(b=>c===b||c.startsWith(b+' ')||c.startsWith(b+'/'));return i<0?999:i}
// Who is in scope: a target at Contacted or later (not Dead), any target with an outreach entry, an adviser in dialogue.
export function inGapScope(r){
  if(r.archived||r.mergedInto)return false;
  if(r.kind==='target'){if(r.stage==='Dead')return false;return STAGES.indexOf(r.stage)>=STAGES.indexOf('Contacted')||wasApproached(r)}
  return r.kind==='advisor'&&['In dialogue','Active relationship'].includes(r.status);
}
export function gapFields(r){
  const miss=[];const ppl=orgPeople(r);const prim=primaryOf(r);
  if(!orgDomain(r))miss.push('domain');
  if(!addrParts(r).street)miss.push('address');
  if(!prim&&!(r.contact||'').trim())miss.push('contact');
  if(!(r.email||'').includes('@')&&!ppl.some(p=>(p.email||'').includes('@')))miss.push('email');
  return miss;
}
export function gapRows(){
  return [...(S.companies||[]),...(S.advisors||[])].filter(inGapScope).map(r=>({r,miss:gapFields(r),city:cityOf(r),last:lastTouch(r)}))
    .filter(x=>x.miss.length)
    .sort((a,b)=>cityRank(a.city)-cityRank(b.city)||String(a.last||'').localeCompare(String(b.last||''))||dispName(a.r).localeCompare(dispName(b.r)));
}
export function renderGaps(){
  const el=document.getElementById('gapsBody');if(!el)return;
  const rows=gapRows();
  const cnt={};rows.forEach(x=>x.miss.forEach(m=>{cnt[m]=(cnt[m]||0)+1}));
  el.innerHTML='<p class="muted" style="margin:0 0 8px">'+rows.length+' organisations with gaps · '+['domain','address','contact','email'].map(k=>k+' '+(cnt[k]||0)).join(' · ')+'</p>'
    +(rows.length?'<table class="gaps"><thead><tr><th>Name</th><th>Stage / status</th><th>City</th><th>Missing</th><th>Last touch</th></tr></thead><tbody>'
    +rows.map(x=>'<tr data-click="openRec|'+x.r.id+'|$e"><td><b>'+esc(fixUml(dispName(x.r)))+'</b></td><td>'+esc(x.r.kind==='target'?(x.r.stage||''):(x.r.status||''))+'</td><td>'+esc(x.city||'-')+'</td><td>'+x.miss.map(m=>'<span class="chip">'+m+'</span>').join(' ')+'</td><td title="'+esc(x.last?fmtDe(x.last):'')+'">'+(x.last?fmtAgo(x.last):'never')+'</td></tr>').join('')
    +'</tbody></table>':'<p class="muted">No gaps.</p>');
}
