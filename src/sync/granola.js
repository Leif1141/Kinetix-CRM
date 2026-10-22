import {S, addTouch, allOrgs, allRecs, dispName, findRec} from '../state.js';
import {driveCall, driveProxy, driveReady} from './drive.js';
import {gmailToken} from './google.js';
import {isDismissedUnmatched} from '../views/inbox.js';
import {matchRecords} from './match.js';
import {normName} from '../util.js';

export async function syncGranolaCalls(){
  if(!driveReady())return 0;
  try{
    let gfiles=null;
    if(driveProxy){gfiles=(await driveCall('granola')).files||[]}
    else if(!S.granolaFolderId){
      const q0=encodeURIComponent("name='Granola Call Notes' and mimeType='application/vnd.google-apps.folder' and trashed=false");
      const r0=await fetch('https://www.googleapis.com/drive/v3/files?q='+q0+'&fields=files(id,name)',{headers:{Authorization:'Bearer '+gmailToken}});
      const ff=((await r0.json()).files||[])[0];
      if(!ff)return 0;
      S.granolaFolderId=ff.id;
    }
    if(!gfiles){
      const q=encodeURIComponent("'"+S.granolaFolderId+"' in parents and trashed=false");
      const res=await fetch('https://www.googleapis.com/drive/v3/files?q='+q+'&orderBy=createdTime desc&pageSize=60&fields=files(id,name,webViewLink,createdTime)',{headers:{Authorization:'Bearer '+gmailToken}});
      if(!res.ok)throw new Error('Drive '+res.status);
      gfiles=(await res.json()).files||[];
    }
    let added=0;
    for(const f of gfiles){
      const key='gr_'+f.id;
      if(allRecs().some(r=>r.touches&&r.touches[key]))continue;
      if((S.unmatched||[]).some(u=>u.key===key))continue;
      if(isDismissedUnmatched(key))continue;
      const m=(f.name||'').match(/^(\d{4})(\d{2})(\d{2})\s+(.+?)(\s*\[[0-9a-f-]+\])?\.docx$/i);
      const date=m?(m[1]+'-'+m[2]+'-'+m[3]+'T12:00:00Z'):(f.createdTime||new Date().toISOString());
      const title=m?m[4]:(f.name||'Call');
      const t={date:date,dir:'out',subject:'\uD83D\uDCDE '+title,link:f.webViewLink||'',src:'Granola',who:''};
      let recs=[];
      const nt=normName(title);
      (S.people||[]).forEach(p=>{const pn=normName(p.name||'');if(pn&&pn.length>5&&nt.includes(pn)){recs.push(p);if(p.orgId){const o=findRec(p.orgId);if(o&&!recs.includes(o))recs.push(o)}}});
      if(!recs.length)allOrgs().forEach(o=>{const cn=normName((o.contact||'').replace(/\(.*?\)/g,''));const fn=normName(dispName(o)||'');if((cn&&cn.length>5&&nt.includes(cn))||(fn&&fn.length>5&&nt.includes(fn)))recs.push(o)});
      if(!recs.length)recs=matchRecords(title,'',false);
      if(recs.length){recs.forEach(r=>addTouch(r,key,t));added++}
      else{S.unmatched=S.unmatched||[];S.unmatched.push(Object.assign({},t,{key:key,sender:'granola'}))}
    }
    return added;
  }catch(e){console.warn('Granola sync error:',e);return 0}
}
