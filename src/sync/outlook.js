import {AZURE_CLIENT_ID, AZURE_TENANT} from '../config.js';
import {MY_ADDR} from '../constants.js';
import {S, addTouch} from '../state.js';
import {auth} from '../store/firebase.js';
import {autoPipeline} from './google.js';
import {cleanPrev, toast} from '../util.js';
import {isDismissedUnmatched} from '../views/inbox.js';
import {isIgnoredAddr} from './triage.js';
import {matchRecords} from './match.js';

export let outlookToken=null;
export function setOutlookToken(v){outlookToken=v}
export let msalInstance=null;

// ═══════════════════════════════════════════════════════════════
// OUTLOOK (Microsoft Graph) SYNC
// ═══════════════════════════════════════════════════════════════
export function ensureMsal(){
  if(!msalInstance)msalInstance=new msal.PublicClientApplication({auth:{clientId:AZURE_CLIENT_ID,authority:'https://login.microsoftonline.com/'+AZURE_TENANT,redirectUri:window.location.origin+window.location.pathname.replace(/index\.html$/,'')},cache:{cacheLocation:'localStorage'}});
  return msalInstance;
}
export function setConnUI(id,txt){const el=document.getElementById(id);if(el){el.className='conn-status';el.textContent=txt}}
export async function connectOutlook(){
  if(!AZURE_CLIENT_ID){toast('Set AZURE_CLIENT_ID in the config');return}
  try{
    ensureMsal();
    await msalInstance.initialize();
    const login=await msalInstance.loginPopup({scopes:['Mail.Read']});
    const token=await msalInstance.acquireTokenSilent({scopes:['Mail.Read'],account:login.account});
    outlookToken=token.accessToken;
    setConnUI('outlookConn','Outlook: '+login.account.username);
    toast('Outlook connected');
    autoPipeline();
  }catch(e){toast('Outlook connection failed: '+e.message);console.error(e)}
}
export async function silentOutlook(){
  if(!AZURE_CLIENT_ID)return false;
  try{
    ensureMsal();
    await msalInstance.initialize();
    const accs=msalInstance.getAllAccounts();
    if(!accs.length)return false;
    const token=await msalInstance.acquireTokenSilent({scopes:['Mail.Read'],account:accs[0]});
    outlookToken=token.accessToken;
    setConnUI('outlookConn','Outlook: '+accs[0].username);
    return true;
  }catch(e){console.warn('Outlook silent auth failed:',e);return false}
}
export async function syncOutlookEmails(){
  if(!outlookToken)return 0;
  const afterDate=new Date(Date.now()-45*864e5).toISOString();
  let url='https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge '+afterDate+'&$top=100&$orderby=receivedDateTime desc&$select=id,internetMessageId,subject,receivedDateTime,sender,toRecipients,bodyPreview,uniqueBody,webLink,hasAttachments,isDraft';
  let added=0,allMsgs=[];const attQueue=[];
  try{
    while(url&&allMsgs.length<500){
      const res=await fetch(url,{headers:{Authorization:'Bearer '+outlookToken,Prefer:'outlook.body-content-type="text"'}});
      if(!res.ok){if(res.status===401){outlookToken=null;document.getElementById('outlookConn').className='conn-status off';document.getElementById('outlookConn').textContent='Outlook: session expired'}throw new Error('Outlook API '+res.status)}
      const data=await res.json();
      if(data.value)allMsgs.push(...data.value);
      url=data['@odata.nextLink']||null;
    }
    allMsgs.forEach(msg=>{
      if(msg.isDraft)return; // drafts are not activity
      const key='ol_'+(msg.internetMessageId||msg.id);
      const sAddr=(msg.sender?.emailAddress?.address||'').toLowerCase();
      const _holders=[...S.companies,...S.advisors,...(S.people||[])].filter(r=>r.touches&&r.touches[key]);
      if(_holders.length){
        const _full=cleanPrev((msg.uniqueBody&&msg.uniqueBody.content)||msg.bodyPreview,1500);if(_full&&(_holders[0].touches[key].prev||'').length<_full.length)_holders.forEach(r=>{r.touches[key].prev=_full});
        if(msg.hasAttachments&&!_holders[0].touches[key].att)attQueue.push({key,id:msg.id,holders:_holders});
        return;
      }
      const dir=MY_ADDR.some(a=>sAddr.includes(a))?'out':'in';
      const recipients=(msg.toRecipients||[]).map(r=>(r.emailAddress?.address||'').toLowerCase()).filter(Boolean);
      const text=[msg.subject,msg.bodyPreview,...recipients].join(' ');
      const cand=dir==='in'?[sAddr]:recipients.filter(a=>!MY_ADDR.some(m=>a.includes(m)));
      if(!cand.length)return;
      if(cand.every(isIgnoredAddr))return;
      let recs=[];
      cand.forEach(a=>{matchRecords(text,a,true).forEach(x=>{if(!recs.includes(x))recs.push(x)})});
      const t={date:msg.receivedDateTime,dir,subject:msg.subject||'(no subject)',link:msg.webLink||'',src:'Kinetix',who:dir==='out'?recipients.join(', '):sAddr,prev:cleanPrev((msg.uniqueBody&&msg.uniqueBody.content)||msg.bodyPreview,1500)};
      if(recs.length){recs.forEach(r=>{addTouch(r,key,t)});added++;if(msg.hasAttachments)attQueue.push({key,id:msg.id,holders:recs})}
      else{if(!isDismissedUnmatched(key)&&!(S.unmatched||[]).some(u=>u.key===key)){S.unmatched=S.unmatched||[];S.unmatched.push({...t,key,sender:sAddr})}}
    });
    for(const q of attQueue.slice(0,25)){
      try{
        const ar=await fetch('https://graph.microsoft.com/v1.0/me/messages/'+q.id+'/attachments?$select=name,size',{headers:{Authorization:'Bearer '+outlookToken}});
        if(!ar.ok)continue;
        const names=((await ar.json()).value||[]).map(a=>a.name||'').filter(n=>n&&!/\.(png|jpg|jpeg|gif)$/i.test(n));
        if(names.length)q.holders.forEach(r=>{if(r.touches&&r.touches[q.key])r.touches[q.key].att=names});
      }catch(e){}
    }
  }catch(e){console.warn('Outlook sync error:',e)}
  return added;
}
