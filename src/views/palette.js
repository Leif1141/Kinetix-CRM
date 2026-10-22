import {S, allRecs, addTouch, dispName, findRec, fixUml, lastTouch} from '../state.js';
import {addDays, esc, fmtAgo, foldSearch, toast, today, uid} from '../util.js';
import {searchHay} from './search.js';
import {openProfile} from './record.js';
import {save} from '../store/firebase.js';
import {renderAll} from '../main.js';
import {invalidateThreads} from './threads.js';

// ═══════════════════════════════════════════════════════════════
// Ctrl+K palette: jump to a record, log a call, set a next action, without leaving the view.
// ═══════════════════════════════════════════════════════════════
const ACTIONS=[{k:'open',t:'Open'},{k:'call',t:'Log call'},{k:'next',t:'Set next action'}];
let hits=[],sel=0,act=0,mode='search',target=null;

export function initPalette(){
  if(document.getElementById('palette'))return;
  const el=document.createElement('div');el.id='palette';el.className='palette';el.hidden=true;
  el.innerHTML='<div class="pal-box"><input id="palInput" autocomplete="off" spellcheck="false" placeholder="Type a name: Enter opens, Tab switches to Log call / Set next action"><div id="palBody"></div><div class="pal-hint muted">&uarr;&darr; choose &middot; Tab action &middot; Enter run &middot; Esc close</div></div>';
  document.body.appendChild(el);
  el.addEventListener('mousedown',e=>{if(e.target===el)closePalette()});
  const inp=document.getElementById('palInput');
  inp.addEventListener('input',()=>{if(mode==='search'){sel=0;act=0;renderHits()}});
  inp.addEventListener('keydown',onKey);
  document.getElementById('palBody').addEventListener('click',e=>{
    const a=e.target.closest('[data-act]');const row=e.target.closest('[data-i]');
    if(a&&row){sel=+row.dataset.i;runAction(a.dataset.act);return}
    if(row){sel=+row.dataset.i;runAction('open')}
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();togglePalette();return}
    if(e.key==='Escape'&&!document.getElementById('palette').hidden){e.preventDefault();e.stopPropagation();closePalette()}
  },true);
}
export function openPalette(prefill){
  const el=document.getElementById('palette');if(!el)return;
  el.hidden=false;mode='search';target=null;sel=0;act=0;
  const inp=document.getElementById('palInput');inp.value=prefill||'';renderHits();inp.focus();inp.select();
}
export function closePalette(){const el=document.getElementById('palette');if(el)el.hidden=true;mode='search';target=null}
export function togglePalette(){const el=document.getElementById('palette');if(!el)return;if(el.hidden)openPalette();else closePalette()}

