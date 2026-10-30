import {openDialog, confirmDialog} from './dialog.js';
import {invalidateThreads} from '../views/threads.js';
import {ACT_TYPES, ADV_CATS, ADV_STATUS, CHANNELS, DEADREASONS, PRIORITIES, PTYPES, STAGES, VERDICTS} from '../constants.js';
import {S, addTouch, chanOf, deadCatOf, dispName, findRec, fixUml, isSysNote, newPerson, orgPeople, personOrg, splitPhones, tType, touchList, touchTomb, lastTouch} from '../state.js';
import {addDays, cleanPrev, esc, fmtAgo, fmtD, fmtDe, normName, toast, today, uid} from '../util.js';
import {fld, gv, n1, selFld, starHtml, stagePill} from './ui.js';
import {letterBox} from './pipeline.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';
import {shareHtml, sharedByRec} from '../shares.js';
import {logDone} from './actions.js';
import {openPromises} from './home.js';

// ═══════════════════════════════════════════════════════════════
// RECORD PAGE: one scrolling page per record, click-to-edit fields, autosave per field.
// Route #rec/{id}. Replaces the modal editor.
// ═══════════════════════════════════════════════════════════════
export let profRec=null;
export let profChart=null;
let prevTab='home',isNew=false;

const COUNTRIES=['Germany','United Kingdom','Switzerland','France','Netherlands','Luxembourg','Sweden','Denmark','Austria','United States','Other'];
const F=(key,label,type,opts)=>Object.assign({key,label,type:type||'text'},opts||{});
function fieldSpecs(r){
  const next=[F('nextAction','Next action','textarea'),F('nextDate','Due','date'),F('priority','Priority','select',{options:PRIORITIES})];
  if(r.kind==='target')return {
    sections:[
      ['Company',[F('name','Company name','text',{required:true}),F('contact','Primary contact (owner / MD)'),F('email','Email'),F('phone','Phone (office)'),F('mobile','Mobile'),F('domain','Website'),F('location','Location')]],
      ['Deal',[F('stage','Stage','select',{options:STAGES}),F('channel','Channel','select',{options:CHANNELS,get:c=>chanOf(c)}),F('channelVia','Via (partner, fair, contact)'),F('revenue','Revenue (€m)','number'),F('ebitda','EBITDA (€m)','number'),F('ebit','EBIT (€m)','number'),F('gm','Gross margin %','number',{get:c=>c.gm==null||c.gm===''?null:Math.round(c.gm*1000)/10,set:v=>v==null?null:v/100}),F('score','Score /100','number'),F('verdict','Verdict','select',{options:VERDICTS})]
        .concat(r.stage==='Dead'?[F('deadCat','Dead category','select',{options:DEADREASONS,get:deadCatOf}),F('revisitDate','Revisit date','date'),F('deadReason','Dead reason (detail)','textarea')]:[])],
      ['Profile',[F('description','Description','textarea'),F('ownership','Ownership'),F('flag','Flag'),F('notes','Research notes','textarea',{rows:6})]]
    ],next};
  if(r.kind==='advisor')return {
    sections:[
      ['Firm',[F('firm','Firm name','text',{required:true}),F('contact','Primary contact'),F('email','Email'),F('phone','Phone (office)'),F('mobile','Mobile'),F('domain','Domain'),F('city','City'),F('address','Address')]],
      ['Relationship',[F('category','Category','select',{options:ADV_CATS}),F('status','Status','select',{options:ADV_STATUS}),F('market','Market','select',{options:['DE','UK'],get:a=>a.market||(/uk|united kingdom/i.test(a.geo||'')?'UK':'DE')}),F('geo','Geo (country)','select',{options:COUNTRIES}),F('cadence','Check-in cadence (days)','int',{def:30}),F('introPath','Intro path'),F('notes','Notes','textarea')]]
    ],next};
  return {
    sections:[
      ['Person',[F('name','Full name','text',{required:true}),F('title','Title'),F('ptype','Type','select',{options:PTYPES}),F('firm','Organisation'),F('email','Email'),F('phone','Phone (office)'),F('mobile','Mobile'),F('linkedin','LinkedIn'),F('city','City')]],
      ['Context',[F('angle','Angle / notes','textarea'),F('networkPath','Network path')]]
    ],next};
}
const getVal=(r,s)=>s.get?s.get(r):r[s.key];
function display(r,s){
  const v=getVal(r,s);
  if(v===null||v===undefined||v==='')return '<span class="muted">-</span>';
  if(s.type==='date')return esc(fmtDe(v));
  if(s.type==='number')return esc(n1(v)===''?String(v):n1(v));
  if(s.key==='stage')return stagePill(v);
  if(s.key==='domain'||s.key==='linkedin'){const u=/^https?:/.test(v)?v:'https://'+v;return '<a href="'+esc(u)+'" target="_blank" data-click="!">'+esc(v)+'</a>'}
  if(s.key==='email')return '<a href="mailto:'+esc(v)+'" data-click="!">'+esc(v)+'</a>';
  return esc(fixUml(String(v))).replace(/\n/g,'<br>');
}
function fieldHtml(r,s){return '<div class="rf" data-f="'+s.key+'"><label>'+esc(s.label)+'</label><div class="rfv" tabindex="0" title="Click to edit">'+display(r,s)+'</div></div>'}
function editorHtml(r,s){
  const v=getVal(r,s);const cur=v===null||v===undefined?'':String(v);
  if(s.type==='select'){const has=cur===''||s.options.includes(cur);return '<select class="rfe">'+s.options.map(o=>'<option value="'+esc(o)+'"'+(o===cur?' selected':'')+'>'+esc(o)+'</option>').join('')+(has?'':'<option selected>'+esc(cur)+'</option>')+'</select>'}
  if(s.type==='textarea')return '<textarea class="rfe" rows="'+(s.rows||3)+'">'+esc(cur)+'</textarea>';
  if(s.type==='date')return '<input class="rfe" type="date" value="'+esc(cur)+'">';
  if(s.type==='number'||s.type==='int')return '<input class="rfe" type="text" inputmode="decimal" value="'+esc(cur)+'">';
  return '<input class="rfe" type="text" value="'+esc(cur)+'">';
}
function ensureInState(r){
  if(r.kind==='target'&&!S.companies.find(c=>c.id===r.id))S.companies.push(r);
  if(r.kind==='advisor'&&!S.advisors.find(a=>a.id===r.id))S.advisors.push(r);
  if(r.kind==='person'&&!(S.people||[]).find(p=>p.id===r.id)){S.people=S.people||[];S.people.push(r)}
  isNew=false;
}
export function commitField(r,s,raw){
  let v=(raw??'').toString();
  if(s.type!=='textarea')v=v.trim();
  if(s.type==='number'){if(v===''){v=null}else{const n=+v.replace(',','.');if(isNaN(n)){toast('Not a number: '+v);return false}v=n}}
  else if(s.type==='int'){const n=parseInt(v,10);v=isNaN(n)?(s.def??null):n}
  if(s.required&&(v===''||v===null)){toast(s.label+' cannot be empty');return false}
  if(s.set)v=s.set(v);
  const old=getVal(r,s);
  const same=(a,b)=>(a===null||a===undefined||a==='')&&(b===null||b===undefined||b==='')||a===b;
  if(s.key==='gm'?same(r.gm,v):same(old,v))return true;
  if(s.key==='stage'){r.stageLog=r.stageLog||[];r.stageLog.push({stage:v,date:today()})}
  if(s.key==='nextAction'){r.nextSet=today();invalidateThreads()}
  if(s.key==='deadCat'){r.deadCat=v}
  else if(s.key==='channel'){r.channel=v}
  else r[s.key]=v;
  if(s.key==='phone')splitPhones(r);
  ensureInState(r);
  save();
  return true;
}

