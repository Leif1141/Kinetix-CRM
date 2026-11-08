// ═══════════════════════════════════════════════════════════════
// Delegated events. Markup names an action instead of carrying inline JavaScript:
//   data-click="sugAct|done|r123|due_r123|$e"   data-change="setStatusInline|r123|$v"
//   data-input, data-enter (Enter in a field), data-toggle (details), data-dragstart, data-dragend,
//   data-dragover, data-dragleave, data-drop
// Arguments are strings, except: $e event, $el element, $v value, $vn value as number, $c checked,
// #12 the number 12. A leading ! stops the event there (outer handlers do not run); "!" alone only stops.
// Handlers run from the innermost element outwards, like inline handlers did; ev.stopPropagation()
// inside an action stops the walk as before.
// Actions come from registerActions(), never from window.
// ═══════════════════════════════════════════════════════════════
const ACT=Object.create(null);
const SRC=Object.create(null);
export function registerActions(map,src,override){
  for(const [k,v] of Object.entries(map)){
    if(typeof v!=='function')continue;
    if(ACT[k]&&ACT[k]!==v&&!override){console.error('action name exported twice: '+k+' ('+SRC[k]+', '+src+')');continue}
    ACT[k]=v;SRC[k]=src||'';
  }
}
export function hasAction(name){return !!ACT[name]}

const ATTR={click:'click',change:'change',input:'input',keydown:'enter',toggle:'toggle',dragstart:'dragstart',dragend:'dragend',dragover:'dragover',dragleave:'dragleave',drop:'drop'};
function arg(a,e,el){
  if(a==='$e')return e;
  if(a==='$el')return el;
  if(a==='$v')return el.value;
  if(a==='$vn')return Number(el.value);
  if(a==='$c')return el.checked;
  if(a[0]==='#'&&a.length>1&&!isNaN(+a.slice(1)))return Number(a.slice(1));
  return a;
}
// returns true when the walk should stop
function run(spec,e,el){
  let stop=false;
  if(spec[0]==='!'){stop=true;spec=spec.slice(1)}
  if(!spec)return stop;
  const parts=spec.split('|');
  const fn=ACT[parts[0]];
  if(!fn){console.error('unknown action: '+parts[0]);return true}
  try{fn(...parts.slice(1).map(a=>arg(a,e,el)))}catch(err){console.error('action '+parts[0],err)}
  return stop;
}
function dispatch(type,e){
  if(type==='keydown'&&e.key!=='Enter')return;
  const attr='data-'+ATTR[type];
  let stopped=false;
  const orig=e.stopPropagation;
  e.stopPropagation=function(){stopped=true;return orig.call(e)};
  for(let el=e.target;el&&el.nodeType===1&&!stopped;el=el.parentElement){
    const spec=el.getAttribute(attr);
    if(spec===null)continue;
    if(run(spec,e,el))stopped=true;
  }
}
let _wired=false;
export function initEvents(){
  if(_wired)return;_wired=true;
  for(const type of Object.keys(ATTR)){
    // toggle does not bubble, so it is caught on the way down
    document.addEventListener(type,e=>dispatch(type,e),type==='toggle');
  }
}

// small actions that used to be inline expressions
export const helperActions={
  openRec(id,e){if(e&&e.target&&e.target.closest&&e.target.closest('a'))e.preventDefault();const r=ACT.findRec&&ACT.findRec(id);if(r)ACT.openProfile(r)},
  newRecord(kind){const f={target:ACT.newCompany,advisor:ACT.newAdvisor,person:ACT.newPerson}[kind];if(f)ACT.openProfile(f())},
  newFromSelect(el){const v=el.value;el.value='';if(v==='t')helperActions.newRecord('target');else if(v==='a')helperActions.newRecord('advisor')},
  toggleBodyClass(c){document.body.classList.toggle(c)},
  toggleClass(el,c){el.classList.toggle(c)},
  addClass(el,c){el.classList.add(c)},
  removeClass(el,c){el.classList.remove(c)},
  clickEl(id){const x=document.getElementById(id);if(x)x.click()},
  clearField(id,action){const x=document.getElementById(id);if(x)x.value='';if(action&&ACT[action])ACT[action]()},
};
