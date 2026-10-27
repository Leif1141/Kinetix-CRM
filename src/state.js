import {CAD_STEPS, CHANNELS, CH_MAP, DEADREASONS, STAGE_ALIAS, STALE_DAYS, VERDICTS} from './constants.js';
import {addDays, daysAgo, daysBetween, normName, toast, today, uid} from './util.js';
import {renderAll} from './main.js';
import {save} from './store/firebase.js';

export function migrateStages(){let n=0;(S.companies||[]).forEach(c=>{if(STAGE_ALIAS[c.stage]){c.stage=STAGE_ALIAS[c.stage];n++}(c.stageLog||[]).forEach(l=>{if(STAGE_ALIAS[l.stage])l.stage=STAGE_ALIAS[l.stage]})});return n}
export function migrateChannels(){if(S.chanMigV1)return;let n=0;(S.companies||[]).forEach(c=>{const old=c.channel||'';if(CHANNELS.includes(old)&&old)return;let ch='',via='';if(old){if(/rettig/i.test(old)){ch='Partner letter';via=old}else if(/fakuma|messe|fair/i.test(old)){ch='Trade fair';via=old}else if(/network/i.test(old)){ch='Network / referral'}else if(CH_MAP[old]){ch=CH_MAP[old]}else{ch='M&A house / advisor';via=old}}else if(c.outreachChannel){ch=CH_MAP[c.outreachChannel]||'Other'}if(ch){c.channel=ch;if(via&&!c.channelVia)c.channelVia=via;n++}});S.chanMigV1=today();if(n)save();return n}
export function chanOf(c){return c.channel||CH_MAP[c.outreachChannel]||''}
// Structured dead category: the explicit deadCat wins, else the free-text deadReason is classified by keyword.
export function deadCatOf(c){if(!c||c.stage!=='Dead')return '';if(DEADREASONS.includes(c.deadCat))return c.deadCat;if(DEADREASONS.includes(c.deadReason))return c.deadReason;const s=(c.deadReason||'').toLowerCase();if(!s)return 'Other';if(/falsches gesch|außerhalb der these|reiner handel|handel statt|projektgesch|marge zu niedrig|margin too low/.test(s))return 'Bad fit';if(/zu klein|too small|zu wenig/.test(s))return 'Too small';if(/zu gro|too large|too big/.test(s))return 'Too large';if(/nicht verk|not for sale|kein verkauf|unabh|nicht in frage|stiftung/.test(s))return 'Not for sale';if(/bewertung|valuation|preisvorstellung|price gap/.test(s))return 'Valuation gap';if(/verkauft|lost to|anderen k|family office|investorenholding|konzern|tochter|teil der/.test(s))return 'Lost to buyer';if(/keine antwort|no response|ohne antwort|nicht reagiert/.test(s))return 'No response';if(/falsch|fit|projektgesch|handel statt|b2c|sektor|dienstleistung|these/.test(s))return 'Bad fit';return 'Other'}
export function parseFlag(c){
  if(c.score==null||c.score===''){const m=/score\s+([\d]+(?:[.,][\d]+)?)/i.exec(c.flag||'');if(m)c.score=parseFloat(m[1].replace(',','.'))}
  if(!c.verdict){const f=(c.flag||'').toLowerCase();const hit=VERDICTS.slice(1).find(v=>f.includes(v));if(hit)c.verdict=hit}
  return c;
}
export function backfillScores(){let n=0;(S.companies||[]).forEach(c=>{const b=[c.score,c.verdict].join('|');parseFlag(c);if([c.score,c.verdict].join('|')!==b)n++});return n}
export let S=null;
export function setS(v){S=v}

// ═══════════════════════════════════════════════════════════════
// SEED + STATE
// ═══════════════════════════════════════════════════════════════
export function seedAdvisor(a){return {id:uid(),kind:'advisor',firm:a.firm,contact:a.contact||'',email:a.email||'',domain:'',category:a.category||a.type||'',geo:a.geo||'',market:'',status:a.status||'Active',ptype:a.type||'',introPath:a.intro_path||'',notes:a.notes||'',detail:a.detail||'',cadence:30,fav:false,lists:[],touches:{},nextDate:'',nextAction:'',priority:'',links:[]}}
export function seedCompany(t){return {id:uid(),kind:'target',name:t.company,geo:t.geo,revenue:t.revenue_eurm?+t.revenue_eurm:null,ebitda:t.ebitda_eurm?+t.ebitda_eurm:null,ebit:t.ebit_eurm?+t.ebit_eurm:null,gm:t.gross_margin?+t.gross_margin:null,description:t.description||'',ownership:t.ownership||'',flag:t.flag||'',stage:t.status==='Dead'?'Dead':t.status==='Active'?'Contacted':'Identified',channel:'',deadReason:'',revisitDate:'',stageLog:[{stage:'Identified',date:today()}],fav:false,lists:[],touches:{},nextDate:'',nextAction:'',priority:'',links:[],location:t.location||''}}
export function seedPerson(p,orgId){return {id:uid(),kind:'person',name:p.name,title:p.title||'',firm:p.firm||'',orgId:orgId||'',email:p.email||'',phone:p.phone||'',mobile:p.mobile||'',linkedin:p.linkedin||'',city:p.city||'',market:p.market||'',ptype:p.ptype||p.source||'',angle:p.angle||'',networkPath:p.networkPath||'',fav:false,lists:[],touches:{},nextDate:'',nextAction:'',priority:''}}
export function orgByFirm(f){const nf=normName(f);if(!nf)return null;return S.companies.find(c=>normName(c.name)===nf||normName(c.description||'').includes(nf))||S.advisors.find(a=>normName(a.firm)===nf)}
export function buildPeople(SEED){
  const people=[];
  SEED.people.forEach(p=>{const org=orgByFirm(p.firm);people.push(seedPerson(p,org?org.id:''))});
  return people;
}