// ---- page rendering ----
function headHtml(r){
  const isT=r.kind==='target',isA=r.kind==='advisor';
  const kind=isT?'Target':isA?'Advisor':'Person';
  const status=isT?stagePill(r.stage):(isA?'<span class="chip">'+esc(r.status||'')+'</span>':(r.firm?'<span class="chip">'+esc(fixUml(r.firm))+'</span>':''));
  const org=r.kind==='person'?personOrg(r):null;
  return '<div class="rec-head"><button class="sm" id="recBack" title="Back (Esc)">&larr; Back</button>'
    +'<div class="rec-title"><h2>'+(isNew?'<span class="muted">New '+kind.toLowerCase()+'</span>':esc(fixUml(dispName(r))))+'</h2><div class="muted" style="font-size:11px">'+kind+' &middot; '+status+(org?' &middot; <a href="#rec/'+org.id+'">'+esc(fixUml(dispName(org)))+'</a>':'')+' &middot; last contact '+(lastTouch(r)?fmtAgo(lastTouch(r)):'never')+'</div></div>'
    +'<div class="rec-tools">'+starHtml(r)+'</div></div>';
}
function promisesHtml(r){
  const lines=openPromises(r);
  const log=(r.actionLog||[]).slice(-5).reverse();
  let h='<div class="pbox" id="recNext"><h4>Next step</h4><div class="pgrid">'+fieldSpecs(r).next.slice(1).map(s=>fieldHtml(r,s)).join('')+'</div>'+fieldHtml(r,fieldSpecs(r).next[0]);
  if(lines.length)h+='<div style="margin-top:8px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959">Open promises</div>'+lines.map((l,i)=>'<div class="promise"><button class="sm primary" data-promise="'+i+'">Done</button> <span>'+esc(l)+'</span></div>').join('')+'</div>';
  if(log.length)h+='<details style="margin-top:8px"><summary class="muted" style="font-size:11px;cursor:pointer">Completed ('+(r.actionLog||[]).length+')</summary>'+log.map(a=>'<div style="font-size:11px;margin-top:3px"><span class="muted">'+fmtD(a.done)+'</span> '+esc(fixUml(a.what||''))+'</div>').join('')+'</details>';
  return h+'</div>';
}
// Advisers who receive target names from Leif. Changing the category or person type re-renders the page,
// so the box appears or disappears as soon as the type is set.
const NAME_TAKERS=['M&A sourcing intermediaries'];
function givesNames(r){
  if(sharedByRec(r).length)return true;
  if(r.kind==='advisor')return NAME_TAKERS.includes(r.category);
  if(r.kind==='person'){if(NAME_TAKERS.includes(r.ptype))return true;const o=personOrg(r);return !!(o&&o.kind==='advisor'&&NAME_TAKERS.includes(o.category))}
  return false;
}
export function renderRecordPage(){
  const r=profRec;const el=document.getElementById('p-record');if(!r||!el)return;
  const spec=fieldSpecs(r);const isT=r.kind==='target',isP=r.kind==='person';
  const ppl=isP?[]:orgPeople(r);
  const details=spec.sections.map(([title,fs])=>'<div class="pbox"><h4>'+esc(title)+'</h4><div class="pgrid">'+fs.map(s=>s.type==='textarea'?'</div>'+fieldHtml(r,s)+'<div class="pgrid">':fieldHtml(r,s)).join('')+'</div></div>').join('');
  el.innerHTML=headHtml(r)
    +'<div class="rec-grid"><div class="rec-l">'
    +details
    +(isT?'<div class="pbox"><h4>Letter and cadence</h4>'+letterBox(r)+'</div>':'')
    +'<div class="pbox"><h4>Lists</h4>'+listChips(r)+'</div>'
    +(isP?'':'<div class="pbox"><h4>People <button class="sm" data-click="addPersonToOrg">+ Add</button></h4>'+peopleBoxHtml(r,ppl)+'</div>')
    +'<div class="pbox"><h4>Files <button class="sm" data-click="addLink">+ Link</button></h4>'+filesHtml(r)+'</div>'
    +(isT?'<details class="pbox"><summary style="font-size:11px;color:var(--deep);text-transform:uppercase;letter-spacing:.4px;cursor:pointer;font-weight:700">Deal maths</summary><div class="pgrid" style="margin-top:6px">'+fld('dm_e','EBITDA (€m)',r.ebitda,'number')+fld('dm_m','Multiple',6,'number')+fld('dm_d','Debt %',60,'number')+fld('dm_r','Interest rate %',5,'number')+fld('dm_t','Tenor (yrs)',7,'number')+'</div><button class="sm primary" data-click="calcMaths" style="margin-top:6px">Calculate</button><div id="dm_out" style="margin-top:8px"></div></details>':'')
    +'</div><div class="rec-r">'
    +promisesHtml(r)
    +wrapUpHtml(r)
    +(isT||givesNames(r)?'<div class="pbox"><h4>'+(isT?'Shared with':'Names you gave them')+(isT?' <button class="sm" data-click="addShare">+ Add</button>':'')+'</h4>'+shareHtml(r)+'</div>':'')
    +'<div class="pbox"><h4>Log activity</h4><div class="inline">'+selFld('la_type','Type',ACT_TYPES,'Call')+fld('la_date','Date',today(),'date')+fld('la_txt','Subject','')+'</div><label>Note</label><textarea id="la_note" rows="2"></textarea><div class="inline" style="margin-top:4px">'+fld('la_owe','I promised (becomes an open promise)','')+fld('la_owe_by','By',addDays(today(),3),'date')+'</div><button class="sm primary" data-click="logActivity" style="margin-top:4px">Log</button></div>'
    +'<div class="pbox"><h4>Activity timeline <span class="muted" style="font-weight:400">'+Object.keys(r.touches||{}).length+' activities</span></h4>'
      +'<div class="tl-ctl">Period: <select data-change="setTlPeriod|$vn"><option value="13"'+(tlPeriod===13?' selected':'')+'>13 weeks</option><option value="26"'+(tlPeriod===26?' selected':'')+'>26 weeks</option><option value="52"'+(tlPeriod===52?' selected':'')+'>52 weeks</option></select> '
      +Object.keys(tlTypes).map(ty=>'<label><input type="checkbox" '+(tlTypes[ty]?'checked':'')+' data-change="toggleTlType|'+ty+'|$c"> '+ty+'</label>').join(' ')
      +'</div><div style="height:160px"><canvas id="profTl"></canvas></div></div>'
    +'<div class="pbox"><h4>Contact history</h4>'+tlHtml(r)+'</div>'
    +'<div class="pbox rec-danger"><h4>Danger zone</h4><button data-click="deleteRec" style="border-color:var(--red);color:var(--red)">Delete this record</button></div>'
    +'</div></div>';
  drawTimeline(r);
}
export function refreshRecordPage(){ // called from renderAll after remote changes; never while a field is being edited
  if(!profRec||!document.body.classList.contains('rec-open'))return;
  if(document.querySelector('#p-record .rfe'))return;
  if(profRec.id&&!findRec(profRec.id)&&!isNew){closeProfile();return}
  const fresh=profRec.id&&findRec(profRec.id);if(fresh&&fresh!==profRec)profRec=fresh; // state objects are replaced by undo and import
  const y=window.scrollY;renderRecordPage();window.scrollTo(0,y);
}
export function openProfile(rec){
  if(!rec)return;
  const open=document.body.classList.contains('rec-open');
  if(!open){const t=document.querySelector('.tab.active');prevTab=t?t.dataset.t:'home'}
  profRec=rec;isNew=!findRec(rec.id);
  document.body.classList.add('rec-open');
  const want='#rec/'+(isNew?'new':rec.id);
  if(location.hash!==want){if(open)history.replaceState(null,'',want);else location.hash=want}
  renderRecordPage();
  window.scrollTo(0,0);
}
export function closeProfile(){
  if(!document.body.classList.contains('rec-open'))return;
  if(profChart){try{profChart.destroy()}catch(e){}profChart=null}
  profRec=null;isNew=false;
  document.body.classList.remove('rec-open');
  const el=document.getElementById('p-record');if(el)el.innerHTML='';
  if(location.hash.startsWith('#rec/'))history.replaceState(null,'',location.pathname+location.search);
  renderAll();
}
export function initRecordPage(){
  const el=document.getElementById('p-record');if(!el||el._wired)return;el._wired=true;
  window.addEventListener('hashchange',()=>{
    const m=location.hash.match(/^#rec\/(.+)$/);
    if(!m){if(profRec)closeProfile();return}
    if(m[1]==='new')return;
    if(profRec&&profRec.id===m[1])return;
    const r=findRec(m[1]);if(r)openProfile(r);else{toast('Record not found');history.replaceState(null,'',location.pathname+location.search);closeProfile()}
  });
  el.addEventListener('click',e=>{
    if(e.target.closest('#recBack')){closeProfile();return}
    const pb=e.target.closest('button[data-promise]');if(pb){donePromise(+pb.dataset.promise);return}
    const fv=e.target.closest('.rfv');if(fv&&!e.target.closest('a'))startEdit(fv.parentElement);
  });
  el.addEventListener('keydown',e=>{
    const fv=e.target.closest&&e.target.closest('.rfv');
    if(fv&&(e.key==='Enter'||e.key===' ')){e.preventDefault();startEdit(fv.parentElement)}
  });
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!document.body.classList.contains('rec-open'))return;const t=e.target;if(t&&t.closest&&t.closest('.rfe,input,textarea,select'))return;if(document.querySelector('#p-record .rfe'))return;closeProfile()});
}
function specFor(r,key){const sp=fieldSpecs(r);return [...sp.sections.flatMap(x=>x[1]),...sp.next].find(s=>s.key===key)}
function startEdit(wrap){
  const r=profRec;if(!r||!wrap||wrap.querySelector('.rfe'))return;
  const s=specFor(r,wrap.dataset.f);if(!s)return;
  const fv=wrap.querySelector('.rfv');fv.style.display='none';
  wrap.insertAdjacentHTML('beforeend',editorHtml(r,s));
  const ed=wrap.querySelector('.rfe');
  let done=false;
  const finish=(commit,moveNext)=>{
    if(done)return;done=true;
    let ok=true;
    if(commit)ok=commitField(r,s,ed.value);
    ed.remove();fv.style.display='';
    if(ok!==false){fv.innerHTML=display(r,s);afterCommit(s.key)}
    if(moveNext){const all=[...document.querySelectorAll('#p-record .rf')];const i=all.indexOf(wrap);const nx=all[i+1];if(nx)startEdit(nx)}
  };
  ed.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)}
    else if(e.key==='Enter'&&(s.type!=='textarea'||e.ctrlKey||e.metaKey)){e.preventDefault();finish(true)}
    else if(e.key==='Tab'){e.preventDefault();finish(true,!e.shiftKey)}
  });
  ed.addEventListener('blur',()=>setTimeout(()=>finish(true),0));
  if(s.type==='select'||s.type==='date')ed.addEventListener('change',()=>finish(true));
  ed.focus();if(ed.select&&s.type!=='select')try{ed.select()}catch(e){}
}
let _rt=null;
function afterCommit(key){
  // header, dependent blocks and the other tabs, without tearing down the field being edited next
  const r=profRec;if(!r)return;
  const head=document.querySelector('#p-record .rec-head');if(head)head.outerHTML=headHtml(r);
  if(key==='stage'||key==='nextAction'||key==='nextDate'||key==='priority'||key==='category'||key==='ptype'){setTimeout(()=>{if(!document.querySelector('#p-record .rfe'))renderRecordPage()},50)}
  clearTimeout(_rt);_rt=setTimeout(renderAll,150);
}
function donePromise(i){
  const r=profRec;if(!r)return;
  const lines=(r.nextAction||'').split('|').map(s=>s.trim()).filter(Boolean);
  const prom=lines.filter(s=>/^Promised\b/.test(s));const line=prom[i];if(!line)return;
  logDone(r,line);
  const rest=lines.filter(s=>s!==line);
  r.nextAction=rest.join(' | ');
  if(!rest.length){r.nextDate='';r.nextSet=''}
  invalidateThreads();save();renderRecordPage();toast('Promise logged as kept');
}

