import {GMAIL_CLIENT_ID} from '../config.js';
import {MY_ADDR} from '../constants.js';
import {S, addTouch, allOrgs} from '../state.js';
import {autoDriveBackup, checkDriveUpdates, driveCall, driveProxy, driveReady, loadDriveProxy, setDriveProxy} from './drive.js';
import {isDismissedUnmatched} from '../views/inbox.js';
import {isIgnoredAddr} from './triage.js';
import {matchRecords} from './match.js';
import {outlookToken, setConnUI, silentOutlook} from './outlook.js';
import {syncEmails} from './index.js';
import {toast} from '../util.js';

export let gmailToken=null;
export function setGmailToken(v){gmailToken=v}

// ═══════════════════════════════════════════════════════════════
// GMAIL SYNC
// ═══════════════════════════════════════════════════════════════
export let _gClient=null;
export function gClient(){
  if(_gClient)return _gClient;
  _gClient=google.accounts.oauth2.initTokenClient({client_id:GMAIL_CLIENT_ID,scope:'https://www.googleapis.com/auth/drive',callback:(resp)=>{
    if(resp.error){console.warn('Google auth:',resp.error);return}
    gmailToken=resp.access_token;
    localStorage.setItem('kx_gAuth','1');
    setConnUI('gmailConn','Drive: connected');
    checkDriveUpdates(true);
    autoPipeline();
  }});
  return _gClient;
}
export function connectGmail(){
  if(!GMAIL_CLIENT_ID){toast('Set GMAIL_CLIENT_ID in the config');return}
  try{gClient().requestAccessToken()}catch(e){toast('Gmail connection failed: '+e.message)}
}
export let _autoRan=false;
export async function autoPipeline(){
  if(_autoRan)return;
  const stale=!S||!S.lastSync||Date.now()-new Date(S.lastSync).getTime()>6*3600e3;
  if(stale&&(outlookToken||driveReady())){_autoRan=true;toast('Auto-sync running…');syncEmails()}
  else if(driveReady()&&S&&(!S.lastDriveBackup||Date.now()-new Date(S.lastDriveBackup).getTime()>24*3600e3)){_autoRan=true;autoDriveBackup()}
}
export async function autoConnect(){
  await silentOutlook();
  if(await loadDriveProxy()){
    try{
      await driveCall('ping');
      setConnUI('gmailConn','Drive: connected');
      const b=document.querySelector('button[onclick="connectGmail()"]');if(b)b.style.display='none';
      checkDriveUpdates(true);
      autoPipeline();
      return;
    }catch(e){
      console.warn('Drive proxy ping failed',e);
      setConnUI('gmailConn','Drive: proxy error');
      document.getElementById('gmailConn').className='conn-status off';
      setDriveProxy(null); // fall through to the old token path
    }
  }
  if(localStorage.getItem('kx_gAuth')&&GMAIL_CLIENT_ID){
    const kick=()=>{if(!gmailToken){try{gClient().requestAccessToken({prompt:''})}catch(e){}}};
    document.addEventListener('pointerdown',kick,{once:true});
    kick();
  }else if(outlookToken){autoPipeline()}
}
export async function syncGmailEmails(){
  // Disabled 01.09.2026 on Leif's instruction: nothing Kinetix-related runs through Gmail,
  // so no Gmail content is pulled into the CRM. The Google token is retained for Drive only
  // (backup file + patch pipeline), which is why the connection itself stays.
  return 0;
  if(!gmailToken)return 0;
  let added=0;
  try{
    // list threads
    const listRes=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/threads?q=newer_than:45d+-category:promotions+-category:social&maxResults=80',{headers:{Authorization:'Bearer '+gmailToken}});
    if(!listRes.ok){if(listRes.status===401){gmailToken=null;document.getElementById('gmailConn').className='conn-status off';document.getElementById('gmailConn').textContent='Drive: session expired'}throw new Error('Gmail API '+listRes.status)}
    const listData=await listRes.json();
    const threads=listData.threads||[];
    // fetch each thread metadata (batch of 10)
    for(let i=0;i<threads.length;i+=10){
      const batch=threads.slice(i,i+10);
      const details=await Promise.all(batch.map(th=>fetch('https://gmail.googleapis.com/gmail/v1/users/me/threads/'+th.id+'?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date',{headers:{Authorization:'Bearer '+gmailToken}}).then(r=>r.json()).catch(()=>null)));
      details.filter(Boolean).forEach(th=>{
        (th.messages||[]).forEach(m=>{
          const key='gm_'+m.id;
          // skip if already seen
          const alreadySeen=allOrgs().some(o=>o.touches&&o.touches[key]);
          if(alreadySeen)return;
          const headers={};
          (m.payload?.headers||[]).forEach(h=>{headers[h.name.toLowerCase()]=h.value});
          const sender=(headers.from||'').toLowerCase();
          const sAddr=(sender.match(/[\w.+-]+@[\w.-]+/)||[''])[0];
          const dir=MY_ADDR.some(a=>sender.includes(a))?'out':'in';
          const to=(headers.to||'').toLowerCase();
          const text=[headers.subject,to].join(' ');
          const cand=dir==='in'?[sAddr]:(to.match(/[\w.+-]+@[\w.-]+/g)||[]).filter(a=>!MY_ADDR.some(mm=>a.includes(mm)));
          if(!cand.length)return;
          if(cand.every(isIgnoredAddr))return;
          let recs=[];
          cand.forEach(a=>{matchRecords(text,a,true).forEach(x=>{if(!recs.includes(x))recs.push(x)})});
          const date=new Date(parseInt(m.internalDate)).toISOString();
          const t={date,dir,subject:headers.subject||'(no subject)',link:'https://mail.google.com/mail/u/0/#all/'+th.id,src:'Gmail',who:dir==='out'?to:sAddr};
          if(recs.length){recs.forEach(r=>{addTouch(r,key,t)});added++}
          else{if(!isDismissedUnmatched(key)&&!(S.unmatched||[]).some(u=>u.key===key)){S.unmatched=S.unmatched||[];S.unmatched.push({...t,key,sender:sAddr})}}
        });
      });
    }
  }catch(e){console.warn('Gmail sync error:',e)}
  return added;
}
