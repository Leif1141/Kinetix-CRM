import {openDialog, confirmDialog} from '../views/dialog.js';
import {addrParts, setAddrPart} from '../addr.js';
import {S, addTouch, allRecs, dispName, findRec, newAdvisor, newCompany, newPerson, orgByDomain, splitPhones} from '../state.js';
import {STAGES} from '../constants.js';
import {autoThread, invalidateThreads, seedThreads} from '../views/threads.js';
import {backfillPersonTouches, retriageUnmatched} from './triage.js';
import {dashApplyOp} from '../views/dash.js';
import {normName, toast, today, uid} from '../util.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';


// ═══════════════════════════════════════════════════════════════
// CLAUDE PATCH FILES — merge updates without replacing state
// ═══════════════════════════════════════════════════════════════
export function patchFind(m){
  if(!m)return null;
  if(m.id){const r=findRec(m.id);if(r)return r}
  const nn=normName(m.firm||m.name||'');
  if(!nn)return null;
  let pool=allRecs();
  if(m.kind)pool=pool.filter(r=>r.kind===m.kind);
  else if(m.firm)pool=pool.filter(r=>r.kind==='advisor');
  // Hardened 01.09.2026: plain substring matching merged one firm into another with a similar name
  // record because 'eura' sits inside 'eurazeo'. Require the shorter name's tokens to appear as
  // whole tokens in the longer one, and require some length, before treating it as the same firm.
  return pool.find(r=>normName(dispName(r))===nn)||pool.find(r=>{
    const rn=normName(dispName(r));if(!rn)return false;
    const A=rn.split(' ').filter(Boolean),B=nn.split(' ').filter(Boolean);
    const shortT=A.length<=B.length?A:B,longT=A.length<=B.length?B:A;
    if(!shortT.length)return false;
    if(shortT.join('').length<6)return false;
    return shortT.every(t=>longT.includes(t));
  })||null;
}
// Fields owned by MASTER Scoring: a patch that writes one stamps the record with the file and date (finSrc).
const FIN_FIELDS=['revenue','ebitda','ebit','gm','score','verdict','ownership','flag','metrics'];
let _patchName='';
// Contact data carries its source (legal notice, register, business card, mail signature) and date: op.source, op.date.
const SRC_FIELDS=['domain','email','phone','mobile','street','zip','city','address','title','linkedin','contact','name'];
function stampSrc(r,k,src,d){if(src&&SRC_FIELDS.includes(k)){r.src=r.src||{};r.src[k]={s:String(src),d:d||today()}}}
// street, zip and city recompose the address line; a new address line replaces the parts it contains.
// On a person the address is their own office; empty means the organisation's address (Leif 05.11.2026).
function putVal(r,k,v){
  if(k==='street'||k==='zip'||(k==='city'&&(r.street||r.zip))){setAddrPart(r,k,v==null?'':String(v));return}
  r[k]=v;
  if(k==='address'){delete r.street;delete r.zip;const p=addrParts(Object.assign({},r,{city:''}));if(p.rawStreet)r.street=p.rawStreet;if(p.zip)r.zip=p.zip;if(p.zip&&p.city)r.city=p.city}
}
// Two records of the same person or organisation become one: the kept record takes the touches and fills its
// empty contact fields, an organisation's people move over, the other record is archived with mergedInto.
const MERGE_FILL=['email','phone','mobile','title','linkedin','street','zip','city','address','domain'];
export function mergeRecs(dup,keep){
  if(!dup||!keep||dup===keep||(dup.kind==='person')!==(keep.kind==='person'))return false;
  keep.touches=keep.touches||{};Object.entries(dup.touches||{}).forEach(([k,t])=>{if(!keep.touches[k])keep.touches[k]=t});
  MERGE_FILL.forEach(f=>{if(!keep[f]&&dup[f]){keep[f]=dup[f];if(dup.src&&dup.src[f]){keep.src=keep.src||{};keep.src[f]=dup.src[f]}}});
  if(dup.kind!=='person'){(S.people||[]).forEach(p=>{if(p.orgId===dup.id)p.orgId=keep.id});if(!keep.primaryId&&dup.primaryId)keep.primaryId=dup.primaryId}
  const sm=S.senderMap||{};Object.keys(sm).forEach(k=>{if(sm[k]===dup.id)sm[k]=keep.id});
  dup.archived=true;dup.archivedAt=today();dup.archivedReason='Merged into '+dispName(keep);dup.mergedInto=keep.id;
  return true;
}
function stampFin(r,k){if(r.kind==='target'&&FIN_FIELDS.includes(k))r.finSrc={file:_patchName,date:today()}}
export function patchSet(r,set,src,d){
  if(!set)return;
  for(const k of Object.keys(set)){
    if(['id','kind','touches','stageLog','stage'].includes(k))continue;
    if(k==='email'&&r.kind!=='person'&&set[k])continue; // addresses live on people only (Leif 10.11.2026)
    if(k==='notes'&&r.notes&&set.notes){if(!r.notes.includes(set.notes))r.notes=(r.notes+' | '+set.notes).trim();continue}
    if(k==='nextAction'&&set[k]!==r[k])r.nextSet=today();
    putVal(r,k,set[k]);stampFin(r,k);stampSrc(r,k,src,d);
  }
}
// Runs still write contact, email, mobile and title onto organisations (phase 3 part A). After every patch the
// same rules as the one-off migration move them to linked people, so the organisation keeps no contact text.
export async function normaliseContacts(){
  if(!S.contactsMigV1)return 0; // before the one-off move on the Data tab, patches behave as they always did
  const {planContacts,applyContactPlan}=await import('../contacts.js'); // loaded on demand, not at start
  const plan=planContacts(S,newPerson,uid);
  if(!plan.create.length&&!plan.link.length&&!plan.orgSet.length)return 0;
  applyContactPlan(S,plan);
  return plan.create.length+plan.link.length+plan.orgSet.length;
}
export function applyPatchOps(ops){
  let made=0,skipped=0;
  for(const o of (ops||[])){
    try{
      if(o.op&&String(o.op).indexOf('dash')===0){if(dashApplyOp(o))made++;else skipped++;continue}
      if(o.op==='upsertAdvisor'){
        let r=patchFind(Object.assign({kind:'advisor'},o.match));
        if(!r&&o.set&&o.set.domain){const d=orgByDomain(o.set.domain);if(d&&d.kind==='advisor')r=d} // one organisation per domain
        if(!r){r=newAdvisor();r.firm=(o.match&&o.match.firm)||(o.set&&o.set.firm)||'';S.advisors.push(r)}
        patchSet(r,o.set,o.source,o.date);made++;
      }else if(o.op==='upsertCompany'){
        let r=patchFind(Object.assign({kind:'target'},o.match));
        if(!r&&o.set&&o.set.domain){const d=orgByDomain(o.set.domain);if(d&&d.kind==='target')r=d} // one organisation per domain
        if(!r){r=newCompany();r.name=(o.match&&o.match.name)||(o.set&&o.set.name)||'';S.companies.push(r)}
        patchSet(r,o.set,o.source,o.date);made++;
      }else if(o.op==='upsertPerson'){
        let r=patchFind(Object.assign({kind:'person'},o.match));
        if(!r){r=newPerson();r.name=(o.match&&o.match.name)||(o.set&&o.set.name)||'';S.people.push(r)}
        patchSet(r,o.set,o.source,o.date);made++;
      }else if(o.op==='addTouch'){
        const r=patchFind(o.match);
        if(r&&o.key&&o.touch){addTouch(r,o.key,o.touch);made++}else skipped++;
      }else if(o.op==='setStage'){
        const r=patchFind(Object.assign({kind:'target'},o.match));
        if(r&&o.stage&&STAGES.includes(o.stage)&&r.stage!==o.stage){r.stage=o.stage;r.stageLog=r.stageLog||[];r.stageLog.push({stage:o.stage,date:o.date||today()});made++}else skipped++;
      }else if(o.op==='thread'){
        if(o.id){S.threadsState=S.threadsState||{};S.threadsDone=S.threadsDone||{};const st=S.threadsState[o.id]||{};if(o.v)st.v=o.v;if(o.note){st.note=o.note;st.noteDate=o.date||today()}S.threadsState[o.id]=st;if(o.done)S.threadsDone[o.id]=o.date||today();made++}else skipped++;
      }else if(o.op==='mapEmail'){
        const r=patchFind(o.match);
        if(r&&o.email){S.senderMap=S.senderMap||{};S.senderMap[o.email.toLowerCase().replace(/\./g,'_')]=r.id;made++}else skipped++;
      }else if(o.op==='ignore'){
        S.ignoredSenders=S.ignoredSenders||{};S.ignoredDomains=S.ignoredDomains||{};
        if(o.email){S.ignoredSenders[o.email.toLowerCase().replace(/\./g,'_')]=today();made++}
        else if(o.domain){S.ignoredDomains[o.domain.toLowerCase().replace(/\./g,'_')]=today();made++}
        else skipped++;
      }else if(o.op==='setTouch'){
        // corrects a logged touch: call or in-person meeting, subject, summary (06.11.2026)
        const r=o.match&&o.match.id?findRec(o.match.id):patchFind(o.match),t=r&&o.key&&(r.touches||{})[o.key],f=o.fields||{};let hit=0;
        if(t){['mode','subject','prev','who','link'].forEach(k=>{if(f[k]!=null&&t[k]!==f[k]){t[k]=f[k];hit++}})}
        if(hit)made++;else skipped++;
      }else if(o.op==='setTouchLink'){
        const r=patchFind(o.match);let hit=0;
        if(r&&o.link){const tl=r.touches||{};Object.keys(tl).forEach(k=>{const t=tl[k];if(t&&(!t.link||o.force)&&(!o.key||k===o.key)&&(!o.date||String(t.date||'').slice(0,10)===o.date)&&(!o.subject||String(t.subject||'').toLowerCase().indexOf(String(o.subject).toLowerCase())>=0)){t.link=o.link;hit++}})}
        if(hit)made++;else skipped++;
      }else if(o.op==='dismissUnmatched'){
        if(o.key){S.dismissedUnmatched=S.dismissedUnmatched||{};S.dismissedUnmatched[o.key.replace(/\./g,'_')]=today();S.unmatched=(S.unmatched||[]).filter(u=>u.key!==o.key);made++}else skipped++;
      }else if(o.op==='setThread'){
        seedThreads();let t=S.threads.find(x=>x.id===o.id||(x.alias||[]).includes(o.id));
        if(!t){const r=findRec(o.id);if(r){t=autoThread(r);delete t.auto;S.threads.push(t)}}
        if(t&&o.fields){['r','a','o','e','due','p','cat'].forEach(k=>{if(o.fields[k]!==undefined)t[k]=o.fields[k]});invalidateThreads();made++}else skipped++;
      }else if(o.op==='setField'){
        const r=patchFind(o.match);
        const _ok=['metrics','namedOn','street','zip','notes','nextAction','nextDate','nextSet','angle','flag','description','contact','email','domain','title','city','address','networkPath','introPath','ptype','market','geo','status','category','ownership','location','priority','firm','cadence','orgId','linkedin','phone','mobile','detail','lastSummary','lastSummaryDate','deadReason','revisitDate','revenue','ebitda','ebit','gm','industry','tier','website','rationale','score','verdict','outreachChannel','stage','channel','channelVia','letterSent','letterStatus','fav','ignored','cadDone','archived','deadCat','primaryId'];
        if(r&&o.field&&_ok.includes(o.field)&&!(o.field==='email'&&r.kind!=='person'&&o.value)){if(o.field==='nextAction'&&o.value&&o.value!==r.nextAction)r.nextSet=today();if(o.field==='stage'&&r.stage!==o.value){r.stageLog=r.stageLog||[];r.stageLog.push({stage:o.value,date:o.date||today()})}putVal(r,o.field,o.value);stampFin(r,o.field);stampSrc(r,o.field,o.source,o.date);if(o.field==='phone')splitPhones(r);made++}else skipped++;
      }else if(o.op==='merge'){
        const dup=o.match&&o.match.id?findRec(o.match.id):patchFind(o.match),keep=o.into&&o.into.id?findRec(o.into.id):patchFind(o.into);
        if(mergeRecs(dup,keep))made++;else skipped++;
      }else if(o.op==='addList'){
        if(o.name){S.customLists=S.customLists||[];if(!S.customLists.includes(o.name))S.customLists.push(o.name);made++}else skipped++;
      }else if(o.op==='setAnalysed'){
        // analysed and dropped without an approach (red in MASTER Scoring); replaced as a whole on every refresh
        if(Array.isArray(o.items)){S.analysed={source:o.source||'',date:o.date||today(),items:o.items.filter(x=>x&&x.name).map(x=>({name:String(x.name),loc:x.loc||'',ebit:x.ebit??null,score:x.score??null,reason:x.reason||'',src:x.src||o.source||''}))};made++}else skipped++;
      }else if(o.op==='renameList'){
        if(o.from&&o.to&&(S.customLists||[]).includes(o.from)){S.customLists=S.customLists.map(x=>x===o.from?o.to:x);allRecs().forEach(r=>{if(r.lists)r.lists=r.lists.map(x=>x===o.from?o.to:x)});made++}else skipped++;
      }else if(o.op==='removeList'){
        if(o.name&&(S.customLists||[]).includes(o.name)){S.customLists=S.customLists.filter(x=>x!==o.name);allRecs().forEach(r=>{if(r.lists)r.lists=r.lists.filter(x=>x!==o.name)});made++}else skipped++;
      }else skipped++;
    }catch(e){skipped++}
  }
  return {made,skipped};
}
export function applyPatchObj(p,name,force){
  if(!p||!p.kinetixPatch)throw new Error('not a Kinetix patch file'); // accept 1 or true

  S.appliedPatchTitles=S.appliedPatchTitles||{};
  if(S.appliedPatchTitles[name]&&!force)return null;
  _patchName=name||'';
  const r=applyPatchOps(p.ops);
  _patchName='';
  S.appliedPatchTitles[name]=today();
  try{backfillPersonTouches();const _rt=retriageUnmatched();r.made+=_rt.assigned}catch(e){console.warn('post-patch triage:',e)}
  normaliseContacts().then(n=>{if(n){save();renderAll()}}).catch(e=>console.warn('contacts after patch:',e));
  return r;
}
export function applyPatchFile(ev){
  const f=ev.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=async e=>{
    try{
      const p=JSON.parse(e.target.result);
      let force=true;
      if((S.appliedPatchTitles||{})[f.name]&&!(await confirmDialog(f.name+' was already applied on '+S.appliedPatchTitles[f.name]+'.',{title:'Apply again?',ok:'Apply again'}))){ev.target.value='';return}
      const r=applyPatchObj(p,f.name,force);
      save();renderAll();
      toast(r.made+' updates applied from '+f.name+(r.skipped?' ('+r.skipped+' skipped)':''));
    }catch(err){toast('Patch error: '+err.message)}
  };
  rd.readAsText(f);ev.target.value='';
}
