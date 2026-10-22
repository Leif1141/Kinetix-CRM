import {S} from '../state.js';
import {autoDriveBackup, checkDriveUpdates} from './drive.js';
import {backfillPersonTouches, reconcileDraftActions, retriageUnmatched} from './triage.js';
import {reconcileStatuses} from '../views/orgs.js';
import {renderAll} from '../main.js';
import {save} from '../store/firebase.js';
import {syncGmailEmails} from './google.js';
import {syncGranolaCalls} from './granola.js';
import {syncOutlookEmails} from './outlook.js';
import {toast} from '../util.js';

export async function syncEmails(){
  const btn=document.getElementById('btnSync');btn.disabled=true;btn.textContent='Syncing…';
  const st=document.getElementById('syncStatus');
  let total=0;
  try{
    const [ol,gm,gr]=await Promise.all([syncOutlookEmails(),syncGmailEmails(),syncGranolaCalls()]);
    total=ol+gm+gr;
    try{await checkDriveUpdates(true)}catch(e){}
    backfillPersonTouches();
    const _rt=retriageUnmatched();if(_rt.assigned||_rt.dropped)toast('Inbox triage: '+_rt.assigned+' auto-assigned, '+_rt.dropped+' cleared');
    const _rd=reconcileDraftActions();if(_rd)toast(_rd+' draft action'+(_rd>1?'s':'')+' auto-completed (email was sent)');
    const _rs=reconcileStatuses();if(_rs)toast(_rs+' advisor status'+(_rs>1?'es':'')+' auto-advanced');
    S.lastSync=new Date().toISOString();
    save();
    st.textContent='Synced '+new Date().toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' · '+total+' new';
    toast('Sync done — '+total+' new activities');
  }catch(e){
    st.textContent='Sync error';
    toast('Sync failed: '+e.message);
  }
  btn.disabled=false;btn.textContent='Sync';
  autoDriveBackup();
  renderAll();
}
