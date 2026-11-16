import {ADV_CATS, ADV_STATUS, CHANNELS, DEADREASONS, OUTREACH, PTYPES, STAGES} from './constants.js';

// Patch contract as data (Leif 16.11.2026); exported in the backup and as KinetixCRM Contract.json. Version +1 on any change.
const SET_FIELDS=['metrics','namedOn','street','zip','homeStreet','homeZip','homeCity','notes','nextAction','nextDate','nextSet','angle','flag','description','contact','email','domain','title','city','address','networkPath','introPath','ptype','market','geo','status','category','ownership','location','priority','firm','cadence','orgId','linkedin','phone','mobile','detail','lastSummary','lastSummaryDate','deadReason','revisitDate','revenue','ebitda','ebit','gm','industry','tier','website','rationale','score','verdict','outreachChannel','stage','channel','channelVia','letterSent','letterStatus','fav','ignored','cadDone','archived','deadCat','primaryId'];

export const CONTRACT={
  version:1,
  updated:'2026-11-16',
  ops:{
    upsertAdvisor:['match','set'],
    upsertCompany:['match','set'],
    upsertPerson:['match','set'],
    addTouch:['match','key','touch'],
    setStage:['match','stage'],
    thread:['id'],
    mapEmail:['match','email'],
    ignore:['email|domain'],
    setTouch:['match','key','fields'],
    setTouchLink:['match','link'],
    dismissUnmatched:['key'],
    setThread:['id','fields'],
    setField:['match','field','value'],
    noteDone:['match','at'],
    merge:['match','into'],
    addList:['name'],
    addToList:['match','name'],
    removeFromList:['match','name'],
    setAnalysed:['items'],
    renameList:['from','to'],
    removeList:['name'],
    dashSet:['key','value'],
    dashAddProgress:['entry'],
    dashUpsertTodo:['id|set'],
    dashRemoveTodo:['id'],
    dashUpsertDecision:['decision'],
    dashDismiss:['decision'],
    dashRestore:['decision']
  },
  setFieldAllowed:{target:SET_FIELDS,advisor:SET_FIELDS,person:SET_FIELDS},
  threadFields:['r','a','o','e','due','p','cat','checked'],
  derived:['thread.a'],
  enums:{
    advisorCategory:ADV_CATS,
    advisorStatus:ADV_STATUS,
    personPtype:PTYPES,
    targetStage:STAGES,
    deadCat:DEADREASONS,
    channel:CHANNELS,
    outreachChannel:OUTREACH,
    threadVerdict:['OPEN_LEIF','OPEN_THEM','CLOSED','DEAD','UNCLEAR']
  },
  skipReasons:['unknown_op','no_match','field_rejected','archived_target','noop'],
  redirectReasons:['contact_to_person']
};
export function fieldAllowed(kind,field){return ((CONTRACT.setFieldAllowed[kind]||[])).includes(field)}
