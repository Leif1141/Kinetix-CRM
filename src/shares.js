import {S, dispName, findRec, fixUml, isSysNote, liveOnly, touchList} from './state.js';
import {esc, fmtD, foldSearch, normName, toast, today} from './util.js';
import {openProfile, profRec} from './views/record.js';
import {save} from './store/firebase.js';
import {searchHay} from './views/search.js';



// ═══════════════════════════════════════════════════════════════
// NAME SHARING  -  which targets have I put in front of whom
// Avoids double-dipping: two advisors working the same name.
// ═══════════════════════════════════════════════════════════════
export function shareTokens(c){
  // distinctive tokens of a company name, legal forms stripped, umlaut-blind
  const base=foldSearch(normName(dispName(c)));
  const stop=new Set(['und','the','group','gruppe','deutschland','germany','technik','industrie','werke','sohn','sohne','co']);
  return base.split(' ').filter(w=>w.length>=5&&!stop.has(w));
}
export let _shareIdx=null;
export function invalidateShares(){_shareIdx=null}
export function shareIndex(){
  if(_shareIdx)return _shareIdx;
  const idx={};                       // companyId -> [{recId,date,subject,auto}]
  const cos=(S.companies||[]).map(c=>({c,tok:shareTokens(c)})).filter(x=>x.tok.length);
  // archived records are internal or parked; they are not a third party holding the name
  liveOnly([...(S.advisors||[]),...(S.people||[])]).forEach(r=>{
    touchList(r).filter(t=>!isSysNote(t)&&t.dir==='out').forEach(t=>{
      const hay=foldSearch((t.subject||'')+' '+(t.prev||'')+' '+(t.note||''));
      if(!hay)return;
      cos.forEach(x=>{
        if(!x.tok.every(w=>hay.includes(w)))return;
        (idx[x.c.id]=idx[x.c.id]||[]).push({recId:r.id,date:(t.date||'').slice(0,10),subject:t.subject||'',auto:true,link:t.link||''});
      });
    });
  });
  // fold in anything recorded by hand on the company
  (S.companies||[]).forEach(c=>(c.sharedWith||[]).forEach(e=>{
    (idx[c.id]=idx[c.id]||[]).push({recId:e.recId,date:e.date||'',subject:e.note||'recorded by hand',auto:false});
  }));
  // one row per counterparty, earliest date wins
  Object.keys(idx).forEach(k=>{
    const best={};
    idx[k].forEach(e=>{const b=best[e.recId];if(!b||(e.date&&e.date<b.date))best[e.recId]=e});
    idx[k]=Object.values(best).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  });
  _shareIdx=idx;return idx;
}
export function sharesFor(c){return shareIndex()[c.id]||[]}
export function sharedByRec(r){
  const out=[];const idx=shareIndex();
  (S.companies||[]).forEach(c=>{const e=(idx[c.id]||[]).find(x=>x.recId===r.id);if(e)out.push({c,e})});
  return out.sort((a,b)=>(b.e.date||'').localeCompare(a.e.date||''));
}
export function shareHtml(rec){
  if(rec.kind==='target'){
    const sh=sharesFor(rec);
    if(!sh.length)return '<div class="muted" style="font-size:11px">Not shared with anyone yet.</div>';
    const warn=sh.length>1?'<div style="font-size:11px;margin-bottom:4px"><b>'+sh.length+' parties have this name.</b> Check before you promise exclusivity.</div>':'';
    return warn+sh.map(e=>{
      const r=findRec(e.recId);
      return '<div style="font-size:11px;margin-bottom:2px">'+(e.date?'<span class="muted">'+fmtD(e.date)+'</span> ':'')+'<b style="cursor:pointer" onclick="openProfile(findRec(\''+e.recId+'\'))">'+esc(fixUml(r?dispName(r):e.recId))+'</b>'+(e.auto?'':' <span class="chip">by hand</span>')+(e.subject?' <span class="muted">'+esc(fixUml(e.subject.slice(0,70)))+'</span>':'')+'</div>';
    }).join('');
  }
  const names=sharedByRec(rec);
  if(!names.length)return '<div class="muted" style="font-size:11px">You have not given them any names yet.</div>';
  return names.map(x=>'<div style="font-size:11px;margin-bottom:2px">'+(x.e.date?'<span class="muted">'+fmtD(x.e.date)+'</span> ':'')+'<b style="cursor:pointer" onclick="openProfile(findRec(\''+x.c.id+'\'))">'+esc(fixUml(dispName(x.c)))+'</b> <span class="muted">'+esc(x.c.stage||'')+'</span>'+(sharesFor(x.c).length>1?' <span class="chip" style="background:#C6943E;color:#fff">also with '+(sharesFor(x.c).length-1)+'</span>':'')+'</div>').join('');
}
export function addShare(){
  const rec=profRec;if(!rec||rec.kind!=='target')return;
  const who=prompt('Which partner did you give '+dispName(rec)+' to? Type part of their name:');
  if(!who)return;
  const q=foldSearch(who);
  const hits=[...(S.advisors||[]),...(S.people||[])].filter(r=>searchHay(r).includes(q));
  if(!hits.length){toast('No match for "'+who+'"');return}
  const pick=hits.length===1?hits[0]:hits[Math.max(0,(+prompt(hits.map((h,i)=>i+': '+dispName(h)).join('\n')+'\n\nNumber:','0')||0))];
  if(!pick)return;
  const d=prompt('Date shared (YYYY-MM-DD):',today())||today();
  rec.sharedWith=rec.sharedWith||[];
  rec.sharedWith.push({recId:pick.id,date:d,note:'recorded by hand'});
  _shareIdx=null;save();openProfile(rec);
}
