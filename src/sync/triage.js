import {MY_ADDR} from '../constants.js';
import {S, addTouch, allRecs, touchList} from '../state.js';
import {cleanPrev, fmtD} from '../util.js';
import {isDismissedUnmatched} from '../views/inbox.js';
import {matchRecords} from './match.js';
import {save} from '../store/firebase.js';

export function migratePrevClean(){
  if(S.prevCleanV1)return;
  [...(S.companies||[]),...(S.advisors||[]),...(S.people||[])].forEach(r=>{
    Object.values(r.touches||{}).forEach(t=>{if(t.prev)t.prev=cleanPrev(t.prev)});
  });
  (S.unmatched||[]).forEach(u=>{if(u.prev)u.prev=cleanPrev(u.prev)});
  S.prevCleanV1=1;save();
}
export function backfillPersonTouches(){
  const map={};
  (S.people||[]).forEach(p=>{const e=(p.email||'').toLowerCase();if(e){(map[e]=map[e]||[]).push(p)}});
  let n=0;
  [...(S.companies||[]),...(S.advisors||[])].forEach(o=>{
    Object.keys(o.touches||{}).forEach(k=>{
      const t=o.touches[k];
      (((t.who||'').toLowerCase().match(/[\w.+-]+@[\w.-]+/g))||[]).forEach(a=>{
        (map[a]||[]).forEach(p=>{if(!(p.touches||{})[k]){addTouch(p,k,t);n++}});
      });
    });
  });
  return n;
}
export function isIgnoredAddr(a){
  a=(a||'').toLowerCase();if(!a)return false;
  if((S.ignoredSenders||{})[a.replace(/\./g,'_')])return true;
  const d=a.split('@')[1]||'';
  return !!(d&&(S.ignoredDomains||{})[d.replace(/\./g,'_')]);
}
export function retriageUnmatched(){
  let assigned=0,dropped=0;
  S.unmatched=(S.unmatched||[]).filter(u=>{
    if(allRecs().some(r=>r.touches&&r.touches[u.key])){dropped++;return false}
    if(isDismissedUnmatched(u.key)){dropped++;return false}
    const addrs=u.dir==='out'?(((u.who||'').toLowerCase().match(/[\w.+-]+@[\w.-]+/g))||[]):[((u.sender||'').toLowerCase())];
    const real=addrs.filter(a=>a&&a.includes('@')&&!MY_ADDR.some(m=>a.includes(m)));
    if(u.src!=='Granola'&&!real.length){dropped++;return false}
    if(real.length&&real.every(isIgnoredAddr)){dropped++;return false}
    let recs=[];
    real.forEach(a=>{matchRecords((u.subject||'')+' '+(u.who||''),a,true).forEach(x=>{if(!recs.includes(x))recs.push(x)})});
    if(recs.length){
      const t={date:u.date,dir:u.dir,subject:u.subject,link:u.link||'',src:u.src,who:u.who||u.sender,prev:u.prev||''};
      recs.forEach(r=>addTouch(r,u.key,t));assigned++;return false;
    }
    return true;
  });
  return {assigned,dropped};
}
export function reconcileDraftActions(){
  let n=0;
  allRecs().forEach(r=>{
    if(!r.nextAction||!/entwurf|draft/i.test(r.nextAction))return;
    const lo=touchList(r).find(t=>t.dir==='out'&&t.src!=='Note');
    if(!lo)return;
    if(!r.nextSet)return; // only auto-complete actions with a known set-date
    const since=r.nextSet;
    if((lo.date||'').slice(0,10)>=since){
      addTouch(r,'auto_'+r.id+'_'+(lo.date||'').slice(0,10),{date:new Date().toISOString(),dir:'out',subject:'\u2714 Auto-completed: '+r.nextAction.slice(0,90)+' (email sent '+fmtD(lo.date)+')',src:'Note'});
      r.nextAction='';r.nextDate='';r.nextSet='';n++;
    }
  });
  return n;
}
