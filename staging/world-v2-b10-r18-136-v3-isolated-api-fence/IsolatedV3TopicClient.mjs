/**
 * B10-R18-136 dormant PostgREST V3 custom-schema topic request adapter.
 *
 * This is NOT a deployable API, authentication replacement, or host view
 * controller. Its only function is to call the narrow forge_v3_api RPC with
 * a signed Supabase client and validate the matching actor/map/epoch result.
 * It NEVER calls the public RPC or restores schema usage.
 *
 * The schema MUST be independently configured as exposed in Supabase Data
 * API settings on a future *approved* QA project; a PG GRANT alone cannot
 * make this accessible via HTTP. No live app import or per-frame RPC.
 */
export const R136_LIVE_ENABLED=false;
export const R136_V3_API_SCHEMA='forge_v3_api';
export const R136_V3_TOPIC_RPC='get_authorized_scene_channel_v3';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const err=code=>Object.assign(new Error('V3 membership access unverified.'),{code});
function contextMatches(expected,current){
 return !!current&&current.mapId===expected.mapId&&
   current.viewerId===expected.viewerId;
}
function validTopic(t,mapId,viewerId){
 if(typeof t!=='string')return false;
 const parts=t.split(':');
 return parts.length===4&&parts[0]==='forge-world-scene-v3'&&
  UUID.test(parts[1])&&UUID.test(parts[2])&&UUID.test(parts[3])&&
  !/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(parts[3])&&
  parts[1].toLowerCase()===mapId.toLowerCase()&&
  parts[2].toLowerCase()===viewerId.toLowerCase();
}
export function createIsolatedV3TopicClient({
 db,mapId,viewerId,getContext
}={}){
 if(!UUID.test(mapId||'')||!UUID.test(viewerId||'')||
  typeof db?.auth?.getUser!=='function'||
  typeof db?.schema!=='function'||typeof getContext!=='function')
  throw err('invalid_configuration');
 const expected=Object.freeze({mapId,viewerId});
 let revision=0,closed=false,pending=null;
 const fresh=n=>{
  if(closed||n!==revision)return false;
  try{return contextMatches(expected,getContext())}catch{return false}
 };
 const snapshot=()=>Object.freeze({
  closed,pending:pending!==null,productionReady:false,
  defaultPublicRpcFallbackAllowed:false,requestCountNotAuthority:true
 });
 async function getTopic(){
  if(closed)throw err('closed');
  if(pending)return pending;
  const n=++revision;
  const job=(async()=>{
   if(!fresh(n))throw err('changed_context');
   const signed=await db.auth.getUser();
   if(!fresh(n))throw err('changed_context');
   if(signed?.error||signed?.data?.user?.id!==viewerId)
    throw err('signed_actor_mismatch');
   // R128 prevents the old public RPC. No attempt to discover it or
   // automatically retry using db.rpc. It remains permanently off limits.
   const gateway=db.schema(R136_V3_API_SCHEMA);
   if(!gateway||typeof gateway.rpc!=='function')
    throw err('v3_schema_not_exposed');
   const reply=await gateway.rpc(R136_V3_TOPIC_RPC,{p_map:mapId});
   if(!fresh(n))throw err('changed_context');
   if(reply?.error||!validTopic(reply?.data,mapId,viewerId))
    throw err('v3_topic_not_authorized');
   return reply.data;
  })().finally(()=>{if(pending===job)pending=null});
  pending=job;
  return job;
 }
 function cancel(){
  revision++;
  // A previous fetch may resolve later; it can no longer be consumed.
 }
 function dispose(){closed=true;cancel()}
 return Object.freeze({getTopic,cancel,dispose,snapshot});
}
