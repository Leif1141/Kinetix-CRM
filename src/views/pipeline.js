import {letterDoneStep, effDue} from '../state.js';
import {logDone} from './actions.js';
import {openDialog, confirmDialog} from './dialog.js';
import {ACTIVE_STAGES, BOARD_COLS, CHANNELS, CH_DE, LETTER_TARGET_WEEK, LIVE, LS_DE, STAGES, ST_DE} from '../constants.js';
import {S, addTouch, cadenceOf, chanOf, dispName, findRec, fixUml, isDue, lastTouch, tType, touchList} from '../state.js';
import {addDays, daysAgo, daysBetween, esc, fmtDe, fmtM, normName, toast, today, uid, weekStart} from '../util.js';
import {openProfile, profRec, renderRecordPage} from './record.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';

export let pipeView=null,pipeSort={},pipeExpand={},pipeMore={},pipeKpi='',pipeDragId=null,pipeDrill='';
// Tab click: back to the base view (Leif 29.10.2026)
export function resetPipeView(){pipeKpi='';pipeDrill='';pipeMore={};pipeExpand={}}
export function chDe(c){return CH_DE[chanOf(c)]||chanOf(c)||'(no channel)'}
export function cadChip(c){const cd=cadenceOf(c);if(!cd)return '';if(cd.replied)return '<span class="chch" style="background:#E3F1E4;color:#2E7D32">Reply received</span>';if(!cd.next)return '<span class="chch">Cadence complete</span>';const od=cd.next.due<=today();return '<span class="chch" title="Letter of '+fmtDe(cd.sent)+'" style="'+(od?'background:#FBE3D6;color:#9A3B12':'')+'">'+cd.next.label+' by '+fmtDe(cd.next.due)+'</span>'}
export function lsChip(c){if(c.letterSent)return '';const v=c.letterStatus;if(!v||!LS_DE[v])return '';return '<span class="chch" style="'+(v==='ready'?'background:#E3F1E4;color:#2E7D32':'')+'">'+LS_DE[v]+'</span>'}
export function dueDe(d,id){
  const edit=id?' data-click="!editDue|'+id+'|$el" title="Click to change"':'';
  if(!d)return id?'<span class="duechip" style="background:#EEF0F5;color:#595959"'+edit+'>no date</span>':'';
  const n=-daysAgo(d);const t=n<0?Math.abs(n)+'d overdue':n===0?'due today':'in '+n+'d';const c=n<0?'var(--red)':n===0?'#C6943E':'#2E7D32';
  return '<span class="duechip" style="background:'+c+'22;color:'+c+'"'+edit+'>'+t+' · '+fmtDe(d)+'</span>'
}
export function editDue(id,el){
  const r=findRec(id);if(!r)return;
  const inp=document.createElement('input');inp.type='date';inp.value=r.nextDate||today();inp.style.cssText='font-size:11px;padding:1px 3px';
  inp.onclick=e=>e.stopPropagation();
  inp.onchange=()=>{r.nextDate=inp.value||'';r.nextSet=today();save();renderPipeline();toast('Due date '+(r.nextDate?fmtDe(r.nextDate):'removed'))};
  inp.onblur=()=>setTimeout(()=>{if(inp.parentNode)renderPipeline()},150);
  el.replaceWith(inp);inp.focus();try{inp.showPicker()}catch(e){}
}
export function shiftDue(id,days,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;r.nextDate=addDays(r.nextDate&&r.nextDate>today()?r.nextDate:today(),days);r.nextSet=today();save();renderPipeline()}
export function toggleFav(id,ev){if(id&&typeof id==='object'&&id.stopPropagation){const t=id;id=ev;ev=t}if(ev&&ev.stopPropagation)ev.stopPropagation();const r=findRec(id);if(!r)return;r.fav=!r.fav;save();renderAll();if(profRec&&profRec.id===id)openProfile(r)}
export function letterBox(rec){
  const cd=cadenceOf(rec);
  const st=cd?('Letter sent on '+fmtDe(cd.sent)+(cd.via?' via '+esc(cd.via):'')+' · '+(cd.replied?'Reply received, cadence ended':cd.partner?'follow-up by the partner, no cadence in the CRM':cd.next?'next step: '+cd.next.label+' by '+fmtDe(cd.next.due):'Cadence complete')):(LS_DE[rec.letterStatus]||'No letter yet');
  const steps=cd&&!cd.partner?'<div style="font-size:11px;margin-top:4px">'+cd.steps.map(s=>(s.done?'&#10003; ':'&#9675; ')+s.label+' '+fmtDe(s.due)).join(' &nbsp; ')+'</div>':'';
  const b=(v,t)=>'<button class="sm'+(rec.letterStatus===v?' vbtn on':'')+'" data-click="setLetterStatus|'+rec.id+'|'+v+'">'+t+'</button> ';
  return '<div style="margin-top:8px;padding:8px;border:1px solid #E3E5EC;border-radius:5px"><label style="margin:0">Letter and cadence</label><div style="font-size:12px">'+st+'</div>'+steps+
    '<div style="margin-top:6px">'+(cd?'':b('planned','Letter planned')+b('ready','Letter drafted'))+'<button class="sm" data-click="markLetterSent|'+rec.id+'">Letter sent...</button></div></div>';
}
// Contact was made (letter, mail, call, meeting); a note alone is not contact
export function wasApproached(c){return !!c.letterSent||touchList(c).some(t=>tType(t)!=='Note')||ACTIVE_STAGES.includes(c.stage)}
// One row per letter: the letter touches, plus the first letter where only its date was recorded (letterSent without a touch)
export function letterRows(cs){
  const out=[];
  for(const c of cs){
    const ts=Object.entries(c.touches||{}).filter(([k,t])=>t&&tType(t)==='Letter'&&t.dir!=='in');
    // the first letter shows letterSent, the date the cadence runs on, even where its touch carries another day
    const first=ts.map(([k,t])=>(t.date||'').slice(0,10)).sort()[0];let fd=false;
    ts.forEach(([k,t])=>{let d=(t.date||'').slice(0,10);if(c.letterSent&&!fd&&d===first){d=c.letterSent;fd=true}out.push({c,key:k,date:d})});
    if(c.letterSent&&!ts.length)out.push({c,key:'',date:c.letterSent});
  }
  return out.sort((a,b)=>b.date.localeCompare(a.date)||dispName(a.c).localeCompare(dispName(b.c)));
}
// Where a company stands after the approach, in one line
export function pipeStatus(c){
  if(c.stage==='Dead')return {k:'dead',t:'Passed'+(c.deadReason?': '+c.deadReason:'')};
  if(c.stage==='On hold')return {k:'hold',t:'On hold'+(c.deadReason?': '+c.deadReason:'')};
  if(c.stage&&!['Identified','Contacted'].includes(c.stage))return {k:'live',t:ST_DE[c.stage]||c.stage};
  const cd=cadenceOf(c);
  if(cd&&cd.replied)return {k:'live',t:'Reply received'};
  if(cd&&cd.partner)return {k:'wait',t:'No reply yet; follow-up by '+(cd.via||'the partner')};
  if(cd&&cd.next)return {k:cd.next.due<=today()?'due':'wait',t:'No reply yet; '+cd.next.label.toLowerCase()+' by '+fmtDe(cd.next.due)};
  return {k:'wait',t:'No reply yet'};
}
const ST_STYLE={dead:'background:#EEF0F5;color:#595959',hold:'background:#EEF0F5;color:#595959',live:'background:#E3F1E4;color:#2E7D32',due:'background:#FBE3D6;color:#9A3B12',wait:''};
const ST_LBL={live:'reply or further',dead:'passed',hold:'on hold',due:'follow-up due',wait:'waiting'};
export function setPipeDrill(v){pipeDrill=pipeDrill===v?'':v;renderPipeline();const el=document.getElementById('pipeDrill');if(el)el.scrollIntoView({block:'nearest'})}
// Move a letter to another date. The first letter carries the cadence and the 'Contacted' date, so both follow.
export function setLetterDate(id,key,old,v){
  const r=findRec(id);v=(v||'').trim();if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v===old)return;
  const t=key&&key!=='-'&&r.touches?r.touches[key]:null;
  if(t)t.date=v+((t.date||'').length>10?t.date.slice(10):'T12:00:00Z');
  const was=r.letterSent;
  const ds=Object.values(r.touches||{}).filter(x=>tType(x)==='Letter'&&x.dir!=='in').map(x=>(x.date||'').slice(0,10)).filter(Boolean).sort();
  if(!t)r.letterSent=v;else if(ds.length&&(!was||was===old||!ds.includes(was)))r.letterSent=ds[0];
  if(r.letterSent!==was)(r.stageLog||[]).forEach(l=>{if(l.stage==='Contacted'&&l.date===was)l.date=r.letterSent});
  save();renderAll();toast('Letter to '+fixUml(dispName(r))+' moved to '+fmtDe(v));
}
function agoTxt(d){const n=daysAgo(d);return n===0?'today':n>0?n+(n===1?' day ago':' days ago'):'in '+(-n)+(n===-1?' day':' days')}
function firstContact(c){const d=touchList(c).filter(t=>tType(t)!=='Note').map(t=>(t.date||'').slice(0,10)).filter(Boolean).sort()[0];const l=(c.stageLog||[]).find(x=>x.stage==='Contacted');return d||(l&&l.date)||''}
// Overview of one channel or of the letters: a timeline by date, then one row per letter with its date editable
function drillHtml(cs){
  const i=pipeDrill.indexOf(':'),kind=pipeDrill.slice(0,i),arg=pipeDrill.slice(i+1),ws=weekStart(today());
  let rows,title;
  if(kind==='letters'){rows=letterRows(cs);if(arg==='week')rows=rows.filter(r=>r.date>=ws);title=arg==='week'?'Letters this week':'All letters'}
  else{const g=cs.filter(c=>(chanOf(c)||'')===arg&&c.stage!=='Identified'&&wasApproached(c));rows=letterRows(g);const lc=new Set(rows.map(r=>r.c.id));
    g.filter(c=>!lc.has(c.id)).forEach(c=>rows.push({c,key:null,date:firstContact(c)}));rows.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||dispName(a.c).localeCompare(dispName(b.c)));title=CH_DE[arg]||arg||'(no channel)'}
  const comps=[...new Map(rows.map(r=>[r.c.id,r.c])).values()];
  const nLet=rows.filter(r=>r.key!==null).length,cnt={};comps.forEach(c=>{const k=pipeStatus(c).k;cnt[k]=(cnt[k]||0)+1});
  const head=(nLet?nLet+' letter'+(nLet===1?'':'s')+' to ':'')+comps.length+' compan'+(comps.length===1?'y':'ies')+(comps.length?' &middot; '+['live','dead','hold','due','wait'].filter(k=>cnt[k]).map(k=>cnt[k]+' '+ST_LBL[k]).join(' &middot; '):'');
  const tabs=kind==='letters'?' <button class="sm'+(arg==='week'?' vbtn on':'')+'" data-click="setPipeDrill|letters:week">This week</button><button class="sm'+(arg==='all'?' vbtn on':'')+'" data-click="setPipeDrill|letters:all">All letters</button>':'';
  const byDate=new Map();rows.forEach(r=>{const k=r.date||'';if(!byDate.has(k))byDate.set(k,[]);byDate.get(k).push(r)});
  const via=rs=>{const v=[...new Set(rs.map(r=>r.c.channel==='Partner letter'&&r.c.channelVia?r.c.channelVia:(r.key!==null?'own':'')).filter(Boolean))];return v.length?' &middot; '+v.map(esc).join(', '):''};
  const tl='<div class="tl">'+[...byDate].map(([d,rs])=>'<div class="tl-row"><div class="tl-d"><b>'+(d?fmtDe(d):'no date')+'</b><div class="muted">'+(d?agoTxt(d):'')+'</div></div><div class="tl-dot"></div><div class="tl-c"><div class="muted" style="font-size:11px;margin-bottom:3px">'+rs.length+(nLet?' letter'+(rs.length===1?'':'s'):' compan'+(rs.length===1?'y':'ies'))+via(rs)+'</div>'+[...new Map(rs.map(r=>[r.c.id,r.c])).values()].map(c=>{const s=pipeStatus(c),n=rs.filter(r=>r.c===c).length;return '<span class="chch" style="cursor:pointer;'+ST_STYLE[s.k]+'" title="'+esc(s.t)+'" data-click="openRec|'+c.id+'|$e">'+esc(fixUml(dispName(c)))+(n>1?' ('+n+' letters)':'')+'</span>'}).join(' ')+'</div></div>').join('')+'</div>';
  const dcell=r=>r.key===null?(r.date?fmtDe(r.date):'-'):'<input type="date" style="font-size:11px;padding:1px 3px" value="'+r.date+'" title="Change the date the letter went out" data-click="!" data-change="setLetterDate|'+r.c.id+'|'+(r.key||'-')+'|'+r.date+'|$v">';
  const tbl='<table class="ps"><tr><th style="width:24%">Company</th><th>'+(nLet?'Sent':'First contact')+'</th><th>Via</th><th style="width:34%">Status</th><th>Last contact</th><th style="width:22%">Next step</th></tr>'+rows.map(r=>{const c=r.c,s=pipeStatus(c),lt=lastTouch(c);return '<tr class="rowlink" data-click="openRec|'+c.id+'|$e"><td><b>'+esc(fixUml(dispName(c)))+'</b>'+(c.location?'<div class="muted" style="font-size:10px">'+esc(c.location)+'</div>':'')+'</td><td>'+dcell(r)+'</td><td class="muted">'+esc(c.channel==='Partner letter'?(c.channelVia||'partner'):r.key!==null?'own letter':(c.channelVia||''))+'</td><td><span class="chch" style="white-space:normal;'+ST_STYLE[s.k]+'">'+esc(fixUml(s.t))+'</span></td><td class="muted">'+(lt?fmtDe(lt):'-')+'</td><td style="font-size:11px" title="'+esc(fixUml(c.nextAction||''))+'">'+esc(fixUml((c.nextAction||'').length>110?c.nextAction.slice(0,107)+' ...':(c.nextAction||'')))+'</td></tr>'}).join('')+'</table>';
  return '<div class="section" id="pipeDrill" style="border:1px solid #CFD1E2;border-radius:6px;padding:10px 12px;margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><b style="font-size:15px">'+esc(title)+'</b><span class="muted">'+head+'</span>'+tabs+'<span style="flex:1"></span><button class="sm" data-click="setPipeDrill|'+pipeDrill+'">Close</button></div>'+(rows.length?tl+tbl:'<p class="muted">None.</p>')+'</div>';
}
// Analysed and dropped without an approach: CRM records passed before any contact, plus the companies marked red
// (drop) in MASTER Scoring, which the daily run mirrors into S.analysed. Collapsed by default.
function analysedSec(recs,q){
  const have=new Set((S.companies||[]).map(c=>normName(dispName(c))));
  const ext=((S.analysed&&S.analysed.items)||[]).filter(x=>x&&x.name&&!have.has(normName(x.name))&&(!q||x.name.toLowerCase().includes(q)));
  const rows=recs.map(c=>({id:c.id,name:dispName(c),loc:c.location||'',ebit:c.ebit,score:c.score,why:c.deadReason||c.flag||'',src:'CRM'}))
    .concat(ext.map(x=>({name:x.name,loc:x.loc||'',ebit:x.ebit,score:x.score,why:x.reason||'',src:x.src||'MASTER Scoring'})))
    .sort((a,b)=>a.name.localeCompare(b.name));
  const shown=pipeMore.analysed?rows:rows.slice(0,50);
  const tbl=rows.length?'<table class="ps"><tr><th style="width:24%">Company</th><th>Location</th><th style="text-align:right">EBIT</th><th style="text-align:right">Score</th><th style="width:40%">Reason</th><th>Source</th></tr>'+shown.map(x=>'<tr'+(x.id?' class="rowlink" data-click="openRec|'+x.id+'|$e"':'')+'><td><b>'+esc(fixUml(x.name))+'</b></td><td class="muted">'+esc(x.loc)+'</td><td class="muted" style="text-align:right">'+(x.ebit!=null&&x.ebit!==''?fmtM(x.ebit):'')+'</td><td class="muted" style="text-align:right">'+(x.score!=null&&x.score!==''?Math.round(x.score):'')+'</td><td style="font-size:11px">'+esc(fixUml(x.why))+'</td><td class="muted" style="font-size:10px">'+esc(x.src)+'</td></tr>').join('')+'</table>'+(rows.length>50?'<div style="padding:6px 10px"><button class="sm" data-click="togglePipeMore|analysed">'+(pipeMore.analysed?'Show fewer':'Show all '+rows.length)+'</button></div>':''):'<p class="muted" style="padding:6px 10px">None.</p>';
  return '<details class="psec"'+(pipeExpand.analysed||(q&&rows.length)?' open':'')+' data-toggle="setPipeExpand|analysed|$el"><summary>Analysed, not approached <span style="font-weight:400">('+rows.length+')</span></summary>'+tbl+'</details>';
}
export function setLetterStatus(id,v){const r=findRec(id);if(!r)return;r.letterStatus=r.letterStatus===v?'':v;save();if(profRec&&profRec.id===id)renderRecordPage();renderAll()}
export function toggleLetterReady(id){setLetterStatus(id,'ready')}
export async function markLetterSent(id){
  const r=findRec(id);if(!r)return;
  const v=await openDialog({title:'Letter sent',text:dispName(r),fields:[{key:'d',label:'Date sent',type:'date',value:today()},{key:'via',label:'Sent via (empty for an own letter)',placeholder:'e.g. Rettig Family Capital',value:r.channel==='Partner letter'?(r.channelVia||''):'',list:(S.advisors||[]).map(a=>a.firm).filter(Boolean)}],ok:'Record letter'});
  if(!v)return;
  const dt=/^\d{4}-\d{2}-\d{2}$/.test((v.d||'').trim())?v.d.trim():today();
  const via=(v.via||'').trim();
  const first=!r.letterSent;
  addTouch(r,'letter_'+dt+'_'+uid(),{date:dt+'T12:00:00Z',dir:'out',src:'Letter',subject:(first?'Erstbrief':'Folgebrief')+(via?' über '+via:''),who:r.contact||'',note:''});
  if(first){r.letterSent=dt;if(!r.channel||!CHANNELS.includes(r.channel))r.channel=via?'Partner letter':'Own letter';if(via)r.channelVia=via}
  else{const ds=daysBetween(r.letterSent,dt);r.cadDone=r.cadDone||{};if(ds>330)r.cadDone.l12=dt;else if(ds>150)r.cadDone.l6=dt}
  r.letterStatus='sent';
  if(r.stage==='Identified'){r.stage='Contacted';r.stageLog=r.stageLog||[];r.stageLog.push({stage:'Contacted',date:dt})}
  // the open step dated up to the posting was the letter itself: log it as done, the cadence takes over
  if(r.nextAction&&(!r.nextDate||r.nextDate<=dt)){logDone(r,r.nextAction);r.nextAction='';r.nextDate='';r.nextSet=''}
  const cd=cadenceOf(r);
  save();if(profRec&&profRec.id===id)renderRecordPage();renderAll();toast('Letter recorded'+(cd&&cd.next?'; '+cd.next.label.toLowerCase()+' due '+fmtDe(cd.next.due):''));
}
export async function pipeSetStage(id,ns){
  const r=findRec(id);if(!r||ns===r.stage)return;
  // a cancelled dialog re-renders, so a stage dropdown snaps back to the stored stage
  if(ns==='Dead'){const v=await openDialog({title:'Pass on '+dispName(r),fields:[{key:'why',label:'Reason (one sentence)',type:'textarea',rows:2,value:r.deadReason||''}],ok:'Pass'});if(!v){renderAll();return}r.deadReason=v.why.trim()}
  if(ns==='On hold'){const v=await openDialog({title:'Put '+dispName(r)+' on hold',fields:[{key:'why',label:'Reason',type:'textarea',rows:2,value:r.deadReason||''},{key:'rv',label:'Revisit date',type:'date',value:r.revisitDate||addDays(today(),180)}],ok:'Put on hold'});if(!v){renderAll();return}r.deadReason=v.why.trim();if(/^\d{4}-\d{2}-\d{2}$/.test((v.rv||'').trim()))r.revisitDate=v.rv.trim()}
  r.stage=ns;r.stageLog=r.stageLog||[];r.stageLog.push({stage:ns,date:today()});
  save();renderAll();toast(fixUml(dispName(r))+' → '+(ST_DE[ns]||ns));
}
export function pipeDragStart(ev,id){pipeDragId=id;ev.dataTransfer.setData('text',id);ev.dataTransfer.effectAllowed='move'}
export function pipeDragOver(ev,el){ev.preventDefault();el.classList.add('dragover')}
export function pipeDrop(ev,el,target){
  ev.preventDefault();el.classList.remove('dragover');
  const id=ev.dataTransfer.getData('text')||pipeDragId;pipeDragId=null;const r=findRec(id);if(!r)return;
  if(target==='ready'){if(r.stage!=='Identified'){toast('Only identified companies can move to "To contact"');return}if(!r.letterStatus||r.letterStatus==='sent')r.letterStatus='planned';save();renderPipeline();return}
  pipeSetStage(id,target);
}
export function setPipeView(v){pipeView=v;try{localStorage.setItem('kxPipeView',v)}catch(e){}renderPipeline()}
export function setPipeKpi(k){pipeKpi=pipeKpi===k?'':k;renderPipeline()}
export function toggleWide(){const on=!document.body.classList.contains('wide');document.body.classList.toggle('wide',on);try{localStorage.setItem('kxWide',on?'1':'')}catch(e){}const b=document.getElementById('wideBtn');if(b)b.textContent=on?'Normal width':'Wide view'}
export function pipeSortClick(tid,k){const p=pipeSort[tid]||{};pipeSort[tid]={k,d:p.k===k?-(p.d||1):1};renderPipeline()}
export function pTable(tid,cols,items,limit){
  const st=pipeSort[tid];
  if(st){const col=cols.find(c=>c.k===st.k);if(col)items=[...items].sort((a,b)=>{const x=col.v(a),y=col.v(b);return (x==null||x==='')-(y==null||y==='')||(typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*st.d})}
  const shown=limit&&!pipeMore[tid]?items.slice(0,limit):items;
  return '<table class="ps"><tr>'+cols.map(c=>'<th style="'+(c.w?'width:'+c.w+';':'')+(c.num?'text-align:right':'')+'" data-click="pipeSortClick|'+tid+'|'+c.k+'">'+c.t+(st&&st.k===c.k?(st.d>0?' &#9650;':' &#9660;'):'')+'</th>').join('')+'</tr>'+
    shown.map(r=>'<tr class="rowlink" data-click="openRec|'+r.id+'|$e">'+cols.map(c=>'<td'+(c.num?' style="text-align:right"':'')+(c.muted?' class="muted"':'')+'>'+c.h(r)+'</td>').join('')+'</tr>').join('')+'</table>'+
    (limit&&items.length>limit?'<div style="padding:6px 10px"><button class="sm" data-click="togglePipeMore|'+tid+'">'+(pipeMore[tid]?'Show fewer':'Show all '+items.length)+'</button></div>':'');
}
export function cardSort(a,b){const od=x=>isDue(x)?0:1;return od(a)-od(b)||(b.fav?1:0)-(a.fav?1:0)||(a.nextDate||'9').localeCompare(b.nextDate||'9')||dispName(a).localeCompare(dispName(b))}
export function staleTxt(c){const lt=lastTouch(c);if(!lt)return '';const n=daysAgo(lt);return n>30?'<span class="muted" style="font-size:10px"> · letzter Kontakt vor '+n+' T</span>':''}
export function bCard(c){
  const ch=chanOf(c);
  return '<div class="bcard'+(isDue(c)?' due':'')+'" draggable="true" data-dragstart="pipeDragStart|$e|'+c.id+'" data-click="openRec|'+c.id+'|$e">'+
    '<div class="nm"><span class="star'+(c.fav?' on':'')+'" data-click="toggleFav|'+c.id+'|$e" title="Markieren">&#9733;</span> '+esc(fixUml(dispName(c)))+'</div>'+
    '<div class="muted">'+(c.ebit!=null&&c.ebit!==''?'EBIT '+fmtM(c.ebit):'')+(c.revenue?' · Revenue '+fmtM(c.revenue):'')+(c.location?' · '+esc(c.location):'')+'</div>'+
    (ch?'<span class="chch">'+esc(chDe(c))+(c.channelVia&&(ch==='Partner letter'||ch==='M&A house / advisor'||ch==='Tax adviser / auditor'||ch==='Trade fair')?': '+esc(c.channelVia.split(/[ (]/)[0]):'')+'</span> ':'')+lsChip(c)+cadChip(c)+
    (c.nextAction?'<div class="na"'+(letterDoneStep(c)?' style="color:#595959" title="Done by the letter; the cadence follows"':'')+'>'+(letterDoneStep(c)?'Letter sent '+fmtDe(c.letterSent)+'. ':'')+esc(c.nextAction)+'</div>':(['Contacted','Replied','Meeting','NDA','LOI','Diligence'].includes(c.stage)&&!cadenceOf(c)?'<div class="na" style="color:#9A3B12">No next step recorded</div>':''))+
    '<div style="margin-top:3px">'+(letterDoneStep(c)?'':dueDe(c.nextDate,c.id))+' <span class="mini" data-click="shiftDue|'+c.id+'|#7|$e" title="one week later">+1W</span><span class="mini" data-click="shiftDue|'+c.id+'|#30|$e" title="one month later">+1M</span>'+staleTxt(c)+'</div></div>'
}
export function renderPipeline(){
  if(!pipeView){try{pipeView=localStorage.getItem('kxPipeView')||'board'}catch(e){pipeView='board'}}
  document.querySelectorAll('#p-pipeline .vbtn').forEach(b=>b.classList.toggle('on',b.dataset.v===pipeView));
  const cs=(S.companies||[]).filter(c=>c.kind!=='advisor'&&!c.archived);
  const fc=document.getElementById('fChan');if(fc&&fc.options.length<2)fc.innerHTML='<option value="">All channels</option>'+CHANNELS.filter(Boolean).map(c=>'<option value="'+c+'">'+(CH_DE[c]||c)+'</option>').join('');
  const q=(document.getElementById('fSearch').value||'').toLowerCase(),fch=fc?fc.value:'',onlyFav=!!(document.getElementById('fFav')||{}).checked;
  const t=today(),ws=weekStart(t);
  const LIVE=ACTIVE_STAGES;
  const base=cs.filter(c=>(!q||(c.name||'').toLowerCase().includes(q)||(c.location||'').toLowerCase().includes(q)||(c.contact||'').toLowerCase().includes(q)||(c.channelVia||'').toLowerCase().includes(q))&&(!fch||chanOf(c)===fch)&&(!onlyFav||c.fav));
  const isReady=c=>c.stage==='Identified'&&(c.letterStatus==='ready'||c.letterStatus==='planned'||c.fav);
  const lettersWeek=letterRows(cs).filter(r=>r.date>=ws).length;
  const kdef=[
    {k:'live',t:'Live',f:c=>LIVE.includes(c.stage)},
    {k:'due',t:'Due',f:c=>(LIVE.includes(c.stage)||isReady(c))&&isDue(c),warn:1},
    {k:'nonext',t:'Without next step',f:c=>LIVE.includes(c.stage)&&!c.nextAction&&!(cadenceOf(c)&&(cadenceOf(c).next||cadenceOf(c).partner)),warn:1},
    {k:'replied',t:'Replied or further',f:c=>LIVE.includes(c.stage)&&c.stage!=='Contacted'},
    {k:'ready',t:'To contact',f:isReady},
    {k:'letters',t:'Letters this week',v:lettersWeek+' / '+LETTER_TARGET_WEEK,f:c=>letterRows([c]).some(r=>r.date>=ws),drill:'letters:week'}
  ];
  document.getElementById('pipeKpis').innerHTML=kdef.map(x=>{const n=base.filter(x.f).length;const on=x.drill?pipeDrill.indexOf('letters:')===0:pipeKpi===x.k;return '<div class="kpi'+(x.warn&&n?' warn':'')+(on?' on':'')+'" data-click="'+(x.drill?'setPipeDrill|'+x.drill:'setPipeKpi|'+x.k)+'" title="'+(x.drill?'Click for the letters with their dates':'Click to filter the view')+'"><div class="v">'+(x.v||n)+'</div><div class="l">'+x.t+'</div></div>'}).join('');
  const kf=kdef.find(x=>x.k===pipeKpi);
  const list=kf?base.filter(kf.f):base;
  const active=list.filter(c=>LIVE.includes(c.stage));
  const ready=list.filter(isReady);
  const stageSel=c=>'<select class="stagesel" data-click="!" data-change="pipeSetStage|'+c.id+'|$v">'+STAGES.map(s=>'<option value="'+s+'"'+(s===c.stage?' selected':'')+'>'+(ST_DE[s]||s)+'</option>').join('')+'</select>';
  const lsSel=c=>'<select class="stagesel" data-click="!" data-change="setLetterStatus|'+c.id+'|$v"><option value="">no letter</option><option value="planned"'+(c.letterStatus==='planned'?' selected':'')+'>planned</option><option value="ready"'+(c.letterStatus==='ready'?' selected':'')+'>drafted</option></select>';
  const C={
    name:{k:'name',t:'Company',w:'22%',v:c=>dispName(c),h:c=>'<span class="star'+(c.fav?' on':'')+'" data-click="toggleFav|'+c.id+'|$e">&#9733;</span> <b>'+esc(fixUml(dispName(c)))+'</b>'},
    loc:{k:'loc',t:'Location',v:c=>c.location||'',h:c=>esc(c.location||''),muted:1},
    ebit:{k:'ebit',t:'EBIT',num:1,v:c=>c.ebit==null||c.ebit===''?null:+c.ebit,h:c=>fmtM(c.ebit),muted:1},
    rev:{k:'rev',t:'Revenue',num:1,v:c=>c.revenue==null||c.revenue===''?null:+c.revenue,h:c=>fmtM(c.revenue),muted:1},
    score:{k:'score',t:'Score',num:1,v:c=>c.score==null||c.score===''?null:+c.score,h:c=>c.score!=null&&c.score!==''?Math.round(c.score):'-',muted:1},
    verdict:{k:'verdict',t:'Verdict',v:c=>c.verdict||'',h:c=>esc(c.verdict||''),muted:1},
    stage:{k:'stage',t:'Stage',v:c=>STAGES.indexOf(c.stage),h:c=>stageSel(c)},
    ls:{k:'ls',t:'Letter',v:c=>c.letterStatus||'',h:c=>lsSel(c)},
    chan:{k:'chan',t:'Channel',v:c=>chanOf(c),h:c=>esc(chDe(c))+(c.channelVia?'<div class="muted" style="font-size:10px">'+esc(c.channelVia.slice(0,40))+'</div>':''),muted:1},
    next:{k:'next',t:'Next step',w:'32%',v:c=>c.nextAction||'',h:c=>esc(c.nextAction||'')+' '+cadChip(c)},
    due:{k:'due',t:'Due',v:c=>effDue(c)||'9999',h:c=>letterDoneStep(c)?dueDe(effDue(c)):dueDe(c.nextDate,c.id)},
    last:{k:'last',t:'Last contact',v:c=>lastTouch(c)||'',h:c=>{const d=lastTouch(c);return d?fmtDe(d)+' <span style="font-size:10px">('+daysAgo(d)+'d)</span>':'-'},muted:1},
    days:{k:'days',t:'Days in stage',num:1,v:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l&&l.date?daysAgo(l.date):null},h:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l&&l.date?daysAgo(l.date):'-'},muted:1},
    reason:{k:'reason',t:'Reason',w:'36%',v:c=>c.deadReason||c.flag||'',h:c=>esc(c.deadReason||c.lastSummary||c.flag||'')},
    revisit:{k:'revisit',t:'Revisit',v:c=>c.revisitDate||'9999',h:c=>c.revisitDate?fmtDe(c.revisitDate):'-',muted:1},
    when:{k:'when',t:'Date',v:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l?l.date:''},h:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l?fmtDe(l.date):'-'},muted:1}
  };
  const sec=(id,title,items,cols,limit,open)=>'<details class="psec"'+(open||pipeExpand[id]||(q&&items.length)?' open':'')+' data-toggle="setPipeExpand|'+id+'|$el"><summary>'+title+' <span style="font-weight:400">('+items.length+')</span></summary>'+(items.length?pTable(id,cols,items,limit):'<p class="muted" style="padding:6px 10px">None.</p>')+'</details>';
  const idl=list.filter(c=>c.stage==='Identified'&&!isReady(c)),hold=list.filter(c=>c.stage==='On hold'),dead=list.filter(c=>c.stage==='Dead'&&wasApproached(c)),analysed=list.filter(c=>c.stage==='Dead'&&!wasApproached(c)),closed=list.filter(c=>c.stage==='Closed');
  const lower=sec('idl','Identified, not yet approached',idl,[C.name,C.loc,C.rev,C.ebit,C.score,C.verdict,C.ls,C.next],50)+
    sec('hold','On hold',hold,[C.name,C.loc,C.ebit,C.chan,C.reason,C.revisit,C.when],50)+
    sec('dead','Passed after contact',dead,[C.name,C.loc,C.ebit,C.chan,C.reason,C.when],50)+(closed.length?sec('closed','Closed',closed,[C.name,C.ebit,C.when],0):'')+analysedSec(analysed,q);
  let body='';
  if(pipeView==='focus'){
    const fl=[...new Map([...active,...ready,...list.filter(c=>c.fav&&c.stage!=='Dead')].map(c=>[c.id,c])).values()];
    if(!pipeSort.focus)fl.sort(cardSort);
    // one block per stage, in funnel order, so the stage of a row is never in doubt
    const grp=c=>isReady(c)?'ready':(LIVE.includes(c.stage)?c.stage:'other');
    const GL={ready:'To contact',Contacted:'Contacted',Replied:'Replied',Meeting:'Meeting',NDA:'NDA / info',LOI:'LOI',Diligence:'Diligence',other:'Starred, other stages'};
    body=Object.keys(GL).map(k=>{const g=fl.filter(c=>grp(c)===k);if(!g.length)return '';if(!pipeSort['focus_'+k])g.sort(cardSort);return '<div class="section stagegrp stg-'+k+'"><div class="stagehdr">'+GL[k]+' <span>'+g.length+'</span></div>'+pTable('focus_'+k,[C.name,C.chan,C.ebit,C.next,C.due,C.last,C.days],g,0)+'</div>'}).join('')+lower;
  }else if(pipeView==='channel'){
    const rows=CHANNELS.filter(Boolean).concat(['']).map(ch=>{const g=list.filter(c=>(chanOf(c)||'')===ch&&c.stage!=='Identified'&&wasApproached(c));const rep=g.filter(c=>['Replied','Meeting','NDA','LOI','Diligence','Closed'].includes(c.stage)||(c.stageLog||[]).some(l=>['Replied','Meeting','NDA','LOI'].includes(l.stage))).length;return {ch,g,appr:g.length,rep,meet:g.filter(c=>(c.stageLog||[]).some(l=>['Meeting','NDA','LOI','Diligence','Closed'].includes(l.stage))).length,pass:g.filter(c=>c.stage==='Dead').length,hold:g.filter(c=>c.stage==='On hold').length}}).filter(x=>x.appr);
    body='<div class="section"><table class="ps"><tr><th>Channel</th><th style="text-align:right">Approached</th><th style="text-align:right">Replied</th><th style="text-align:right">Rate</th><th style="text-align:right">Meeting+</th><th style="text-align:right">On hold</th><th style="text-align:right">Passed</th><th>Companies</th></tr>'+rows.map(x=>'<tr class="rowlink'+(pipeDrill==='ch:'+x.ch?' on':'')+'" data-click="setPipeDrill|ch:'+x.ch+'" title="Click for the timeline and status of every company"><td><b>'+esc(CH_DE[x.ch]||x.ch)+'</b></td><td style="text-align:right">'+x.appr+'</td><td style="text-align:right">'+x.rep+'</td><td style="text-align:right">'+(x.appr?Math.round(100*x.rep/x.appr)+'%':'-')+'</td><td style="text-align:right">'+x.meet+'</td><td style="text-align:right">'+x.hold+'</td><td style="text-align:right">'+x.pass+'</td><td style="font-size:11px">'+x.g.slice(0,60).map(c=>'<a href="#" data-click="!openRec|'+c.id+'|$e">'+esc(fixUml(dispName(c)))+'</a> <span class="muted">('+(ST_DE[c.stage]||c.stage)+')</span>').join(', ')+'</td></tr>').join('')+'</table></div>'+lower;
  }else{
    const colItems=k=>k==='ready'?ready:list.filter(c=>c.stage===k);
    // Meeting, NDA, LOI and Diligence hold one or two companies each: they share one narrow column
    const LATE=['Meeting','NDA','LOI','Diligence'];
    const colHtml=(col,sub)=>{const its=colItems(col.k).sort(cardSort);const lim=pipeExpand['b_'+col.k]?its.length:8;return '<div class="bcol'+(sub?' bsub':'')+'" data-dragover="pipeDragOver|$e|$el" data-dragleave="removeClass|$el|dragover" data-drop="pipeDrop|$e|$el|'+col.k+'"><h5>'+col.t+' <span style="font-weight:400;color:#595959">'+its.length+'</span></h5>'+its.slice(0,lim).map(bCard).join('')+(its.length>8?'<button class="sm" style="width:100%" data-click="togglePipeExpand|b_'+col.k+'">'+(pipeExpand['b_'+col.k]?'Show fewer':'+'+(its.length-8)+' more')+'</button>':'')+'</div>'};
    body='<div class="board">'+BOARD_COLS.filter(c=>!LATE.includes(c.k)).map(c=>colHtml(c)).join('')+'<div class="bstack">'+BOARD_COLS.filter(c=>LATE.includes(c.k)).map(c=>colHtml(c,true)).join('')+'</div></div>'+
      '<div class="dropbar"><div class="dropz" data-dragover="pipeDragOver|$e|$el" data-dragleave="removeClass|$el|dragover" data-drop="pipeDrop|$e|$el|On hold">Drop a card here: put on hold (with reason and revisit date)</div><div class="dropz" data-dragover="pipeDragOver|$e|$el" data-dragleave="removeClass|$el|dragover" data-drop="pipeDrop|$e|$el|Dead">Drop a card here: pass (with reason)</div></div>'+lower;
  }
  document.getElementById('pipeBody').innerHTML=(pipeDrill?drillHtml(cs):'')+body;
}

export function dropCard(ev,colEl){
  ev.preventDefault();colEl.classList.remove('dragover');
  const id=ev.dataTransfer.getData('text');const c=findRec(id);if(!c)return;
  const ns=colEl.dataset.stage;
  if(ns!==c.stage){c.stageLog=c.stageLog||[];c.stageLog.push({stage:ns,date:today()});c.stage=ns;save();renderAll()}
}
export function togglePipeMore(tid){pipeMore[tid]=!pipeMore[tid];renderPipeline()}
export function togglePipeExpand(key){pipeExpand[key]=!pipeExpand[key];renderPipeline()}
export function setPipeExpand(id,el){pipeExpand[id]=el.open}
