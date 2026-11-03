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

// Organisations Leif keeps as one record whatever the branch (Leif 03.11.2026): every IHK is "IHK"; each person
// keeps their own chamber in the firm field.
export const GROUPS=[{name:'IHK',re:/\bIHK\b|Handelskammer/i,category:'Chambers & bodies'}];
// No person records for archived organisations or for tool and service vendors (CRM, data platforms, notaries).
const SKIP_CATS=['Admin & infrastructure'];
export const isSkipped=o=>!!o.archived||SKIP_CATS.includes(o.category)||!!o.mergedInto;
// Two firm names are the same firm when the shorter one's tokens all appear in the longer one ("Benten", "Benten Capital").
function firmToks(n){return normName(n).split(' ').filter(Boolean)}
export function sameFirm(a,b){const A=firmToks(a),B=firmToks(b);if(!A.length||!B.length)return false;const s=A.length<=B.length?A:B,l=A.length<=B.length?B:A;return s.join('').length>=5&&s.every(t=>l.includes(t))}
// A firm field that is really a person or a former employer is not an organisation ("Walter Nemetz (ex-Rubix)").
function personalFirm(p){const f=p.firm||'';if(/\(ex-|\b\w+\/\w+\b/.test(f))return true;if(!/\s(and|und)\s/i.test(f))return false;const ft=firmToks(f),nt=nameTok(p.name||'');return nt.some(t=>t.length>=4&&ft.includes(t))}
const groupOf=n=>GROUPS.find(g=>g.re.test(n||''))||null;

// Plan the move for one state object. Returns the changes and a review list; changes nothing.
// mk(): new person template, id(): new id. Both injected so the plan is testable outside the app.
export function planContacts(st,mk,id){
  const orgs=[...(st.companies||[]),...(st.advisors||[])];
  const people=st.people||[];
  const byOrg=new Map();
  const addTo=(org,p)=>(byOrg.get(org)||byOrg.set(org,[]).get(org)).push(p);
  people.forEach(p=>{if(p.orgId)addTo(p.orgId,p)});
  const create=[],newOrgs=[],orgSet=[],review=[],merge=[];
  const links=new Map(); // one entry per person
  const link=(person,org,why,set)=>{const e=links.get(person);if(e){e.org=org;if(set)e.set=Object.assign(e.set||{},set)}else links.set(person,{person,org,why,set:set||null})};
  const linkedNow=new Set();
  // 0. groups: one surviving organisation per group, the others are merged into it
  const survivorOf=new Map();
  GROUPS.forEach(g=>{
    const members=orgs.filter(o=>!o.mergedInto&&g.re.test(orgName(o)));
    if(!members.length)return;
    const sv=members.find(o=>orgName(o)===g.name)||[...members].sort((a,b)=>(!!a.archived-!!b.archived)||(Object.keys(b.touches||{}).length-Object.keys(a.touches||{}).length))[0];
    survivorOf.set(g.name,sv);
    const from=members.filter(o=>o!==sv);
    if(from.length||orgName(sv)!==g.name)merge.push({into:sv.id,from:from.map(o=>o.id),name:g.name,category:g.category});
  });
  // 1. people without an organisation: the firm field names an organisation, a group, or a firm not held yet
  const live=orgs.filter(o=>!o.mergedInto&&!o.archived);
  people.forEach(p=>{
    if(p.orgId||p.archived)return;
    const f=(p.firm||'').trim();
    if(!f){review.push({kind:'person',id:p.id,name:p.name,org:'',issue:'no organisation'});return}
    const g=groupOf(f);
    let o=g?survivorOf.get(g.name):null,why='firm field';
    if(!o){const ex=live.filter(x=>normName(orgName(x))===normName(f));o=ex.length===1?ex[0]:null}
    if(!o){const fz=live.filter(x=>sameFirm(orgName(x),f));o=fz.length===1?fz[0]:null}
    if(!o){
      if(personalFirm(p)){review.push({kind:'person',id:p.id,name:p.name,org:f,issue:'firm field names a person, not an organisation'});return}
      o=newOrgs.find(x=>sameFirm(x.firm,f));why='new organisation';
      if(!o){o={id:id(),kind:'advisor',firm:f,email:'',domain:'',category:p.ptype||'Other',geo:'',market:p.market||'',status:'Contact known',ptype:'',introPath:'',notes:'',detail:'',cadence:30,fav:false,lists:[],touches:{},nextDate:'',nextAction:'',priority:'',links:[],city:p.city||''};newOrgs.push(o)}
    }
    link(p.id,o.id,why);linkedNow.add(p.id);addTo(o.id,p);
  });
  // 2. contact text on organisations
  orgs.forEach(o=>{
    if(isSkipped(o))return;
    const raw=(o.contact||'').trim();
    const set={};
    // a group member also knows the people already filed under the group, so nobody is created twice
    const grp=groupOf(orgName(o)),sv=grp&&survivorOf.get(grp.name);
    const known=(byOrg.get(o.id)||[]).concat(sv&&sv!==o?(byOrg.get(sv.id)||[]):[]);
    let primary=null;
    if(raw){
      const parts=splitNames(raw).map(parseName);
      const names=parts.map(x=>x.name);
      const addrs=orgAddresses(o);
      const rest=[];
      parts.forEach(pt=>{
        if(!looksLikeName(pt.name)){rest.push(pt.name+(pt.role?' ('+pt.role+')':''));return}
        const email=addressFor(pt.name,addrs,names);
        const nn=normName(pt.name),tk=nameTok(pt.name);
        let p=known.find(x=>normName(x.name||'')===nn)||(email&&known.find(x=>(x.email||'').toLowerCase()===email))
          ||known.find(x=>{const t=nameTok(x.name||'');return tk.length===1&&t.length&&t[t.length-1]===tk[0]});
        if(!p){
          // same person already in the people list under another or no organisation
          // a person filed only under a firm created from their firm field may still belong to this organisation
          const movable=x=>!x.orgId&&(!linkedNow.has(x.id)||(links.get(x.id)||{}).why==='new organisation');
          const elsewhere=people.find(x=>movable(x)&&((email&&(x.email||'').toLowerCase()===email)||(normName(x.name||'')===nn&&tk.length>1)));
          if(elsewhere){p=elsewhere;link(p.id,o.id,'contact text');linkedNow.add(p.id);known.push(p);const r=review.findIndex(x=>x.id===p.id);if(r>=0)review.splice(r,1)}
        }
        if(!p){
          p=Object.assign(mk(),{id:id(),name:pt.name,title:pt.role,firm:orgName(o),orgId:o.id,email:email||'',
            ptype:o.kind==='target'?'Target contact':(PTYPE_OF[o.category]||''),city:o.city||o.location||''});
          create.push(p);known.push(p);
        }else{
          const upd={};
          if(pt.role&&!p.title)upd.title=pt.role;
          if(email&&!p.email)upd.email=email;
          if(Object.keys(upd).length)link(p.id,p.orgId||o.id,'contact text',upd);
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
      if(Object.keys(pset).length){const c=create.find(x=>x===primary);if(c)Object.assign(c,pset);else link(primary.id,primary.orgId||o.id,'primary',pset)}
    }else if(raw){review.push({kind:o.kind,id:o.id,name:orgName(o),org:'',issue:'contact text without a person: '+raw})}
    if(Object.keys(set).length)orgSet.push({id:o.id,set});
  });
  // The organisation keeps only an address that belongs to none of its people (general address). Checked once all
  // links are planned, because a person can reach an organisation after that organisation was looked at.
  const mailsOf=new Map();
  const note=(org,mail)=>{if(!org||!mail)return;mail=mail.toLowerCase();(mailsOf.get(org)||mailsOf.set(org,new Set()).get(org)).add(mail)};
  people.forEach(p=>{const l=links.get(p.id);note(l?l.org:p.orgId,(l&&l.set&&l.set.email)||p.email)});
  create.forEach(p=>note(p.orgId,p.email));
  orgs.forEach(o=>{
    if(isSkipped(o))return;
    const oe=(o.email||'').toLowerCase();if(!oe||!(mailsOf.get(o.id)||new Set()).has(oe))return;
    let u=orgSet.find(x=>x.id===o.id);if(!u){u={id:o.id,set:{}};orgSet.push(u)}
    u.set.email=null;
  });
  // a firm created from a firm field whose people all turned out to belong elsewhere is not needed
  const used=new Set([...links.values()].map(l=>l.org));
  return {create,link:[...links.values()],orgSet,newOrgs:newOrgs.filter(o=>used.has(o.id)),merge,review};
}
// Apply a plan to the state in place. null in a set removes the field.
export function applyContactPlan(st,plan){
  const today=new Date().toISOString().slice(0,10);
  st.people=st.people||[];st.advisors=st.advisors||[];
  (plan.newOrgs||[]).forEach(o=>st.advisors.push(o));
  const byId=new Map([...(st.companies||[]),...st.advisors,...st.people].map(r=>[r.id,r]));
  plan.create.forEach(p=>{st.people.push(p);byId.set(p.id,p)});
  plan.link.forEach(l=>{const p=byId.get(l.person);if(!p)return;p.orgId=l.org;if(l.set)Object.assign(p,l.set)});
  plan.orgSet.forEach(u=>{const o=byId.get(u.id);if(!o)return;Object.entries(u.set).forEach(([k,v])=>{if(v===null)delete o[k];else o[k]=v})});
  (plan.merge||[]).forEach(m=>mergeOrgs(st,byId,m,today));
  if(!st.contactsMigV1)st.contactsMigV1=today;
  return {created:plan.create.length,linked:plan.link.length,orgs:plan.orgSet.length,newOrgs:(plan.newOrgs||[]).length,merged:(plan.merge||[]).reduce((n,m)=>n+m.from.length,0),review:plan.review.length};
}
// Merge organisations into one: touches, people, next steps, lists and notes move; each former record keeps its own
// address and phone as a line in the notes and is archived with mergedInto, so nothing is deleted.
function mergeOrgs(st,byId,m,today){
  const sv=byId.get(m.into);if(!sv)return;
  const card=o=>{const bits=[o.address||o.city,o.phone,o.email,o.domain].filter(Boolean);return bits.length?orgName(o)+': '+bits.join(', '):''};
  const renamed=orgName(sv)!==m.name;
  const notes=[];if(renamed){const c=card(sv);if(c)notes.push(c)}
  const steps=[];if((sv.nextAction||'').trim())steps.push(sv.nextAction.trim());
  m.from.forEach(fid=>{
    const o=byId.get(fid);if(!o)return;
    Object.entries(o.touches||{}).forEach(([k,t])=>{sv.touches=sv.touches||{};if(!sv.touches[k])sv.touches[k]=t});
    o.touches={};
    st.people.forEach(p=>{if(p.orgId===fid)p.orgId=sv.id});
    const c=card(o);if(c)notes.push(c);
    if((o.notes||'').trim())notes.push(orgName(o)+': '+o.notes.trim());
    if(!o.archived&&(o.nextAction||'').trim()){const a=o.nextAction.trim();steps.push(a.includes(orgName(o))?a:orgName(o)+': '+a);if(o.nextDate&&(!sv.nextDate||o.nextDate<sv.nextDate))sv.nextDate=o.nextDate}
    (o.lists||[]).forEach(l=>{sv.lists=sv.lists||[];if(!sv.lists.includes(l))sv.lists.push(l)});
    if(o.actionLog&&o.actionLog.length)sv.actionLog=(sv.actionLog||[]).concat(o.actionLog);
    if((o.lastSummaryDate||'')>(sv.lastSummaryDate||'')){sv.lastSummary=o.lastSummary;sv.lastSummaryDate=o.lastSummaryDate}
    Object.keys(st.senderMap||{}).forEach(k=>{if(st.senderMap[k]===fid)st.senderMap[k]=sv.id});
    st.threadsDone=st.threadsDone||{};if(!st.threadsDone[fid])st.threadsDone[fid]=today;
    o.archived=true;o.archivedAt=today;o.archivedReason='Merged into '+m.name;o.mergedInto=sv.id;delete o.primaryId;
  });
  if(renamed)['address','phone','email','domain','city'].forEach(k=>delete sv[k]);
  sv.firm=m.name;if(m.category)sv.category=m.category;
  if(steps.length>1){sv.nextAction=steps.join(' | ');sv.nextSet=today}
  if(notes.length){const add=notes.join(' | ');if(!(sv.notes||'').includes(add))sv.notes=((sv.notes||'')+(sv.notes?' | ':'')+add)}
}