// ---- pieces reused from the former modal ----
export function tlHtml(r){
  const ts=touchList(r);
  const legend='<div style="font-size:10px;color:#595959;margin-bottom:6px;line-height:1.6"><span style="color:#2E3C65">●</span> Email sent &nbsp;<span style="color:#C6943E">●</span> Email received &nbsp;<span style="color:#008A3E">●</span> Meeting/Granola &nbsp;<span style="color:#7030A0">●</span> Call &nbsp;<span style="color:#8C97B8">●</span> Note/other</div>';
  return legend+'<div class="timeline">'+ts.slice(0,30).map(t=>{
    const k=Object.keys(r.touches||{}).find(k=>(r.touches||{})[k]===t);
    return '<div class="titem t'+tType(t)+(t.dir==='out'?' out':'')+'"><b>'+fmtD(t.date)+'</b> '+(t.link?'<a href="'+esc(t.link)+'" target="_blank" title="Open original">'+esc(fixUml(t.subject))+'</a>':esc(fixUml(t.subject)))+' <span class="chip">'+esc(srcLabel(t))+'</span>'+(t.who?' <span class="muted">- '+esc(fixUml(t.who))+'</span>':'')+(t.link?' <a href="'+esc(t.link)+'" target="_blank">↗</a>':'')+(k?'<br><button class="sm" data-click="editNote|'+r.id+'|'+k+'">Note</button> <button class="sm" data-click="removeTouch|'+r.id+'|'+k+'" title="Filed here by mistake">Remove</button>':'')+(t.note?'<div class="tnote">'+esc(fixUml(t.note))+'</div>':(t.prev?'<div class="tnote">'+esc(fixUml(cleanPrev(t.prev,400)))+'</div>':''))+'</div>'
  }).join('')+'</div>';
}
export async function editNote(recId,key){
  const r=findRec(recId);const t=(r.touches||{})[key];if(!t)return;
  const v=await openDialog({title:'Note',text:t.subject||'',fields:[{key:'n',label:'Note',type:'textarea',rows:4,value:t.note||''}]});
  if(v){t.note=v.n;save();if(profRec)renderRecordPage()}
}
// A wrongly filed entry goes from every record holding it (an organisation and its people share the key) and stays out.
export async function removeTouch(recId,key){
  const r=findRec(recId);const t=r&&(r.touches||{})[key];if(!t)return;
  if(!(await confirmDialog('"'+fixUml(t.subject||'(no subject)')+'" goes from this record and every linked one, and later syncs will not bring it back. Undo can restore it.',{title:'Remove this entry?',ok:'Remove',danger:true})))return;
  [...(S.companies||[]),...(S.advisors||[]),...(S.people||[])].filter(x=>(x.touches||{})[key]).forEach(x=>{
    const letter=tType(x.touches[key])==='Letter'&&x.touches[key].dir!=='in';
    delete x.touches[key];
    // letterSent follows the letters that remain, so the cadence does not run on a removed one
    if(letter&&x.letterSent)x.letterSent=Object.values(x.touches).filter(o=>tType(o)==='Letter'&&o.dir!=='in').map(o=>(o.date||'').slice(0,10)).sort()[0]||'';
  });
  S.removedTouches=S.removedTouches||{};S.removedTouches[touchTomb(key)]=today();
  save();renderAll();if(profRec)renderRecordPage();toast('Entry removed');
}
export function filesHtml(r){
  let h='';
  (r.links||[]).forEach((l,i)=>{h+='<div style="margin-bottom:4px"><a href="'+esc(l.url)+'" target="_blank">'+esc(l.title)+'</a> <button class="sm" data-click="removeLink|#'+i+'">×</button></div>'});
  (r.driveFiles||[]).forEach(f=>{h+='<div style="margin-bottom:4px"><a href="'+esc(f.link)+'" target="_blank">'+esc(f.name)+'</a> <span class="muted">'+esc(f.type||'')+'</span></div>'});
  const _seen=new Set();
  touchList(r).forEach(t=>{(t.att||[]).forEach(n=>{if(_seen.has(n))return;_seen.add(n);h+='<div style="margin-bottom:4px">📎 '+esc(n)+' <span class="muted">'+fmtD(t.date)+(t.dir==='out'?' · sent':' · received')+'</span>'+(t.link?' <a href="'+esc(t.link)+'" target="_blank">↗</a>':'')+'</div>'})});
  if(r.kind==='person'){
    const o=personOrg(r);
    if(o)touchList(o).forEach(t=>{(t.att||[]).forEach(n=>{if(_seen.has(n))return;_seen.add(n);h+='<div style="margin-bottom:4px">📎 '+esc(n)+' <span class="muted">'+fmtD(t.date)+(t.dir==='out'?' · sent':' · received')+' · via '+esc(dispName(o))+'</span>'+(t.link?' <a href="'+esc(t.link)+'" target="_blank">↗</a>':'')+'</div>'})});
  }
  return h||'<span class="muted">No files linked</span>';
}
export async function addLink(){const v=await openDialog({title:'Add a link',fields:[{key:'t',label:'Title',required:true},{key:'u',label:'URL',placeholder:'https://',required:true}],ok:'Add'});if(!v)return;const t=v.t.trim(),u=v.u.trim();profRec.links=profRec.links||[];profRec.links.push({title:t,url:u});ensureInState(profRec);save();renderRecordPage()}
export function listChips(r){return '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 10px;align-items:start">'+(S.customLists||[]).map(l=>'<label style="font-size:11px;display:flex;align-items:flex-start;gap:6px;text-transform:none;margin:0;line-height:1.3;color:#000;text-align:left"><input type="checkbox" style="margin:1px 0 0" '+(((r.lists||[]).includes(l))?'checked':'')+' data-change="toggleList|'+r.id+'|'+esc(l)+'|$c"> '+esc(l)+'</label>').join('')+'</div>'}
export function toggleList(id,l,on){const r=findRec(id)||profRec;if(!r)return;r.lists=r.lists||[];if(on&&!r.lists.includes(l))r.lists.push(l);if(!on)r.lists=r.lists.filter(x=>x!==l);ensureInState(r);save()}

