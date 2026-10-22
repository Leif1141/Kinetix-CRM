import {invalidateThreads} from '../views/threads.js';
import {ACT_TYPES, ADV_CATS, ADV_STATUS, CHANNELS, DEADREASONS, PRIORITIES, PTYPES, STAGES, VERDICTS} from '../constants.js';
import {S, addTouch, chanOf, deadCatOf, dispName, findRec, fixUml, isSysNote, newPerson, orgPeople, personOrg, splitPhones, tType, touchList} from '../state.js';

import {addDays, cleanPrev, esc, fmtAgo, fmtD, normName, toast, today, uid} from '../util.js';
import {fld, gv, n1, selFld, starHtml} from './ui.js';
import {letterBox} from './pipeline.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';
import {shareHtml} from '../shares.js';

export let profRec=null;
export let profChart=null;

export function tlHtml(r){
  const ts=touchList(r);
  const legend='<div style="font-size:10px;color:#595959;margin-bottom:6px;line-height:1.6"><span style="color:#2E3C65">\u25CF</span> Email sent &nbsp;<span style="color:#C6943E">\u25CF</span> Email received &nbsp;<span style="color:#008A3E">\u25CF</span> Meeting/Granola &nbsp;<span style="color:#7030A0">\u25CF</span> Call &nbsp;<span style="color:#8C97B8">\u25CF</span> Note/other</div>';
  return legend+'<div class="timeline">'+ts.slice(0,30).map(t=>{
    const k=Object.keys(r.touches||{}).find(k=>(r.touches||{})[k]===t);
    return '<div class="titem t'+tType(t)+(t.dir==='out'?' out':'')+'"><b>'+fmtD(t.date)+'</b> '+(t.link?'<a href="'+esc(t.link)+'" target="_blank" title="Open original">'+esc(fixUml(t.subject))+'</a>':esc(fixUml(t.subject)))+' <span class="chip">'+esc(srcLabel(t))+'</span>'+(t.who?' <span class="muted">— '+esc(fixUml(t.who))+'</span>':'')+(t.link?' <a href="'+esc(t.link)+'" target="_blank">↗</a>':'')+(k?'<br><button class="sm" onclick="editNote(\''+r.id+'\',\''+k+'\')">Note</button>':'')+(t.note?'<div class="tnote">'+esc(fixUml(t.note))+'</div>':(t.prev?'<div class="tnote">'+esc(fixUml(cleanPrev(t.prev,400)))+'</div>':''))+'</div>'
  }).join('')+'</div>';
}
export function editNote(recId,key){
  const r=findRec(recId);const t=(r.touches||{})[key];if(!t)return;
  const n=prompt('Note for: '+t.subject,t.note||'');
  if(n!==null){t.note=n;save();if(profRec)openProfile(profRec)}
}
export function filesHtml(r){
  let h='';
  (r.links||[]).forEach((l,i)=>{h+='<div style="margin-bottom:4px"><a href="'+esc(l.url)+'" target="_blank">'+esc(l.title)+'</a> <button class="sm" onclick="profRec.links.splice('+i+',1);save();openProfile(profRec)">×</button></div>'});
  (r.driveFiles||[]).forEach(f=>{h+='<div style="margin-bottom:4px"><a href="'+esc(f.link)+'" target="_blank">'+esc(f.name)+'</a> <span class="muted">'+esc(f.type||'')+'</span></div>'});
  const _seen=new Set();
  touchList(r).forEach(t=>{(t.att||[]).forEach(n=>{if(_seen.has(n))return;_seen.add(n);h+='<div style="margin-bottom:4px">\uD83D\uDCCE '+esc(n)+' <span class="muted">'+fmtD(t.date)+(t.dir==='out'?' \u00B7 sent':' \u00B7 received')+'</span>'+(t.link?' <a href="'+esc(t.link)+'" target="_blank">\u2197</a>':'')+'</div>'})});
  if(r.kind==='person'){
    const o=personOrg(r);
    if(o)touchList(o).forEach(t=>{(t.att||[]).forEach(n=>{if(_seen.has(n))return;_seen.add(n);h+='<div style="margin-bottom:4px">\uD83D\uDCCE '+esc(n)+' <span class="muted">'+fmtD(t.date)+(t.dir==='out'?' \u00B7 sent':' \u00B7 received')+' \u00B7 via '+esc(dispName(o))+'</span>'+(t.link?' <a href="'+esc(t.link)+'" target="_blank">\u2197</a>':'')+'</div>'})});
  }
  return h||'<span class="muted">No files linked</span>';
}
export function addLink(){const t=prompt('Link title:');if(!t)return;const u=prompt('URL:');if(!u)return;profRec.links=profRec.links||[];profRec.links.push({title:t,url:u});save();openProfile(profRec)}
export function listChips(r){return '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 10px;align-items:start">'+(S.customLists||[]).map(l=>'<label style="font-size:11px;display:flex;align-items:flex-start;gap:5px;text-transform:none;margin:0;line-height:1.3"><input type="checkbox" style="margin:0" '+(((r.lists||[]).includes(l))?'checked':'')+' onchange="toggleList(\''+r.id+'\',\''+esc(l)+'\',this.checked)"> '+esc(l)+'</label>').join('')+'</div>'}
export function toggleList(id,l,on){const r=findRec(id);r.lists=r.lists||[];if(on&&!r.lists.includes(l))r.lists.push(l);if(!on)r.lists=r.lists.filter(x=>x!==l);save()}

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
export function wrapUpHtml(r){
  const ts=convTouches(r);
  if(!ts.length)return '';
  const newest=ts[0];
  const lastIn=ts.find(t=>t.dir==='in'),lastOut=ts.find(t=>t.dir==='out');
  const open=(r.nextAction||'').trim();
  const ball=open
    ? 'Ball with you - open item below (last exchange '+(newest.dir==='in'?'received ':'sent ')+fmtAgo(newest.date)+')'
    : (newest.dir==='in'
      ? 'Ball with you - they wrote last, '+fmtAgo(newest.date)
      : 'Ball with them - you wrote last, '+fmtAgo(newest.date));
  const cut=(s,n)=>{s=(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n)+' …':s};
  const blk=(t,lab)=>!t?'':'<div style="margin-bottom:9px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959">'+lab+' &middot; '+fmtD(t.date)+' &middot; '+fmtAgo(t.date)+' &middot; '+esc(srcLabel(t))+(t.who?' &middot; '+esc(fixUml(t.who)):'')+'</div><b style="font-size:12px">'+linkWrap(t,esc(fixUml(t.subject||'(no subject)')))+(t.link?' <span class="muted">&#8599;</span>':'')+'</b>'+((t.prev||t.note)?'<div class="tnote" style="margin-top:4px">'+esc(cut(fixUml(cleanPrev(t.prev||t.note,1200)),1200))+'</div>':'')+'</div>';
  const older=ts.filter(t=>t!==lastIn&&t!==lastOut).slice(0,4);
  return '<div class="pbox" style="border-left:3px solid '+(newest.dir==='in'?'#C6943E':'#2E3C65')+'">'+
    '<h4>Where we left things</h4>'+
    '<div style="font-size:12px;font-weight:bold;margin-bottom:9px">'+ball+'</div>'+
    blk(lastIn,'Last received')+blk(lastOut,'Last sent')+
    (r.nextAction?'<div style="margin-top:4px;padding-top:6px;border-top:1px solid var(--lgray)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959">Open item</div><div style="font-size:12px">'+esc(r.nextAction)+(r.nextDate?' <span class="muted">('+fmtD(r.nextDate)+')</span>':'')+'</div></div>':'')+
    (older.length?'<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--lgray)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959">Earlier in this thread</div>'+older.map(t=>'<div style="font-size:11px;margin-top:5px">'+fmtD(t.date)+' <span class="muted">'+(t.dir==='out'?'sent':'received')+' &middot; '+esc(srcLabel(t))+'</span> <b>'+linkWrap(t,esc(fixUml(t.subject||'')))+'</b>'+(t.prev?'<div class="tnote" style="margin-top:2px">'+esc(cut(fixUml(cleanPrev(t.prev,400)),400))+'</div>':'')+'</div>').join('')+'</div>':'')+
    '</div>';
}
export function setTlPeriod(w){tlPeriod=w;drawTimeline(profRec)}
export function toggleTlType(ty,on){tlTypes[ty]=on;drawTimeline(profRec)}

