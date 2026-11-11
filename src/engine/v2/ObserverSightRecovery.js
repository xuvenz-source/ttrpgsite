/**
 * R16: bounded recovery of a valid private observer route that outran the
 * local cosmetic buffer. Only signed visibility may reconcile the path.
 * Repeated stale signed frames must not leave that route permanently frozen.
 * This helper does not authorize sprites, inspect paths or send motion.
 */
export function createObserverSightRecovery({
 refresh,isWaiting,isAuthorized,onExhausted=()=>false,maxAttempts=3
}={}){
 if(typeof refresh!=='function'||typeof isWaiting!=='function'||
  typeof isAuthorized!=='function'||typeof onExhausted!=='function'||
  !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)
  throw Error('Invalid observer sight recovery');
 let disposed=false,pending=null;
 return Object.freeze({
  recover(){
   if(disposed)return Promise.resolve(false);
   if(pending)return pending;
   const task=(async()=>{
    for(let attempt=0;attempt<maxAttempts;attempt++){
     if(disposed||!isAuthorized())return false;
     if(!isWaiting())return true;
     // A signed snapshot can be older than a validated private stream
     // packet. Try another signed snapshot; do not invent continuity.
     try{await refresh()}catch{}
     if(disposed||!isAuthorized())return false;
     if(!isWaiting())return true;
    }
    if(disposed||!isAuthorized()||!isWaiting())return false;
    // If fresh sight never catches up, retain the prior fail-closed
    // scene reauthorization as a bounded last resort, never freeze forever.
    try{return await onExhausted()===true}catch{return false}
   })().finally(()=>{if(pending===task)pending=null});
   pending=task;
   return task;
  },
  dispose(){disposed=true},
  get pending(){return pending!==null}
 });
}
