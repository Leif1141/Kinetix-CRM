import {MY_ADDR} from '../constants.js';
import {S, addTouch, allOrgs, dispName, findRec, newPerson, orgPeople} from '../state.js';
import {cleanPrev, esc, fmtD, normName, toast, today} from '../util.js';
import {renderAll} from '../main.js';
import {retriageUnmatched} from '../sync/triage.js';
import {save} from '../store/firebase.js';


// ═══════════════════════════════════════════════════════════════
// RENDER: INBOX
// ═══════════════════════════════════════════════════════════════
export function renderInbox(){
  const b=document.getElementById('inbBadge');
  b.style.display=(S.unmatched||[]).length?'inline-block':'none';b.textContent=(S.unmatched||[]).length;
  const opts='<option value="">Assign to…</option><optgroup label="Targets">'+(S.companies||[]).map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'</optgroup><optgroup label="Advisors">'+(S.advisors||[]).map(a=>'<option value="'+a.id+'">'+esc(a.firm)+'</option>').join('')+'</optgroup>';
  const dl=document.getElementById('assignList')||(()=>{const d=document.createElement('datalist');d.id='assignList';document.body.appendChild(d);return d})();dl.innerHTML=[...(S.companies||[]).map(c=>[c.name,'Target']),...(S.advisors||[]).map(a=>[a.firm,'Advisor']),...(S.people||[]).map(p=>[p.name+(p.firm?' ('+p.firm+')':''),'Person'])].filter(x=>x[0]).map(x=>'<option value="'+esc(x[0])+'">'+x[1]+'</option>').join('');
  document.getElementById('inboxBody').innerHTML=(S.unmatched||[]).length?(S.unmatched||[]).map((u,i)=>'<div class="inbox-item"><div class="body" style="cursor:pointer" onclick="toggleInboxBody('+i+')"><b>'+esc(u.subject)+'</b>'+(u.link?' <a href="'+esc(u.link)+'" target="_blank" onclick="event.stopPropagation()" title="Open original">&#8599;</a>':'')+'<div id="inb_body_'+i+'" style="display:none;margin-top:6px;padding:8px;background:#F4F5F9;border:1px solid var(--lgray);border-radius:4px;font-size:11px;white-space:pre-wrap">'+esc(cleanPrev(u.prev||u.note||'',2000)||'No content captured for this message. Use the link to open the original.')+'</div><div class="snip">'+esc(u.dir==='out'?('to: '+(u.who||u.sender)):u.sender)+' · '+fmtD(u.date)+' · '+u.src+'</div></div><input class="assign" id="asg_'+i+'" list="assignList" placeholder="Assign: type company or person…" onkeydown="if(event.key===\'Enter\')assignByName('+i+',this)" style="min-width:220px"><button class="sm primary" onclick="assignByName('+i+',document.getElementById(\'asg_'+i+'\'))">Assign</button><button class="sm" onclick="ignoreUnmatched('+i+',false)" title="Ignore this sender">Ignore</button><button class="sm" onclick="ignoreUnmatched('+i+',true)" title="Ignore the whole domain">Ignore domain</button><button class="sm" onclick="dismissUnmatched('+i+')" title="Remove this item only">Dismiss</button></div>').join(''):'<p class="muted" style="padding:14px">No unmatched emails. Sync to pull new ones.</p>';
}
export function assignByName(i,inp){const v=(inp.value||'').trim();if(!v)return;const nn=normName(v.replace(/\s*\(.*\)$/,''));let r=(S.companies||[]).find(c=>normName(c.name||'')===nn)||(S.advisors||[]).find(a=>normName(a.firm||'')===nn)||(S.people||[]).find(p=>normName(p.name||'')===nn);
  if(!r){const all=[...(S.companies||[]),...(S.advisors||[]),...(S.people||[])];const cands=all.filter(x=>normName(dispName(x)||'').includes(nn));if(cands.length===1)r=cands[0]}
  if(!r){if(!confirm('"'+v+'" is not in the CRM. Create as a new person?')){inp.value='';return}const firm=prompt('Firm of the person (optional):','')||'';const p=newPerson();p.name=v;p.firm=firm;const u=(S.unmatched||[])[i];const addr=((u&&(u.dir==='out'?(u.who||''):(u.sender||'')))||'').toLowerCase().match(/[\w.+-]+@[\w.-]+/);if(addr)p.email=addr[0];const o=firm?allOrgs().find(x=>normName(dispName(x))===normName(firm)):null;if(o)p.orgId=o.id;S.people=S.people||[];S.people.push(p);r=p}
  assignEmail(i,r.id)}
export function toggleInboxBody(i){const el=document.getElementById('inb_body_'+i);if(el)el.style.display=el.style.display==='none'?'':'none'}
export function ignoreUnmatched(i,dom){
  const u=(S.unmatched||[])[i];if(!u)return;
  const base=u.dir==='out'?(u.who||''):(u.sender||'');
  const a=((base.toLowerCase().match(/[\w.+-]+@[\w.-]+/))||[base.toLowerCase()])[0];
  if(!a){return}
  S.ignoredSenders=S.ignoredSenders||{};S.ignoredDomains=S.ignoredDomains||{};
  if(dom&&a.includes('@'))S.ignoredDomains[a.split('@')[1].replace(/\./g,'_')]=today();
  else S.ignoredSenders[a.replace(/\./g,'_')]=today();
  const r=retriageUnmatched();
  save();renderAll();
  toast('Ignored '+(dom&&a.includes('@')?'@'+a.split('@')[1]:a)+' — '+r.dropped+' item'+(r.dropped===1?'':'s')+' cleared');
}
export function dismissUnmatched(i){
  const u=(S.unmatched||[])[i];if(!u||!u.key)return;
  S.dismissedUnmatched=S.dismissedUnmatched||{};S.dismissedUnmatched[u.key.replace(/\./g,'_')]=today();
  S.unmatched=(S.unmatched||[]).filter((_,j)=>j!==i);
  save();renderAll();toast('Hidden');
}
export function isDismissedUnmatched(k){return !!(k&&S.dismissedUnmatched&&S.dismissedUnmatched[k.replace(/\./g,'_')])}
export function assignEmail(i,val){
  const u=(S.unmatched||[])[i];if(!u||!val)return;
  const _base=u.dir==='out'?(u.who||''):(u.sender||'');
  const senderAddr=(_base.toLowerCase().match(/[\w.+-]+@[\w.-]+/))?.[0]||'';
  // map counterparty address for future auto-match (Firebase key-safe: replace dots)
  if(senderAddr&&!MY_ADDR.some(m=>senderAddr.includes(m))){S.senderMap=S.senderMap||{};S.senderMap[senderAddr.replace(/\./g,'_')]=val}
  let rec;
  if(val.startsWith('r'))rec=findRec(val);
  if(!rec)return;
  const t={date:u.date,dir:u.dir,subject:u.subject,link:u.link,src:u.src,who:u.who||u.sender,prev:u.prev||'',gid:u.gid};
  addTouch(rec,u.key,t);
  // also log to linked org
  if(rec.orgId){const org=findRec(rec.orgId);if(org)addTouch(org,u.key,t)}
  if(rec.kind!=='person'){const ppl=orgPeople(rec);ppl.forEach(p=>{if(senderAddr&&(p.email||'').toLowerCase()===senderAddr)addTouch(p,u.key,t)})}
  S.unmatched=(S.unmatched||[]).filter((_,j)=>j!==i);
  retriageUnmatched();
  save();renderAll();
}
