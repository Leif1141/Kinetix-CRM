import {S, addTouch, allRecs, dispName, findRec, newAdvisor, newCompany, newPerson, splitPhones} from '../state.js';
import {STAGES} from '../constants.js';
import {autoThread, invalidateThreads, seedThreads} from '../views/threads.js';
import {backfillPersonTouches, retriageUnmatched} from './triage.js';
import {dashApplyOp} from '../views/dash.js';
import {normName, toast, today} from '../util.js';
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
  // Hardened 01.09.2026: plain substring matching merged 'EURA AG' into the 'Idinvest / Eurazeo'
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
export function patchSet(r,set){
  if(!set)return;
  for(const k of Object.keys(set)){
    if(['id','kind','touches','stageLog','stage'].includes(k))continue;
    if(k==='notes'&&r.notes&&set.notes){if(!r.notes.includes(set.notes))r.notes=(r.notes+' | '+set.notes).trim();continue}
    if(k==='nextAction'&&set[k]!==r[k])r.nextSet=today();
    r[k]=set[k];
  }
}
export function applyPatchOps(ops){
  let made=0,skipped=0;
  for(const o of (ops||[])){
    try{
      if(o.op&&String(o.op).indexOf('dash')===0){if(dashApplyOp(o))made++;else skipped++;continue}
      if(o.op==='upsertAdvisor'){
        let r=patchFind(Object.assign({kind:'advisor'},o.match));
        if(!r){r=newAdvisor();r.firm=(o.match&&o.match.firm)||(o.set&&o.set.firm)||'';S.advisors.push(r)}
        patchSet(r,o.set);made++;
      }else if(o.op==='upsertCompany'){
        let r=patchFind(Object.assign({kind:'target'},o.match));
        if(!r){r=newCompany();r.name=(o.match&&o.match.name)||(o.set&&o.set.name)||'';S.companies.push(r)}
        patchSet(r,o.set);made++;
      }else if(o.op==='upsertPerson'){
        let r=patchFind(Object.assign({kind:'person'},o.match));
        if(!r){r=newPerson();r.name=(o.match&&o.match.name)||(o.set&&o.set.name)||'';S.people.push(r)}
        patchSet(r,o.set);made++;
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
        const _ok=['notes','nextAction','nextDate','nextSet','angle','flag','description','contact','email','domain','title','city','address','networkPath','introPath','ptype','market','geo','status','category','ownership','location','priority','firm','cadence','orgId','linkedin','phone','mobile','detail','lastSummary','lastSummaryDate','deadReason','revisitDate','revenue','ebitda','ebit','gm','industry','tier','website','rationale','score','verdict','outreachChannel','stage','channel','channelVia','letterSent','letterStatus','fav','ignored','cadDone','archived','deadCat'];
        if(r&&o.field&&_ok.includes(o.field)){if(o.field==='stage'&&r.stage!==o.value){r.stageLog=r.stageLog||[];r.stageLog.push({stage:o.value,date:o.date||today()})}r[o.field]=o.value;if(o.field==='phone')splitPhones(r);made++}else if(o.op==='addList'){
        if(o.name){S.customLists=S.customLists||[];if(!S.customLists.includes(o.name))S.customLists.push(o.name);made++}else skipped++;
      }else if(o.op==='renameList'){
        if(o.from&&o.to&&(S.customLists||[]).includes(o.from)){S.customLists=S.customLists.map(x=>x===o.from?o.to:x);allRecs().forEach(r=>{if(r.lists)r.lists=r.lists.map(x=>x===o.from?o.to:x)});made++}else skipped++;
      }else if(o.op==='removeList'){
        if(o.name&&(S.customLists||[]).includes(o.name)){S.customLists=S.customLists.filter(x=>x!==o.name);allRecs().forEach(r=>{if(r.lists)r.lists=r.lists.filter(x=>x!==o.name)});made++}else skipped++;
      }else skipped++;
      }else skipped++;
    }catch(e){skipped++}
  }
  return {made,skipped};
}
export function applyPatchObj(p,name,force){
  if(!p||!p.kinetixPatch)throw new Error('not a Kinetix patch file'); // accept 1 or true

  S.appliedPatchTitles=S.appliedPatchTitles||{};
  if(S.appliedPatchTitles[name]&&!force)return null;
  const r=applyPatchOps(p.ops);
  S.appliedPatchTitles[name]=today();
  try{backfillPersonTouches();const _rt=retriageUnmatched();r.made+=_rt.assigned}catch(e){console.warn('post-patch triage:',e)}
  return r;
}
export function applyPatchFile(ev){
  const f=ev.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const p=JSON.parse(e.target.result);
      let force=true;
      if((S.appliedPatchTitles||{})[f.name]){if(!confirm(f.name+' was already applied on '+S.appliedPatchTitles[f.name]+'. Apply again anyway?')){ev.target.value='';return}}
      const r=applyPatchObj(p,f.name,force);
      save();renderAll();
      toast(r.made+' updates applied from '+f.name+(r.skipped?' ('+r.skipped+' skipped)':''));
    }catch(err){toast('Patch error: '+err.message)}
  };
  rd.readAsText(f);ev.target.value='';
}
