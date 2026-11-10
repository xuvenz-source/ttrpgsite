/**
 * B10-R02 — optional bounded authoritative-sight recovery when a private
 * Realtime packet is delayed by the B07/B08 free-tier observer budget.
 *
 * Timers request EXISTING per-viewer signed sight through the injected
 * callback, not a new channel, public token feed, fog rebuild or SQL poll.
 * No request occurs while the viewport is backgrounded, disconnected or
 * unauthorized. The caller's sight controller MUST fail closed on denial.
 *
 * This is a safety fallback for missing COMMITTED canonical movement; it
 * cannot reconstruct uncommitted drag steps that the server never delivered.
 */
export const OBSERVER_RECOVERY_INTERVAL_MS=6000;

export function createObserverRecoveryWatch({
 check,canCheck,isForeground=()=>true,
 intervalMs=OBSERVER_RECOVERY_INTERVAL_MS,
 schedule=(fn,delay)=>setTimeout(fn,delay),
 cancel=handle=>clearTimeout(handle),
 onError=()=>{}
}={}){
 if(typeof check!=='function'||typeof canCheck!=='function'||
  typeof isForeground!=='function'||typeof schedule!=='function'||
  typeof cancel!=='function'||typeof onError!=='function'||
  !Number.isSafeInteger(intervalMs)||intervalMs<4000||intervalMs>30000)
  throw Error('Invalid V2 observer recovery watch');
 let started=false,disposed=false,timer=null,inFlight=null;
 let checks=0,denials=0;
 function clear(){
  if(timer!==null){cancel(timer);timer=null}
 }
 function scheduleNext(){
  if(disposed||!started||timer!==null||inFlight)return;
  timer=schedule(()=>{timer=null;void run()},intervalMs);
 }
 function run(){
  if(disposed||!started)return Promise.resolve(false);
  if(inFlight)return inFlight;
  if(!isForeground()||!canCheck()){
   scheduleNext();return Promise.resolve(false);
  }
  // Even a rejected/expired signed sight is handled only by the caller's
  // fail-closed controller. Do not retry on a hot loop or overlap RPCs.
  checks++;
  const task=Promise.resolve().then(check).then(x=>x===true)
   .catch(error=>{
    denials++;
    try{onError(error)}catch{}
    return false;
   }).finally(()=>{
    if(inFlight===task)inFlight=null;
    scheduleNext();
   });
  inFlight=task;
  return task;
 }
 return Object.freeze({
  start(){
   if(disposed)return false;
   if(started)return true;
   started=true;scheduleNext();return true;
  },
  // The host calls this after a background tab becomes visible. A single
  // signed snapshot is obtained immediately, without a timer burst.
  resume(){
   if(disposed||!started)return Promise.resolve(false);
   if(inFlight)return inFlight;
   clear();return run();
  },
  stop(){started=false;clear()},
  dispose(){disposed=true;started=false;clear()},
  get enabled(){return started&&!disposed},
  get busy(){return inFlight!==null},
  get statistics(){return Object.freeze({checks,denials})}
 });
}
