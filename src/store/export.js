import {S, setS} from '../state.js';
import {legacyExport, ensureDefaults} from './shards.js';
import {renderAll} from '../main.js';
import {save, currentUser, legacyMode} from './firebase.js';
import {toast, today} from '../util.js';
import {OWNER_EMAIL} from '../config.js';

export function exportJSON(){
  const blob=new Blob([JSON.stringify(legacyExport(S),null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='KinetixCRM_'+today().replace(/-/g,'')+'.json';a.click();toast('Exported');
}

// Import replaces every record for both users at once (per-record writes), so it is limited to the owner,
// shows what it would replace, downloads the current state first and needs the word REPLACE.
export function canImport(email){return !!email&&email===OWNER_EMAIL}
const counts=s=>{const recs=[...(s.companies||[]),...(s.advisors||[]),...(s.people||[])];return {companies:(s.companies||[]).length,advisors:(s.advisors||[]).length,people:(s.people||[]).length,touches:recs.reduce((n,r)=>n+Object.keys((r&&r.touches)||{}).length,0)}};
const line=c=>c.companies+' companies, '+c.advisors+' advisors, '+c.people+' people, '+c.touches+' touches';
export function importJSON(ev){
  const f=ev.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=e=>{let d;try{d=JSON.parse(e.target.result)}catch(err){toast('Import error: '+err.message);return}importParsed(d,f.name)};
  rd.readAsText(f);ev.target.value='';
}
export function importParsed(d,name){
  if(!canImport(currentUser&&currentUser.email)){toast('Import is limited to '+OWNER_EMAIL);return false}
  if(legacyMode){toast('Read-only: the database is still in the old layout');return false}
  if(!d||!Array.isArray(d.companies)||!Array.isArray(d.advisors)||!Array.isArray(d.people)){toast('Not a KinetixCRM export: companies, advisors and people are missing');return false}
  const now=counts(S),file=counts(d);
  exportJSON(); // the current state goes to Downloads before anything is replaced
  const word=prompt('Import replaces the whole CRM for both users.\n\nNow: '+line(now)+'\nFile '+(name||'')+': '+line(file)+'\n\nA copy of the current state was just downloaded. Type REPLACE to continue.','');
  if((word||'').trim()!=='REPLACE'){toast('Import cancelled, nothing changed');return false}
  setS(ensureDefaults(d));save();renderAll();toast('Imported '+(name||'file')+': '+line(file));
  return true;
}