export let tlPeriod=13,tlTypes={Email:true,Meeting:true,Call:true,Note:true,Letter:true};
export function drawTimeline(r){
  const el=document.getElementById('profTl');if(!el)return;
  if(profChart){try{profChart.destroy()}catch(e){}}
  const wks=tlPeriod;
  const labels=[],out=[],inn=[],mtg=[];
  const mon0=new Date();mon0.setHours(0,0,0,0);mon0.setDate(mon0.getDate()-((mon0.getDay()+6)%7));
  const all=touchList(r).filter(t=>t.date&&tlTypes[tType(t)]);
  for(let i=wks-1;i>=0;i--){
    const ws=new Date(mon0);ws.setDate(ws.getDate()-i*7);
    const we=new Date(ws);we.setDate(we.getDate()+7);
    labels.push('W/c '+ws.getDate()+' '+ws.toLocaleString('en-GB',{month:'short'}));
    const ts=all.filter(t=>{const d=new Date(t.date);return d>=ws&&d<we});
    const isMeet=t=>tType(t)==='Meeting'||tType(t)==='Call';
    mtg.push(ts.filter(isMeet).length);
    out.push(ts.filter(t=>!isMeet(t)&&t.dir==='out').length);
    inn.push(ts.filter(t=>!isMeet(t)&&t.dir==='in').length);
  }
  if(typeof Chart==='undefined')return;
  profChart=new Chart(el,{type:'bar',data:{labels,datasets:[{label:'Out (sent)',data:out,backgroundColor:'#2E3C65'},{label:'In (received)',data:inn,backgroundColor:'#FFC000'},{label:'Calls / meetings',data:mtg,backgroundColor:'#2E7D32'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{font:{size:10}}}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}});
}
export function srcLabel(t){const s=t.src||'';if(s==='Granola'||s==='Meeting')return 'Call';if(s==='Kinetix'||s==='Gmail'||s==='Email')return 'Email';return s}
export function mailUrl(u){if(!u)return u;const m=String(u).match(/outlook\.office(?:365)?\.com\/owa\/\?ItemID=([^&]+)/i);if(m){const id=m[1];return 'https://outlook.cloud.microsoft/mail/deeplink/read/'+id}return u}
export function linkWrap(t,inner){if(!t.link)return inner;const u=mailUrl(t.link),isMail=u!==t.link||/outlook\.office/.test(u);return '<a href="'+esc(u)+'" target="'+(isMail?'kinetixmail':'_blank')+'" title="Open original">'+inner+'</a>'}
export function convTouches(r){
  let ts=touchList(r).filter(t=>!isSysNote(t));
  if(r.kind==='person'){const o=personOrg(r);if(o){const seen=new Set(ts.map(t=>(t.date||'')+'|'+(t.subject||'')));touchList(o).forEach(t=>{if(isSysNote(t))return;const k=(t.date||'')+'|'+(t.subject||'');if(!seen.has(k)){seen.add(k);ts.push(t)}});ts.sort((a,b)=>(b.date||'').localeCompare(a.date||''))}}
  return ts;
}
// A call or meeting has no direction for the purpose of "who owes the next move".
const isCallTouch=t=>srcLabel(t)==='Call';
const dirWord=t=>isCallTouch(t)?'Call':(t.dir==='out'?'Sent':'Received');
export function wrapUpHtml(r){
  const ts=convTouches(r); // newest first
  if(!ts.length)return '';
  const newest=ts[0];
  // "Kein offener Punkt: ..." is context, not a step of Leif's
  const open=(r.nextAction||'').trim()&&!/^kein offener punkt/i.test((r.nextAction||'').trim());
  const ball=(isCallTouch(newest)
      ? 'Last contact: call '+fmtAgo(newest.date)
      : newest.dir==='in'
        ? 'Ball with you - they wrote last, '+fmtAgo(newest.date)
        : 'Ball with them - you wrote last, '+fmtAgo(newest.date))
    +(open?' <span class="muted" style="font-weight:400">&middot; your next step is set above</span>':'');
  const cut=(s,n)=>{s=(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n)+' …':s};
  const blk=t=>!t?'':'<div style="margin-bottom:9px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959">'+dirWord(t)+' &middot; '+fmtD(t.date)+' &middot; '+fmtAgo(t.date)+' &middot; '+esc(srcLabel(t))+(t.who?' &middot; '+esc(fixUml(t.who)):'')+'</div><b style="font-size:12px">'+linkWrap(t,esc(fixUml(t.subject||'(no subject)')))+(t.link?' <span class="muted">&#8599;</span>':'')+'</b>'+((t.prev||t.note)?'<div class="tnote" style="margin-top:4px">'+esc(cut(fixUml(cleanPrev(t.prev||t.note,1200)),1200))+'</div>':'')+'</div>';
  const older=ts.slice(2,6);
  return '<div class="pbox" style="border-left:3px solid '+(!isCallTouch(newest)&&newest.dir==='in'?'#C6943E':'#2E3C65')+'">'+
    '<h4>Where we left things</h4>'+
    '<div style="font-size:12px;font-weight:bold;margin-bottom:9px">'+ball+'</div>'+
    blk(ts[0])+blk(ts[1])+
    (older.length?'<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--lgray)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959">Earlier in this thread</div>'+older.map(t=>'<div style="font-size:11px;margin-top:5px">'+fmtD(t.date)+' <span class="muted">'+(isCallTouch(t)?'call':(t.dir==='out'?'sent':'received')+' &middot; '+esc(srcLabel(t)))+'</span> <b>'+linkWrap(t,esc(fixUml(t.subject||'')))+'</b>'+(t.prev?'<div class="tnote" style="margin-top:2px">'+esc(cut(fixUml(cleanPrev(t.prev,400)),400))+'</div>':'')+'</div>').join('')+'</div>':'')+
    '</div>';
}
export function setTlPeriod(w){tlPeriod=w;drawTimeline(profRec)}
export function toggleTlType(ty,on){tlTypes[ty]=on;drawTimeline(profRec)}
export async function deleteRec(){
  const r=profRec;if(!r)return;
  if(!(await confirmDialog('The record and its contact history are removed for both users. Undo can bring it back.',{title:'Delete '+dispName(r)+'?',ok:'Delete',danger:true})))return;
  S.companies=(S.companies||[]).filter(c=>c.id!==r.id);
  S.advisors=(S.advisors||[]).filter(a=>a.id!==r.id);
  S.people=(S.people||[]).filter(p=>p.id!==r.id);
  save();closeProfile();
}
// Whoever is primary so far stays as a person on the record, also when they only lived in the contact text.
export function setPrimary(recId,personId){
  const r=findRec(recId),p=findRec(personId);if(!r||!p)return;
  const ppl=orgPeople(r);
  const parts=String(r.contact||'').split(';').map(x=>x.trim()).filter(Boolean);
  parts.forEach((c,i)=>{
    const m=c.match(/^([^(]+?)\s*\((.*)\)\s*$/),name=m?m[1].trim():c,title=m?m[2].trim():'';
    if(normName(name)===normName(p.name)||ppl.some(x=>normName(x.name)===normName(name)))return;
    const n=newPerson();n.name=name;n.title=title;n.firm=r.firm||r.name||'';n.orgId=r.id;
    if(i===0){n.email=r.email||'';n.phone=r.phone||'';n.mobile=r.mobile||''}
    S.people=S.people||[];S.people.push(n);
  });
  r.contact=p.name;r.email=p.email||'';r.phone=p.phone||'';r.mobile=p.mobile||'';
  save();renderAll();if(profRec)renderRecordPage();toast(fixUml(p.name)+' is now primary');
}
export function peopleBoxHtml(rec,ppl){
  // Primary contact in full, everyone else on one line each.
  const prim=ppl.find(p=>rec.contact&&normName(p.name)===normName(rec.contact));
  const rest=ppl.filter(p=>p!==prim);
  let out='';
  if(prim){
    out+='<div style="margin-bottom:6px;cursor:pointer" data-click="openRec|'+prim.id+'|$e"><b>'+esc(fixUml(prim.name))+'</b> <span class="chip">primary</span>'
      +(prim.title?'<div class="muted" style="font-size:11px">'+esc(prim.title)+'</div>':'')
      +(prim.email?'<div style="font-size:11px"><a href="mailto:'+esc(prim.email)+'" data-click="!">'+esc(prim.email)+'</a></div>':'')
      +(prim.phone?'<div class="muted" style="font-size:11px">'+esc(prim.phone)+'</div>':'')+'</div>';
  } else if(rec.contact){
    out+='<div style="margin-bottom:6px"><b>'+esc(fixUml(rec.contact))+'</b> <span class="chip">primary</span>'
      +(rec.email?'<div style="font-size:11px"><a href="mailto:'+esc(rec.email)+'">'+esc(rec.email)+'</a></div>':'')
      +'<div class="muted" style="font-size:10px">from the company record, no separate person record yet</div></div>';
  }
  if(rest.length){
    out+=(out?'<div style="border-top:1px solid #E8E8EC;margin:6px 0 5px"></div>':'')
      +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959;margin-bottom:3px">Also here ('+rest.length+')</div>'
      +rest.map(p=>'<div style="font-size:11px;margin-bottom:2px;cursor:pointer" data-click="openRec|'+p.id+'|$e"><b>'+esc(fixUml(p.name))+'</b>'+(p.email?' <span class="muted">'+esc(p.email)+'</span>':'')+(p.title?' <span class="muted">'+esc(p.title.slice(0,40))+'</span>':'')+' <button class="sm" data-click="!setPrimary|'+rec.id+'|'+p.id+'">Make primary</button></div>').join('');
  }
  return out||'<span class="muted">No people linked</span>';
}
export function addPersonToOrg(){const p=newPerson();p.orgId=profRec.id;p.firm=dispName(profRec);openProfile(p)}
export function logActivity(){
  const r=profRec;if(!r)return;
  const type=gv('la_type'),date=gv('la_date')||today(),txt=gv('la_txt'),note=gv('la_note');
  if(!txt){toast('Enter a subject');return}
  const key='man_'+uid();
  const t={date:date+'T12:00:00Z',dir:'out',subject:type+': '+txt,link:'',src:type,who:'',note:note||''};
  const owe=(gv('la_owe')||'').trim(),oweBy=gv('la_owe_by')||addDays(today(),3);
  if(owe){t.note=(t.note?t.note+' | ':'')+'Promised: '+owe}
  addTouch(r,key,t);
  if(r.orgId){const org=findRec(r.orgId);if(org)addTouch(org,key,t)}
  if(owe){const line='Promised ('+type+' '+fmtD(date)+'): '+owe;r.nextAction=r.nextAction&&r.nextAction.trim()?r.nextAction.trim()+' | '+line:line;if(!r.nextDate||oweBy<r.nextDate)r.nextDate=oweBy;r.nextSet=today();invalidateThreads()}
  ensureInState(r);
  save();renderRecordPage();toast(owe?'Logged, promise added as an open item':'Activity logged');
}
export function calcMaths(){
  const r=profRec;if(!r)return;const el=document.getElementById('dm_out');if(!el)return;
  const e=+gv('dm_e')||0,mm=+gv('dm_m')||0,d=(+gv('dm_d')||0)/100,rate=(+gv('dm_r')||0)/100,tn=+gv('dm_t')||7;
  if(!e||!mm){el.innerHTML='<span class="muted">Enter EBITDA and multiple</span>';return}
  const ev=e*mm,debt=ev*d,eq=ev-debt;
  const svc=rate>0?debt*rate/(1-Math.pow(1+rate,-tn)):debt/tn;
  const dscr=svc>0?e/svc:0;
  const col=dscr>=1.5?'var(--green)':dscr>=1.2?'#8a6d00':'var(--red)';
  el.innerHTML='<div class="dm-kpi"><b>€'+ev.toFixed(1)+'m</b><span>Enterprise value</span></div><div class="dm-kpi"><b>€'+eq.toFixed(1)+'m</b><span>Equity check</span></div><div class="dm-kpi"><b>€'+debt.toFixed(1)+'m</b><span>Debt</span></div><div class="dm-kpi"><b>€'+svc.toFixed(2)+'m/yr</b><span>Debt service</span></div><div class="dm-kpi"><b style="color:'+col+'">'+dscr.toFixed(2)+'x</b><span>DSCR</span></div>';
}
export function removeLink(i){if(!profRec||!profRec.links)return;profRec.links.splice(i,1);save();renderRecordPage()}
