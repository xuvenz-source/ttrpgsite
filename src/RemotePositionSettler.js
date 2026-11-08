/**
 * Accept the final saved token position after a short quiet period.
 * Live observer previews are server-authorized but may be throttled behind
 * the actual final waypoint. A later preview supersedes an earlier commit
 * reconciliation; only the most recent saved coordinates should settle.
 *
 * This is a presentation queue, NOT an authorization or visibility source.
 */
export function createRemotePositionSettler({
 settle,delayMs=180,setTimer=setTimeout,clearTimer=clearTimeout
}){
 const timers=new Map();
 let disposed=false;
 function cancel(id){
  const entry=timers.get(id);
  if(!entry)return;
  clearTimer(entry.handle);timers.delete(id);
 }
 return {
  notePreview(id){cancel(id)},
  noteCanonical(id,x,y){
   if(disposed||!id||!Number.isFinite(x)||!Number.isFinite(y))return;
   cancel(id);
   const entry={x,y,handle:null};
   entry.handle=setTimer(()=>{
    if(disposed||timers.get(id)!==entry)return;
    timers.delete(id);
    settle(id,x,y);
   },delayMs);
   timers.set(id,entry);
  },
  cancel,
  dispose(){
   disposed=true;
   for(const id of timers.keys())cancel(id);
  }
 };
}
