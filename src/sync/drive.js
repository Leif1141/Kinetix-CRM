import {legacyExport} from '../store/shards.js';
import {S} from '../state.js';
import {applyPatchObj} from './patch.js';
import {db, save, serverGet, currentUser} from '../store/firebase.js';
import {gmailToken} from './google.js';
import {isoWeekKey, toast, today} from '../util.js';
import {renderAll} from '../main.js';

export const DRIVE_CRM_FOLDER='19NSMw1zEmNctsmWuPnXCLZeX09ehO6bW';
// ── Drive proxy (15.09.2026) ──────────────────────────────────────
// Apps Script web app (_drive_proxy.gs) that runs as Leif and owns all Drive I/O.
// URL and key are NOT in this file: they are read from Firebase at crm-config/driveProxy
// (rules restrict it to Leif's uid) with a localStorage fallback. While configured, the
// browser OAuth token (gmailToken) is never needed and "Drive: not connected" cannot occur.
export let driveProxy=null;
export function setDriveProxy(v){driveProxy=v} // {url,key}
export function driveReady(){return !!(driveProxy||gmailToken)}
export async function loadDriveProxy(){
  try{
    const snap=await db.ref('crm-config/driveProxy').once('value');
    const v=snap.val();
    // The proxy authenticates the signed-in user by the Firebase ID token; there is no shared key any more.
    if(v&&v.url){driveProxy={url:v.url};try{localStorage.setItem('kx_driveProxy',JSON.stringify(driveProxy))}catch(e){}return driveProxy}
  }catch(e){console.warn('driveProxy from Firebase failed',e)}
  try{const l=JSON.parse(localStorage.getItem('kx_driveProxy')||'null');if(l&&l.url)driveProxy={url:l.url}}catch(e){}
  return driveProxy;
}
export async function driveCall(action,params,body){
  if(!driveProxy)throw new Error('Drive proxy not configured');
  if(!currentUser)throw new Error('not signed in');
  const idToken=await currentUser.getIdToken();
  let res;
  if(body){
    res=await fetch(driveProxy.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(Object.assign({idToken,action:action},params||{},body))});
  }else{
    const q=new URLSearchParams(Object.assign({idToken,action:action},params||{}));
    res=await fetch(driveProxy.url+'?'+q.toString());
  }
  if(!res.ok)throw new Error('proxy '+res.status);
  const j=await res.json();
  if(j.error)throw new Error('proxy: '+j.error);
  return j;
}
export async function driveArchiveId(){
  if(S._driveArchiveId)return S._driveArchiveId;
  if(driveProxy)return 'proxy'; // the proxy resolves the archive folder itself
  const q=encodeURIComponent("'"+DRIVE_CRM_FOLDER+"' in parents and name='0. Archive' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const r=await fetch('https://www.googleapis.com/drive/v3/files?q='+q+'&fields=files(id)',{headers:{Authorization:'Bearer '+gmailToken}});
  const f=((await r.json()).files||[])[0];
  if(f){S._driveArchiveId=f.id;return f.id}
  const c=await fetch('https://www.googleapis.com/drive/v3/files',{method:'POST',
    headers:{Authorization:'Bearer '+gmailToken,'Content-Type':'application/json'},
    body:JSON.stringify({name:'0. Archive',parents:[DRIVE_CRM_FOLDER],mimeType:'application/vnd.google-apps.folder'})});
  const j=await c.json(); S._driveArchiveId=j.id; return j.id;
}
export async function driveMoveToArchive(fileId){
  try{
    if(driveProxy){await driveCall('archive',{id:fileId});return true}
    const arc=await driveArchiveId();
    await fetch('https://www.googleapis.com/drive/v3/files/'+fileId+'?addParents='+arc+'&removeParents='+DRIVE_CRM_FOLDER+'&fields=id',
      {method:'PATCH',headers:{Authorization:'Bearer '+gmailToken}});
    return true;
  }catch(e){console.warn('archive move failed',e);return false}
}
export async function autoDriveBackup(){
  if(!driveReady())return;
  if(driveProxy){
    try{
      const wk=isoWeekKey(new Date());
      const snap=S._lastSnapshotWeek!==wk;
      const r=await driveCall('backup',{snapshot:snap},{data:legacyExport(S)});
      if(snap&&r.snapshot)S._lastSnapshotWeek=wk;
      S.lastDriveBackup=new Date().toISOString();save();
      console.log('Drive auto-backup via proxy: '+r.bytes+' bytes'+(r.snapshot?', snapshot '+r.snapshot:''));
    }catch(e){toast('⚠ Drive backup FAILED: '+e.message+'. Data is safe in Firebase, but weekly briefings go stale');console.warn('Drive backup failed:',e)}
    return;
  }
  try{
    const name='KinetixCRM Backup.json';
    // Eine rollierende Datei: vorhandene suchen und ueberschreiben statt jedes Mal neu anzulegen.
    const q=encodeURIComponent("'"+DRIVE_CRM_FOLDER+"' in parents and name='"+name+"' and trashed=false");
    const lr=await fetch('https://www.googleapis.com/drive/v3/files?q='+q+'&fields=files(id)',{headers:{Authorization:'Bearer '+gmailToken}});
    const ex=((await lr.json()).files||[])[0];
    let res;
    if(ex){
      res=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+ex.id+'?uploadType=media',
        {method:'PATCH',headers:{Authorization:'Bearer '+gmailToken,'Content-Type':'application/json'},body:JSON.stringify(legacyExport(S))});
    }else{
      const meta={name:name,parents:[DRIVE_CRM_FOLDER],mimeType:'application/json'};
      const boundary='kinetix'+Date.now();
      const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+
        '\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(legacyExport(S))+'\r\n--'+boundary+'--';
      res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{Authorization:'Bearer '+gmailToken,'Content-Type':'multipart/related; boundary='+boundary},body:body});
    }
    if(!res.ok)throw new Error('upload '+res.status);
    // Wochenschnappschuss ins Archiv, hoechstens einmal pro Kalenderwoche.
    const wk=(function(d){const t=new Date(d);t.setHours(0,0,0,0);t.setDate(t.getDate()+3-((t.getDay()+6)%7));const f=new Date(t.getFullYear(),0,4);return t.getFullYear()+'-'+String(1+Math.round(((t-f)/864e5-3+((f.getDay()+6)%7))/7)).padStart(2,'0')})(new Date());
    if(S._lastSnapshotWeek!==wk){
      try{
        const arc=await driveArchiveId();
        const sm={name:today().replace(/-/g,'')+' KinetixCRM Backup.json',parents:[arc],mimeType:'application/json'};
        const sb='snap'+Date.now();
        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',
          headers:{Authorization:'Bearer '+gmailToken,'Content-Type':'multipart/related; boundary='+sb},
          body:'--'+sb+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(sm)+
               '\r\n--'+sb+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(legacyExport(S))+'\r\n--'+sb+'--'});
        S._lastSnapshotWeek=wk;
      }catch(e){console.warn('weekly snapshot failed',e)}
    }
    S.lastDriveBackup=new Date().toISOString();save();
    console.log('Drive auto-backup: '+name);
  }catch(e){toast('⚠ Drive backup FAILED: '+e.message+'. Data is safe in Firebase, but weekly briefings go stale');console.warn('Drive backup failed:',e)}
}
export async function checkDriveUpdates(auto){
  if(!driveReady()){if(!auto){toast('Drive proxy not configured (crm-config/driveProxy in Firebase) and no Google token');}return}
  try{
    let all;
    if(driveProxy){all=(await driveCall('list')).files||[]}
    else{
      const q=encodeURIComponent("'"+DRIVE_CRM_FOLDER+"' in parents and name contains 'KinetixCRM Patch' and trashed=false");
      const res=await fetch('https://www.googleapis.com/drive/v3/files?q='+q+'&orderBy=name&fields=files(id,name)',{headers:{Authorization:'Bearer '+gmailToken}});
      if(!res.ok)throw new Error('Drive list failed ('+res.status+')');
      all=(await res.json()).files||[];
    }
    const files=all.filter(f=>!(S.appliedPatchTitles||{})[f.name]);
    if(!files.length){if(!auto)toast('No new CRM updates in Drive');return}
    let tot=0,bad=[],moved=0;
    for(const f of files){
      try{ // one bad file must never block the rest
        let p;
        if(driveProxy){p=JSON.parse((await driveCall('get',{id:f.id})).content)}
        else{
          const dl=await fetch('https://www.googleapis.com/drive/v3/files/'+f.id+'?alt=media',{headers:{Authorization:'Bearer '+gmailToken}});
          p=await dl.json();
        }
        const r=applyPatchObj(p,f.name,false);
        if(r){tot+=r.made;moved+=(await driveMoveToArchive(f.id))?1:0}
      }catch(e){bad.push(f.name+': '+e.message);console.warn('patch failed:',f.name,e)}
    }
    save();renderAll();
    toast(tot+' updates applied from '+files.length+' Claude patch file'+(files.length>1?'s':'')+(moved?', '+moved+' archived':'')+(bad.length?' | FAILED: '+bad.join('; '):''));
    // Confirm on the server that each applied patch is recorded; a patch that did not land is sent again.
    setTimeout(async()=>{const missing=[];for(const f of files){if(bad.some(b=>b.startsWith(f.name)))continue;try{if(await serverGet('meta/appliedPatchTitles/'+f.name)===undefined)missing.push(f.name)}catch(e){}}
      if(missing.length){console.error('patch not confirmed on server',missing);toast('⚠ Not confirmed on the server: '+missing.join(', ')+'. Sending again.');save()}},4000);
    autoDriveBackup();
  }catch(e){toast('⚠ Claude-update check FAILED: '+e.message+(String(e.message).includes('403')?'. Is the Drive API enabled in the Google Cloud project?':''))}
}
