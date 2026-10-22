import {ACTIVE_STAGES, BOARD_COLS, CHANNELS, CH_DE, LETTER_TARGET_WEEK, LIVE, LS_DE, STAGES, ST_DE} from '../constants.js';
import {S, addTouch, cadenceOf, chanOf, dispName, findRec, fixUml, isDue, lastTouch, tType, touchList} from '../state.js';
import {addDays, daysAgo, daysBetween, esc, fmtDe, fmtM, toast, today, uid, weekStart} from '../util.js';
import {openProfile, profRec} from './record.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';

export let pipeView=null,pipeSort={},pipeExpand={},pipeMore={},pipeKpi='',pipeDragId=null;
export function chDe(c){return CH_DE[chanOf(c)]||chanOf(c)||'(kein Kanal)'}
export function cadChip(c){const cd=cadenceOf(c);if(!cd)return '';if(cd.replied)return '<span class="chch" style="background:#E3F1E4;color:#2E7D32">Antwort erhalten</span>';if(!cd.next)return '<span class="chch">Kadenz abgeschlossen</span>';const od=cd.next.due<=today();return '<span class="chch" title="Brief vom '+fmtDe(cd.sent)+'" style="'+(od?'background:#FBE3D6;color:#9A3B12':'')+'">'+cd.next.label+' bis '+fmtDe(cd.next.due)+'</span>'}
export function lsChip(c){if(c.letterSent)return '';const v=c.letterStatus;if(!v||!LS_DE[v])return '';return '<span class="chch" style="'+(v==='ready'?'background:#E3F1E4;color:#2E7D32':'')+'">'+LS_DE[v]+'</span>'}
export function dueDe(d,id){
  const edit=id?' onclick="event.stopPropagation();editDue(\''+id+'\',this)" title="Klicken zum Ändern"':'';
  if(!d)return id?'<span class="duechip" style="background:#EEF0F5;color:#595959"'+edit+'>kein Termin</span>':'';
  const n=-daysAgo(d);const t=n<0?Math.abs(n)+' T überfällig':n===0?'heute fällig':'in '+n+' T';const c=n<0?'var(--red)':n===0?'#C6943E':'#2E7D32';
  return '<span class="duechip" style="background:'+c+'22;color:'+c+'"'+edit+'>'+t+' · '+fmtDe(d)+'</span>'
}
export function editDue(id,el){
  const r=findRec(id);if(!r)return;
  const inp=document.createElement('input');inp.type='date';inp.value=r.nextDate||today();inp.style.cssText='font-size:11px;padding:1px 3px';
  inp.onclick=e=>e.stopPropagation();
  inp.onchange=()=>{r.nextDate=inp.value||'';r.nextSet=today();save();renderPipeline();toast('Fälligkeit '+(r.nextDate?fmtDe(r.nextDate):'entfernt'))};
  inp.onblur=()=>setTimeout(()=>{if(inp.parentNode)renderPipeline()},150);
  el.replaceWith(inp);inp.focus();try{inp.showPicker()}catch(e){}
}
export function shiftDue(id,days,ev){if(ev)ev.stopPropagation();const r=findRec(id);if(!r)return;r.nextDate=addDays(r.nextDate&&r.nextDate>today()?r.nextDate:today(),days);r.nextSet=today();save();renderPipeline()}
export function toggleFav(id,ev){if(id&&typeof id==='object'&&id.stopPropagation){const t=id;id=ev;ev=t}if(ev&&ev.stopPropagation)ev.stopPropagation();const r=findRec(id);if(!r)return;r.fav=!r.fav;save();renderAll();if(profRec&&profRec.id===id)openProfile(r)}
export function letterBox(rec){
  const cd=cadenceOf(rec);
  const st=cd?('Brief versendet am '+fmtDe(cd.sent)+(cd.via?' über '+esc(cd.via):'')+' · '+(cd.replied?'Antwort erhalten, Kadenz beendet':cd.next?'nächster Schritt: '+cd.next.label+' bis '+fmtDe(cd.next.due):'Kadenz abgeschlossen')):(LS_DE[rec.letterStatus]||'Noch kein Brief');
  const steps=cd?'<div style="font-size:11px;margin-top:4px">'+cd.steps.map(s=>(s.done?'&#10003; ':'&#9675; ')+s.label+' '+fmtDe(s.due)).join(' &nbsp; ')+'</div>':'';
  const b=(v,t)=>'<button class="sm'+(rec.letterStatus===v?' vbtn on':'')+'" onclick="setLetterStatus(\''+rec.id+'\',\''+v+'\')">'+t+'</button> ';
  return '<div style="margin-top:8px;padding:8px;border:1px solid #E3E5EC;border-radius:5px"><label style="margin:0">Brief und Kadenz</label><div style="font-size:12px">'+st+'</div>'+steps+
    '<div style="margin-top:6px">'+(cd?'':b('planned','Brief geplant')+b('ready','Brief entworfen'))+'<button class="sm" onclick="markLetterSent(\''+rec.id+'\')">Brief versendet...</button></div></div>';
}
export function setLetterStatus(id,v){const r=findRec(id);if(!r)return;r.letterStatus=r.letterStatus===v?'':v;save();if(document.getElementById('modal')&&document.getElementById('modal').style.display!=='none')openProfile(r);renderAll()}
export function toggleLetterReady(id){setLetterStatus(id,'ready')}
export function markLetterSent(id){
  const r=findRec(id);if(!r)return;
  const d=prompt('Datum des Briefversands (JJJJ-MM-TT):',today());if(d===null)return;
  const dt=/^\d{4}-\d{2}-\d{2}$/.test(d.trim())?d.trim():today();
  const via=prompt('Versendet über (leer lassen bei eigenem Brief, sonst z.B. Rettig Family Capital):',r.channel==='Partner letter'?(r.channelVia||''):'');if(via===null)return;
  const first=!r.letterSent;
  addTouch(r,'letter_'+dt+'_'+uid(),{date:dt+'T12:00:00Z',dir:'out',src:'Letter',subject:(first?'Erstbrief':'Folgebrief')+(via?' über '+via:''),who:r.contact||'',note:''});
  if(first){r.letterSent=dt;if(!r.channel||!CHANNELS.includes(r.channel))r.channel=via?'Partner letter':'Own letter';if(via)r.channelVia=via}
  else{const ds=daysBetween(r.letterSent,dt);r.cadDone=r.cadDone||{};if(ds>330)r.cadDone.l12=dt;else if(ds>150)r.cadDone.l6=dt}
  r.letterStatus='sent';
  if(r.stage==='Identified'){r.stage='Contacted';r.stageLog=r.stageLog||[];r.stageLog.push({stage:'Contacted',date:dt})}
  save();openProfile(r);renderAll();toast('Brief erfasst, Kadenz läuft');
}
export function pipeSetStage(id,ns){
  const r=findRec(id);if(!r||ns===r.stage)return;
  if(ns==='Dead'){const why=prompt('Grund der Absage (ein Satz):',r.deadReason||'');if(why===null)return;r.deadReason=why.trim()}
  if(ns==='On hold'){const why=prompt('Grund für Zurückstellen:',r.deadReason||'');if(why===null)return;r.deadReason=why.trim();const rv=prompt('Wiedervorlage (JJJJ-MM-TT):',r.revisitDate||addDays(today(),180));if(rv!==null&&/^\d{4}-\d{2}-\d{2}$/.test(rv.trim()))r.revisitDate=rv.trim()}
  r.stage=ns;r.stageLog=r.stageLog||[];r.stageLog.push({stage:ns,date:today()});
  save();renderAll();toast(fixUml(dispName(r))+' → '+(ST_DE[ns]||ns));
}
export function pipeDragStart(ev,id){pipeDragId=id;ev.dataTransfer.setData('text',id);ev.dataTransfer.effectAllowed='move'}
export function pipeDragOver(ev,el){ev.preventDefault();el.classList.add('dragover')}
export function pipeDrop(ev,el,target){
  ev.preventDefault();el.classList.remove('dragover');
  const id=ev.dataTransfer.getData('text')||pipeDragId;pipeDragId=null;const r=findRec(id);if(!r)return;
  if(target==='ready'){if(r.stage!=='Identified'){toast('Nur identifizierte Firmen können nach "Zu kontaktieren"');return}if(!r.letterStatus||r.letterStatus==='sent')r.letterStatus='planned';save();renderPipeline();return}
  pipeSetStage(id,target);
}
export function setPipeView(v){pipeView=v;try{localStorage.setItem('kxPipeView',v)}catch(e){}renderPipeline()}
export function setPipeKpi(k){pipeKpi=pipeKpi===k?'':k;renderPipeline()}
export function toggleWide(){const on=!document.body.classList.contains('wide');document.body.classList.toggle('wide',on);try{localStorage.setItem('kxWide',on?'1':'')}catch(e){}const b=document.getElementById('wideBtn');if(b)b.textContent=on?'Normale Breite':'Breite Ansicht'}
export function pipeSortClick(tid,k){const p=pipeSort[tid]||{};pipeSort[tid]={k,d:p.k===k?-(p.d||1):1};renderPipeline()}
export function pTable(tid,cols,items,limit){
  const st=pipeSort[tid];
  if(st){const col=cols.find(c=>c.k===st.k);if(col)items=[...items].sort((a,b)=>{const x=col.v(a),y=col.v(b);return (x==null||x==='')-(y==null||y==='')||(typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*st.d})}
  const shown=limit&&!pipeMore[tid]?items.slice(0,limit):items;
  return '<table class="ps"><tr>'+cols.map(c=>'<th style="'+(c.w?'width:'+c.w+';':'')+(c.num?'text-align:right':'')+'" onclick="pipeSortClick(\''+tid+'\',\''+c.k+'\')">'+c.t+(st&&st.k===c.k?(st.d>0?' &#9650;':' &#9660;'):'')+'</th>').join('')+'</tr>'+
    shown.map(r=>'<tr class="rowlink" onclick="openProfile(findRec(\''+r.id+'\'))">'+cols.map(c=>'<td'+(c.num?' style="text-align:right"':'')+(c.muted?' class="muted"':'')+'>'+c.h(r)+'</td>').join('')+'</tr>').join('')+'</table>'+
    (limit&&items.length>limit?'<div style="padding:6px 10px"><button class="sm" onclick="pipeMore[\''+tid+'\']=!pipeMore[\''+tid+'\'];renderPipeline()">'+(pipeMore[tid]?'Weniger zeigen':'Alle '+items.length+' zeigen')+'</button></div>':'');
}
export function cardSort(a,b){const od=x=>isDue(x)?0:1;return od(a)-od(b)||(b.fav?1:0)-(a.fav?1:0)||(a.nextDate||'9').localeCompare(b.nextDate||'9')||dispName(a).localeCompare(dispName(b))}
export function staleTxt(c){const lt=lastTouch(c);if(!lt)return '';const n=daysAgo(lt);return n>30?'<span class="muted" style="font-size:10px"> · letzter Kontakt vor '+n+' T</span>':''}
export function bCard(c){
  const ch=chanOf(c);
  return '<div class="bcard'+(isDue(c)?' due':'')+'" draggable="true" ondragstart="pipeDragStart(event,\''+c.id+'\')" onclick="openProfile(findRec(\''+c.id+'\'))">'+
    '<div class="nm"><span class="star'+(c.fav?' on':'')+'" onclick="toggleFav(\''+c.id+'\',event)" title="Markieren">&#9733;</span> '+esc(fixUml(dispName(c)))+'</div>'+
    '<div class="muted">'+(c.ebit!=null&&c.ebit!==''?'EBIT '+fmtM(c.ebit):'')+(c.revenue?' · Umsatz '+fmtM(c.revenue):'')+(c.location?' · '+esc(c.location):'')+'</div>'+
    (ch?'<span class="chch">'+esc(chDe(c))+(c.channelVia&&(ch==='Partner letter'||ch==='M&A house / advisor'||ch==='Tax adviser / auditor'||ch==='Trade fair')?': '+esc(c.channelVia.split(/[ (]/)[0]):'')+'</span> ':'')+lsChip(c)+cadChip(c)+
    (c.nextAction?'<div class="na">'+esc(c.nextAction)+'</div>':(['Contacted','Replied','Meeting','NDA','LOI','Diligence'].includes(c.stage)&&!cadenceOf(c)?'<div class="na" style="color:#9A3B12">Kein nächster Schritt hinterlegt</div>':''))+
    '<div style="margin-top:3px">'+dueDe(c.nextDate,c.id)+' <span class="mini" onclick="shiftDue(\''+c.id+'\',7,event)" title="eine Woche später">+1W</span><span class="mini" onclick="shiftDue(\''+c.id+'\',30,event)" title="einen Monat später">+1M</span>'+staleTxt(c)+'</div></div>'
}
export function renderPipeline(){
  if(!pipeView){try{pipeView=localStorage.getItem('kxPipeView')||'board'}catch(e){pipeView='board'}try{if(localStorage.getItem('kxWide')==='1'&&!document.body.classList.contains('wide'))toggleWide()}catch(e){}}
  document.querySelectorAll('#p-pipeline .vbtn').forEach(b=>b.classList.toggle('on',b.dataset.v===pipeView));
  const cs=(S.companies||[]).filter(c=>c.kind!=='advisor'&&!c.archived);
  const fc=document.getElementById('fChan');if(fc&&fc.options.length<2)fc.innerHTML='<option value="">Alle Kanäle</option>'+CHANNELS.filter(Boolean).map(c=>'<option value="'+c+'">'+(CH_DE[c]||c)+'</option>').join('');
  const q=(document.getElementById('fSearch').value||'').toLowerCase(),fch=fc?fc.value:'',onlyFav=!!(document.getElementById('fFav')||{}).checked;
  const t=today(),ws=weekStart(t);
  const LIVE=ACTIVE_STAGES;
  const base=cs.filter(c=>(!q||(c.name||'').toLowerCase().includes(q)||(c.location||'').toLowerCase().includes(q))&&(!fch||chanOf(c)===fch)&&(!onlyFav||c.fav));
  const isReady=c=>c.stage==='Identified'&&(c.letterStatus==='ready'||c.letterStatus==='planned'||c.fav);
  const lettersWeek=cs.reduce((n,c)=>n+touchList(c).filter(x=>tType(x)==='Letter'&&x.dir!=='in'&&(x.date||'').slice(0,10)>=ws).length,0);
  const kdef=[
    {k:'live',t:'Live',f:c=>LIVE.includes(c.stage)},
    {k:'due',t:'Fällig',f:c=>(LIVE.includes(c.stage)||isReady(c))&&isDue(c),warn:1},
    {k:'nonext',t:'Ohne nächsten Schritt',f:c=>LIVE.includes(c.stage)&&!c.nextAction&&!(cadenceOf(c)&&cadenceOf(c).next),warn:1},
    {k:'replied',t:'Antwort oder weiter',f:c=>LIVE.includes(c.stage)&&c.stage!=='Contacted'},
    {k:'ready',t:'Zu kontaktieren',f:isReady},
    {k:'letters',t:'Briefe diese Woche',v:lettersWeek+' / '+LETTER_TARGET_WEEK,f:c=>touchList(c).some(x=>tType(x)==='Letter'&&x.dir!=='in'&&(x.date||'').slice(0,10)>=ws)}
  ];
  document.getElementById('pipeKpis').innerHTML=kdef.map(x=>{const n=base.filter(x.f).length;return '<div class="kpi'+(x.warn&&n?' warn':'')+(pipeKpi===x.k?' on':'')+'" onclick="setPipeKpi(\''+x.k+'\')" title="Klicken filtert die Ansicht"><div class="v">'+(x.v||n)+'</div><div class="l">'+x.t+'</div></div>'}).join('');
  const kf=kdef.find(x=>x.k===pipeKpi);
  const list=kf?base.filter(kf.f):base;
  const active=list.filter(c=>LIVE.includes(c.stage));
  const ready=list.filter(isReady);
  const stageSel=c=>'<select class="stagesel" onclick="event.stopPropagation()" onchange="pipeSetStage(\''+c.id+'\',this.value)">'+STAGES.map(s=>'<option value="'+s+'"'+(s===c.stage?' selected':'')+'>'+(ST_DE[s]||s)+'</option>').join('')+'</select>';
  const lsSel=c=>'<select class="stagesel" onclick="event.stopPropagation()" onchange="setLetterStatus(\''+c.id+'\',this.value)"><option value="">kein Brief</option><option value="planned"'+(c.letterStatus==='planned'?' selected':'')+'>geplant</option><option value="ready"'+(c.letterStatus==='ready'?' selected':'')+'>entworfen</option></select>';
  const C={
    name:{k:'name',t:'Firma',w:'22%',v:c=>dispName(c),h:c=>'<span class="star'+(c.fav?' on':'')+'" onclick="toggleFav(\''+c.id+'\',event)">&#9733;</span> <b>'+esc(fixUml(dispName(c)))+'</b>'},
    loc:{k:'loc',t:'Ort',v:c=>c.location||'',h:c=>esc(c.location||''),muted:1},
    ebit:{k:'ebit',t:'EBIT',num:1,v:c=>c.ebit==null||c.ebit===''?null:+c.ebit,h:c=>fmtM(c.ebit),muted:1},
    rev:{k:'rev',t:'Umsatz',num:1,v:c=>c.revenue==null||c.revenue===''?null:+c.revenue,h:c=>fmtM(c.revenue),muted:1},
    score:{k:'score',t:'Score',num:1,v:c=>c.score==null||c.score===''?null:+c.score,h:c=>c.score!=null&&c.score!==''?Math.round(c.score):'-',muted:1},
    verdict:{k:'verdict',t:'Verdikt',v:c=>c.verdict||'',h:c=>esc(c.verdict||''),muted:1},
    stage:{k:'stage',t:'Stufe',v:c=>STAGES.indexOf(c.stage),h:c=>stageSel(c)},
    ls:{k:'ls',t:'Brief',v:c=>c.letterStatus||'',h:c=>lsSel(c)},
    chan:{k:'chan',t:'Kanal',v:c=>chanOf(c),h:c=>esc(chDe(c))+(c.channelVia?'<div class="muted" style="font-size:10px">'+esc(c.channelVia.slice(0,40))+'</div>':''),muted:1},
    next:{k:'next',t:'Nächster Schritt',w:'32%',v:c=>c.nextAction||'',h:c=>esc(c.nextAction||'')+' '+cadChip(c)},
    due:{k:'due',t:'Fällig',v:c=>c.nextDate||'9999',h:c=>dueDe(c.nextDate,c.id)},
    last:{k:'last',t:'Letzter Kontakt',v:c=>lastTouch(c)||'',h:c=>{const d=lastTouch(c);return d?fmtDe(d)+' <span style="font-size:10px">('+daysAgo(d)+' T)</span>':'-'},muted:1},
    days:{k:'days',t:'Tage in Stufe',num:1,v:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l&&l.date?daysAgo(l.date):null},h:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l&&l.date?daysAgo(l.date):'-'},muted:1},
    reason:{k:'reason',t:'Grund',w:'36%',v:c=>c.deadReason||c.flag||'',h:c=>esc(c.deadReason||c.lastSummary||c.flag||'')},
    revisit:{k:'revisit',t:'Wiedervorlage',v:c=>c.revisitDate||'9999',h:c=>c.revisitDate?fmtDe(c.revisitDate):'-',muted:1},
    when:{k:'when',t:'Datum',v:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l?l.date:''},h:c=>{const l=(c.stageLog||[]).slice(-1)[0];return l?fmtDe(l.date):'-'},muted:1}
  };
  const sec=(id,title,items,cols,limit,open)=>'<details class="psec"'+(open||pipeExpand[id]?' open':'')+' ontoggle="pipeExpand[\''+id+'\']=this.open"><summary>'+title+' <span style="font-weight:400">('+items.length+')</span></summary>'+(items.length?pTable(id,cols,items,limit):'<p class="muted" style="padding:6px 10px">Keine.</p>')+'</details>';
  const idl=list.filter(c=>c.stage==='Identified'&&!isReady(c)),hold=list.filter(c=>c.stage==='On hold'),dead=list.filter(c=>c.stage==='Dead'),closed=list.filter(c=>c.stage==='Closed');
  const lower=sec('idl','Identifiziert, noch nicht angesprochen',idl,[C.name,C.loc,C.rev,C.ebit,C.score,C.verdict,C.ls,C.next],50)+
    sec('hold','Zurückgestellt',hold,[C.name,C.loc,C.ebit,C.chan,C.reason,C.revisit,C.when],50)+
    sec('dead','Absage',dead,[C.name,C.loc,C.ebit,C.chan,C.reason,C.when],50)+(closed.length?sec('closed','Abgeschlossen',closed,[C.name,C.ebit,C.when],0):'');
  let body='';
  if(pipeView==='focus'){
    const fl=[...new Map([...active,...ready,...list.filter(c=>c.fav&&c.stage!=='Dead')].map(c=>[c.id,c])).values()];
    if(!pipeSort.focus)fl.sort(cardSort);
    body='<div class="section">'+pTable('focus',[C.name,C.stage,C.chan,C.ebit,C.next,C.due,C.last,C.days],fl,0)+'</div>'+lower;
  }else if(pipeView==='channel'){
    const rows=CHANNELS.filter(Boolean).concat(['']).map(ch=>{const g=list.filter(c=>(chanOf(c)||'')===ch&&c.stage!=='Identified');const rep=g.filter(c=>['Replied','Meeting','NDA','LOI','Diligence','Closed'].includes(c.stage)||(c.stageLog||[]).some(l=>['Replied','Meeting','NDA','LOI'].includes(l.stage))).length;return {ch,g,appr:g.length,rep,meet:g.filter(c=>(c.stageLog||[]).some(l=>['Meeting','NDA','LOI','Diligence','Closed'].includes(l.stage))).length,pass:g.filter(c=>c.stage==='Dead').length,hold:g.filter(c=>c.stage==='On hold').length}}).filter(x=>x.appr);
    body='<div class="section"><table class="ps"><tr><th>Kanal</th><th style="text-align:right">Angeschrieben</th><th style="text-align:right">Antwort</th><th style="text-align:right">Quote</th><th style="text-align:right">Gespräch+</th><th style="text-align:right">Zurückgestellt</th><th style="text-align:right">Absage</th><th>Firmen</th></tr>'+rows.map(x=>'<tr><td><b>'+esc(CH_DE[x.ch]||x.ch)+'</b></td><td style="text-align:right">'+x.appr+'</td><td style="text-align:right">'+x.rep+'</td><td style="text-align:right">'+(x.appr?Math.round(100*x.rep/x.appr)+'%':'-')+'</td><td style="text-align:right">'+x.meet+'</td><td style="text-align:right">'+x.hold+'</td><td style="text-align:right">'+x.pass+'</td><td style="font-size:11px">'+x.g.slice(0,60).map(c=>'<a href="#" onclick="openProfile(findRec(\''+c.id+'\'));return false">'+esc(fixUml(dispName(c)))+'</a> <span class="muted">('+(ST_DE[c.stage]||c.stage)+')</span>').join(', ')+'</td></tr>').join('')+'</table></div>'+lower;
  }else{
    const colItems=k=>k==='ready'?ready:list.filter(c=>c.stage===k);
    body='<div class="board">'+BOARD_COLS.map(col=>{const its=colItems(col.k).sort(cardSort);const lim=pipeExpand['b_'+col.k]?its.length:8;return '<div class="bcol" ondragover="pipeDragOver(event,this)" ondragleave="this.classList.remove(\'dragover\')" ondrop="pipeDrop(event,this,\''+col.k+'\')"><h5>'+col.t+' <span style="font-weight:400;color:#595959">'+its.length+'</span></h5>'+its.slice(0,lim).map(bCard).join('')+(its.length>8?'<button class="sm" style="width:100%" onclick="pipeExpand[\'b_'+col.k+'\']=!pipeExpand[\'b_'+col.k+'\'];renderPipeline()">'+(pipeExpand['b_'+col.k]?'Weniger zeigen':'+'+(its.length-8)+' weitere')+'</button>':'')+'</div>'}).join('')+'</div>'+
      '<div class="dropbar"><div class="dropz" ondragover="pipeDragOver(event,this)" ondragleave="this.classList.remove(\'dragover\')" ondrop="pipeDrop(event,this,\'On hold\')">Karte hierher ziehen: Zurückstellen (mit Grund und Wiedervorlage)</div><div class="dropz" ondragover="pipeDragOver(event,this)" ondragleave="this.classList.remove(\'dragover\')" ondrop="pipeDrop(event,this,\'Dead\')">Karte hierher ziehen: Absage (mit Grund)</div></div>'+lower;
  }
  document.getElementById('pipeBody').innerHTML=body;
}

export function dropCard(ev,colEl){
  ev.preventDefault();colEl.classList.remove('dragover');
  const id=ev.dataTransfer.getData('text');const c=findRec(id);if(!c)return;
  const ns=colEl.dataset.stage;
  if(ns!==c.stage){c.stageLog=c.stageLog||[];c.stageLog.push({stage:ns,date:today()});c.stage=ns;save();renderAll()}
}
