// In-memory stand-in for the Firebase compat SDK, used only by the local harness (_harness.html).
// Serves tools/harness/data/KinetixCRM Backup.json as the database content and signs in a fake user.
// Records every write in window.__writes so tests can assert what the app sent.
(function(){
  const DATA_URL='tools/harness/data/KinetixCRM Backup.json';
  const ENC=k=>k.replace(/\./g,'__dot__').replace(/\$/g,'__dlr__').replace(/#/g,'__hash__').replace(/\[/g,'__lb__').replace(/\]/g,'__rb__');
  function encKeys(o){if(o===null||typeof o!=='object')return o;if(Array.isArray(o))return o.map(encKeys);const out={};for(const[k,v]of Object.entries(o))out[ENC(k)]=encKeys(v);return out}
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  let root={}; let ready=false; const waiters=[];
  const listeners=[]; // {path, ev, cb, children:Set}
  window.__writes=[];
  const segs=p=>(p||'').split('/').filter(Boolean);
  function getAt(path){let n=root;for(const s of segs(path)){if(n===null||typeof n!=='object'||!(s in n))return null;n=n[s]}return n===undefined?null:n}
  function prune(v){ // Firebase drops null, undefined, empty objects and empty arrays
    if(v===null||v===undefined)return null;
    if(Array.isArray(v)){const o={};v.forEach((x,i)=>{const p=prune(x);if(p!==null)o[i]=p});return Object.keys(o).length?o:null}
    if(typeof v==='object'){const o={};for(const[k,x]of Object.entries(v)){const p=prune(x);if(p!==null)o[k]=p}return Object.keys(o).length?o:null}
    return v;
  }
  function setAt(path,value){
    const ss=segs(path);const v=prune(clone(value));
    if(!ss.length){root=v||{};return}
    let n=root;for(let i=0;i<ss.length-1;i++){if(n[ss[i]]===null||typeof n[ss[i]]!=='object')n[ss[i]]={};n=n[ss[i]]}
    if(v===null)delete n[ss[ss.length-1]];else n[ss[ss.length-1]]=v;
    // remove emptied parents
    let p=root;const stack=[];for(let i=0;i<ss.length-1;i++){stack.push([p,ss[i]]);p=p[ss[i]]}
    for(let i=stack.length-1;i>=0;i--){const[o,k]=stack[i];if(o[k]&&typeof o[k]==='object'&&!Object.keys(o[k]).length)delete o[k]}
  }
  // Firebase returns objects whose keys are all small integers as arrays (sparse slots become null).
  function arrify(v){if(v===null||typeof v!=='object')return v;const ks=Object.keys(v);if(ks.length&&ks.every(k=>/^\d+$/.test(k))){const max=Math.max(...ks.map(Number));if(ks.length>max/2){const a=new Array(max+1).fill(null);ks.forEach(k=>a[+k]=arrify(v[k]));return a}}const o={};for(const k of ks)o[k]=arrify(v[k]);return o}
  function snap(path){const v=arrify(clone(getAt(path)));const key=segs(path).slice(-1)[0]||null;return {val:()=>v===undefined?null:v,key,exists:()=>v!==null&&v!==undefined,forEach(cb){if(v&&typeof v==='object')Object.keys(v).forEach(k=>cb(snap(path+'/'+k)))}}}
  function notify(changedPaths){
    for(const l of listeners){
      const touched=changedPaths.some(p=>p===l.path||p.startsWith(l.path+'/')||l.path.startsWith(p+'/')||l.path===''||p==='');
      if(!touched)continue;
      if(l.ev==='value'){l.cb(snap(l.path));continue}
      const now=getAt(l.path)||{};const keys=new Set([...Object.keys(now),...l.children.keys()]);
      for(const k of keys){
        const before=l.children.get(k),after=now[k]===undefined?undefined:JSON.stringify(now[k]);
        if(before===undefined&&after!==undefined){l.children.set(k,after);if(l.ev==='child_added')l.cb(snap(l.path+'/'+k))}
        else if(before!==undefined&&after===undefined){l.children.delete(k);if(l.ev==='child_removed')l.cb({val:()=>JSON.parse(before),key:k,exists:()=>true})}
        else if(before!==after){l.children.set(k,after);if(l.ev==='child_changed')l.cb(snap(l.path+'/'+k))}
      }
    }
  }
  function whenReady(fn){if(ready)fn();else waiters.push(fn)}
  function Ref(path){this.path=segs(path).join('/')}
  Ref.prototype.child=function(p){return new Ref(this.path+'/'+p)};
  Ref.prototype.on=function(ev,cb){const l={path:this.path,ev,cb,children:new Map()};listeners.push(l);whenReady(()=>{if(ev==='value'){cb(snap(l.path))}else if(ev==='child_added'){const now=getAt(l.path)||{};Object.keys(now).forEach(k=>{l.children.set(k,JSON.stringify(now[k]));cb(snap(l.path+'/'+k))})}else{const now=getAt(l.path)||{};Object.keys(now).forEach(k=>l.children.set(k,JSON.stringify(now[k])))}});return cb};
  Ref.prototype.off=function(ev,cb){for(let i=listeners.length-1;i>=0;i--){const l=listeners[i];if(l.path===this.path&&(!ev||l.ev===ev)&&(!cb||l.cb===cb))listeners.splice(i,1)}};
  Ref.prototype.once=function(ev){return new Promise(res=>whenReady(()=>res(snap(this.path))))};
  Ref.prototype.set=function(v){window.__writes.push({op:'set',path:this.path,bytes:JSON.stringify(v===undefined?null:v).length});setAt(this.path,v);notify([this.path]);return Promise.resolve()};
  Ref.prototype.update=function(obj){const paths=[];for(const[k,v]of Object.entries(obj||{})){const p=segs(this.path+'/'+k).join('/');setAt(p,v);paths.push(p)}window.__writes.push({op:'update',path:this.path,keys:Object.keys(obj||{}).length,bytes:JSON.stringify(obj).length});notify(paths);return Promise.resolve()};
  Ref.prototype.remove=function(){return this.set(null)};
  Ref.prototype.push=function(v){const k='-H'+Math.random().toString(36).slice(2,12);const r=new Ref(this.path+'/'+k);if(v!==undefined)r.set(v);return r};
  const db={ref:p=>new Ref(p||''),goOffline(){},goOnline(){}};
  const user={email:(new URLSearchParams(location.search).get('as'))||'leif.berger26@gmail.com',displayName:'Harness user',uid:'harness-uid'};
  const authCbs=[];
  const authObj={
    setPersistence:()=>Promise.resolve(),getRedirectResult:()=>Promise.resolve(null),
    onAuthStateChanged(cb){authCbs.push(cb);whenReady(()=>cb(user))},
    signInWithPopup:()=>Promise.resolve({user}),signInWithRedirect:()=>Promise.resolve(),signOut:()=>{authCbs.forEach(cb=>cb(null));return Promise.resolve()},
    currentUser:user
  };
  function GoogleAuthProvider(){this.setCustomParameters=()=>{}}
  const fb={initializeApp:()=>({}),database:()=>db,auth:()=>authObj};
  fb.auth.GoogleAuthProvider=GoogleAuthProvider;fb.auth.Auth={Persistence:{LOCAL:'local'}};
  window.firebase=fb;
  window.__db={get:getAt,set:(p,v)=>{setAt(p,v);notify([p])},root:()=>root,ready:()=>ready};
  // Load the data. Harness pages are served from the repo root.
  const seedPath=new URLSearchParams(location.search).get('data');
  fetch(seedPath||DATA_URL).then(r=>r.ok?r.json():Promise.reject(new Error(r.status+' '+r.url))).then(d=>{
    const mode=new URLSearchParams(location.search).get('mode')||'blob';
    const done=()=>{ready=true;waiters.splice(0).forEach(fn=>fn());console.log('[harness] data ready, mode='+mode)};
    if(mode==='blob'){root={crm:prune(encKeys(d))};done()}          // today's layout: the backup is the blob
    else if(mode==='empty'){root={};done()}
    else return import('/src/store/shards.js').then(m=>{root={crm:prune(m.encodeKeys(m.shard(d)))};done()}); // phase 1 layout
  }).catch(e=>{console.error('[harness] data load failed',e);ready=true;waiters.splice(0).forEach(fn=>fn())});
  // MSAL and Google Identity are absent in the harness; the app treats both as not connected.
  window.msal=window.msal||{};
})();
