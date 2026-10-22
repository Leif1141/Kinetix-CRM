import {S, allOrgs, dispName, findRec} from '../state.js';
import {nameTokens, normName} from '../util.js';


// ═══════════════════════════════════════════════════════════════
// EMAIL MATCHING
// ═══════════════════════════════════════════════════════════════
export function matchRecords(text,senderEmail,strict){
  // strict=true: senderMap + domain + people-email ONLY (used by auto-sync)
  // strict=false/undefined: also tries fuzzy name-token matching (used by inbox suggestions)
  const out=[];const se=(senderEmail||'').toLowerCase();
  let hit=null;
  // 1. try sender-map first (exact email -> record mapping)
  if(se&&S.senderMap[se.replace(/\./g,'_')]){hit=findRec(S.senderMap[se.replace(/\./g,'_')]);if(hit)out.push(hit)}
  // 2. try domain match (never on freemail domains)
  const FREEMAIL=new Set(['gmail.com','googlemail.com','icloud.com','me.com','mac.com','gmx.de','gmx.at','gmx.net','gmx.ch','web.de','t-online.de','outlook.com','outlook.de','hotmail.com','hotmail.de','live.com','yahoo.com','yahoo.de','aol.com','proton.me','protonmail.com','mail.com','posteo.de','freenet.de']);
  const dom=se.split('@')[1]||'';
  if(!hit&&dom&&!FREEMAIL.has(dom)){const byDom=allOrgs().find(o=>(o.domain||'').toLowerCase()===dom||((o.email||'').split('@')[1]||'').toLowerCase()===dom);if(byDom)out.push(byDom)}
  // 3. people email match
  if(se)(S.people||[]).forEach(p=>{if((p.email||'').toLowerCase()===se&&!out.includes(p)){out.push(p);if(p.orgId){const org=findRec(p.orgId);if(org&&!out.includes(org))out.push(org)}}});
  // 4. fuzzy name-token matching -- ONLY when strict=false (manual/inbox use)
  if(!strict&&!out.length){
    const STOPTOK=new Set(['invest','investment','investments','deutsche','deutsches','deutschland','german','germany','capital','partners','partner','group','gruppe','holding','holdings','private','equity','industrie','industrial','industries','industriebedarf','mittelstand','unternehmen','company','advisors','advisory','consulting','beratung','bank','banking','finance','financial','financing','european','europe','international','management','solutions','systems','service','services','technik','technology','office','network']);
    const hay=normName(text);
    const hasWord=t=>new RegExp('(^|[^a-z0-9])'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^a-z0-9])').test(hay);
    let bestLen=0;
    allOrgs().forEach(r=>{
      const toks=nameTokens(dispName(r)).filter(t=>!STOPTOK.has(t));
      if(!toks.length)return;
      const hits=toks.filter(hasWord);
      const ok=hits.length>=2||(hits.length===1&&hits[0].length>=6&&toks.length===1);
      if(ok&&hits.length>bestLen){bestLen=hits.length;out.length=0;out.push(r)}
      else if(ok&&hits.length===bestLen&&bestLen>0&&!out.includes(r))out.push(r);
    });
  }
  return out;
}
