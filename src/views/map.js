import {S, allOrgs, allRecs, dispName, findRec, fixUml, lastTouch, liveOnly, orgPeople, personOrg} from '../state.js';
import {daysAgo, esc, normName, toast} from '../util.js';
import {save} from '../store/firebase.js';


// ═══════════════════════════════════════════════════════════════
// RENDER ALL + INIT
// ═══════════════════════════════════════════════════════════════
export function cleanCity(s){
  s=(s||'').trim(); if(!s)return '';
  s=s.split(/\s*[\/;,|]\s*| und | & | \+ /)[0].trim();
  s=s.replace(/\s*\(.*?\)\s*/g,' ')
     .replace(/\s+i\.?\s*d\.?\s+\S+$/i,'')
     .replace(/\s+(i\.|im)\s+\S+$/i,'')
     .replace(/\s{2,}/g,' ').trim();
  return s;
}
export function recCity(r){return cleanCity(r.city||r.location||'')}
export function locFocus(c){const g=cityLL(c);if(!g||!locMap){toast('Kein Geocode für '+c);return}locMap.setView(g,12);document.getElementById('locMap').scrollIntoView({behavior:'smooth',block:'start'})}
export function cityLL(c){return (S.geoCache||{})[(c||'').toLowerCase()]||null}
export function addrKey(r){if(!r)return null;const a=(r.address||'').trim();if(!a||!/\d/.test(a))return null;const c=cleanCity(r.city||r.location||'');return ('addr:'+a+(c&&!a.toLowerCase().includes(c.toLowerCase())?', '+c:'')).toLowerCase().replace(/[.#$\/\[\]]/g,'_')}
export function addrQuery(r){let a=(r.address||'').split(/[;|]|\.\s*Weitere|\s+Weitere Standorte/i)[0].replace(/\(.*?\)/g,'').trim();const city=cleanCity(r.city||r.location||'');if(city&&!a.toLowerCase().includes(city.toLowerCase()))a+=', '+city;const ctry=(r.geo&&r.geo!=='DE')?({CH:'Switzerland',AT:'Austria',UK:'United Kingdom',FR:'France',NL:'Netherlands',LU:'Luxembourg',US:'USA'}[r.geo]||''):'Germany';return a+(ctry?', '+ctry:'')}
export function addrLL(r){const k=addrKey(r);return k?((S.geoCache||{})[k]||null):null}
export function distKm(a,b){const R=6371,t=x=>x*Math.PI/180;
  const dLat=t(b[0]-a[0]),dLon=t(b[1]-a[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(t(a[0]))*Math.cos(t(b[0]))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));}
export const MEET_RE=/kaffee|coffee|treffen|pers[oö]nlich|vorbeikommen|besuch|vor ort|wenn ich (da|dort|in)\b|sobald ich|lunch|mittagessen|meet in person|come by|drop by|in t[oó]uch once/i;
export function meetSignal(r){return MEET_RE.test(((r.nextAction||'')+' '+(r.notes||'')+' '+(r.detail||'')+' '+(r.lastSummary||'')))}
export function nearRecords(city,km){
  const ll=cityLL(city); if(!ll)return null;
  const out=[];
  locGroups('').forEach(g=>{
    // distance = nearest of the org city and its people's cities
    const cities=[g.city].concat(g.people.map(recCity)).filter(Boolean);
    let best=null,bc='';
    cities.forEach(c=>{const ge=cityLL(c);if(!ge)return;const d=distKm(ll,ge);if(best===null||d<best){best=d;bc=c}});
    if(best===null||best>km)return;
    const r=g.rec;
    const open=!!((r.nextAction&&r.nextAction.trim())||g.people.some(p=>p.nextAction&&p.nextAction.trim()));
    const meet=meetSignal(r)||g.people.some(meetSignal);
    const lts=[lastTouch(r)].concat(g.people.map(lastTouch)).filter(Boolean).sort().reverse();
    out.push({r,g,city:bc,km:Math.round(best),open,meet,lt:lts[0]||null});
  });
  out.sort((a,b)=>(b.meet-a.meet)||(b.open-a.open)||(a.km-b.km));
  return out;
}
export function nearbyBriefing(){
  const city=cleanCity(document.getElementById('locNear').value);
  const km=+document.getElementById('locKm').value||75;
  const onlyOpen=document.getElementById('locOnlyOpen').checked;
  const box=document.getElementById('locNearOut');
  if(!city){box.innerHTML='<p class="muted" style="padding:12px">Ort eingeben.</p>';return}
  let rows=nearRecords(city,km);
  if(rows===null){box.innerHTML='<p class="muted" style="padding:12px">'+esc(city)+' ist noch nicht geocodiert. Erst auf "Geocode new cities" klicken.</p>';return}
  if(onlyOpen)rows=rows.filter(x=>x.open);
  if(!rows.length){box.innerHTML='<p class="muted" style="padding:12px">Nobody within '+km+' km.</p>';return}
  const GRP=x=>x.r.kind==='target'?'Zielunternehmen':x.r.kind==='advisor'?'Berater und Partner':'Kontakte';
  const g={};rows.forEach(x=>{(g[GRP(x)]=g[GRP(x)]||[]).push(x)});
  let html='',txt='Within '+km+' km of '+city+':\n';
  ['Zielunternehmen','Berater und Partner','Kontakte'].forEach(k=>{
    if(!g[k])return;
    html+='<div style="padding:8px 12px;border-bottom:1px solid #E8E8EC"><b>'+k+' ('+g[k].length+')</b></div>';
    txt+='\n'+k+':\n';
    g[k].forEach(x=>{
      const age=x.lt?daysAgo(x.lt)+' Tage her':'kein Kontakt';
      const na=(x.r.nextAction&&x.r.nextAction.trim())||(x.g.people.map(p=>p.nextAction||'').find(s=>s.trim()))||'';
      const ppl=x.g.people.map(p=>'<span style="cursor:pointer" onclick="openProfile(findRec(\''+p.id+'\'))">'+esc(fixUml(p.name))+(p.title?' <span class="muted">('+esc(fixUml(p.title))+')</span>':'')+'</span>').join(', ');
      const who=ppl||(x.g.contact?'<span class="muted">'+esc(fixUml(x.g.contact))+'</span>':'');
      html+='<div style="padding:7px 12px;border-bottom:1px solid #F2F2F5;border-left:4px solid '+x.g.cat[1]+'">'
        +'<span style="cursor:pointer;font-weight:600" onclick="openProfile(findRec(\''+x.r.id+'\'))">'+esc(x.g.name)+'</span>'
        +' <span class="chip" style="background:'+x.g.cat[1]+';color:#fff">'+esc(x.g.cat[0])+'</span>'
        +(who?' '+who:'')
        +' <span class="chip">'+esc(x.city)+' · '+x.km+' km</span>'
        +(x.meet?' <span class="chip" style="background:#C00000;color:#fff">Treffen offen</span>':'')
        +' <span class="muted" style="font-size:11px">'+age+'</span>'
        +(na?'<div class="muted" style="font-size:12px;margin-top:2px">'+esc(na.slice(0,170))+'</div>':'')
        +'</div>';
      const names=x.g.people.map(p=>fixUml(p.name)).join(', ')||fixUml(x.g.contact||'');
      txt+='- '+x.g.name+(names?' ('+names+')':'')+', '+x.city+', '+x.km+' km, '+age
        +(x.meet?' [Treffen offen]':'')+(na?'\n  offen: '+na.slice(0,170):'')+'\n';
    });
  });
  window.__brief=txt;
  box.innerHTML=html;
}
export function copyBriefing(){
  if(!window.__brief){toast('Erst "Zeigen" klicken');return}
  navigator.clipboard.writeText(window.__brief).then(()=>toast('Briefing kopiert'),()=>toast('Kopieren blockiert'));
}
export function renderClusters(){
  const box=document.getElementById('locClusters'); if(!box)return;
  const km=+((document.getElementById('locKm')||{}).value)||75;
  const tg=allRecs().filter(r=>r.kind==='target'&&r.stage!=='Dead'&&cityLL(recCity(r)));
  const seen={},rows=[];
  tg.forEach(r=>{const c=recCity(r); if(seen[c])return; seen[c]=1;
    const near=nearRecords(c,km)||[];
    const t=near.filter(x=>x.r.kind==='target'&&x.r.stage!=='Dead');
    const a=near.filter(x=>x.r.kind!=='target');
    if(t.length>=3)rows.push({c,t,a});
  });
  rows.sort((x,y)=>y.t.length-x.t.length);
  box.innerHTML=rows.length?rows.slice(0,10).map(x=>
    '<div style="padding:8px 12px;border-bottom:1px solid #E8E8EC"><b>'+esc(x.c)+'</b> '
    +'<span class="chip" style="background:#C00000;color:#fff">'+x.t.length+' Ziele</span> '
    +'<span class="chip">'+x.a.length+' Kontakte</span> '
    +'<button class="sm" onclick="document.getElementById(\'locNear\').value=\''+esc(x.c).replace(/'/g,"")+'\';nearbyBriefing();">Briefing</button>'
    +'<div class="muted" style="font-size:12px;margin-top:3px">'+x.t.slice(0,6).map(y=>esc(dispName(y.r))).join(' · ')+(x.t.length>6?' …':'')+'</div></div>'
  ).join(''):'<p class="muted" style="padding:12px">No region with three or more targets within '+km+' km yet.</p>';
}
export let locMap=null,locLayer=null;
// Colour and label per record category. Used by the map markers, the region list and the nearby briefing.
export function locParty(r){
  if(!r)return ['Contact','#434F80'];
  return r.kind==='target'?['Target','#C00000']:
    r.kind==='person'?['Contact','#434F80']:
    r.category==='M&A sourcing intermediaries'?['M&A advisor','#2E3C65']:
    r.category==='Financing partners'?['Financing','#2E7D32']:
    r.category==='Investors & family office'?['Investor / FO','#7030A0']:
    r.category==='DD advisors'?['DD / industry advisor','#C6943E']:
    r.category==='HR, universities & interns'?['HR / interns','#FFC000']:
    r.category==='Admin & infrastructure'?['Admin','#595959']:
    r.category==='Personal network'?['Personal','#A9A4C6']:['Other','#8C97B8'];
}
// Where an organisation sits: its own city, else the city of the first linked person who has one.
export function effCity(r){
  const c=recCity(r);if(c||r.kind==='person')return c;
  const p=orgPeople(r).find(x=>recCity(x));return p?recCity(p):'';
}
// One group per firm: a real org record with its people folded in, or the people who share a firm text, or a lone person.
// Each group: {key, rec (org or lead person), org, name, city, cat:[label,colour], contact, people:[person records]}
export function locGroups(kindFilter){
  const groups={},order=[];
  const add=(key,g)=>{if(!groups[key]){groups[key]=g;order.push(key)}return groups[key]};
  const wantOrg=!kindFilter||kindFilter!=='person';
  const wantPerson=!kindFilter||kindFilter==='person';
  if(wantOrg)allOrgs().forEach(o=>{
    if(kindFilter&&o.kind!==kindFilter)return;
    const c=effCity(o);if(!c)return;
    add('o:'+o.id,{key:'o:'+o.id,rec:o,org:o,name:dispName(o),city:c,cat:locParty(o),contact:o.contact||'',people:[]});
  });
  liveOnly(S.people||[]).forEach(p=>{
    const pc=recCity(p);if(!pc)return;
    const o=personOrg(p);
    if(o&&wantOrg&&(!kindFilter||o.kind===kindFilter)){
      const g=add('o:'+o.id,{key:'o:'+o.id,rec:o,org:o,name:dispName(o),city:effCity(o)||pc,cat:locParty(o),contact:o.contact||'',people:[]});
      g.people.push(p);if(!g.contact)g.contact=p.name;return;
    }
    if(!wantPerson)return;
    if(o)return; // belongs to an org of another kind than the filter
    const fn=normName(p.firm||'');
    const key=fn?'f:'+fn+'|'+pc.toLowerCase():'p:'+p.id;
    const g=add(key,{key,rec:p,org:null,name:p.firm?fixUml(p.firm):dispName(p),city:pc,cat:locParty(p),contact:'',people:[]});
    g.people.push(p);if(!g.contact)g.contact=p.name;
  });
  return order.map(k=>groups[k]);
}
export function groupLabel(g){const who=g.contact?fixUml(g.contact):'';return who&&who!==g.name?fixUml(g.name)+' · '+who:fixUml(g.name)}
export function groupChip(g){return '<span class="chip" title="'+esc(g.cat[0])+'" style="cursor:pointer;background:'+g.cat[1]+';color:#fff" onclick="openProfile(findRec(\''+g.rec.id+'\'))">'+esc(groupLabel(g))+'</span>'}

// One label for every record: the person and the organisation they belong to.
export function recLabel(r){
  if(r.kind==='person'){const o=r.orgId?findRec(r.orgId):null;const firm=(o?dispName(o):r.firm)||'';return firm?fixUml(dispName(r))+' / '+fixUml(firm):fixUml(dispName(r))}
  const p=orgPeople(r)[0];
  const who=r.contact||(p&&p.name)||'';
  return who?fixUml(who)+' / '+fixUml(dispName(r)):fixUml(dispName(r));
}
// Cluster cities that sit within roughly `km` of each other so the list is regions, not 200 single entries.
export function clusterCities(byCity,km){
  const cache=S.geoCache||{};
  const inDE=g=>g&&g[0]>=47&&g[0]<=55.2&&g[1]>=5.5&&g[1]<=15.2;
  const pts=Object.keys(byCity).map(c=>({c,g:cache[c.toLowerCase()]}));
  const R=6371,rad=x=>x*Math.PI/180;
  const dist=(a,b)=>{const dLat=rad(b[0]-a[0]),dLon=rad(b[1]-a[1]);const h=Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
  const clusters=[];const abroad={head:'Abroad',cities:[],geo:null};const unknown={head:'No location yet',cities:[],geo:null};
  pts.sort((a,b)=>byCity[b.c].length-byCity[a.c].length).forEach(p=>{
    if(!p.g){unknown.cities.push(p.c);return}
    if(!inDE(p.g)){abroad.cities.push(p.c);return}
    const hit=clusters.find(cl=>cl.geo&&dist(cl.geo,p.g)<=km);
    if(hit)hit.cities.push(p.c); else clusters.push({head:p.c,cities:[p.c],geo:p.g});
  });
  if(abroad.cities.length)clusters.push(abroad);
  if(unknown.cities.length)clusters.push(unknown);
  return clusters.map(cl=>({
    head:cl.head,
    cities:cl.cities,
    recs:cl.cities.reduce((a,c)=>a.concat(byCity[c]),[])
  })).sort((a,b)=>b.recs.length-a.recs.length);
}
export function setLocRadius(v){S.locRadius=+v;save();renderLocations()}
export function renderLocations(){
  const kind=document.getElementById('locKind').value;
  const groups0=locGroups(kind);
  const nPeople=groups0.reduce((a,g)=>a+g.people.length,0);
  document.getElementById('locCount').textContent=groups0.length+' firms and contacts with a city ('+nPeople+' people folded into their firms)';
  const byCity={};groups0.forEach(g=>{(byCity[g.city]=byCity[g.city]||[]).push(g)});
  const cities=Object.keys(byCity).sort((a,b)=>byCity[b].length-byCity[a].length);
  const km=S.locRadius||100;
  const groups=clusterCities(byCity,km);
  const ctl='<div style="padding:8px 12px;border-bottom:1px solid #E8E8EC;font-size:11px">Region size '
    +'<select onchange="setLocRadius(this.value)">'+[50,75,100,150,200].map(v=>'<option value="'+v+'"'+(km===v?' selected':'')+'>'+v+' km</option>').join('')+'</select>'
    +' <span class="muted">'+groups.length+' regions from '+Object.keys(byCity).length+' places</span></div>';
  const catOrder=g=>g.cat[0]==='Target'?0:g.cat[0]==='Contact'?9:1;
  document.getElementById('locList').innerHTML=ctl+(groups.map(g=>'<div style="padding:8px 12px;border-bottom:1px solid #E8E8EC"><b style="cursor:pointer;text-decoration:underline dotted" title="Auf der Karte zeigen" onclick="locFocus(\''+esc(g.head).replace(/'/g,"\\'")+'\')">'+esc(g.head)+'</b> <span class="muted">('+g.recs.length+')</span>'+(g.cities.length>1?' <span class="muted" style="font-size:10px">incl. '+esc(g.cities.filter(c=>c!==g.head).join(', '))+'</span>':'')+'<br>'+g.recs.slice().sort((a,b)=>catOrder(a)-catOrder(b)||a.name.localeCompare(b.name)).map(groupChip).join(' ')+'</div>').join('')||'<p class="muted" style="padding:12px">No records with a city yet.</p>');
  if(typeof L==='undefined')return;
  if(!locMap){locMap=L.map('locMap').setView([51.1,10.3],6);locMap.setMaxBounds([[46.5,4.5],[55.5,16.5]]);locMap.setMinZoom(5);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(locMap)}
  if(locLayer)locLayer.remove();locLayer=L.layerGroup().addTo(locMap);
  S.geoCache=S.geoCache||{};
  let plotted=0;const pts=[];
  cities.forEach(c=>{
    const g=S.geoCache[c.toLowerCase()];if(!g)return;
    if(!(g[0]>=47&&g[0]<=55.2&&g[1]>=5.5&&g[1]<=15.2))return;
    plotted++;pts.push(g);
    byCity[c].forEach((gr,i)=>{
      const n=byCity[c].length;
      const ang=2*Math.PI*i/Math.max(n,1);
      const off=n>1?0.012:0;
      const [lbl,col]=gr.cat;
      const ex=addrLL(gr.rec);const pos=ex?ex:[g[0]+off*Math.sin(ang),g[1]+off*Math.cos(ang)];
      const m=L.circleMarker(pos,{radius:ex?7:8,color:ex?'#000':'#fff',weight:1.5,fillColor:col,fillOpacity:0.92}).addTo(locLayer);
      const ppl=gr.people.map(p=>fixUml(p.name)).join(', ')||fixUml(gr.contact||'');
      m.bindPopup('<b>'+esc(gr.name)+'</b><br><span style="color:'+col+';font-weight:700">'+lbl+'</span> · '+esc(c)+(ppl?'<br>'+esc(ppl):'')+(ex?'<br><span style="font-size:10px">'+esc(gr.rec.address||'')+'</span>':'<br><span style="font-size:10px;color:#595959">nur Ort bekannt, keine Straßenadresse im CRM</span>')+'<br><a href="#" onclick="openProfile(findRec(\''+gr.rec.id+'\'));return false">Open profile →</a>');
    });
  });
  if(!locMap._legend){
    const lg=L.control({position:'bottomright'});
    lg.onAdd=function(){
      const d=L.DomUtil.create('div');
      d.style.cssText='background:#fff;padding:8px 12px;border:1px solid #D3D3D2;border-radius:4px;font:11px Arial;line-height:1.7';
      d.innerHTML=[['Target','#C00000'],['M&A advisor','#2E3C65'],['Financing','#2E7D32'],['Investor / FO','#7030A0'],['DD / industry advisor','#C6943E'],['HR / interns','#FFC000'],['Admin','#595959'],['Personal','#A9A4C6'],['Contact (no firm record)','#434F80']].map(x=>'<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+x[1]+';margin-right:6px"></span>'+x[0]).join('<br>');
      return d;
    };
    lg.addTo(locMap);locMap._legend=lg;
  }
  const missing=cities.filter(c=>!S.geoCache[c.toLowerCase()]).length;
  if(missing)toast(missing+' places not geocoded yet, click "Geocode new cities"');
  try{renderClusters()}catch(e){}
  // Always frame Germany. Foreign records are listed under Abroad, they do not widen the map.
  if(!locMap._fitted){try{locMap.fitBounds([[47.3,5.9],[55.1,15.0]],{padding:[10,10]});locMap._fitted=1}catch(e){}}
  setTimeout(()=>locMap.invalidateSize(),120);
}
export async function geocodeMissing(){
  S.geoCache=S.geoCache||{};
  const cities=[...new Set(allRecs().map(recCity).filter(Boolean))].filter(c=>!S.geoCache[c.toLowerCase()]);
  const addrs=[];allRecs().forEach(r=>{const k=addrKey(r);if(k&&!S.geoCache[k]&&!addrs.some(x=>x[0]===k))addrs.push([k,addrQuery(r)])});
  if(!cities.length&&!addrs.length){toast('All cities and addresses geocoded');return}
  toast('Geocoding '+cities.length+' cities and '+addrs.length+' addresses…');
  for(const c of [...cities,...addrs]){
    try{
      const isA=Array.isArray(c);const q=isA?c[1]:c+', Europe';
      const res=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q));
      const j=await res.json();
      if(j[0])S.geoCache[isA?c[0]:c.toLowerCase()]=[+j[0].lat,+j[0].lon];
      await new Promise(r=>setTimeout(r,1100));
    }catch(e){}
  }
  save();renderLocations();toast('Geocoding done');
}
