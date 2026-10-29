import {openDialog, confirmDialog} from './dialog.js';
import {S, allRecs, dispName, findRec, fixUml, isIgnoredRec, lastTouch, orgTouches, rawRecs, rowLabel} from '../state.js';
import {daysAgo, esc, fmtAgo, fmtD, toast, today} from '../util.js';
import {dueChip, prioChip} from './ui.js';
import {logDone} from './actions.js';
import {openProfile} from './record.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';

export const TH_V={OPEN_LEIF:'My move',OPEN_THEM:'Their move',CLOSED:'Done',DEAD:'Dead',UNCLEAR:'Unclear'};
export const TH_CLS={OPEN_LEIF:'leif',OPEN_THEM:'them',CLOSED:'closed',DEAD:'dead',UNCLEAR:'unclear'};
export const TH_ORDER=['OPEN_LEIF','OPEN_THEM','UNCLEAR','CLOSED','DEAD'];
export const TH_HDR={OPEN_LEIF:'var(--navy)',OPEN_THEM:'#6B7AAF',CLOSED:'var(--green)',DEAD:'#595959',UNCLEAR:'#C6943E'};
export let thFilt='open', thOpenIds=new Set(), thDraftIds=new Set(), thAllOpen=false;
// Live thread list: the seeded snapshot (recommendations, drafts) plus every record with recent
// activity that the snapshot does not know. Verdict and days-quiet come from the CRM, not the snapshot.
// The thread snapshot of 15.09.2026 (128 KB) seeds an empty thread list. It loads on demand: ensureThreadSeed()
// runs at start-up when the list is empty, so seedThreads() can stay synchronous for patches and renders.
let THREADS_SEED=null;
export async function ensureThreadSeed(){if(!THREADS_SEED)THREADS_SEED=(await import('../data/threads-seed.js')).THREADS_SEED;seedThreads()}
export function seedThreads(){if(THREADS_SEED&&(!S.threads||!Array.isArray(S.threads)||!S.threads.length)){S.threads=JSON.parse(JSON.stringify(THREADS_SEED))}}
export function autoThread(r){
  return {id:r.id,name:fixUml(dispName(r)),contact:r.kind==='person'?'':(r.contact||''),email:r.email||'',v:'',p:(r.priority==='Urgent'||r.priority==='High')?'Hoch':(r.priority==='Medium'?'Mittel':'Niedrig'),cat:r.kind==='target'?'Targets':(r.category||''),auto:true};
}
export let _threadsCache=null,_threadsCacheKey='';
export function invalidateThreads(){_threadsCache=null}
export function THREADS_LIVE(){
  seedThreads();
  const key=(S.lastSync||'')+'|'+rawRecs().length;
  if(_threadsCache&&_threadsCacheKey===key)return _threadsCache;
  const known=new Set();S.threads.forEach(t=>{known.add(t.id);(t.alias||[]).forEach(a=>known.add(a))});
  const extra=allRecs().filter(r=>!known.has(r.id)&&lastTouch(r)&&daysAgo(lastTouch(r))<=90).map(autoThread);
  _threadsCache=S.threads.filter(t=>{const r=thRec(t);return !(r&&r.archived)}).concat(extra);
  _threadsCacheKey=key;return _threadsCache;
}
export function thState(id){return (S&&S.threadsState&&S.threadsState[id])||{}}
export function liveVerdict(t){
  // 1. a manual override wins; 2. otherwise read the record: an open action or an unanswered inbound = my move,
  // my own message unanswered = their move, silence for four months = done.
  const st=thState(t.id);if(st.v)return st.v;
  const r=thRec(t);if(!r)return t.v||'UNCLEAR';
  if(r.stage==='Dead'||r.status==='Dead')return 'DEAD';
  const ts=orgTouches(r);const last=ts[0];
  if(!last)return t.v||'UNCLEAR';
  if(daysAgo(last.date)>120&&!r.nextDate)return 'CLOSED';
  if((r.nextAction||'').trim())return 'OPEN_LEIF';
  return last.dir==='in'?'OPEN_LEIF':'OPEN_THEM';
}
export function thV(t){return liveVerdict(t)}
export function thRec(t){let r=findRec(t.id);if(!r)(t.alias||[]).some(a=>(r=findRec(a)));return r||null}
export function thDone(id){return !!(S&&S.threadsDone&&S.threadsDone[id])}
export function thIsOpen(t){const v=thV(t);return v==='OPEN_LEIF'||v==='OPEN_THEM'}
export function resetThreadsView(){thFilt='open';thOpenIds=new Set();thAllOpen=false;document.querySelectorAll('.th-f').forEach(x=>x.classList.toggle('on',x.dataset.f==='open'));const b=document.getElementById('thAllBtn');if(b)b.textContent='All details'}
export function thGo(f){thFilt=f;document.querySelectorAll('.th-f').forEach(x=>x.classList.toggle('on',x.dataset.f===f));renderThreads()}
export function thOpen(id,ev){if(ev)ev.stopPropagation();const t=THREADS_LIVE().find(x=>x.id===id);const r=t?thRec(t):findRec(id);if(r)openProfile(r);else toast('Record no longer in the CRM')}
export function thToggle(id,ev){
  if(ev)ev.stopPropagation();
  S.threadsDone=S.threadsDone||{};
  const t=THREADS_LIVE().find(x=>x.id===id);
  if(S.threadsDone[id]){delete S.threadsDone[id]}
  else{S.threadsDone[id]=today();const r=t&&thRec(t);if(r&&t.a)logDone(r,'Faden: '+t.a)}
  save();renderThreads();
}
export function thSetV(id,v){S.threadsState=S.threadsState||{};const st=S.threadsState[id]||{};const t=THREADS_LIVE().find(x=>x.id===id);if(v===t.v)delete st.v;else st.v=v;S.threadsState[id]=st;save();renderThreads();toast('Status: '+TH_V[v])}
export async function thNote(id){S.threadsState=S.threadsState||{};const st=S.threadsState[id]||{};const v=await openDialog({title:'Note on this item',fields:[{key:'n',label:'Note',type:'textarea',rows:4,value:st.note||''}]});if(!v)return;const n=v.n;if(n.trim()){st.note=n.trim();st.noteDate=today()}else{delete st.note;delete st.noteDate}S.threadsState[id]=st;save();renderThreads()}
export function thAdopt(id,ev){if(ev)ev.stopPropagation();const t=THREADS_LIVE().find(x=>x.id===id);const r=t&&thRec(t);if(!r||!t.a)return;
  r.nextAction=t.a;if(t.due){const m=/^(\d\d)\.(\d\d)\.(\d\d)$/.exec(t.due);if(m)r.nextDate='20'+m[3]+'-'+m[2]+'-'+m[1]}
  r.priority=t.p==='Hoch'?'High':(t.p==='Mittel'?'Medium':(r.priority||''));r.nextSet=today();
  if(S.dismissed)delete S.dismissed['due_'+r.id];save();renderAll();toast('Action set in the CRM')}
