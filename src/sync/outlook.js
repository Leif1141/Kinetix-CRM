import {AZURE_CLIENT_ID, AZURE_TENANT} from '../config.js';
import {MY_ADDR} from '../constants.js';
import {S, addTouch} from '../state.js';
import {auth} from '../store/firebase.js';
import {autoPipeline} from './google.js';
import {cleanPrev, toast} from '../util.js';
import {isDismissedUnmatched} from '../views/inbox.js';
import {isIgnoredAddr} from './triage.js';
import {matchRecords} from './match.js';
import {FREEMAIL} from '../constants.js';
import {allRecs, findRec} from '../state.js';
import {parseSignature, firmFromDomain} from './signature.js';
import {today, isGenericMail} from '../util.js';

// A reply from someone at a firm Leif wrote to, with a full signature, becomes a record on the spot instead of
// waiting unassigned in Inbox (Leif 07.11.2026). The record says where it came from and asks for review.
export async function createFromSignatures(msgs){
  const mine=a=>MY_ADDR.some(m=>a.includes(m));
  const sentDom=new Set();
  msgs.forEach(m=>{if(m.isDraft||!mine((m.sender?.emailAddress?.address||'').toLowerCase()))return;(m.toRecipients||[]).forEach(r=>{const d=((r.emailAddress?.address||'').toLowerCase().split('@')[1])||'';if(d)sentDom.add(d)})});
  const ops=[],done=new Set();
  msgs.forEach(m=>{
    if(m.isDraft)return;
    const a=(m.sender?.emailAddress?.address||'').toLowerCase(),dom=a.split('@')[1]||'';
    if(!dom||mine(a)||FREEMAIL.has(dom)||!sentDom.has(dom)||done.has(dom)||isIgnoredAddr(a))return;
    if(matchRecords('',a,true).length)return;
    const sig=parseSignature((m.uniqueBody&&m.uniqueBody.content)||m.bodyPreview,m.sender?.emailAddress?.name||'');
    if(!sig)return;
    done.add(dom);
    const firm=sig.firm||firmFromDomain(dom),d=(m.receivedDateTime||'').slice(0,10)||today();
    // a reply sent from a shared inbox (info@) names the person but is not their address: keep the link, not the email
    // addresses belong to people, never to the organisation (Leif 10.11.2026)
    const set={firm,domain:dom,category:'Other',status:'In dialogue',notes:'Aus Mail-Signatur angelegt am '+d+'; Kategorie und Firmenname prüfen'};
    ['phone','street','zip','city'].forEach(k=>{if(sig[k])set[k]=sig[k]});
    ops.push({op:'upsertAdvisor',match:{firm},set,source:'Mail signature',date:d},{op:'mapEmail',email:a,match:{kind:'advisor',firm}});
    if(sig.name){const ps={name:sig.name,firm,email:isGenericMail(a)?'':a};['mobile','title','linkedin'].forEach(k=>{if(sig[k])ps[k]=sig[k]});ops.push({op:'upsertPerson',match:{kind:'person',name:sig.name},set:ps,source:'Mail signature',date:d})}
  });
  if(!ops.length)return 0;
  const p=await import('./patch.js');
  p.applyPatchObj({kinetixPatch:1,ops},'auto signature '+today()+' '+[...done].join(' '),true);
  return done.size;
}

// Outlook gives a mail a new item id when it moves to another folder, so a link stored earlier goes dead.
// A click on any mail link finds the mail by its time and subject and opens it where it is now.
const itemIdOf=u=>{const s=String(u||'');const m=s.match(/ItemID=([^&]+)/i)||s.match(/deeplink\/read\/([^?&#]+)/i);if(!m)return '';try{return decodeURIComponent(m[1])}catch(e){return m[1]}};
export async function freshMailLink(t){
  if(!t||!t.date)return null;
  if(!outlookToken&&!(await silentOutlook()))return null;
  const d=new Date(t.date);if(isNaN(d))return null;
  const lo=new Date(d.getTime()-2000).toISOString(),hi=new Date(d.getTime()+2000).toISOString();
  const r=await fetch('https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge '+lo+' and receivedDateTime le '+hi+'&$select=subject,webLink&$top=10',{headers:{Authorization:'Bearer '+outlookToken}});
  if(!r.ok)return null;
  const v=(await r.json()).value||[],s=String(t.subject||'').trim().toLowerCase();
  const hit=v.find(x=>String(x.subject||'').trim().toLowerCase()===s)||(v.length===1?v[0]:null);
  return hit?hit.webLink:null;
}
function touchByLink(href){
  const id=itemIdOf(href);if(!id)return null;
  for(const r of allRecs())for(const t of Object.values(r.touches||{}))if(t&&t.link&&itemIdOf(t.link)===id)return t;
  return null;
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
  const href=a.getAttribute('href');const t=touchByLink(href);if(!t)return;
  e.preventDefault();e.stopPropagation();
  const w=window.open('',a.getAttribute('target')||'kinetixmail');
  const old=t.link;
  freshMailLink(t).catch(()=>null).then(f=>{
    if(f&&f!==old)allRecs().forEach(r=>Object.values(r.touches||{}).forEach(x=>{if(x&&x.link===old)x.link=f}));
    const id=itemIdOf(f||old),url=id?'https://outlook.cloud.microsoft/mail/deeplink/read/'+encodeURIComponent(id):(f||old);
    if(w)w.location.href=url;else window.open(url,'kinetixmail');
  });
},true);

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
    try{await createFromSignatures(allMsgs)}catch(e){console.warn('signature contacts:',e)}
    allMsgs.forEach(msg=>{
      if(msg.isDraft)return; // drafts are not activity
      const key='ol_'+(msg.internetMessageId||msg.id);
      const sAddr=(msg.sender?.emailAddress?.address||'').toLowerCase();
      const _holders=[...S.companies,...S.advisors,...(S.people||[])].filter(r=>r.touches&&r.touches[key]);
      if(_holders.length){
        // a mail moved to Archive or another folder gets a new item id: keep the stored link current
        if(msg.webLink)_holders.forEach(r=>{if(r.touches[key].link!==msg.webLink)r.touches[key].link=msg.webLink});
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
      else{if(!isDismissedUnmatched(key)&&!(S.unmatched||[]).some(u=>u.key===key)){S.unmatched=S.unmatched||[];S.unmatched.push({...t,key,sender:sAddr,sname:dir==='in'?(msg.sender?.emailAddress?.name||''):(((msg.toRecipients||[]).find(r=>!MY_ADDR.some(m=>(r.emailAddress?.address||'').toLowerCase().includes(m)))||{}).emailAddress?.name||'')})}}
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
