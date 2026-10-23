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
      const b=document.querySelector('button[data-click="connectGmail"]');if(b)b.style.display='none';
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
// Gmail sync was switched off on 01.09.2026 (nothing Kinetix-related runs through Gmail) and removed on
// 23.10.2026. The Google connection stays for Drive (backup and patch pipeline).
