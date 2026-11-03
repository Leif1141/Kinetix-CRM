import {normName} from './util.js';

// ═══════════════════════════════════════════════════════════════
// CONTACTS → PEOPLE (phase 3 part A)
// Pure functions, no DOM and no state import, so the migration runs the same in the app, the harness and node.
// An organisation's contact text becomes person records linked by orgId; the first name is the primary person.
// An email address only moves to a person when its local part carries that person's name (or it is the sender
// of mail in the correspondence). Nothing is derived from a pattern: an address that names nobody stays on the
// organisation as its general address.
// ═══════════════════════════════════════════════════════════════
const ROLE_EN={assistenz:'Assistant',assistentin:'Assistant',assistent:'Assistant',sekretariat:'Office',pa:'Assistant'};
export const fold=x=>(x||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
export function nameTok(n){return fold(n).replace(/^(dr|prof|frau|herr)\.?\s+/g,'').split(/[^a-z]+/).filter(t=>t.length>=3&&!['frau','herr','prof'].includes(t))}
// split a contact field into names: ; , "und" "and" & separate them, but not inside brackets
export function splitNames(raw){
  const out=[];let depth=0,cur='';
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(ch==='(')depth++;else if(ch===')')depth=Math.max(0,depth-1);
    if(depth===0){
      if(ch===';'||ch===','){out.push(cur);cur='';continue}
      const m=raw.slice(i).match(/^\s+(?:und|and|&)\s+/i);
      if(m){out.push(cur);cur='';i+=m[0].length-1;continue}
    }
    cur+=ch;
  }
  out.push(cur);
  return out.map(x=>x.trim()).filter(Boolean);
}
// "Dr. Benjamin Ullrich (Partner, Berlin) - direkter Kontakt" -> name and role
export function parseName(part){
  const roles=[];
  let name=part.replace(/\(([^()]*)\)/g,(_,r)=>{roles.push(r.trim());return ' '}).replace(/\s+/g,' ').trim();
  const via=name.match(/^(?:Termine?|Kontakt|Appointments?)\s+(?:über|ueber|via)\s+(.*)$/i);if(via){name=via[1].trim();roles.unshift('Appointments')}
  const dash=name.match(/^(.*?)\s+[-–—]\s+(.*)$/);if(dash){name=dash[1].trim();roles.push(dash[2].trim())}
  const role=roles.filter(Boolean).map(r=>ROLE_EN[fold(r)]||r).join('; ');
  return {name,role};
}
// A part counts as a person when it has a capitalised word and no digits or address characters.
// Function words that sit in contact fields instead of a name ("Firmenkunden", "Legal - corporate / M&A").
const NOT_NAME=new Set(['legal','firmenkunden','geschaeftsfuehrung','geschaeftsleitung','vertrieb','sekretariat','team','office','zentrale','empfang','vorstand','inhaber','unbekannt','kontakt','ansprechpartner','partner','assistenz','buchhaltung','einkauf','personal','corporate','finance','advisory','mittelstand','firmenkundenbetreuung','nachfolge','unternehmensnachfolge','info','service','general','tbd','unknown']);
export function looksLikeName(n){if(!n||!/[A-ZÄÖÜ]/.test(n)||/[\d@]/.test(n)||n.length>60)return false;const t=nameTok(n);return t.length>0&&!t.every(x=>NOT_NAME.has(x))}
const GENERIC=/^(info|kontakt|contact|office|mail|post|zentrale|service|vertrieb|sales|hello|empfang|team|ir|presse|order|anfrage|verwaltung|buero|büro)([._-]|@)/i;
export function isGeneralAddr(a){return GENERIC.test((a||'').trim())}
// Addresses that are known to work: the record's own email field, senders of incoming mail, attendees of
// meetings and calls. An address that only ever received mail from us could be a guess and is not used.
export function orgAddresses(o){
  const a=new Set();
  if(o.email)a.add(o.email.toLowerCase().trim());
  Object.values(o.touches||{}).forEach(t=>{if(!t||typeof t!=='object')return;const em=t.src==='Kinetix'||t.src==='Gmail'||!t.src;if(t.dir!=='in'&&em)return;((t.who||'').toLowerCase().match(/[\w.+-]+@[\w.-]+/g)||[]).forEach(x=>a.add(x))});
  return [...a];
}
export function addressFor(name,addrs,names){
  const tok=nameTok(name);if(!tok.length)return '';
  const sur=tok[tok.length-1],first=tok.length>1?tok[0]:'';
  const shared=(names||[]).filter(n=>{const t=nameTok(n);return t[t.length-1]===sur}).length>1;
  return addrs.find(a=>{
    if(isGeneralAddr(a))return false;
    const l=fold(a.split('@')[0]);if(!l.includes(sur))return false;
    if(first&&(l.includes(first)||l.startsWith(first[0]+'.')||l.startsWith(first[0]+sur)||l.startsWith(first[0]+'_')))return true;
    return !shared&&(l===sur||l.endsWith('.'+sur));
  })||'';
}
const PTYPE_OF={'M&A sourcing intermediaries':'M&A sourcing intermediaries','Financing partners':'Financing partners','Investors & family office':'Investors & family office','DD advisors':'DD advisors','Legal':'Legal','Executive search':'Executive search','HR, universities & interns':'Other','Chambers & bodies':'Chambers & bodies','Industry association':'Industry association','Admin & infrastructure':'Admin & infrastructure','Personal network':'Personal network','Other':'Other'};
export function orgName(o){return o.name||o.firm||''}

