import {GRP_DEF, S, allOrgs, dispName, grpOf, lastTouch, personOrg, tType} from '../state.js';
import {esc, fmtAgo, normName} from '../util.js';
import {starHtml, dueChip} from './ui.js';

export let psortK='lastc';
export let psortD=-1;

// ═══════════════════════════════════════════════════════════════
// RENDER: PEOPLE
// ═══════════════════════════════════════════════════════════════
// Org contacts without their own person record. The contact field can hold several names
// ("Phil Lesjak; Rute Miranda (Assistenz)"): each becomes its own row, the role in brackets becomes its
// title, and an email address goes to the name it belongs to. Addresses come from the record's email field
// and from the addresses in its correspondence (touch senders and recipients, sender map), never a pattern.
const ROLE_EN={assistenz:'Assistant',assistentin:'Assistant',assistent:'Assistant',sekretariat:'Office',pa:'Assistant'};
const fold=x=>(x||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
function nameTok(n){return fold(n).replace(/^(dr|prof)\.?\s+/g,'').split(/[^a-z]+/).filter(t=>t.length>=3)}
// Addresses that are known to work: the record's own email field, senders of incoming mail, and attendees of
// meetings and calls. An address that only ever received mail from us could be a guess and is not used.
function orgAddresses(o){
  const a=new Set();
  if(o.email)a.add(o.email.toLowerCase().trim());
  Object.values(o.touches||{}).forEach(t=>{if(t.dir!=='in'&&tType(t)==='Email')return;((t.who||'').toLowerCase().match(/[\w.+-]+@[\w.-]+/g)||[]).forEach(x=>a.add(x))});
  return [...a];
}
function addressFor(name,addrs,names){
  const tok=nameTok(name);if(!tok.length)return '';
  const sur=tok[tok.length-1],first=tok.length>1?tok[0]:'';
  const shared=(names||[]).filter(n=>{const t=nameTok(n);return t[t.length-1]===sur}).length>1;
  return addrs.find(a=>{
    const l=fold(a.split('@')[0]);if(!l.includes(sur))return false;
    if(first&&(l.includes(first)||l.startsWith(first[0]+'.')||l.startsWith(first[0]+sur)))return true;
    return !shared&&l===sur;
  })||'';
}
// split a contact field into names: ; , "und" "and" & separate them, but not inside brackets
function splitNames(raw){
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
function parseName(part){
  const roles=[];
  let name=part.replace(/\(([^()]*)\)/g,(_,r)=>{roles.push(r.trim());return ' '}).replace(/\s+/g,' ').trim();
  const via=name.match(/^(?:Termine?|Kontakt|Appointments?)\s+(?:über|ueber|via)\s+(.*)$/i);if(via){name=via[1].trim();roles.unshift('Appointments')}
  const dash=name.match(/^(.*?)\s+[-–—]\s+(.*)$/);if(dash){name=dash[1].trim();roles.push(dash[2].trim())}
  const role=roles.filter(Boolean).map(r=>ROLE_EN[fold(r)]||r).join('; ');
  return {name,role};
}
function personLast(o,name,email){
  const tok=nameTok(name),sur=tok[tok.length-1]||'';
  let best='';
  Object.values(o.touches||{}).forEach(t=>{
    const who=fold(t.who||''),subj=fold(t.subject||'');
    // an email counts when they sent or received it; a call or meeting note also when its title names them
    const hit=(email&&who.includes(email))||(sur&&(who.includes(sur)||(tType(t)!=='Email'&&subj.includes(sur))));
    if(hit&&(t.date||'')>best)best=t.date||'';
  });
  return best||null;
}
export function contactRows(){
  const out=[];
  allOrgs().forEach(o=>{
    const raw=(o.contact||'').trim();if(!raw)return;
    const parts=splitNames(raw).map(parseName).filter(x=>x.name);
    const names=parts.map(x=>x.name);
    const addrs=orgAddresses(o);
    const known=(S.people||[]).filter(p=>p.orgId===o.id||normName(p.firm||'')===normName(dispName(o))).map(p=>normName(p.name||''));
    const given=parts.map(x=>addressFor(x.name,addrs,names));
    // the record's own address goes to the first name when it belongs to nobody in the field (office@, info@)
    const orgMail=(o.email||'').trim().toLowerCase();
    let general=false;
    if(orgMail&&!given.includes(orgMail)&&!given[0]){given[0]=orgMail;general=true}
    parts.forEach(({name,role},i)=>{
      if(known.includes(normName(name)))return;
      const email=given[i];
      const primary=i===0;
      out.push({__org:true,__orgRec:o,__general:general&&i===0,__last:personLast(o,name,email),id:o.id,kind:'person',name,title:role,firm:dispName(o),
        email,phone:primary?(o.phone||''):'',mobile:primary?(o.mobile||''):'',linkedin:'',city:o.city||'',
        networkPath:primary?(o.introPath||''):'',ptype:o.category||'',angle:'',
        touches:o.touches||{},fav:o.fav,lists:o.lists||[],nextAction:primary?o.nextAction:'',nextDate:primary?o.nextDate:'',priority:o.priority});
    });
  });
  return out;
}
// last contact with the person; for an org contact without own record, the org's correspondence that names them
export function personLastTouch(p){return p.__org?(p.__last||null):lastTouch(p)}
export function allPeopleRows(){return [...(S.people||[]),...contactRows()]}
export let pGrp='';
export function resetPeopleView(){pGrp=''}
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
  const val=p=>{switch(psortK){case 'name':return (p.name||'').toLowerCase();case 'firm':return (p.firm||'').toLowerCase();case 'lastc':return personLastTouch(p)||'';default:return ''}};
  rows.sort((a,b)=>{const va=val(a),vb=val(b);return va<vb?-psortD:va>vb?psortD:0});
  document.getElementById('pCount').textContent=rows.length+' of '+BASE.length;
  {const cnt={};BASE.forEach(p=>{const g=personGrp(p);cnt[g]=(cnt[g]||0)+1});const pg=document.getElementById('pGroups');if(pg)pg.innerHTML='<button class="sm'+(pGrp?'':' vbtn on')+'" data-click="setPGrp|">All</button>'+GRP_DEF.map(g=>'<button class="sm'+(pGrp===g.k?' vbtn on':'')+'" data-click="setPGrp|'+g.k+'">'+g.t+' ('+(cnt[g.k]||0)+')</button>').join('')}
  const hdr=(k,label)=>'<th data-click="sortPeople|'+k+'">'+label+(psortK===k?' <span class="arr">'+(psortD>0?'▲':'▼')+'</span>':'')+'</th>';
  const lastCell=p=>{const d=personLastTouch(p);if(d)return fmtAgo(d);if(p.__org){const f=lastTouch(p.__orgRec);return f?'<span title="Last contact with the firm">'+fmtAgo(f)+' (firm)</span>':'-'}return '-'};
  const nextCell=p=>p.nextAction?'<div class="nx">'+esc(p.nextAction)+'</div>'+(p.nextDate?dueChip(p.nextDate):''):'';
  const chip=p=>{const g=GRP_DEF.find(x=>x.k===personGrp(p))||GRP_DEF[5];return '<span class="gchip" style="background:'+g.c+'">'+(g.s||g.t)+'</span>'};
  document.getElementById('peopleTable').innerHTML='<table class="ppl"><colgroup><col style="width:19%"><col style="width:8%"><col style="width:19%"><col style="width:18%"><col style="width:9%"><col style="width:27%"></colgroup><tr>'+hdr('name','Name')+'<th>Type</th>'+hdr('firm','Organization')+'<th>Email / phone</th>'+hdr('lastc','Last contact')+'<th>Next step</th></tr>'
    +rows.slice(0,400).map(p=>'<tr class="rowlink" data-click="openRec|'+p.id+'|$e">'
      +'<td>'+starHtml(p)+' <b>'+esc(p.name)+'</b>'+(p.title?'<div class="sub">'+esc(p.title)+'</div>':'')+'</td>'
      +'<td>'+chip(p)+'</td>'
      +'<td>'+esc(p.firm||'-')+(p.networkPath?'<div class="sub" title="'+esc(p.networkPath)+'">'+esc(p.networkPath)+'</div>':'')+'</td>'
      +'<td><div class="em">'+(p.email?'<a href="mailto:'+esc(p.email)+'" data-click="!">'+esc(p.email)+'</a>':'')+'</div>'+(p.__general?'<div class="sub">general address</div>':'')+((p.mobile||p.phone)?'<div class="sub">'+esc(p.mobile||p.phone)+'</div>':'')+'</td>'
      +'<td>'+lastCell(p)+'</td>'
      +'<td>'+nextCell(p)+'</td></tr>').join('')+'</table>';
}
export function sortPeople(k){if(psortK===k)psortD*=-1;else{psortK=k;psortD=k==='lastc'?-1:1}renderPeople()}