export function openProfile(rec){
  profRec=rec;
  const isT=rec.kind==='target',isA=rec.kind==='advisor',isP=rec.kind==='person';
  const m=document.getElementById('modal');
  const detailL=isT?
    fld('e_name','Company name',rec.name)+
    '<div class="pgrid">'+fld('e_tcontact','Primary contact (owner / MD)',rec.contact)+fld('e_temail','Email',rec.email)+fld('e_tphone','Phone (office)',rec.phone)+fld('e_tmobile','Mobile',rec.mobile)+fld('e_tdomain','Website',rec.domain)+'</div>'+
    '<div class="pgrid">'+selFld('e_stage','Stage',STAGES,rec.stage)+fld('e_rev','Revenue (€m)',n1(rec.revenue),'number')+fld('e_ebitda','EBITDA (€m)',n1(rec.ebitda),'number')+fld('e_ebit','EBIT (€m)',n1(rec.ebit),'number')+fld('e_gm','Gross margin %',rec.gm?n1(rec.gm*100):null,'number')+selFld('e_chan','Channel',CHANNELS,chanOf(rec))+fld('e_chvia','Via (partner, fair, contact)',rec.channelVia)+fld('e_loc','Location',rec.location)+'</div>'+
    '<label>Description</label><textarea id="e_desc" rows="2">'+esc(rec.description||'')+'</textarea>'+
    '<label>Ownership</label><input id="e_own" value="'+esc(rec.ownership||'')+'">'+
    '<label>Flag</label><input id="e_flag" value="'+esc(rec.flag||'')+'">'+
    '<div class="pgrid">'+fld('e_score','Score /100',rec.score,'number')+selFld('e_verdict','Verdict',VERDICTS,rec.verdict)+'</div>'+
    '<label>Research notes</label><textarea id="e_tnotes" rows="6" style="width:100%;font-size:11px">'+esc(rec.notes||'')+'</textarea>'+
    (rec.stage==='Dead'?'<div class="pgrid">'+selFld('e_dc','Dead category',DEADREASONS,deadCatOf(rec))+fld('e_revd','Revisit date',rec.revisitDate,'date')+'</div>'+fld('e_dr','Dead reason (detail)',rec.deadReason):'')+
    '<div class="pgrid">'+selFld('e_prio','Priority',PRIORITIES,rec.priority)+fld('e_nd','Next action date',rec.nextDate,'date')+'</div>'+'<label>Next action</label><textarea id="e_na" rows="3" style="width:100%">'+esc(rec.nextAction||'')+'</textarea>'+letterBox(rec):
  isA?
    fld('e_firm','Firm name',rec.firm)+fld('e_contact','Primary contact',rec.contact)+fld('e_email','Email',rec.email)+'<div class="pgrid">'+fld('e_aphone','Phone (office)',rec.phone)+fld('e_amobile','Mobile',rec.mobile)+'</div>'+fld('e_domain','Domain',rec.domain)+
    '<div class="pgrid">'+selFld('e_cat','Category',ADV_CATS,rec.category)+selFld('e_market','Market',['DE','UK'],rec.market||(/uk|united kingdom/i.test(rec.geo||'')?'UK':'DE'))+selFld('e_geo2','Geo (country)',['Germany','United Kingdom','Switzerland','France','Netherlands','Luxembourg','Sweden','Denmark','Austria','United States','Other'],rec.geo)+'</div>'+
    selFld('e_status','Status',ADV_STATUS,rec.status)+
    '<div class="pgrid">'+fld('e_city','City',rec.city)+fld('e_addr','Address',rec.address)+'</div>'+
    fld('e_intro','Intro path',rec.introPath)+
    '<label>Notes</label><textarea id="e_notes" rows="3">'+esc(rec.notes||'')+'</textarea>'+
    fld('e_cad','Check-in cadence (days)',rec.cadence||30,'number')+
    '<div class="pgrid">'+selFld('e_prio','Priority',PRIORITIES,rec.priority)+fld('e_nd','Next action date',rec.nextDate,'date')+'</div>'+'<label>Next action</label><textarea id="e_na" rows="3" style="width:100%">'+esc(rec.nextAction||'')+'</textarea>':
    fld('e_pname','Full name',rec.name)+fld('e_ptitle','Title',rec.title)+selFld('e_ptype','Type',PTYPES,rec.ptype)+fld('e_pfirm','Organization',rec.firm)+fld('e_pemail','Email',rec.email)+fld('e_pphone','Phone (office)',rec.phone)+fld('e_pmobile','Mobile',rec.mobile)+fld('e_plinkedin','LinkedIn',rec.linkedin)+fld('e_pcity','City',rec.city)+fld('e_pangle','Angle / notes',rec.angle)+fld('e_ppath','Network path',rec.networkPath)+
    '<div class="pgrid">'+selFld('e_prio','Priority',PRIORITIES,rec.priority)+fld('e_nd','Next action date',rec.nextDate,'date')+'</div>'+'<label>Next action</label><textarea id="e_na" rows="3" style="width:100%">'+esc(rec.nextAction||'')+'</textarea>';

  const ppl=isP?[]:orgPeople(rec);

  m.innerHTML='<div class="mhead"><div><h2>'+esc(dispName(rec))+'</h2><span class="muted" style="font-size:11px">'+(isT?'Target':isA?'Advisor':'Person')+'</span></div><div style="display:flex;gap:8px;align-items:center">'+starHtml(rec)+' <button onclick="closeProfile()" style="background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer">×</button></div></div>'+
  '<div class="mbody"><div class="mcol-l">'+
    '<div class="pbox"><h4>Details</h4>'+detailL+'</div>'+
    '<div class="pbox"><h4>Lists</h4>'+listChips(rec)+'</div>'+
    (isP?'':'<div class="pbox"><h4>People <button class="sm" onclick="addPersonToOrg()">+ Add</button></h4>'+peopleBoxHtml(rec,ppl)+'</div>')+
    '<div class="pbox"><h4>Files <button class="sm" onclick="addLink()">+ Link</button></h4>'+filesHtml(rec)+'</div>'+
    (isT?'<div class="pbox"><h4>Deal maths</h4><div class="pgrid">'+fld('dm_e','EBITDA (€m)',rec.ebitda,'number')+fld('dm_m','Multiple',6,'number')+fld('dm_d','Debt %',60,'number')+fld('dm_r','Interest rate %',5,'number')+fld('dm_t','Tenor (yrs)',7,'number')+'</div><button class="sm primary" onclick="calcMaths()" style="margin-top:6px">Calculate</button><div id="dm_out" style="margin-top:8px"></div></div>':'')+
  '</div><div class="mcol-r">'+
    wrapUpHtml(rec)+
    '<div class="pbox"><h4>'+(isT?'Shared with':'Names you gave them')+(isT?' <button class="sm" onclick="addShare()">+ Add</button>':'')+'</h4>'+shareHtml(rec)+'</div>'+
    '<div class="pbox"><h4>Log activity</h4><div class="inline">'+selFld('la_type','Type',ACT_TYPES,'Call')+fld('la_date','Date',today(),'date')+fld('la_txt','Subject','')+'</div><label>Note</label><textarea id="la_note" rows="2"></textarea><div class="inline" style="margin-top:4px">'+fld('la_owe','I promised (becomes the open item)','')+fld('la_owe_by','By',addDays(today(),3),'date')+'</div><button class="sm primary" onclick="logActivity()" style="margin-top:4px">Log</button></div>'+
    '<div class="pbox"><h4>Activity timeline <span class="muted" style="font-weight:400">'+Object.keys(rec.touches||{}).length+' activities</span></h4>'+
      '<div class="tl-ctl">Period: <select onchange="setTlPeriod(+this.value)"><option value="13"'+(tlPeriod===13?' selected':'')+'>13 weeks</option><option value="26"'+(tlPeriod===26?' selected':'')+'>26 weeks</option><option value="52"'+(tlPeriod===52?' selected':'')+'>52 weeks</option></select> '+
      Object.keys(tlTypes).map(ty=>'<label><input type="checkbox" '+(tlTypes[ty]?'checked':'')+' onchange="toggleTlType(\''+ty+'\',this.checked)"> '+ty+'</label>').join(' ')+
      '</div><div style="height:160px"><canvas id="profTl"></canvas></div>'+
    '</div>'+
    '<div class="pbox" style="max-height:400px;overflow-y:auto"><h4>Contact history</h4>'+tlHtml(rec)+'</div>'+
  '</div></div>'+
  '<div style="padding:10px 18px;display:flex;gap:8px;justify-content:space-between;border-top:1px solid var(--lgray)"><div><button class="primary" onclick="saveProfile()">Save</button> <button onclick="closeProfile()">Cancel</button></div><button onclick="deleteRec()" style="border-color:var(--red);color:var(--red)">Delete</button></div>';

  document.getElementById('modalBg').classList.add('open');
  m.classList.add('open');
  drawTimeline(rec);
}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(document.getElementById('modal').classList.contains('open')){closeProfile();return}document.querySelectorAll('.open').forEach(el=>el.classList.remove('open'))});
export function closeProfile(){document.getElementById('modal').classList.remove('open');document.getElementById('modalBg').classList.remove('open');profRec=null}
export function saveProfile(){
  const r=profRec;if(!r)return;
  if(r.kind==='target'){
    r.name=gv('e_name')||r.name;
    const ns=gv('e_stage');if(ns!==r.stage){r.stage=ns;r.stageLog=r.stageLog||[];r.stageLog.push({stage:ns,date:today()})}
    r.geo=r.geo||'DE';r.revenue=+gv('e_rev')||null;r.ebitda=+gv('e_ebitda')||null;r.ebit=+gv('e_ebit')||null;
    const gm=+gv('e_gm');r.gm=gm?gm/100:null;
    r.channel=gv('e_chan');r.channelVia=gv('e_chvia');r.location=gv('e_loc');r.description=gv('e_desc');r.ownership=gv('e_own');r.flag=gv('e_flag');
    r.contact=gv('e_tcontact');r.email=gv('e_temail');r.phone=gv('e_tphone');r.mobile=gv('e_tmobile');r.domain=gv('e_tdomain');r.notes=gv('e_tnotes');
    r.score=gv('e_score')!==''?+gv('e_score'):(r.score??null);r.verdict=gv('e_verdict')||'';
    if(r.stage==='Dead'){r.deadCat=gv('e_dc');r.deadReason=gv('e_dr');r.revisitDate=gv('e_revd')}
  } else if(r.kind==='advisor'){
    r.firm=gv('e_firm')||r.firm;r.contact=gv('e_contact');r.email=gv('e_email');r.phone=gv('e_aphone');r.mobile=gv('e_amobile');r.domain=gv('e_domain');
    r.category=gv('e_cat');r.market=gv('e_market');r.geo=gv('e_geo2')||r.geo;r.status=gv('e_status');r.introPath=gv('e_intro');r.city=gv('e_city')||r.city||'';r.address=gv('e_addr')||r.address||'';
    r.notes=gv('e_notes');r.cadence=+gv('e_cad')||30;
  } else {
    r.name=gv('e_pname')||r.name;r.title=gv('e_ptitle');r.firm=gv('e_pfirm');r.email=gv('e_pemail');
    r.phone=gv('e_pphone');r.mobile=gv('e_pmobile');r.linkedin=gv('e_plinkedin');r.city=gv('e_pcity');r.angle=gv('e_pangle');
    r.networkPath=gv('e_ppath');r.ptype=gv('e_ptype');
  }
  splitPhones(r);
  r.priority=gv('e_prio');r.nextDate=gv('e_nd');const _na=gv('e_na');if(_na!==r.nextAction){r.nextSet=today()}r.nextAction=_na;
  // upsert into state
  if(r.kind==='target'&&!S.companies.find(c=>c.id===r.id))S.companies.push(r);
  if(r.kind==='advisor'&&!S.advisors.find(a=>a.id===r.id))S.advisors.push(r);
  if(r.kind==='person'&&!(S.people||[]).find(p=>p.id===r.id)){S.people=S.people||[];S.people.push(r)}
  save();closeProfile();renderAll();
}
export function deleteRec(){
  const r=profRec;if(!r)return;
  if(!confirm('Delete '+dispName(r)+'?'))return;
  S.companies=(S.companies||[]).filter(c=>c.id!==r.id);
  S.advisors=(S.advisors||[]).filter(a=>a.id!==r.id);
  S.people=(S.people||[]).filter(p=>p.id!==r.id);
  save();closeProfile();renderAll();
}
export function peopleBoxHtml(rec,ppl){
  // Primary contact in full, everyone else on one line each. Keeps a company with eight
  // contacts readable instead of eight equally loud blocks.
  const prim=ppl.find(p=>rec.contact&&normName(p.name)===normName(rec.contact));
  const rest=ppl.filter(p=>p!==prim);
  let out='';
  if(prim){
    out+='<div style="margin-bottom:6px;cursor:pointer" onclick="openProfile(findRec(\''+prim.id+'\'))"><b>'+esc(fixUml(prim.name))+'</b> <span class="chip">primary</span>'
      +(prim.title?'<div class="muted" style="font-size:11px">'+esc(prim.title)+'</div>':'')
      +(prim.email?'<div style="font-size:11px"><a href="mailto:'+esc(prim.email)+'" onclick="event.stopPropagation()">'+esc(prim.email)+'</a></div>':'')
      +(prim.phone?'<div class="muted" style="font-size:11px">'+esc(prim.phone)+'</div>':'')+'</div>';
  } else if(rec.contact){
    out+='<div style="margin-bottom:6px"><b>'+esc(fixUml(rec.contact))+'</b> <span class="chip">primary</span>'
      +(rec.email?'<div style="font-size:11px"><a href="mailto:'+esc(rec.email)+'">'+esc(rec.email)+'</a></div>':'')
      +'<div class="muted" style="font-size:10px">from the company record, no separate person record yet</div></div>';
  }
  if(rest.length){
    out+=(out?'<div style="border-top:1px solid #E8E8EC;margin:6px 0 5px"></div>':'')
      +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#595959;margin-bottom:3px">Also here ('+rest.length+')</div>'
      +rest.map(p=>'<div style="font-size:11px;margin-bottom:2px;cursor:pointer" onclick="openProfile(findRec(\''+p.id+'\'))"><b>'+esc(fixUml(p.name))+'</b>'+(p.email?' <span class="muted">'+esc(p.email)+'</span>':'')+(p.title?' <span class="muted">'+esc(p.title.slice(0,40))+'</span>':'')+'</div>').join('');
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
  // also log to linked org
  if(r.orgId){const org=findRec(r.orgId);if(org)addTouch(org,key,t)}
  if(owe){const line='Promised ('+type+' '+fmtD(date)+'): '+owe;r.nextAction=r.nextAction&&r.nextAction.trim()?r.nextAction.trim()+' | '+line:line;if(!r.nextDate||oweBy<r.nextDate)r.nextDate=oweBy;r.nextSet=today();invalidateThreads()}
  save();openProfile(r);toast(owe?'Logged, promise added to open item':'Activity logged');
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
