import {allRecs, dispName, fixUml, lastTouch, orgPeople, personOrg, rowLabel} from '../state.js';
import {esc, fmtAgo, foldSearch} from '../util.js';

export function searchHay(r){
  return foldSearch([dispName(r),r.name,r.firm,r.contact,r.email,r.domain,r.city,r.location,r.title,r.category,r.ptype,r.stage,r.status,(r.lists||[]).join(' '),r.description,(r.notes||'').slice(0,600)].filter(Boolean).join(' '));
}
export function renderGlobalSearch(){
  const q=foldSearch((document.getElementById('gSearch')||{}).value||'');
  const wrap=document.getElementById('gSearchWrap');
  if(!wrap)return;
  if(q.length<2){wrap.style.display='none';return}
  wrap.style.display='';
  const terms=q.split(' ').filter(Boolean);
  const hitRecs=allRecs().filter(r=>{const h=searchHay(r);return terms.every(t=>h.includes(t))});
  // One row per organisation. A person who belongs to an org (linked or by firm name) is folded into that org's row,
  // even when only the person matched. People without any org record keep their own row.
  const rows={},order=[];
  const add=(key,row)=>{if(!rows[key]){rows[key]=row;order.push(key)}return rows[key]};
  hitRecs.forEach(r=>{
    if(r.kind!=='person'){add(r.id,{r,people:[]});return}
    const o=personOrg(r);
    if(o){add(o.id,{r:o,people:[]}).people.push(r)}else add(r.id,{r,people:[]});
  });
  const hits=order.map(k=>rows[k]);
  hits.forEach(x=>{if(x.r.kind!=='person'&&!x.people.length)x.people=orgPeople(x.r).slice(0,3)});
  const kindRank={target:0,advisor:1,person:2};
  hits.sort((a,b)=>(kindRank[a.r.kind]-kindRank[b.r.kind])||((lastTouch(b.r)||'').localeCompare(lastTouch(a.r)||'')));
  document.getElementById('gCount').textContent=hits.length+' match'+(hits.length===1?'':'es');
  const kindLbl={target:'Target',advisor:'Organization',person:'Person'};
  document.getElementById('gSearchBody').innerHTML=hits.length
    ? '<table><tr><th style="width:78px">Type</th><th style="width:26%">Name</th><th style="width:26%">Contacts</th><th>Detail</th><th style="width:88px">Last contact</th></tr>'+hits.slice(0,80).map(x=>{
        const r=x.r;
        let contact;
        if(r.kind==='person'){const L=rowLabel(r);contact=L.sub?esc(fixUml(L.sub)):''}
        else{
          const names=[];if(r.contact)names.push(esc(fixUml(r.contact)));
          x.people.forEach(p=>{const n=fixUml(p.name||'');if(!n||names.some(s=>s.indexOf(esc(n))>=0))return;names.push('<span data-click="!openRec|'+p.id+'|$e" style="cursor:pointer;text-decoration:underline dotted">'+esc(n)+'</span>')});
          contact=names.join(', ');
        }
        const detail=[r.kind==='person'?r.title:'',r.category||r.ptype||'',r.email||'',r.city||r.location||''].filter(Boolean).join(' &middot; ');
        return '<tr class="rowlink" data-click="openRec|'+r.id+'|$e"><td><span class="chip">'+kindLbl[r.kind]+'</span></td><td><b>'+esc(fixUml(rowLabel(r).top))+'</b></td><td class="muted">'+contact+'</td><td class="muted">'+detail+'</td><td class="muted">'+fmtAgo(lastTouch(r))+'</td></tr>';
      }).join('')+'</table>'+(hits.length>80?'<p class="muted" style="padding:8px 12px">Showing the first 80.</p>':'')
    : '<p class="muted" style="padding:12px">Nothing found. Umlauts do not matter here - Koehler, Kohler and Köhler all match.</p>';
}
