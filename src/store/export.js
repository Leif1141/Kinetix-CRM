import {S, setS} from '../state.js';
import {renderAll} from '../main.js';
import {save} from './firebase.js';
import {toast, today} from '../util.js';

export function exportJSON(){
  const blob=new Blob([JSON.stringify(S,null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='KinetixCRM_'+today().replace(/-/g,'')+'.json';a.click();toast('Exported');
}
export function importJSON(ev){
  const f=ev.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=e=>{try{const d=JSON.parse(e.target.result);setS(d);save();renderAll();toast('Imported '+f.name)}catch(err){toast('Import error: '+err.message)}};
  rd.readAsText(f);ev.target.value='';
}
