/** Small, cancellable helpers for noisy Realtime events and network reconciliation. */
export function eventAffectsMap(payload,mapId){
 if(!mapId)return false;
 const ids=[payload?.new?.map_id,payload?.old?.map_id].filter(Boolean);
 // DELETE events may expose only the primary key under replica identity.
 // Treat unknown map ownership as relevant rather than miss a deletion.
 return ids.length===0||ids.includes(mapId);
}

export function createCoalescedRefresh(run,delay=80,{
 setTimer=setTimeout,clearTimer=clearTimeout
}={}){
 let timer=null,disposed=false;
 return {
  request(){
   if(disposed||timer!==null)return;
   timer=setTimer(()=>{timer=null;if(!disposed)run()},delay);
  },
  flush(){
   if(disposed)return;
   if(timer!==null){clearTimer(timer);timer=null}
   run();
  },
  cancel(){
   disposed=true;
   if(timer!==null){clearTimer(timer);timer=null}
  }
 };
}

export const CHAT_RECONCILE_MS={healthy:30000,fallback:4000};
export const ROSTER_RECONCILE_MS={healthy:60000,fallback:8000};

/** A healthy Realtime connection still gets a periodic reconciliation.
 * Disconnections return to the original fast backstop, and focus always
 * refreshes immediately. At most one periodic request runs at once.
 */
export function createAdaptiveReconciler(refresh,{healthyMs,fallbackMs,
 isVisible=()=>true,setTimer=setTimeout,clearTimer=clearTimeout}){
 let connected=false,disposed=false,timer=null,inFlight=false;
 function schedule(){
  if(disposed)return;
  if(timer!==null)clearTimer(timer);
  timer=setTimer(()=>{timer=null;void run()},connected?healthyMs:fallbackMs);
 }
 async function run(){
  if(disposed)return;
  if(inFlight){schedule();return}
  if(!isVisible()){schedule();return}
  inFlight=true;
  try{await refresh()}catch(e){console.warn('Reconciliation refresh failed',e)}
  finally{inFlight=false;schedule()}
 }
 schedule();
 return {
  setConnected(value){if(disposed)return;connected=!!value;schedule()},
  refreshNow(){void run()},
  dispose(){disposed=true;if(timer!==null)clearTimer(timer);timer=null}
 };
}
