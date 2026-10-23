import {esc} from '../util.js';

// ═══════════════════════════════════════════════════════════════
// One in-page dialog for everything that used to go through prompt() and confirm().
// openDialog({title, text, fields, ok, cancel, danger, validate}) resolves to {key: value} or null.
// Field: {key, label, type: text|textarea|date|select|number, value, options, list, placeholder, rows, required}
//   options: strings or {value, label} (select); list: suggestions for a text field.
// Enter saves (Ctrl+Enter inside a textarea), Escape or a click outside cancels.
// ═══════════════════════════════════════════════════════════════
let _cur=null;

export function openDialog(o){
  if(_cur)_cur.close(null);
  return new Promise(resolve=>{
    const fields=o.fields||[];
    const el=document.createElement('div');el.id='kxDialog';el.className='dlg';
    const opt=x=>typeof x==='object'?x:{value:x,label:x};
    const fieldHtml=(f,i)=>{
      const id='dlg_'+i,v=f.value==null?'':String(f.value);
      let input;
      if(f.type==='textarea')input='<textarea id="'+id+'" data-key="'+esc(f.key)+'" rows="'+(f.rows||3)+'" placeholder="'+esc(f.placeholder||'')+'">'+esc(v)+'</textarea>';
      else if(f.type==='select')input='<select id="'+id+'" data-key="'+esc(f.key)+'">'+(f.options||[]).map(opt).map(x=>'<option value="'+esc(x.value)+'"'+(String(x.value)===v?' selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select>';
      else input='<input id="'+id+'" data-key="'+esc(f.key)+'" type="'+(f.type==='date'?'date':f.type==='number'?'text':'text')+'"'+(f.type==='number'?' inputmode="decimal"':'')+' value="'+esc(v)+'" placeholder="'+esc(f.placeholder||'')+'" autocomplete="off"'+(f.list?' list="'+id+'_l"':'')+'>'+(f.list?'<datalist id="'+id+'_l">'+[...new Set(f.list)].slice(0,400).map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist>':'');
      return '<label for="'+id+'">'+esc(f.label||'')+(f.required?' *':'')+'</label>'+input;
    };
    el.innerHTML='<div class="dlg-box" role="dialog" aria-modal="true">'
      +(o.title?'<div class="dlg-title">'+esc(o.title)+'</div>':'')
      +(o.text?'<div class="dlg-text">'+esc(o.text)+'</div>':'')
      +(fields.length?'<div class="dlg-fields">'+fields.map(fieldHtml).join('')+'</div>':'')
      +'<div class="dlg-err"></div>'
      +'<div class="dlg-btns"><button class="sm" data-dlg="cancel">'+esc(o.cancel||'Cancel')+'</button><button class="sm primary'+(o.danger?' dlg-danger':'')+'" data-dlg="ok">'+esc(o.ok||'Save')+'</button></div>'
      +'</div>';
    document.body.appendChild(el);
    const values=()=>{const v={};el.querySelectorAll('[data-key]').forEach(x=>{v[x.dataset.key]=x.value});return v};
    const err=m=>{el.querySelector('.dlg-err').textContent=m||''};
    const close=res=>{if(!el.isConnected)return;el.remove();if(_cur&&_cur.el===el)_cur=null;resolve(res)};
    const submit=()=>{
      const v=values();
      const miss=fields.find(f=>f.required&&!String(v[f.key]||'').trim());
      if(miss){err(miss.label+' is required');const x=el.querySelector('[data-key="'+miss.key+'"]');if(x)x.focus();return}
      if(o.validate){const m=o.validate(v);if(m){err(m);return}}
      close(fields.length?v:{});
    };
    el.addEventListener('click',e=>{
      const b=e.target.closest('[data-dlg]');
      if(b){e.stopPropagation();b.dataset.dlg==='ok'?submit():close(null);return}
      if(e.target===el)close(null);
    });
    el.addEventListener('keydown',e=>{
      e.stopPropagation(); // keep Escape and Enter away from the record page, palette and undo shortcuts
      if(e.key==='Escape'){e.preventDefault();close(null)}
      else if(e.key==='Enter'&&(e.target.tagName!=='TEXTAREA'||e.ctrlKey||e.metaKey)&&e.target.tagName!=='BUTTON'){e.preventDefault();submit()}
    });
    _cur={el,close};
    const first=el.querySelector('[data-key]')||el.querySelector('[data-dlg="ok"]');
    setTimeout(()=>{first.focus();if(first.select&&first.tagName==='INPUT'&&first.type!=='date')try{first.select()}catch(e){}},0);
  });
}
export function confirmDialog(text,o){return openDialog(Object.assign({text,ok:'OK'},o||{})).then(v=>!!v)}
export function dialogOpen(){return !!_cur}
