import {openDialog, confirmDialog} from './dialog.js';
import {S, allOrgs, isArch, liveOnly, newPerson, rawRecs, unarchiveAll} from '../state.js';
import {renderAll} from '../main.js';
import {toast, uid} from '../util.js';
import {save, stateRef, legacyMode, currentUser} from '../store/firebase.js';
import {canImport, exportJSON} from '../store/export.js';


// ═══════════════════════════════════════════════════════════════
// RENDER: DATA
// ═══════════════════════════════════════════════════════════════
export async function restoreArchived(){if(await confirmDialog('Every archived record becomes visible again in all views.',{title:'Restore all archived records?',ok:'Restore all'}))unarchiveAll()}
export function renderData(){
  const el=document.getElementById('dataInfo');
  const arch=rawRecs().filter(isArch);
  if(el)el.textContent=allOrgs().filter(o=>o.kind==='target').length+' companies · '+allOrgs().filter(o=>o.kind==='advisor').length+' advisors · '+liveOnly(S.people||[]).length+' people · '+(S.unmatched||[]).length+' unmatched · last sync: '+(S.lastSync?new Date(S.lastSync).toLocaleString('en-GB'):'never')+' · Firebase: '+(stateRef?(legacyMode?'old layout, read-only':'per-record store'):'not configured');
  const ib=document.getElementById('importBtn');if(ib)ib.style.display=canImport(currentUser&&currentUser.email)?'':'none';
  const cb=document.getElementById('contactsBtn');if(cb)cb.style.display=canImport(currentUser&&currentUser.email)&&!S.contactsMigV1&&!legacyMode?'':'none';
  const ael=document.getElementById('archInfo');
  // Deliberately says nothing about what is archived or why: this screen is visible to everyone with access.
  if(ael)ael.innerHTML=S.showArchived
    ? '<label style="font-size:11px;display:inline-flex;align-items:center;gap:5px;text-transform:none"><input type="checkbox" checked data-change="toggleArchived|$c"> Archive visible</label> <button class="sm" data-click="restoreArchived">Restore all</button>'
    : '<label style="font-size:11px;display:inline-flex;align-items:center;gap:5px;text-transform:none"><input type="checkbox" data-change="toggleArchived|$c"> Archive visible</label>';
}

// Phase 3 part A, one-off and owner only: contact text on organisations becomes linked person records, the first
// name is the primary person, personal mobiles, titles and addresses move with them. Shows the counts, downloads
// the current state first, then writes; later patches keep the model through normaliseContacts().
export async function moveContacts(){
  if(!canImport(currentUser&&currentUser.email)||S.contactsMigV1||legacyMode)return;
  const {planContacts,applyContactPlan}=await import('../contacts.js');
  const plan=planContacts(S,newPerson,uid);
  const moved=plan.orgSet.filter(u=>u.set.email===null).length;
  const v=await confirmDialog(['New people: '+plan.create.length,'Existing people linked: '+plan.link.length,
    'Organisations changed: '+plan.orgSet.length+' (contact text removed, '+moved+' personal addresses moved to their person)',
    'New organisations from firm fields: '+plan.newOrgs.length,'Merged: '+plan.merge.map(m=>(m.from.length+1)+' records into '+m.name).join(', '),
    'People without an organisation afterwards: '+plan.review.filter(r=>r.kind==='person').length,'',
    'A copy of the current state is downloaded first. Undo reverses it.'].join('\n'),{title:'Move contacts to people',ok:'Move contacts'});
  if(!v)return;
  exportJSON();
  const r=applyContactPlan(S,plan);
  // financials already in the CRM came from MASTER Scoring before the stamp existed
  (S.companies||[]).forEach(c=>{if(!c.finSrc&&['revenue','ebitda','ebit','score'].some(k=>c[k]!=null&&c[k]!==''))c.finSrc={file:'',date:S.contactsMigV1,held:true}});
  save();renderAll();toast(r.created+' people created, '+r.linked+' linked, '+r.newOrgs+' organisations added, '+r.merged+' merged');
}