// Plan the move for one state object. Returns the changes and a review list; changes nothing.
// mk(): new person template, id(): new id. Both injected so the plan is testable outside the app.
export function planContacts(st,mk,id){
  const orgs=[...(st.companies||[]),...(st.advisors||[])];
  const people=st.people||[];
  const byOrg=new Map();
  people.forEach(p=>{if(p.orgId){(byOrg.get(p.orgId)||byOrg.set(p.orgId,[]).get(p.orgId)).push(p)}});
  const create=[],link=[],orgSet=[],review=[];
  const linkedNow=new Set();
  // 1. people without an organisation whose firm text names exactly one organisation
  const orgByName=new Map();
  orgs.forEach(o=>{const n=normName(orgName(o));if(!n)return;orgByName.set(n,orgByName.has(n)?null:o)});
  people.forEach(p=>{
    if(p.orgId)return;
    const n=normName(p.firm||'');
    const o=n?orgByName.get(n):null;
    if(o){link.push({person:p.id,org:o.id,why:'firm text'});linkedNow.add(p.id);(byOrg.get(o.id)||byOrg.set(o.id,[]).get(o.id)).push(p)}
    else if(!p.archived)review.push({kind:'person',id:p.id,name:p.name,org:p.firm||'',issue:p.firm?'no organisation named '+p.firm:'no organisation'});
  });
  // 2. contact text on organisations
  orgs.forEach(o=>{
    const raw=(o.contact||'').trim();
    const set={};
    const known=byOrg.get(o.id)||[];
    let primary=null;
    if(raw){
      const parts=splitNames(raw).map(parseName);
      const names=parts.map(x=>x.name);
      const addrs=orgAddresses(o);
      const rest=[];
      parts.forEach((pt,i)=>{
        if(!looksLikeName(pt.name)){rest.push(pt.name+(pt.role?' ('+pt.role+')':''));return}
        const email=addressFor(pt.name,addrs,names);
        const nn=normName(pt.name),tk=nameTok(pt.name);
        let p=known.find(x=>normName(x.name||'')===nn)||(email&&known.find(x=>(x.email||'').toLowerCase()===email))
          ||known.find(x=>{const t=nameTok(x.name||'');return tk.length===1&&t.length&&t[t.length-1]===tk[0]});
        if(!p){
          // same person already in the people list under another or no organisation
          const elsewhere=people.find(x=>!x.orgId&&!linkedNow.has(x.id)&&((email&&(x.email||'').toLowerCase()===email)||(normName(x.name||'')===nn&&tk.length>1)));
          if(elsewhere){p=elsewhere;link.push({person:p.id,org:o.id,why:'contact text'});linkedNow.add(p.id);const r=review.findIndex(x=>x.id===p.id);if(r>=0)review.splice(r,1)}
        }
        if(!p){
          p=Object.assign(mk(),{id:id(),name:pt.name,title:pt.role,firm:orgName(o),orgId:o.id,email:email||'',
            ptype:o.kind==='target'?'Target contact':(PTYPE_OF[o.category]||''),city:o.city||o.location||''});
          create.push(p);known.push(p);
        }else{
          const upd={};
          if(pt.role&&!p.title)upd.title=pt.role;
          if(email&&!p.email)upd.email=email;
          if(Object.keys(upd).length)link.push({person:p.id,org:o.id,why:'contact text',set:upd});
        }
        if(!primary)primary=p;
      });
      set.contact=null;
      // text in the contact field that names nobody is kept on the organisation, not dropped
      if(rest.length){const k=o.kind==='advisor'?'detail':'notes';const add='Contact: '+rest.join('; ');if(!(o[k]||'').includes(add))set[k]=((o[k]||'')+(o[k]?' | ':'')+add)}
    }
    if(!primary&&o.primaryId)primary=known.find(x=>x.id===o.primaryId)||null;
    if(primary){
      if(o.primaryId!==primary.id)set.primaryId=primary.id;
      const pset={};
      if(o.mobile){if(!primary.mobile||primary.mobile===o.mobile){pset.mobile=o.mobile;set.mobile=null}else review.push({kind:o.kind,id:o.id,name:orgName(o),org:'',issue:'mobile '+o.mobile+' differs from '+primary.name+' ('+primary.mobile+'), left on the organisation'})}
      if(o.title&&o.kind==='advisor'){if(!primary.title)pset.title=o.title;set.title=null}
      if(Object.keys(pset).length){const c=create.find(x=>x===primary);if(c)Object.assign(c,pset);else link.push({person:primary.id,org:o.id,why:'primary',set:pset})}
    }else if(raw){review.push({kind:o.kind,id:o.id,name:orgName(o),org:'',issue:'contact text without a person: '+raw})}
    if(Object.keys(set).length)orgSet.push({id:o.id,set});
  });
  // The organisation keeps only an address that belongs to none of its people (general address). Checked once all
  // links are planned, because a person can reach an organisation after that organisation was looked at.
  const mailsOf=new Map();
  const note=(org,mail)=>{if(!org||!mail)return;mail=mail.toLowerCase();(mailsOf.get(org)||mailsOf.set(org,new Set()).get(org)).add(mail)};
  const plannedOrg=new Map(link.map(l=>[l.person,l]));
  people.forEach(p=>{const l=plannedOrg.get(p.id);note(l?l.org:p.orgId,(l&&l.set&&l.set.email)||p.email)});
  create.forEach(p=>note(p.orgId,p.email));
  orgs.forEach(o=>{
    const oe=(o.email||'').toLowerCase();if(!oe||!(mailsOf.get(o.id)||new Set()).has(oe))return;
    let u=orgSet.find(x=>x.id===o.id);if(!u){u={id:o.id,set:{}};orgSet.push(u)}
    u.set.email=null;
  });
  return {create,link,orgSet,review};
}
// Apply a plan to the state in place. null in a set removes the field.
export function applyContactPlan(st,plan){
  const byId=new Map([...(st.companies||[]),...(st.advisors||[]),...(st.people||[])].map(r=>[r.id,r]));
  st.people=st.people||[];
  plan.create.forEach(p=>{st.people.push(p);byId.set(p.id,p)});
  plan.link.forEach(l=>{const p=byId.get(l.person);if(!p)return;p.orgId=l.org;if(l.set)Object.assign(p,l.set)});
  plan.orgSet.forEach(u=>{const o=byId.get(u.id);if(!o)return;Object.entries(u.set).forEach(([k,v])=>{if(v===null)delete o[k];else o[k]=v})});
  if(!st.contactsMigV1)st.contactsMigV1=new Date().toISOString().slice(0,10);
  return {created:plan.create.length,linked:plan.link.length,orgs:plan.orgSet.length,review:plan.review.length};
}
