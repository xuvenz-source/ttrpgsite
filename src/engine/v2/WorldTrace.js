/** Bounded opt-in World Engine V2 diagnostic timeline.
 * No network/storage/console logging. Only enumerated event names/details:
 * never IDs, coordinates, RPC payloads, user text or error messages.
 * Enable with ?worldV2Trace=1 then window.__worldV2Trace.snapshot().
 */
const EVENTS=new Set([
 'input.pointer.status','input.pointer.start','input.pointer.end',
 'input.pick',
 'input.pointer.cancel','input.pointer.blur','input.keyboard.start','input.keyboard.end',
 'movement.grabbed','movement.approved','movement.blocked','movement.released',
 'movement.committed','movement.cancelled','movement.rejected','movement.revoked',
 'observer.seal','observer.resync','observer.authorized','observer.invalid-frame',
 'observer.version-change','observer.sequence-gap','observer.late-frame',
 'observer.unknown-piece','observer.sight-hold','visibility.revoke','visibility.refresh',
 'visibility.snapshot','visibility.stale-snapshot',
 'visibility.reject','visibility.notice','renderer.seal','renderer.scene-adopt',
 'renderer.visibility-reject','renderer.static-draw','renderer.fog-full',
 'renderer.fog-partial','renderer.opaque','renderer.visibility-stale',
 'renderer.sprite-create',
 'renderer.sprite-remove','renderer.terrain-assign',
 'renderer.mount','renderer.unmount','renderer.observer-await-vision',
 'renderer.position-local','renderer.position-remote','render.frame-gap'
]);
const METRICS=new Set(['authority.begin','authority.advance','authority.commit',
 'authority.cancel','visibility.rpc','render.frame','render.frame-interval',
 'movement.local-first-position-paint','movement.remote-first-position-paint']);
const DETAILS=new Set(['','other','ok','error','full','partial','none','initial',
 'revision','drag','touch','keyboard','preview','grabbed','busy','point',
 'selection','begin','lost-capture','pointer-cancel','blur','unmount',
 'scene-change','scene-publication','invalid-published-scene',
 'invalid-or-stale-visibility','observer-sequence-gap',
 'observer-path-not-in-authorized-fog','observer-path-discontinuity',
 'invalid-fog-mask','bad-roster','sprite-factory-error',
 'permission-generation-changed','invalid-vision-notice',
 'vision-version-change','invalid-snapshot','context-change','disposed',
 'disconnected','subscribed','sight-retry','sequence-gap','invalid-packet',
 'version-change','unknown-piece','scene-current','observer-resync',
 'movement-vision-dirty','virtual-preview-step','virtual-preview-final',
 'committed','gesture-failed','scene-resync','board-active',
 'map-roster-metadata-changed','queued','manual','canonical-commit',
 'invalid-authorized-roster','invalid-frame','viewer-scope-mismatch',
 'environment-revision-mismatch','scene-generation-mismatch',
 'observer-cursor-regression','stale-visibility-frame',
 'gesture-revoked','viewer-map-switch','permission-revoked',
 'authorization-revoked','resync-error','authorized','permission','stale',
 'gate','hit','owner','roster','current','origin','runtime-inactive','runtime-roster',
 'user','tool-handoff','scene','visibility','input','network',
 'authority','sequence','sprite']);
const clock=()=>typeof performance!=='undefined'&&
 typeof performance.now==='function'?performance.now():Date.now();
const q=(a,p)=>a.length?Math.round(a[Math.max(0,Math.ceil(a.length*p)-1)]*10)/10:0;
export function createWorldV2Trace({enabled=false,limit=256,now=clock}={}){
 const cap=Number.isSafeInteger(limit)?Math.min(512,Math.max(16,limit)):256;
 const events=[],times=new Map(),counts=new Map(),start=now();
 // Strictly one pending first-position paint per kind. Never retain IDs,
 // coordinates, callbacks, packet data or arbitrary labels.
 const pendingMotion={local:null,remote:null};
 let lastFrameTime=null;
 function event(name,detail=''){
  if(!enabled||!EVENTS.has(name))return;
  events.push({ms:Math.max(0,Math.round(now()-start)),event:name,
   detail:typeof detail==='string'&&DETAILS.has(detail)?detail:'other'});
  if(events.length>cap)events.shift();
  counts.set(name,Math.min(2147483647,(counts.get(name)||0)+1));
 }
 function recordDuration(name,elapsed,result='ok'){
  if(!enabled||!METRICS.has(name)||!Number.isFinite(elapsed)||
   elapsed<0)return;
  let a=times.get(name);
  if(!a){a=[];times.set(name,a)}
  a.push(elapsed);if(a.length>cap)a.shift();
  if(result==='error')counts.set(name+'.error',
   Math.min(2147483647,(counts.get(name+'.error')||0)+1));
 }
 function begin(name){
  if(!enabled||!METRICS.has(name))return ()=>{};
  const started=now();
  return result=>recordDuration(name,now()-started,result);
 }
 function startMotion(kind){
  if(!enabled||!Object.hasOwn(pendingMotion,kind))return;
  pendingMotion[kind]=now();
 }
 function positionPaint(kind){
  if(!enabled||!Object.hasOwn(pendingMotion,kind)||
   pendingMotion[kind]===null)return;
  const started=pendingMotion[kind];pendingMotion[kind]=null;
  recordDuration('movement.'+kind+'-first-position-paint',now()-started);
  event('renderer.position-'+kind);
 }
 function endMotion(kind){
  if(Object.hasOwn(pendingMotion,kind))pendingMotion[kind]=null;
 }
 function frameTick(rafTime){
  if(!enabled||!Number.isFinite(rafTime))return;
  if(lastFrameTime!==null){
   const gap=rafTime-lastFrameTime;
   // Background-tab suspension is not a normal foreground animation frame.
   // Omit intervals >=1 second and nonmonotonic clocks rather than skew p95.
   if(gap>0&&gap<1000){
    recordDuration('render.frame-interval',gap);
    if(gap>50)event('render.frame-gap');
   }
  }
  lastFrameTime=rafTime;
 }
 function snapshot(){
  const durations={};
  for(const [name,rows] of times){
   const a=[...rows].sort((x,y)=>x-y);
   durations[name]={samples:a.length,p50Ms:q(a,.5),p95Ms:q(a,.95),maxMs:q(a,1)};
  }
  return {enabled:Boolean(enabled),limit:cap,
   events:events.map(x=>({...x})),counts:Object.fromEntries(counts),durations};
 }
 function clear(){
  events.length=0;times.clear();counts.clear();
  pendingMotion.local=null;pendingMotion.remote=null;lastFrameTime=null;
 }
 return Object.freeze({enabled:Boolean(enabled),event,begin,startMotion,
  positionPaint,endMotion,frameTick,snapshot,clear});
}
const enabled=typeof window!=='undefined'&&
 typeof window.location?.search==='string'&&
 new URLSearchParams(window.location.search).get('worldV2Trace')==='1';
export const worldV2Trace=createWorldV2Trace({enabled});
if(enabled)window.__worldV2Trace=Object.freeze({
 snapshot:()=>worldV2Trace.snapshot(),clear:()=>worldV2Trace.clear()
});
