// View-level checks for the harness page. Loaded by _harness.html (see build.py); runs only with ?check=1.
// Drives the real app against the stubbed store and prints one PASS or FAIL line per check, bottom right,
// and in window.__checkResults (tools/harness/tests.html reads them through an iframe).
const params=new URLSearchParams(location.search);
if(params.get('check')==='1')window.addEventListener('load',()=>setTimeout(run,1500));

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=8000){const t0=Date.now();while(Date.now()-t0<ms){try{if(fn())return true}catch(e){}await wait(50)}return false}
function median(fn,n=5){const ts=[];for(let i=0;i<n;i++){const t0=performance.now();fn();ts.push(performance.now()-t0)}ts.sort((a,b)=>a-b);return ts[Math.floor(n/2)]}

async function run(){
  const results=[];const errs=[];
  window.addEventListener('error',e=>errs.push(String(e.message)));
  const panel=document.createElement('div');
  panel.style.cssText='position:fixed;right:8px;bottom:8px;z-index:9999;background:#fff;border:1px solid #D3D3D2;border-radius:6px;padding:8px 10px;font:11px Arial;max-height:60vh;overflow:auto;max-width:520px;box-shadow:0 2px 12px rgba(0,0,0,.2)';
  document.body.appendChild(panel);
  const line=(ok,name,msg)=>{results.push({name,ok,msg:msg||''});const d=document.createElement('div');d.style.color=ok?'#2E7D32':'#C00000';d.textContent=(ok?'PASS  ':'FAIL  ')+name+(msg?'  ('+msg+')':'');panel.appendChild(d)};
  async function t(name,fn){const e0=errs.length;let ok=false,msg='';try{const r=await fn();ok=r===true||r===undefined;if(typeof r==='string'){ok=false;msg=r}}catch(e){msg=e.message}if(errs.length>e0){ok=false;msg=(msg?msg+'; ':'')+'console: '+errs.slice(e0).join(' | ').slice(0,160)}line(ok,name,msg)}

  if(!await until(()=>window.S&&S.companies&&S.companies.length&&document.getElementById('homeQueue')&&document.getElementById('homeQueue').innerHTML)){line(false,'app loaded','no data after 8 s');return finish()}
  const sh=await import('/src/store/shards.js');
  const backup=await (await fetch('/tools/harness/data/KinetixCRM%20Backup.json')).json();
  const norm0=s=>{const byId=a=>Object.fromEntries((a||[]).map(r=>[r.id,r]));const o={...s};o.companies=byId(s.companies);o.advisors=byId(s.advisors);o.people=byId(s.people);o.unmatched=Object.fromEntries((s.unmatched||[]).map(u=>[u.key,u]));return JSON.parse(JSON.stringify(o))};
  const norm=s=>sh.prune(norm0(s))||{};
  const tab=async name=>{document.querySelector('#tabs .tab[data-t="'+name+'"]').click();await wait(60)};

  await t('export equals the backup JSON',()=>{const A=norm(sh.legacyExport(S)),B=norm(sh.ensureDefaults(backup));const d=[...new Set([...Object.keys(A),...Object.keys(B)])].filter(k=>sh.stableStringify(A[k])!==sh.stableStringify(B[k]));return d.length?'differs: '+d.join(', '):true});

  for(const el of [...document.querySelectorAll('#tabs .tab')]){
    if(el.style.display==='none')continue;
    const name=el.dataset.t;
    await t('tab renders: '+name,async()=>{await tab(name);const p=document.getElementById('p-'+name);if(!p.classList.contains('active'))return 'panel not active';return p.innerText.trim().length>40||'panel nearly empty ('+p.innerText.trim().length+' chars)'});
  }
  await tab('home');

  await t('only the visible tab renders on a change',()=>{renderAll();const hidden=['orgs','people','threads','reports','dash'].filter(v=>!viewIsStale(v));return hidden.length?'rendered while hidden: '+hidden.join(', '):true});
  await t('badges match their counts',()=>{renderAll();const h=+document.getElementById('homeBadge').textContent||0,th=+document.getElementById('thBadge').textContent||0;if(h!==homeUrgentCount())return 'home '+h+' vs '+homeUrgentCount();if(th!==threadsMyMoveCount())return 'open items '+th+' vs '+threadsMyMoveCount();return true});
  await t('full re-render on Today under 100 ms',()=>{const ms=median(()=>renderAll());return ms<100||Math.round(ms)+' ms'});
  await t('Done/+1w click under 100 ms',()=>{const recs=allRecs().filter(r=>r.nextDate&&r.nextDate<today()).slice(0,5);if(!recs.length)return 'no due record';const ts=recs.map(r=>{const t0=performance.now();sugAct('1w',r.id,'due_'+r.id);return performance.now()-t0}).sort((a,b)=>a-b);const ms=ts[Math.floor(ts.length/2)];return ms<100||Math.round(ms)+' ms'});
  await t('remote change shows on a stale tab when it is opened',async()=>{const c=S.companies.find(x=>x.stage==='Identified');const nm='Harness Remote '+Date.now();window.__db.set('crm/companies/'+c.id+'/name',nm);await wait(300);if(!viewIsStale('orgs'))return 'orgs not marked stale';await tab('orgs');const ok=document.getElementById('orgTable').innerText.includes(nm);await tab('home');return ok||'new name not on Organizations'});
  await t('remote change re-render under 100 ms',async()=>{const c=S.companies.find(x=>x.stage==='Identified');const w0=performance.now();window.__db.set('crm/companies/'+c.id+'/flag','harness '+w0);await wait(200);const ms=median(()=>renderAll(),3);return ms<100||Math.round(ms)+' ms'});
  await t('record field edit gives one write',async()=>{const r=S.companies.find(x=>x.stage==='Contacted')||S.companies[0];openProfile(r);await wait(150);const w=document.querySelector('#p-record .rf[data-f="location"]');w.querySelector('.rfv').click();await wait(30);const ed=w.querySelector('.rfe');const n0=window.__writes.length;ed.value='Harness '+Date.now();ed.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(150);const ops=Object.keys(window.__lastOps||{});closeProfile();await wait(50);if(window.__writes.length-n0!==1)return (window.__writes.length-n0)+' writes';return (ops.length===1&&ops[0]===('companies/'+r.id+'/location'))||'ops '+ops.join(',')});
  await t('phase 0 patch applies with 307 made, 48 skipped',async()=>{const p=await (await fetch('/tools/harness/data/patch-sample.json')).json();const r=applyPatchOps(p.ops);return (r.made===307&&r.skipped===48)||r.made+' made, '+r.skipped+' skipped'});
  for(const fn of (window.__extraChecks||[]))await fn(t);
  finish();

  function finish(){
    const fails=results.filter(r=>!r.ok).length;
    const sum=document.createElement('div');sum.style.cssText='margin-top:6px;font-weight:bold';sum.textContent=(results.length-fails)+' of '+results.length+' passed';panel.appendChild(sum);
    window.__checkResults=results;document.title=(fails?'FAIL ':'PASS ')+document.title;
  }
}
