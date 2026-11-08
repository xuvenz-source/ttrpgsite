/** Isolate read-only refresh work by the complete authorization context.
 * No resolved values are cached: changed RLS/fog permissions are never served
 * from a client cache. Only identical requests already in flight are shared.
 */
export function campaignResourceKey({campaignId,mapId=null,userId,resource,variant=''}) {
 if(!campaignId||!userId||!resource)throw Error('A refresh must identify campaign, viewer and resource.');
 return JSON.stringify([String(campaignId),mapId?String(mapId):null,String(userId),String(resource),String(variant)]);
}

/** A request can finish after its authorization context has been invalidated.
 * Consumers MUST check result.current before committing the value to UI state.
 * Invalidation does not abort an RPC already executing on the server.
 */
export function createCampaignRefreshCoordinator(){
 const pending=new Map(),revisions=new Map();
 let epoch=0,disposed=false;
 const counters={started:0,shared:0,stale:0,failed:0};
 function invalidate(key){
  revisions.set(key,(revisions.get(key)||0)+1);
  pending.delete(key);
 }
 function invalidateAll(){
  ++epoch;revisions.clear();pending.clear();
 }
 function request(key,load){
  if(disposed)return Promise.resolve({current:false,value:undefined});
  if(typeof key!=='string'||!key||typeof load!=='function')
   throw Error('A refresh requires a resource key and loader.');
  const revision=revisions.get(key)||0;
  const existing=pending.get(key);
  if(existing&&existing.epoch===epoch&&existing.revision===revision){
   counters.shared++;
   return existing.promise;
  }
  counters.started++;
  const entry={epoch,revision,promise:null};
  entry.promise=Promise.resolve().then(load).then(value=>{
   const current=!disposed&&entry.epoch===epoch&&
    (revisions.get(key)||0)===revision;
   if(!current)counters.stale++;
   return {value,current};
  },error=>{
   counters.failed++;
   throw error;
  }).finally(()=>{
   if(pending.get(key)===entry)pending.delete(key);
  });
  pending.set(key,entry);
  return entry.promise;
 }
 return {
  request,invalidate,invalidateAll,
  stats:()=>({...counters,inFlight:pending.size}),
  dispose(){invalidateAll();disposed=true}
 };
}
