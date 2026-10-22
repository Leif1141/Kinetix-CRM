import {S, allOrgs, allRecs} from '../state.js';
import {goTab, renderAll} from '../main.js';
import {renderOrgs} from './orgs.js';
import {renderOverview} from './overview.js';
import {save} from '../store/firebase.js';

export function newList(){const n=prompt('List name:');if(n&&!(S.customLists||[]).includes(n)){S.customLists=S.customLists||[];S.customLists.push(n);save();renderOverview()}}
export function delList(n){if(!confirm('Delete list "'+n+'"? Records stay.'))return;S.customLists=(S.customLists||[]).filter(x=>x!==n);allRecs().forEach(r=>{if(r.lists)r.lists=r.lists.filter(x=>x!==n)});save();renderAll()}
export function toggleListOpen(l){S._openLists=S._openLists||[];S._openLists=S._openLists.includes(l)?S._openLists.filter(x=>x!==l):[...S._openLists,l];renderOverview()}
export function goList(l){goTab('orgs');document.getElementById('oList').value=l;renderOrgs()}

// ═══════════════════════════════════════════════════════════════
// RENDER: ORGANIZATIONS
// ═══════════════════════════════════════════════════════════════
export function catOf(o){return o.kind==='target'?'Targets':((o.category||'').trim()||'Uncategorised')}
export function autoCats(){const m={};allOrgs().forEach(o=>{const c=catOf(o);m[c]=(m[c]||0)+1});return Object.keys(m).sort((a,b)=>m[b]-m[a])}
export function goCat(c){goTab('orgs');const s=document.getElementById('oList');s.value='cat:'+c;if(s.value!=='cat:'+c){renderOrgs();s.value='cat:'+c}renderOrgs()}
