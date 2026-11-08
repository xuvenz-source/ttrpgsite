/**
 * Keep at most one trusted observer-preview RPC in flight per map piece.
 * Pointer events can arrive faster than a wall/lighting/recipient calculation.
 * Keep only the latest unsent coordinate, not a backlog of stale waypoints.
 *
 * This queue decides neither visibility nor collision. Postgres still
 * authorizes every submitted destination and broadcasts per recipient.
 */
export function createLatestOnlyPreviewQueue({send,onResult=()=>{},onError=()=>{}}){
 const entries=new Map();
 let disposed=false;
 function retire(key,entry){
  if(entries.get(key)===entry)entries.delete(key);
  for(const done of entry.waiters.splice(0))done();
 }
 function pump(key,entry){
  if(disposed||entry.cancelled||entry.busy||!entry.latest)return;
  const payload=entry.latest;
  entry.latest=null;entry.busy=true;
  // A Supabase PostgREST builder is thenable; normalize to a real promise.
  void Promise.resolve().then(()=>send(payload)).then(
   value=>{if(!disposed&&!entry.cancelled)onResult(payload,value)},
   error=>{if(!disposed&&!entry.cancelled)onError(payload,error)}
  ).catch(error=>{
   if(!disposed&&!entry.cancelled)onError(payload,error);
  }).finally(()=>{
   entry.busy=false;
   if(disposed||entry.cancelled||!entry.latest)retire(key,entry);
   else pump(key,entry);
  });
 }
 return {
  enqueue(key,payload){
   if(disposed||!key)return false;
   let entry=entries.get(key);
   if(!entry||entry.cancelled){
    entry={busy:false,latest:null,cancelled:false,waiters:[]};
    entries.set(key,entry);
   }
   entry.latest=payload;
   pump(key,entry);
   return true;
  },
  cancel(key){
   const entry=entries.get(key);
   if(!entry)return Promise.resolve();
   entry.cancelled=true;entry.latest=null;
   if(!entry.busy){retire(key,entry);return Promise.resolve()}
   return new Promise(resolve=>entry.waiters.push(resolve));
  },
  dispose(){
   disposed=true;
   for(const [key,entry] of entries){
    entry.cancelled=true;entry.latest=null;
    if(!entry.busy)retire(key,entry);
   }
  },
  get inFlightCount(){
   return [...entries.values()].filter(entry=>entry.busy).length;
  }
 };
}