// Only for an empty database: the 165 KB seed module loads on demand.
export async function buildInitialState(){
  const {SEED}=await import('./seed.js');
  const companies=SEED.targets.map(seedCompany);
  const advisors=SEED.advisors.map(seedAdvisor);
  const st={seedVer:3,companies,advisors,people:[],unmatched:[],customLists:[],dismissed:{},senderMap:{},lastSync:null};
  S=st;
  st.people=buildPeople(SEED);
  return st;
}

// ═══════════════════════════════════════════════════════════════
// RECORD HELPERS
// ═══════════════════════════════════════════════════════════════
// Archived records stay in the database but disappear from every view, count,
// suggestion and search. Nothing is deleted. Data tab has the restore switch.
export function isArch(r){return !!(r&&r.archived)}
export function liveOnly(a){return S.showArchived?a:a.filter(r=>!isArch(r))}
export function allOrgs(){return liveOnly([...(S.companies||[]),...(S.advisors||[])])}
export function allRecs(){return liveOnly([...(S.companies||[]),...(S.advisors||[]),...(S.people||[])])}
export function rawRecs(){return [...(S.companies||[]),...(S.advisors||[]),...(S.people||[])]}
export function archiveRecs(recs,reason){
  let n=0;recs.forEach(r=>{if(!r.archived){r.archived=true;r.archivedAt=today();r.archivedReason=reason||'';n++}});
  return n;
}
export function unarchiveAll(){let n=0;rawRecs().forEach(r=>{if(r.archived){delete r.archived;delete r.archivedAt;delete r.archivedReason;n++}});save();renderAll();toast(n+' records restored');}
export function toggleArchived(on){S.showArchived=!!on;save();renderAll()}
export function findRec(id){return rawRecs().find(r=>r.id===id)}
export function dispName(r){return r.name||r.firm}
// Two-line label for lists (Leif 27.10.2026): the organisation on top, the person below. A person shows the
// organisation they belong to (linked record, else the firm field) on top and their own name below; a company
// or adviser firm shows its name on top and its contact below. A person without an organisation shows the name only.
export function rowLabel(r){
  if(!r)return {top:'',sub:''};
  // linked organisation or the firm field; no fuzzy name match here, the label is drawn for every queue row
  if(r.kind==='person'){const o=r.orgId?findRec(r.orgId):null;const firm=(o&&o!==r?dispName(o):r.firm)||'';return firm?{top:firm,sub:r.name||''}:{top:r.name||'',sub:''}}
  return {top:dispName(r)||'',sub:r.contact||''};
}
export function touchList(r){return Object.values(r.touches||{}).sort((a,b)=>(b.date||'').localeCompare(a.date||''))}
export function isSysNote(t){return !!(t&&t.src==='Note'&&/^✔/.test(t.subject||''))}
export function orgTouches(o){
  // own touches plus the touches of every linked person, de-duplicated, newest first
  const seen=new Set();const out=[];
  const add=t=>{if(isSysNote(t))return;const k=(t.date||'')+'|'+(t.subject||'');if(seen.has(k))return;seen.add(k);out.push(t)};
  touchList(o).forEach(add);
  if(o.kind!=='person')orgPeople(o).forEach(p=>touchList(p).forEach(add));
  return out.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}
