import {legacyExport} from '../store/shards.js';
import {S, findRec} from '../state.js';
import {CONTRACT} from '../contract.js';
import {fillAddress} from './patch.js';
export {CONTRACT};

// The backup a run reads (Leif 16.11.2026): the export plus the contract, the candidate lists and thread.a taken
// from the record's next action. Built for the Drive file only; contract and lists are not stored in Firebase.
export const CONTRACT_NAME='KinetixCRM Contract.json';
export async function candidateLists(){
  const g=await import('../views/gaps.js'); // loaded on demand, as on the Data gaps tab
  const orgs=[...(S.companies||[]),...(S.advisors||[])].filter(r=>r&&!r.archived&&!r.mergedInto);
  return {
    dataGaps:g.gapRows().map(x=>({id:x.r.id,missing:x.miss})),
    noStreet:orgs.filter(r=>!(r.street?/\d/.test(r.street):/\d/.test(r.address||''))).map(r=>r.id)
  };
}
export async function backupData(){
  const out=legacyExport(S);
  out.threads=(out.threads||[]).map(t=>{const r=findRec(t.id)||(t.alias||[]).map(findRec).find(Boolean);const a=r&&(r.nextAction||'').trim();return a&&a!==t.a?{...t,a}:t});
  ['companies','advisors'].forEach(k=>{out[k]=(out[k]||[]).map(r=>{const c={...r};return fillAddress(c)?c:r})});
  out.contract=CONTRACT;
  try{out.lists=await candidateLists()}catch(e){console.warn('candidate lists:',e)}
  return out;
}
// One rolling JSON file in the CRM folder, found by name and overwritten (browser token path only).
export async function driveWriteJson(name,obj,gmailToken,DRIVE_CRM_FOLDER){
  const q=encodeURIComponent("'"+DRIVE_CRM_FOLDER+"' in parents and name='"+name+"' and trashed=false");
  const ex=((await (await fetch('https://www.googleapis.com/drive/v3/files?q='+q+'&fields=files(id)',{headers:{Authorization:'Bearer '+gmailToken}})).json()).files||[])[0];
  if(ex)return fetch('https://www.googleapis.com/upload/drive/v3/files/'+ex.id+'?uploadType=media',{method:'PATCH',headers:{Authorization:'Bearer '+gmailToken,'Content-Type':'application/json'},body:JSON.stringify(obj)});
  const b='kx'+Date.now();
  return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{Authorization:'Bearer '+gmailToken,'Content-Type':'multipart/related; boundary='+b},
    body:'--'+b+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name,parents:[DRIVE_CRM_FOLDER],mimeType:'application/json'})+'\r\n--'+b+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(obj)+'\r\n--'+b+'--'});
}