export function thMore(id){if(thOpenIds.has(id))thOpenIds.delete(id);else thOpenIds.add(id);renderThreads()}
export function thDraft(id){if(thDraftIds.has(id))thDraftIds.delete(id);else thDraftIds.add(id);renderThreads()}
export function thToggleAll(){thAllOpen=!thAllOpen;thOpenIds=new Set(thAllOpen?THREADS_LIVE().map(t=>t.id):[]);document.getElementById('thAllBtn').textContent=thAllOpen?'Collapse all':'All details';renderThreads()}
export function thCopy(id,what){const t=THREADS_LIVE().find(x=>x.id===id);const ta=document.getElementById('thta_'+id);const txt=ta?ta.value:(what==='cs'?t.cs:((t.dr.s?'Betreff: '+t.dr.s+'\n\n':'')+t.dr.b));
  (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('Copied'),()=>{if(ta){ta.select();document.execCommand('copy');toast('Copied')}})}
export function thMail(id){const t=THREADS_LIVE().find(x=>x.id===id);const ta=document.getElementById('thta_'+id);let body=ta?ta.value:t.dr.b;body=body.replace(/^Betreff:.*\n\n?/,'');
  const u='mailto:'+encodeURIComponent(t.email||'')+'?subject='+encodeURIComponent(t.dr.s||'')+'&body='+encodeURIComponent(body);window.open(u,'_self')}