// Render-scoped cache. Only active inside withRenderCache(), so code that changes a record and reads it
// back outside a render never sees a stale value.
let _rc=null;
export function withRenderCache(fn){const outer=_rc;if(!outer)_rc={last:new Map(),people:null};try{return fn()}finally{if(!outer)_rc=null}}
function lastTouchRaw(r){const t=(r.kind==='person'?touchList(r).filter(x=>!isSysNote(x)):orgTouches(r))[0];return t?t.date:null}
export function lastTouch(r){if(!_rc||!r)return lastTouchRaw(r);if(!_rc.last.has(r))_rc.last.set(r,lastTouchRaw(r));return _rc.last.get(r)}
export function tType(t){if(t.src==='Granola'||t.src==='Meeting')return 'Meeting';if(t.src==='Call')return 'Call';if(t.src==='Kinetix'||t.src==='Gmail')return 'Email';if(t.src==='Note'||t.src==='Letter'||t.src==='LinkedIn')return t.src;return 'Email'}
export function lastOfType(r,ty){const t=touchList(r).find(x=>tType(x)===ty);return t?t.date:null}
export function isStale(c){const th=STALE_DAYS[c.stage];if(th==null)return false;const lt=lastTouch(c);return daysAgo(lt||(c.stageLog?.slice(-1)[0]?.date)||null)>th}
export function stageDate(c){return c.stageLog?.slice(-1)[0]?.date||null}
function orgPeopleRaw(o){const on=normName(o.firm||o.name||'');return liveOnly(S.people||[]).filter(p=>p.orgId===o.id||(!p.orgId&&on&&normName(p.firm||'')===on))}
function peopleIndex(){
  // people grouped by the org they hang off (orgId, else normalised firm name), keeping list order
  const byOrg=new Map(),byFirm=new Map();
  liveOnly(S.people||[]).forEach((p,i)=>{const e=[i,p];if(p.orgId){(byOrg.get(p.orgId)||byOrg.set(p.orgId,[]).get(p.orgId)).push(e)}else{const f=normName(p.firm||'');if(f)(byFirm.get(f)||byFirm.set(f,[]).get(f)).push(e)}});
  return {byOrg,byFirm};
}
export function orgPeople(o){
  if(!_rc)return orgPeopleRaw(o);
  if(!_rc.people)_rc.people=peopleIndex();
  const on=normName(o.firm||o.name||'');
  const a=_rc.people.byOrg.get(o.id)||[],b=on?(_rc.people.byFirm.get(on)||[]):[];
  return (b.length?a.concat(b).sort((x,y)=>x[0]-y[0]):a).map(e=>e[1]);
}
export function addTouch(rec,key,t){rec.touches=rec.touches||{};if(!rec.touches[key])rec.touches[key]=t}

export function dismissSugg(k){
  S.dismissed[k]=today();
  save();renderAll();toast('30 Tage verschoben');
}
export function isDismissed(k){if(S.snoozeUntil&&S.snoozeUntil[k]&&S.snoozeUntil[k]>today())return true;return !!(S.dismissed&&S.dismissed[k]&&daysAgo(S.dismissed[k])<30)}

// ═══════════════════════════════════════════════════════════════
// RENDER: PIPELINE
// ═══════════════════════════════════════════════════════════════
export function newCompany(){return {id:uid(),kind:'target',name:'',geo:'DE',revenue:null,ebitda:null,ebit:null,gm:null,stage:'Identified',channel:'',deadReason:'',revisitDate:'',stageLog:[{stage:'Identified',date:today()}],fav:false,lists:[],touches:{},nextDate:'',nextAction:'',priority:'',links:[],description:'',ownership:'',flag:'',location:''}}
export function newAdvisor(){return {id:uid(),kind:'advisor',firm:'',contact:'',email:'',domain:'',category:'M&A sourcing intermediary',geo:'',market:'',status:'Active',ptype:'',introPath:'',notes:'',detail:'',cadence:30,fav:false,lists:[],touches:{},nextDate:'',nextAction:'',priority:'',links:[]}}
export function newPerson(){return {id:uid(),kind:'person',name:'',title:'',firm:'',orgId:'',email:'',phone:'',mobile:'',linkedin:'',city:'',market:'',ptype:'',angle:'',networkPath:'',fav:false,lists:[],touches:{},nextDate:'',nextAction:'',priority:''}}
export function cadenceOf(c){
  if(!c||!c.letterSent)return null;
  const sent=c.letterSent.slice(0,10),done=c.cadDone||{};
  const ts=touchList(c).filter(t=>!isSysNote(t)&&(t.date||'').slice(0,10)>sent);
  const replied=ts.some(t=>t.dir==='in'&&tType(t)!=='Note')||['Replied','Meeting','NDA','LOI','Diligence','Closed','Dead','On hold'].includes(c.stage);
  const auto={email:ts.some(t=>t.dir==='out'&&tType(t)==='Email'),call:ts.some(t=>tType(t)==='Call'),l6:ts.some(t=>tType(t)==='Letter'&&daysBetween(sent,t.date)>150),l12:ts.some(t=>tType(t)==='Letter'&&daysBetween(sent,t.date)>330)};
  const steps=CAD_STEPS.map(s=>({k:s.k,label:s.label,due:addDays(sent,s.d),done:!!(done[s.k]||auto[s.k])}));
  const next=replied?null:steps.find(s=>!s.done)||null;
  return {sent,via:c.channel==='Partner letter'?(c.channelVia||''):'',replied,steps,next};
}
export function cadDue(c){const cd=cadenceOf(c);return !!(cd&&cd.next&&cd.next.due<=today())}
// A target whose letter went out on or after the date of its next step: the letter was that step and the
// cadence takes over (follow-up email after 10 days, call after 20). Covers letters recorded by the morning run.
export function letterDoneStep(r){return !!(r&&r.kind==='target'&&r.letterSent&&r.nextDate&&r.nextDate<=r.letterSent)}
// the date that is actually due: the next step, or the cadence step when the letter replaced it
export function effDue(r){if(!r)return '';if(!letterDoneStep(r))return r.nextDate||'';const cd=cadenceOf(r);return cd&&cd.next?cd.next.due:''}
export function isDue(c){const t=today();return !!(c.nextDate&&c.nextDate<=t&&!letterDoneStep(c))||cadDue(c)}
export function isIgnoredRec(r){if(!r||!r.ignored)return false;const lt=lastTouch(r);return !(lt&&lt.slice(0,10)>r.ignored)}

