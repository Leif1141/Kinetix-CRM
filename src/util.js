import {LEGAL} from './constants.js';


// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
export function uid(){return 'r'+Math.random().toString(36).slice(2,10)}
export function today(){return new Date().toISOString().slice(0,10)}
export function addDays(d,n){const x=new Date((d||today())+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
export function daysAgo(d){if(!d)return 9999;return Math.floor((Date.now()-new Date(d).getTime())/864e5)}
export function esc(s){return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
export function fmtM(v){return (v===''||v===null||v===undefined||isNaN(v))?'-':Number(v).toFixed(1)}
export function fmtD(d){if(!d)return '-';return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
// calendar days between a date and today (local time); a date-only string is read as a local date
export function calDaysAgo(d){if(!d)return 9999;const s=String(d);const a=/^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(s+'T12:00:00'):new Date(s);if(isNaN(a))return 9999;const n=new Date();return Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate())-new Date(a.getFullYear(),a.getMonth(),a.getDate()))/864e5)}
export function fmtAgo(d){if(!d)return '-';const n=calDaysAgo(d);return n===0?'today':n===1?'yesterday':n<31?n+' days ago':n<365?Math.floor(n/30)+'mo ago':Math.floor(n/365)+'y ago'}
export function toast(m){const t=document.getElementById('toast');t.textContent=m;t.style.display='block';setTimeout(()=>t.style.display='none',2800)}
// pure, so the result is memoised per input string (bounded)
const _nn=new Map();
export function normName(s){s=s||'';let v=_nn.get(s);if(v===undefined){v=s.toLowerCase().replace(/[().,&\/\-–']/g,' ').replace(LEGAL,' ').replace(/\s+/g,' ').trim();if(_nn.size>20000)_nn.clear();_nn.set(s,v)}return v}
export function nameTokens(s){return normName(s).split(' ').filter(w=>w.length>=4)}

// ═══════════════════════════════════════════════════════════════
// COMBINED SYNC
// ═══════════════════════════════════════════════════════════════
export function cleanPrev(s,max){
  if(!s)return '';
  let t=String(s).replace(/\s+/g,' ');
  // cut at quoted-thread markers and signature separators
  const cutters=[/_{4,}/, / From: /i, / Von: /i, / Sent: /i, / Gesendet: /i, /-{3,}\s*(Original|Urspr)/i, / Am [A-Z][a-z]+, \d{1,2}\./, / On .{3,30} wrote:/i, /Diese E-Mail enth/i, /This e-?mail (and any attachments )?(is|are) confidential/i];
  cutters.forEach(rx=>{const m=t.search(rx);if(m>0)t=t.slice(0,m)});
  // drop leading salutation
  t=t.replace(/^\s*(Hallo|Hi|Liebe[rs]?|Sehr geehrte[rs]?|Dear|Guten (Tag|Morgen|Abend))[^,!.]{0,50}[,!.]\s*/i,'');
  // drop closing + signature
  const closers=[/\b(Beste|Viele|Liebe|Herzliche|Freundliche) Gr(ü|u)(ß|ss)e\b/i,/\bMit freundlichen\b/i,/\bBest regards\b/i,/\bKind regards\b/i,/\bBest,\b/,/\bThanks,\b/i,/\bVielen Dank und\b/i,/\bBis sehr bald\b/i,/\bBis bald\b/i];
  closers.forEach(rx=>{const m=t.search(rx);if(m>20)t=t.slice(0,m)});
  return t.trim().slice(0,max||200);
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL SEARCH  (umlaut-blind: Koehler = Köhler = Kohler)
// ═══════════════════════════════════════════════════════════════
export function foldSearch(s){
  return (s||'').toLowerCase()
    .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'s')
    .replace(/ae/g,'a').replace(/oe/g,'o').replace(/ue/g,'u').replace(/ss/g,'s')
    .replace(/[^a-z0-9@. ]+/g,' ').replace(/\s+/g,' ').trim();
}
export const BL_ABBR={'nordrhein-westfalen':'NRW','baden-württemberg':'BW','baden-wuerttemberg':'BW','bayern':'BY','hessen':'HE','niedersachsen':'NI','schleswig-holstein':'SH','rheinland-pfalz':'RP','sachsen':'SN','thüringen':'TH','thueringen':'TH','sachsen-anhalt':'ST','brandenburg':'BB','berlin':'BE','hamburg':'HH','bremen':'HB','saarland':'SL','mecklenburg-vorpommern':'MV'};
export const PLZ_BL=[[1,'SN'],[2,'BB'],[3,'BB'],[4,'SN'],[6,'ST'],[7,'TH'],[8,'SN'],[9,'SN'],[10,'BE'],[11,'BE'],[12,'BE'],[13,'BE'],[14,'BB'],[15,'BB'],[16,'BB'],[17,'MV'],[18,'MV'],[19,'MV'],[20,'HH'],[21,'HH'],[22,'HH'],[23,'SH'],[24,'SH'],[25,'SH'],[26,'NI'],[27,'NI'],[28,'HB'],[29,'NI'],[30,'NI'],[31,'NI'],[32,'NRW'],[33,'NRW'],[34,'HE'],[35,'HE'],[36,'HE'],[37,'NI'],[38,'NI'],[39,'ST'],[40,'NRW'],[41,'NRW'],[42,'NRW'],[44,'NRW'],[45,'NRW'],[46,'NRW'],[47,'NRW'],[48,'NRW'],[49,'NI'],[50,'NRW'],[51,'NRW'],[52,'NRW'],[53,'NRW'],[54,'RP'],[55,'RP'],[56,'RP'],[57,'NRW'],[58,'NRW'],[59,'NRW'],[60,'HE'],[61,'HE'],[63,'HE'],[64,'HE'],[65,'HE'],[66,'SL'],[67,'RP'],[68,'BW'],[69,'BW'],[70,'BW'],[71,'BW'],[72,'BW'],[73,'BW'],[74,'BW'],[75,'BW'],[76,'BW'],[77,'BW'],[78,'BW'],[79,'BW'],[80,'BY'],[81,'BY'],[82,'BY'],[83,'BY'],[84,'BY'],[85,'BY'],[86,'BY'],[87,'BY'],[88,'BW'],[89,'BW'],[90,'BY'],[91,'BY'],[92,'BY'],[93,'BY'],[94,'BY'],[95,'BY'],[96,'BY'],[97,'BY'],[98,'TH'],[99,'TH']];
export const CITY_BL={'düsseldorf':'NRW','köln':'NRW','koeln':'NRW','bonn':'NRW','essen':'NRW','dortmund':'NRW','münster':'NRW','wuppertal':'NRW','remscheid':'NRW','solingen':'NRW','bielefeld':'NRW','aachen':'NRW','duisburg':'NRW','bochum':'NRW','leverkusen':'NRW','leichlingen':'NRW','wetzlar':'HE','frankfurt':'HE','frankfurt am main':'HE','wiesbaden':'HE','darmstadt':'HE','kassel':'HE','stuttgart':'BW','karlsruhe':'BW','mannheim':'BW','heidelberg':'BW','freiburg':'BW','freiburg im breisgau':'BW','ulm':'BW','pforzheim':'BW','ravensburg':'BW','friedrichshafen':'BW','langenargen':'BW','reutlingen':'BW','tübingen':'BW','heilbronn':'BW','münchen':'BY','nürnberg':'BY','augsburg':'BY','regensburg':'BY','würzburg':'BY','ingolstadt':'BY','hamburg':'HH','berlin':'BE','bremen':'HB','hannover':'NI','braunschweig':'NI','osnabrück':'NI','oldenburg':'NI','göttingen':'NI','leipzig':'SN','dresden':'SN','chemnitz':'SN','erfurt':'TH','jena':'TH','magdeburg':'ST','halle':'ST','kiel':'SH','lübeck':'SH','bad bramstedt':'SH','rostock':'MV','schwerin':'MV','mainz':'RP','koblenz':'RP','trier':'RP','ludwigshafen':'RP','saarbrücken':'SL','potsdam':'BB','korschenbroich':'NRW','zürich':'CH','zurich':'CH','london':'UK','wien':'AT'};
export function shortLoc(o){
  const raw=[o.city,o.location,o.address].filter(Boolean).map(String);
  if(!raw.length)return '';
  let city='',bl='';
  for(const r of raw){const m=r.match(/\b(\d{5})\s+([A-Za-zÄÖÜäöüß.\- ]+)/);if(m){city=m[2].trim();const p=parseInt(m[1].slice(0,2));const hit=PLZ_BL.find(x=>x[0]===p);if(hit)bl=hit[1];break}}
  if(!city){const r=raw[0];const parts=r.split(',').map(x=>x.trim()).filter(Boolean);city=parts[0].replace(/^\d{5}\s*/,'');for(const p of parts.slice(1)){const k=p.toLowerCase();if(BL_ABBR[k]){bl=BL_ABBR[k];break}if(/^(NRW|BW|BY|HE|NI|SH|RP|SN|TH|ST|BB|BE|HH|HB|SL|MV)$/.test(p)){bl=p;break}}}
  city=city.replace(/\s*\(.*?\)\s*/g,'').trim();
  if(!bl){const k=city.toLowerCase();if(CITY_BL[k])bl=CITY_BL[k];else if(o.geo&&o.geo!=='DE')bl=o.geo}
  return city+(bl?', '+bl:'');
}
export function fmtDe(d){if(!d)return '-';const x=new Date((d||'').slice(0,10)+'T12:00:00Z');return isNaN(x)?'-':String(x.getUTCDate()).padStart(2,'0')+'.'+String(x.getUTCMonth()+1).padStart(2,'0')+'.'+String(x.getUTCFullYear()).slice(2)}
export function daysBetween(a,b){return Math.round((new Date((b||'').slice(0,10)+'T12:00:00Z')-new Date((a||'').slice(0,10)+'T12:00:00Z'))/864e5)}
export function weekStart(d){const x=new Date((d||today())+'T12:00:00Z');const wd=(x.getUTCDay()+6)%7;x.setUTCDate(x.getUTCDate()-wd);return x.toISOString().slice(0,10)}
export function isoWeekKey(d){const t=new Date(d);t.setHours(0,0,0,0);t.setDate(t.getDate()+3-((t.getDay()+6)%7));const f=new Date(t.getFullYear(),0,4);return t.getFullYear()+'-'+String(1+Math.round(((t-f)/864e5-3+((f.getDay()+6)%7))/7)).padStart(2,'0')}