function search(q){
  q=foldSearch(q);if(q.length<1)return [];
  const terms=q.split(' ').filter(Boolean);
  const scored=allRecs().map(r=>{
    const name=foldSearch(dispName(r)||'');
    let score=0;
    if(name===q)score=100;else if(name.startsWith(q))score=80;else if(name.includes(q))score=60;
    else{const h=searchHay(r);if(terms.every(t=>h.includes(t)))score=terms.every(t=>name.includes(t))?50:20}
    if(!score)return null;
    return {r,score:score+(lastTouch(r)?1:0)};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||(lastTouch(b.r)||'').localeCompare(lastTouch(a.r)||''));
  return scored.slice(0,12).map(x=>x.r);
}
function renderHits(){
  const q=document.getElementById('palInput').value;
  hits=search(q);
  const body=document.getElementById('palBody');
  if(!q.trim()){body.innerHTML='<div class="pal-empty muted">Start typing a company, firm or person.</div>';return}
  if(!hits.length){body.innerHTML='<div class="pal-empty muted">No match.</div>';return}
  const kindLbl={target:'Target',advisor:'Advisor',person:'Person'};
  body.innerHTML=hits.map((r,i)=>'<div class="pal-row'+(i===sel?' sel':'')+'" data-i="'+i+'"><div class="pal-main"><b>'+esc(fixUml(dispName(r)))+'</b> <span class="muted">'+kindLbl[r.kind]+(r.kind==='person'&&r.firm?' · '+esc(fixUml(r.firm)):r.kind==='target'?' · '+esc(r.stage||''):r.status?' · '+esc(r.status):'')+'</span>'+(r.nextAction?'<div class="muted" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(fixUml(r.nextAction))+'</div>':'')+'</div>'
    +'<div class="pal-acts">'+ACTIONS.map((a,j)=>'<span class="pal-act'+(i===sel&&j===act?' on':'')+'" data-act="'+a.k+'">'+a.t+'</span>').join('')+'</div>'
    +'<div class="muted" style="font-size:10px;white-space:nowrap">'+(lastTouch(r)?fmtAgo(lastTouch(r)):'')+'</div></div>').join('');
  const s=body.querySelector('.pal-row.sel');if(s)s.scrollIntoView({block:'nearest'});
}
function onKey(e){
  if(mode!=='search'){
    if(e.key==='Enter'&&!(e.target.tagName==='TEXTAREA'&&!e.ctrlKey&&!e.metaKey)){e.preventDefault();submitForm()}
    return;
  }
  if(e.key==='ArrowDown'){e.preventDefault();if(hits.length){sel=(sel+1)%hits.length;renderHits()}}
  else if(e.key==='ArrowUp'){e.preventDefault();if(hits.length){sel=(sel-1+hits.length)%hits.length;renderHits()}}
  else if(e.key==='Tab'){e.preventDefault();act=(act+(e.shiftKey?ACTIONS.length-1:1))%ACTIONS.length;renderHits()}
  else if(e.key==='Enter'){e.preventDefault();runAction(ACTIONS[act].k)}
}
function runAction(kind){
  const r=hits[sel];if(!r)return;
  if(kind==='open'){closePalette();openProfile(r);return}
  target=r;mode=kind;
  const body=document.getElementById('palBody');
  if(kind==='call'){
    body.innerHTML='<div class="pal-form"><div class="pal-form-title">Log call with <b>'+esc(fixUml(dispName(r)))+'</b></div>'
      +'<input id="pf_subject" placeholder="Subject (what was it about)">'
      +'<textarea id="pf_note" rows="3" placeholder="Note (optional)"></textarea>'
      +'<div class="pal-form-row"><input id="pf_owe" placeholder="I promised (optional, becomes an open promise)"><input id="pf_owe_by" type="date" value="'+addDays(today(),3)+'"></div>'
      +'<div class="pal-form-row"><input id="pf_date" type="date" value="'+today()+'"><button class="sm primary" id="pf_go">Log call</button><button class="sm" id="pf_back">Back</button></div></div>';
  }else{
    body.innerHTML='<div class="pal-form"><div class="pal-form-title">Next action for <b>'+esc(fixUml(dispName(r)))+'</b></div>'
      +'<textarea id="pf_action" rows="3" placeholder="What is the next step">'+esc(r.nextAction||'')+'</textarea>'
      +'<div class="pal-form-row"><input id="pf_date" type="date" value="'+(r.nextDate||addDays(today(),7))+'"><button class="sm primary" id="pf_go">Save</button><button class="sm" id="pf_back">Back</button></div></div>';
  }
  body.querySelector('#pf_go').onclick=submitForm;
  body.querySelector('#pf_back').onclick=()=>{mode='search';target=null;renderHits();document.getElementById('palInput').focus()};
  body.querySelectorAll('input,textarea').forEach(x=>x.addEventListener('keydown',onKey));
  const first=body.querySelector('input,textarea');if(first)first.focus();
}
function submitForm(){
  const r=target;if(!r)return;
  const v=id=>(document.getElementById(id)||{}).value||'';
  if(mode==='call'){
    const subj=v('pf_subject').trim();if(!subj){toast('Enter a subject');return}
    const date=v('pf_date')||today();const key='man_'+uid();
    const t={date:date+'T12:00:00Z',dir:'out',subject:'Call: '+subj,link:'',src:'Call',who:'',note:v('pf_note').trim()};
    const owe=v('pf_owe').trim(),oweBy=v('pf_owe_by')||addDays(today(),3);
    if(owe)t.note=(t.note?t.note+' | ':'')+'Promised: '+owe;
    addTouch(r,key,t);
    if(r.orgId){const org=findRec(r.orgId);if(org)addTouch(org,key,t)}
    if(owe){const line='Promised (Call '+date.slice(8,10)+'.'+date.slice(5,7)+'.): '+owe;r.nextAction=r.nextAction&&r.nextAction.trim()?r.nextAction.trim()+' | '+line:line;if(!r.nextDate||oweBy<r.nextDate)r.nextDate=oweBy;r.nextSet=today();invalidateThreads()}
    save();renderAll();toast(owe?'Call logged, promise added':'Call logged');
  }else{
    const a=v('pf_action').trim();if(!a){toast('Enter the next action');return}
    const d=v('pf_date');
    if(a!==r.nextAction)r.nextSet=today();
    r.nextAction=a;r.nextDate=/^\d{4}-\d{2}-\d{2}$/.test(d)?d:addDays(today(),7);
    invalidateThreads();save();renderAll();toast('Next action set for '+r.nextDate);
  }
  closePalette();
}
