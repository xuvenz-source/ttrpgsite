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
 'movement.reject-phase','movement.reject-reason',
 'movement.canonical-handoff','movement.cancel-reason',
 'observer.seal','observer.resync','observer.authorized','observer.invalid-frame',
 'observer.version-change','observer.sequence-gap','observer.late-frame',
 'observer.unknown-piece','observer.frame-accepted',
 'observer.guarded-start','observer.guarded-held','observer.guarded-recovered',
 'visibility.revoke','visibility.refresh',
 'visibility.rpc-call','visibility.rpc-tail','visibility.queue',
 'visibility.continuation',
 'visibility.snapshot','visibility.stale-snapshot',
 'visibility.reject','visibility.notice','renderer.seal','renderer.scene-adopt',
 'renderer.visibility-reject','renderer.static-draw','renderer.fog-full',
 'renderer.fog-partial','renderer.opaque','renderer.visibility-stale',
 'renderer.sprite-create',
 'renderer.sprite-remove','renderer.terrain-assign',
 'renderer.observer-discontinuity'
]);
const METRICS=new Set(['authority.begin','authority.advance','authority.commit',
 'authority.finalize','authority.cancel','movement.release-to-terminal','visibility.rpc','visibility.queue-wait',
 'observer.frame-gap','render.frame',
 // R18-39 opt-in local browser-only CPU measurements, never a server RPC.
 'input.pointer.processing','movement.prediction-check']);
const COUNTERS=new Set([
 'input.pointer.move-events','input.pointer.samples','input.pointer.batches',
 'input.pointer.batched-samples','input.pointer.single-events',
 'movement.prediction-checked','movement.prediction-skipped'
]);
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
 'observer-guarded-sight','observer-guarded-timeout',
 'observer-guarded-overflow','observer-guarded-invalid',
 'observer-guarded-rejected','observer-guarded-stale','observer-guarded-error',
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
 'authority','sequence','sprite',
 'advance','commit','finalize','path','invalid-path','invalid-authority-ack',
 'invalid-commit','invalid-final-ack','begin-failed','invalid-session','path-limit',
 'rpc-unavailable','invalid-server-reply','client-contract',
 'session-cancelled','authority-error','reused-commit',
 'keyboard-unmount','map-change','dispose',
 'over-750ms','over-2s','over-5s','coalesced','drained','discarded',
 'covered','fallback','origin-mismatch','backlog']);
// Privacy allowlist readers for local QA export. No additional trace data.
export const isWorldV2TraceEvent=name=>EVENTS.has(name);
export const isWorldV2TraceDetail=detail=>DETAILS.has(detail);
export const isWorldV2TraceMetric=name=>METRICS.has(name);
export const isWorldV2TraceCounter=name=>COUNTERS.has(name);
const clock=()=>typeof performance!=='undefined'&&
 typeof performance.now==='function'?performance.now():Date.now();
const q=(a,p)=>a.length?Math.round(a[Math.max(0,Math.ceil(a.length*p)-1)]*10)/10:0;
export function createWorldV2Trace({enabled=false,limit=256,now=clock}={}){
 const cap=Number.isSafeInteger(limit)?Math.min(512,Math.max(16,limit)):256;
 const events=[],times=new Map(),counts=new Map(),start=now();
 let resetGeneration=0;
 function event(name,detail=''){
  if(!enabled||!EVENTS.has(name))return;
  events.push({ms:Math.max(0,Math.round(now()-start)),event:name,
   detail:typeof detail==='string'&&DETAILS.has(detail)?detail:'other'});
  if(events.length>cap)events.shift();
  counts.set(name,Math.min(2147483647,(counts.get(name)||0)+1));
 }
 // Opt-in aggregate counters do NOT write per-event timeline entries:
 // an ordinary pointer burst must never evict useful authority history.
 // Delta is bounded and cannot carry coordinates, IDs, or arbitrary labels.
 function count(name,delta=1){
  if(!enabled||!COUNTERS.has(name)||
   !Number.isSafeInteger(delta)||delta<1||delta>65536)return;
  counts.set(name,Math.min(2147483647,(counts.get(name)||0)+delta));
 }
 function begin(name){
  if(!enabled||!METRICS.has(name))return ()=>{};
  const start=now(),generation=resetGeneration;
  return result=>{
   // Ignore timers started before a trace-clear; otherwise the next
   // observer packet can report minutes of idle time as movement latency.
   if(generation!==resetGeneration)return;
   const elapsed=now()-start;
   if(!Number.isFinite(elapsed)||elapsed<0)return;
   let a=times.get(name);if(!a){a=[];times.set(name,a)}
   a.push(elapsed);if(a.length>cap)a.shift();
   if(result==='error')counts.set(name+'.error',
    Math.min(2147483647,(counts.get(name+'.error')||0)+1));
  };
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
 function clear(){resetGeneration++;events.length=0;times.clear();counts.clear()}
 return Object.freeze({enabled:Boolean(enabled),event,count,begin,snapshot,clear});
}
const enabled=typeof window!=='undefined'&&
 typeof window.location?.search==='string'&&
 new URLSearchParams(window.location.search).get('worldV2Trace')==='1';
export const worldV2Trace=createWorldV2Trace({enabled});
if(enabled)window.__worldV2Trace=Object.freeze({
 snapshot:()=>worldV2Trace.snapshot(),clear:()=>worldV2Trace.clear()
});
