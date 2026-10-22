import {S, allOrgs, buildInitialState, isArch, liveOnly, rawRecs, setS} from '../state.js';
import {renderAll} from '../main.js';
import {save, stateRef} from '../store/firebase.js';
import {toast} from '../util.js';


// ═══════════════════════════════════════════════════════════════
// RENDER: DATA
// ═══════════════════════════════════════════════════════════════
export function renderData(){
  const el=document.getElementById('dataInfo');
  const arch=rawRecs().filter(isArch);
  if(el)el.textContent=allOrgs().filter(o=>o.kind==='target').length+' companies · '+allOrgs().filter(o=>o.kind==='advisor').length+' advisors · '+liveOnly(S.people||[]).length+' people · '+(S.unmatched||[]).length+' unmatched · last sync: '+(S.lastSync?new Date(S.lastSync).toLocaleString('en-GB'):'never')+' · Firebase: '+(stateRef?'connected':'not configured');
  const ael=document.getElementById('archInfo');
  // Deliberately says nothing about what is archived or why: this screen is visible to everyone with access.
  if(ael)ael.innerHTML=S.showArchived
    ? '<label style="font-size:11px;display:inline-flex;align-items:center;gap:5px;text-transform:none"><input type="checkbox" checked onchange="toggleArchived(this.checked)"> Archive visible</label> <button class="sm" onclick="if(confirm(\'Restore everything currently archived?\'))unarchiveAll()">Restore all</button>'
    : '<label style="font-size:11px;display:inline-flex;align-items:center;gap:5px;text-transform:none"><input type="checkbox" onchange="toggleArchived(this.checked)"> Archive visible</label>';
}
export function resetData(){if(!confirm('Reset CRM to seed data? This cannot be undone.'))return;setS(buildInitialState());save();renderAll();toast('Reset to seed data')}
