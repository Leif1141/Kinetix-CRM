import {GRP_DEF, grpOf} from '../state.js';
import {PRIO_COL, PRIO_DEF} from '../constants.js';
import {daysAgo, esc} from '../util.js';


// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════
export function stagePill(s){const col={'Identified':'#8C97B8','Contacted':'#434F80','Replied':'#C6943E','Meeting':'#C6943E','NDA':'#2E7D32','LOI':'#1565C0','Diligence':'#1565C0','Closed':'#2E7D32','Dead':'#999'};return '<span class="pill" style="background:'+(col[s]||'#888')+';color:#fff">'+esc(s)+'</span>'}
export function prioChip(r){return r.priority?'<span class="pill" style="background:'+(PRIO_COL[r.priority]||'#8C97B8')+';color:#fff" title="'+(PRIO_DEF[r.priority]||'')+'">'+r.priority+'</span>':''}
export function dueChip(d){if(!d)return '';const n=-daysAgo(d);const t=n<0?Math.abs(n)+'d overdue':n===0?'due today':'due in '+n+'d';const c=n<0?'var(--red)':n===0?'#C6943E':'#2E7D32';return '<span class="duechip" style="background:'+c+'22;color:'+c+'">'+t+'</span>'}
export function starHtml(r){return '<span class="star'+(r.fav?' on':'')+'" data-click="toggleFav|$e|'+r.id+'" title="Favorite">★</span>'}
export function statusOf(r){return r.kind==='target'?r.stage:r.status}
export function grpChip(r){const g=GRP_DEF.find(x=>x.k===grpOf(r))||GRP_DEF[5];const sub=r.kind==='person'?(r.ptype||''):(r.category||r.ptype||'');return '<span class="gchip" style="background:'+g.c+'">'+(g.s||g.t)+'</span>'+(sub?'<div class="muted" style="font-size:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(sub)+'</div>':'')}

// ═══════════════════════════════════════════════════════════════
// PROFILE / MODAL
// ═══════════════════════════════════════════════════════════════
export function fld(id,label,valu,type){return '<div><label>'+label+'</label><input id="'+id+'" type="'+(type||'text')+'"'+(type==='number'?' step="0.1"':'')+' value="'+esc(valu??'')+'"></div>'}
export function n1(v){return (v===''||v===null||v===undefined||isNaN(v))?'':(Math.round(+v*10)/10).toFixed(1)}
export function selFld(id,label,opts,cur){const has=cur==null||cur===''||opts.includes(cur);return '<div><label>'+label+'</label><select id="'+id+'">'+opts.map(o=>'<option'+(o===cur?' selected':'')+'>'+esc(o)+'</option>').join('')+(has?'':'<option selected>'+esc(cur)+'</option>')+'</select></div>'}
export function gv(id){const e=document.getElementById(id);return e?e.value.trim():undefined}