export function thShow(t,q,cat){
  if(cat&&(t.cat||'')!==cat)return false;
  if(document.getElementById('thHideDone').checked&&thDone(t.id))return false;
  if(q){const st=thState(t.id);const h=[t.name,t.contact,t.o,t.a,t.e,t.cat,t.email,t.r,st.note].join(' ').toLowerCase();if(!h.includes(q))return false}
  const v=thV(t),d=thDone(t.id);
  if(['open','leif','them','hoch'].includes(thFilt)&&thIgnored(t))return false;
  if((document.getElementById('thHideSched')||{}).checked&&['open','leif','them','hoch'].includes(thFilt)){const r=thRec(t);if(r&&r.nextDate)return false}
  if(thFilt==='open')return thIsOpen(t)&&!d;
  if(thFilt==='leif')return v==='OPEN_LEIF'&&!d;
  if(thFilt==='them')return v==='OPEN_THEM'&&!d;
  if(thFilt==='hoch')return t.p==='Hoch'&&thIsOpen(t)&&!d;
  if(thFilt==='ticked')return d;
  if(thFilt==='closed')return v==='CLOSED';
  if(thFilt==='dead')return v==='DEAD';
  if(thFilt==='unclear')return v==='UNCLEAR';
  return true;
}
// Ignored on Today (until the next activity) means ignored here too.
export function thIgnored(t){const r=thRec(t);return !!(r&&isIgnoredRec(r))}
// Done, as on Today: the record's next action is logged as done and cleared, and the thread is ticked off.
export function thDoneItem(id,ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const t=THREADS_LIVE().find(x=>x.id===id);const r=t&&thRec(t);
  if(r){const what=(r.nextAction||'').trim()||(t.a||'');if(what)logDone(r,what);r.nextAction='';r.nextDate='';r.nextSet='';if(S.dismissed)delete S.dismissed['due_'+r.id]}
  S.threadsDone=S.threadsDone||{};S.threadsDone[id]=today();
  save();renderAll();toast('Logged as done');
}
// Ignore, as on Today: hidden from the open lists and from Today until the next activity on the record.
export function thIgnoreItem(id,ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const t=THREADS_LIVE().find(x=>x.id===id);const r=t&&thRec(t);
  if(r){r.ignored=today()}else{S.threadsDone=S.threadsDone||{};S.threadsDone[id]=today()}
  save();renderAll();toast('Ignored until the next activity');
}
// Open items where the move is Leif's, for the tab badge (same filter as the 'My move' tile).
export function threadsMyMoveCount(){
  const hs=!!((document.getElementById('thHideSched')||{checked:true}).checked),sched=t=>{const r=thRec(t);return !!(r&&r.nextDate)};
  return THREADS_LIVE().filter(t=>thV(t)==='OPEN_LEIF'&&!thDone(t.id)&&!thIgnored(t)&&!(hs&&sched(t))).length;
}
export function renderThreads(){
  if(!document.getElementById('thBody'))return;
  const sel=document.getElementById('thCat');
  if(sel.options.length<=1){[...new Set(THREADS_LIVE().map(t=>t.cat).filter(Boolean))].sort().forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o)})}
  const q=(document.getElementById('thSearch').value||'').toLowerCase().trim(), cat=sel.value;
  const cnt=f=>THREADS_LIVE().filter(f).length;
  const hs=!!((document.getElementById('thHideSched')||{}).checked),sched=t=>{const r=thRec(t);return !!(r&&r.nextDate)};
  const ok=t=>!thDone(t.id)&&!thIgnored(t)&&!(hs&&sched(t));
  const leif=cnt(t=>thV(t)==='OPEN_LEIF'&&ok(t)), them=cnt(t=>thV(t)==='OPEN_THEM'&&ok(t)), hoch=cnt(t=>t.p==='Hoch'&&thIsOpen(t)&&ok(t));
  const ticked=cnt(t=>thDone(t.id)), closed=cnt(t=>thV(t)==='CLOSED'), dead=cnt(t=>thV(t)==='DEAD'), unclear=cnt(t=>thV(t)==='UNCLEAR');
  const badge=document.getElementById('thBadge');badge.style.display=leif?'inline-block':'none';badge.textContent=leif;
  document.getElementById('thKpis').innerHTML=[[leif,'My move','leif',leif>0],[them,'Their move','them'],[hoch,'Open, high priority','hoch'],[ticked,'Ticked off','ticked'],[closed,'Done','closed'],[dead,'Dead','dead'],[unclear,'Unclear','unclear']]
    .map(k=>'<div class="kpi'+(k[3]?' warn':'')+(thFilt===k[2]?' th-on':'')+'" data-click="thGo|'+k[2]+'"><div class="v">'+k[0]+'</div><div class="l">'+k[1]+'</div></div>').join('');
  document.querySelectorAll('.th-f').forEach(x=>x.classList.toggle('on',x.dataset.f===thFilt));
  const groups={};TH_ORDER.forEach(v=>groups[v]=[]);let shown=0;
  THREADS_LIVE().forEach(t=>{if(!thShow(t,q,cat))return;shown++;(groups[thV(t)]||(groups[thV(t)]=[])).push(t)});
  const pill=(cls,txt)=>'<span class="th-pill '+cls+'">'+esc(txt)+'</span>';
  const row=t=>{
    const r=thRec(t), done=thDone(t.id), st=thState(t.id), v=thV(t);
    const lt=r?lastTouch(r):null, still=lt?daysAgo(lt):(t.d||null), fresh=false;
    const more=thOpenIds.has(t.id), draft=thDraftIds.has(t.id);
    const pc=t.p==='Hoch'?' p-hoch':(t.p==='Mittel'?' p-mittel':'');
    let h='<div class="th-row'+pc+(done?' done':'')+'">'
      +'<input type="checkbox" title="'+(done?'Ticked on '+esc(S.threadsDone[t.id]):'Tick off')+'" data-click="thToggle|'+t.id+'|$e"'+(done?' checked':'')+'>'
      +(function(){const _r=findRec(t.id);const L=_r?rowLabel(_r):{top:t.name,sub:t.contact};const top=fixUml(L.top||t.name),sub=fixUml(L.sub||'');return '<span class="th-nm" data-click="thOpen|'+t.id+'|$e">'+esc(top)+'</span>'+(sub&&sub!==top?'<span class="muted">'+esc(sub)+'</span>':'')})()
      +pill(TH_CLS[v],TH_V[v])+(t.p&&t.p!=='Niedrig'?pill(t.p.toLowerCase(),({Hoch:'High',Mittel:'Medium'})[t.p]||t.p):'')
      +(still!=null&&still<9999?pill('lite',still+' days quiet'):'')
      +(t.auto?pill('lite','new since snapshot'):'')
      +(st.v?pill('lite','Status changed'):'')
      +(t.dup?pill('lite',t.dup+'x duplicate'):'')+(!r?pill('lite','not in CRM'):(r.archived?pill('lite','archived'):''))
      +'</div>';
    if(t.a)h+='<div class="th-a"><b>Next action:</b> '+esc(t.a)+(t.due?' <span class="muted">(by '+esc(t.due)+')</span>':'')+'</div>';
    if(t.r)h+='<div class="th-r"><b>Recommendation:</b> '+esc(t.r)+'</div>';
    if(st.note)h+='<div class="th-note"><b>Note'+(st.noteDate?' '+fmtD(st.noteDate):'')+':</b> '+esc(st.note)+'</div>';
    if(r&&(r.nextAction||r.nextDate))h+='<div class="th-live"><b>CRM action:</b> '+esc(r.nextAction||'')+' '+dueChip(r.nextDate)+' '+prioChip(r)+'</div>';
    if(more){h+='<div class="th-more">'
      +(t.o?'<div class="lbl">Open point</div><div>'+esc(t.o)+'</div>':'')
      +(t.e?'<div class="lbl">Evidence</div><div>'+esc(t.e)+'</div>':'')
      +'<div class="lbl">History</div><div>'+esc(t.cat||'')+(t.lo?' | last out '+esc(t.lo):'')+(t.li?' | last in '+esc(t.li):'')+' | '+(t.no||0)+' out / '+(t.ni||0)+' in'+(r?' | last contact (CRM) '+fmtAgo(lt):'')
      +(t.email?' | <a href="mailto:'+esc(t.email)+'">'+esc(t.email)+'</a>':'')+(st.v?' | Original-Urteil: '+TH_V[t.v]:'')+'</div></div>'}
    if(draft&&(t.dr||t.cs)){
      const txt=t.dr?((t.dr.s?'Betreff: '+t.dr.s+'\n\n':'')+t.dr.b):t.cs;
      h+='<div class="th-draft"><div style="font-size:11px;font-weight:700;margin-bottom:4px">'+(t.dr?'Draft (editable)':'Call guide')+'</div>'
        +'<textarea id="thta_'+t.id+'" rows="'+Math.min(18,Math.max(4,txt.split('\n').length+1))+'">'+esc(txt)+'</textarea>'
        +(t.att?'<div class="att">Attachment still to add: '+esc(t.att)+'</div>':'')
        +'<div style="margin-top:6px"><button class="sm" data-click="thCopy|'+t.id+'|'+(t.dr?'dr':'cs')+'">Copy</button> '
        +(t.dr&&t.email?'<button class="sm primary" data-click="thMail|'+t.id+'">Open in mail client</button>':'')+'</div></div>'}
    h+='<div class="th-acts">'
      +(!done?'<button class="sm primary" data-click="thDoneItem|'+t.id+'|$e" title="Log as done">Done</button>'+'<button class="sm" data-click="thIgnoreItem|'+t.id+'|$e" title="Hide until there is new activity">Ignore</button>':'')
      +'<button class="sm" data-click="thMore|'+t.id+'">'+(more?'Less':'Details')+'</button>'
      +((t.dr||t.cs)?'<button class="sm'+(draft?' primary':'')+'" data-click="thDraft|'+t.id+'">'+(t.dr?'Draft':'Call guide')+'</button>':'')
      +(r&&t.a?'<button class="sm" data-click="thAdopt|'+t.id+'|$e" title="Copy the next action and date into the CRM record">Adopt into CRM</button>':'')
      +(r?'<button class="sm" data-click="quickSetAction|'+r.id+'|$e">Own action</button>':'')
      +'<button class="sm" data-click="thNote|'+t.id+'">Note</button>'
      +'<button class="sm" data-click="thOpen|'+t.id+'|$e">Open record</button>'
      +'<span class="sp"></span><select data-change="thSetV|'+t.id+'|$v">'+TH_ORDER.map(x=>'<option value="'+x+'"'+(x===v?' selected':'')+'>'+TH_V[x]+'</option>').join('')+'</select>'
      +'</div></div></div>';
    return h;
  };
  const html=TH_ORDER.filter(v=>groups[v].length).map(v=>'<div class="section"><div class="section-hdr" style="background:'+TH_HDR[v]+'">'+TH_V[v]+' ('+groups[v].length+')</div>'+groups[v].map(row).join('')+'</div>').join('');
  document.getElementById('thBody').innerHTML=html||'<p class="muted" style="padding:14px">Nothing in this view.</p>';
  document.getElementById('thCount').textContent=shown+' items';
}