export const GRP_DEF=[
  {k:'Targets',t:'Targets',s:'Target',c:'#2E3C65'},
  {k:'Berater',t:'Advisers',s:'Adviser',c:'#2E7D32'},
  {k:'Finanzierung',t:'Financing',s:'Financing',c:'#C6943E'},
  {k:'Admin',t:'Admin & DD',s:'Admin & DD',c:'#595959'},
  {k:'Netzwerk',t:'Network',s:'Network',c:'#7030A0'},
  {k:'Sonstige',t:'Other',s:'Other',c:'#8C97B8'}
];
export function grpOf(r){
  if(!r)return 'Sonstige';
  if(r.kind==='target')return 'Targets';
  const s=((r.category||'')+' '+(r.ptype||'')).toLowerCase();
  if(/financ|investor|family office|equity|mezzanine|bank|sparkasse|debt|credit/.test(s))return 'Finanzierung';
  if(/m&a|intermedia|advis|compounder|broker|search/.test(s)&&!/dd /.test(s))return 'Berater';
  if(/^dd|dd advis|dd advi|legal|lawyer|accountant|tax|admin|infrastructure|notar|steuer/.test(s))return 'Admin';
  if(/chamber|association|network|event|operator|peer|industry|personal|target con|target contact|verband/.test(s))return 'Netzwerk';
  if(r.kind==='person'&&r.orgId){const o=findRec(r.orgId);if(o&&o!==r)return grpOf(o)}
  return 'Sonstige';
}
export function grpCol(r){const g=GRP_DEF.find(x=>x.k===grpOf(r));return g?g.c:'#8C97B8'}
export let _umlMap=null;
export function foldUml(w){return w.replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/Ä/g,'Ae').replace(/Ö/g,'Oe').replace(/Ü/g,'Ue').replace(/ß/g,'ss')}
export function umlMap(){
  if(_umlMap)return _umlMap;
  const out=[],seen=new Set();
  allRecs().forEach(r=>[r.contact,r.name,r.firm].forEach(v=>{
    if(!v||!/[äöüÄÖÜß]/.test(v))return;
    String(v).split(/[\s,\/()]+/).forEach(w=>{
      if(!/[äöüÄÖÜß]/.test(w)||w.length<4)return;
      const f=foldUml(w);
      if(f===w||seen.has(f))return;
      seen.add(f);out.push([f,w]);
    });
  }));
  out.sort((a,b)=>b[0].length-a[0].length);
  _umlMap=out;return out;
}
export function fixUml(s){if(!s)return s;let t=String(s);umlMap().forEach(p=>{if(t.indexOf(p[0])>=0)t=t.split(p[0]).join(p[1])});return t}
export function splitPhones(r){ // 22.10.2026 (Leif): one number per field. 'Festnetz / M Mobil' wird in phone und mobile getrennt.
  if(!r||!r.phone)return;const m=String(r.phone).match(/^(.+?)\s+[\/;|]\s+(?:M(?:obil|obile)?[.:]?\s*)?(\+?\d[\d\s\-()]+)$/i);
  const dg=x=>(x.match(/\d/g)||[]).length;
  if(m&&dg(m[1])>=7&&dg(m[2])>=7){r.phone=m[1].trim();if(!r.mobile)r.mobile=m[2].trim();}
}
// The organisation a person belongs to: linked record, else a record whose name matches the firm text, else null.
export function personOrg(p){
  if(p.orgId){const o=findRec(p.orgId);if(o)return o}
  const fn=normName(p.firm||'');if(!fn)return null;
  return allOrgs().find(o=>normName(o.firm||o.name||'')===fn)||null;
}
