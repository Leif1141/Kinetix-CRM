import {LIVE} from '../constants.js';
import {S, allRecs, cadenceOf, dispName, isDismissed, isIgnoredRec, isStale, lastTouch, liveOnly} from '../state.js';
import {daysAgo, fmtDe, today} from '../util.js';


// ═══════════════════════════════════════════════════════════════
// SUGGESTIONS ENGINE
// ═══════════════════════════════════════════════════════════════
export function sugHead(r){
  const n=dispName(r);
  const extra = r.kind==='advisor' ? (r.contact||'') : (r.kind==='person' ? (r.firm||'') : (r.location||''));
  const t = r.category||r.ptype||r.type||'';
  const bits=[extra,t].filter(Boolean).join(', ');
  return bits ? n+' ('+bits+')' : n;
}
export function suggestions(){
  const byRec=new Map();
  suggestionsRaw().filter(s=>!isDismissed(s.key)&&!isIgnoredRec(s.rec)).forEach(s=>{const g=byRec.get(s.rec.id);if(!g){s.also=[];byRec.set(s.rec.id,s)}else{g.also.push(s)}});
  return [...byRec.values()];
}
export function suggestionsRaw(){
  const out=[];const t=today();const isDismissed=()=>false;
  (S.companies||[]).forEach(c=>{const cd=cadenceOf(c);if(cd&&cd.next&&cd.next.due<=t)out.push({rec:c,why:'Brief vom '+fmtDe(cd.sent)+': jetzt '+cd.next.label+(cd.via?' (über '+cd.via+')':''),tag:'Cadence',color:'#B86E1B',key:'cdz_'+c.id+'_'+cd.next.k})});
  allRecs().filter(r=>r.nextDate&&r.nextDate<=t).forEach(r=>{const k='due_'+r.id;if(!isDismissed(k))out.push({rec:r,why:'Fällig: '+(r.nextAction||'nachfassen'),tag:'Due',color:'var(--red)',key:k})});
  S.companies.filter(c=>LIVE.includes(c.stage)&&c.stage!=='Identified'&&isStale(c)).forEach(c=>{const k='stale_'+c.id;if(!isDismissed(k))out.push({rec:c,why:c.stage+' for '+daysAgo(lastTouch(c)||(c.stageLog?.slice(-1)[0]?.date)||null)+'d with no activity',tag:'Stale',color:'#C6943E',key:k})});
  liveOnly(S.advisors||[]).filter(a=>{const lt=lastTouch(a);return lt&&daysAgo(lt)>(a.cadence||30)}).forEach(a=>{const k='cad_'+a.id;if(!isDismissed(k))out.push({rec:a,why:'Letzter Kontakt vor '+daysAgo(lastTouch(a))+' Tagen (Rhythmus '+(a.cadence||30)+' Tage)',tag:'Check-in',color:'var(--navy)',key:k})});
  S.companies.filter(c=>c.stage==='Dead'&&c.revisitDate&&c.revisitDate<=t).forEach(c=>{const k='rev_'+c.id;if(!isDismissed(k))out.push({rec:c,why:'Wiedervorlage erreicht: erneut ansprechen oder Termin verschieben',tag:'Revisit',color:'var(--green)',key:k})});
  allRecs().filter(r=>r.nextAction&&r.nextSet&&lastTouch(r)&&lastTouch(r).slice(0,10)>r.nextSet).forEach(r=>{const k='ovt_'+r.id+'_'+lastTouch(r).slice(0,10);if(!isDismissed(k))out.push({rec:r,why:'Nächster Schritt eventuell überholt, seitdem gab es neue Aktivität. Aktuell: "'+r.nextAction+'"',tag:'Overtaken',color:'#7030A0',key:k})});
  return out;
}
