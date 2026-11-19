/**
 * B10-R18-131 SOURCE-ONLY: fail-closed CLIENT-SIDE stream quarantine contract.
 *
 * NOT imported by src/. NOT a server authorization system, WebSocket kill,
 * RLS replacement, or guarantee of immediate remote revocation.
 *
 * Integration prerequisites:
 *  - real R123 signed-user/membership sentinel, whose onAllow MUST NOT reveal
 *    the view before this gate is armed and a fresh scene is authorized;
 *  - synchronous host-wide mask/unmount, plus complete R123 cleanup sinks;
 *  - server-side old-client denial, R125/R126 scene epoch and signed QA.
 *
 * Event wrappers accept only explicit table/mode contracts. Refresh-only
 * listeners never receive original row payloads. Validated-payload listeners
 * must use host-supplied per-row validation; old DELETE is only a refresh
 * hint, NEVER an authorization or full-row event. Guarded async refreshes
 * must recheck the supplied isCurrent() before committing UI state.
 */
export const R131_LIVE_ENABLED=false;
export const R131_SIGNAL_REASONS=Object.freeze([
 'reconnect','membership-hint','server-denied','account-changed',
 'map-reassigned','maintenance-fence','focus'
]);
export const R131_SAFE_RECHECK_REASONS=Object.freeze([
 'reconnect','membership-hint','focus'
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const error=code=>Object.assign(new Error('Stream access is not verified.'),{code});
const validScope=x=>x&&typeof x==='object'&&UUID.test(x.campaignId||'')&&
 UUID.test(x.userId||'')&&(x.mapId==null||UUID.test(x.mapId));
const equivalent=(a,b)=>!!a&&!!b&&a.campaignId===b.campaignId&&
 a.userId===b.userId&&(a.mapId||null)===(b.mapId||null);
const isFn=f=>typeof f==='function';
const frozen=x=>Object.freeze(x);
const allowedTables=new Set([
 'battle_maps','campaign_handout_events','campaign_player_maps',
 'campaign_sheet_item_leases','campaign_tool_issues','campaign_tool_item_leases',
 'campaign_tool_map_tokens','campaign_tool_templates','campaigns','characters',
 'chat_messages','map_combats','map_environments','map_tokens',
 'map_viewer_visibility_ticks','map_visibility_ticks','npc_templates'
]);
const hazardousPayloadTables=new Set(['map_tokens','map_visibility_ticks',
 'map_viewer_visibility_ticks']);
export const R131_AUDITED_TABLES=frozen([...allowedTables].sort());
const isPlain=x=>x&&typeof x==='object'&&!Array.isArray(x);
function sanitize(event,table){
 if(!isPlain(event)||event.schema!=='public'||event.table!==table||
  !['INSERT','UPDATE','DELETE'].includes(event.eventType))
  return null;
 return frozen({kind:'refresh-only',table,eventType:event.eventType});
}

/**
 * sentinel is an R123 instance: begin(), notify(), snapshot() with
 * {allowed:boolean}; the sentinel itself performs fresh signed Auth/RLS.
 * This module never makes an independent membership request or per-event RPC.
 */
export function createStagedStreamQuarantine({
 sentinel,db,getContext,onMask,onFault=()=>{}
}={}){
 if(!isFn(sentinel?.begin)||!isFn(sentinel?.notify)||
  !isFn(sentinel?.snapshot)||!isFn(db?.removeChannel)||
  !isFn(getContext)||!isFn(onMask)||!isFn(onFault))
  throw error('invalid_configuration');
 let phase='closed',revision=0,scope=null,disposed=false;
 let removalFailures=0;
 const channels=new Map(),everRegistered=new WeakSet(),retirements=new Set();
 const liveScope=()=>{try{return equivalent(scope,getContext())}catch{return false}};
 const current=(epoch)=>!disposed&&phase==='armed'&&revision===epoch&&
  liveScope()&&sentinel.snapshot()?.allowed===true;
 const report=reason=>{try{onFault(frozen({reason}))}catch{}};
 const snapshot=()=>frozen({
  phase,armed:phase==='armed'&&liveScope()&&sentinel.snapshot()?.allowed===true,
  registeredChannels:channels.size,pendingRetirements:retirements.size,
  removalFailures,disposed,serverAuthorizationProven:false,
  oldSocketDeliveryStopped:false,productionReady:false
 });

 function maskAndRetire(reason){
  // The epoch and view mask are synchronous; old callbacks must stop before
  // removal promises settle or before the next Supabase network response.
  phase='locked';revision++;
  let maskFault=false;
  try{
   const result=onMask(frozen({reason}));
   if(result!==true){
    // A host must positively attest that the mask was installed NOW;
    // returning undefined, false or a Promise is not sufficient.
    void Promise.resolve(result).catch(()=>{});
    maskFault=true;
   }
  }catch{maskFault=true}
  const remaining=[...channels.keys()];channels.clear();
  const task=Promise.all(remaining.map(async channel=>{
   try{
    const res=await db.removeChannel(channel);
    if(res!=='ok'){
     // Supabase JS returns 'ok', 'timed out' or 'error'. A timeout
     // must NOT re-open the view as though an old socket was removed.
     removalFailures++;return false;
    }
    return true;
   }catch{removalFailures++;return false}
  })).then(results=>results.every(Boolean));
  retirements.add(task);
  void task.finally(()=>retirements.delete(task));
  if(maskFault){report('mask_not_synchronous');throw error('synchronous_mask_failed')}
  return {epoch:revision,retirement:task};
 }
 async function reauthorize(kind,input){
  if(disposed)throw error('disposed');
  const target=kind==='begin'?input:scope;
  const prior=maskAndRetire(kind);
  if(kind==='begin'){
   scope=validScope(input)?frozen({
    campaignId:input.campaignId,userId:input.userId,mapId:input.mapId||null
   }):null;
  }
  if(!scope||!liveScope())return false;
  if(!(await prior.retirement)){
   report('channel_unsubscribe_failed');return false;
  }
  if(disposed||revision!==prior.epoch||!liveScope())return false;
  let answer;
  try{
   if(kind==='begin')answer=await sentinel.begin({
    campaignId:scope.campaignId,userId:scope.userId
   });
   else answer=await sentinel.notify(kind);
  }catch{report('membership_probe_failed');return false}
  if(disposed||revision!==prior.epoch||!liveScope())return false;
  if(answer?.allowed!==true||sentinel.snapshot()?.allowed!==true){
   report('membership_not_verified');return false;
  }
  phase='armed';
  return true;
 }
 function registerChannel(channel,{table,mode='refresh-only',validator}={},listener){
  if(!channel||typeof channel!=='object'||!isFn(listener)||
   !allowedTables.has(table)||!['refresh-only','validated-payload'].includes(mode)||
   (mode==='validated-payload'&&!isFn(validator))||
   (mode==='validated-payload'&&!hazardousPayloadTables.has(table)))
   throw error('invalid_subscription_contract');
  if(!current(revision))throw error('unverified_scope');
  if(everRegistered.has(channel)&&!channels.has(channel))
   throw error('old_channel_reuse');
  if(channels.has(channel)&&channels.get(channel)!==revision)
   throw error('old_channel_reuse');
  everRegistered.add(channel);
  const epoch=revision;
  channels.set(channel,epoch);
  const isCurrent=()=>current(epoch)&&channels.get(channel)===epoch;
  const wrapped=event=>{
   if(!isCurrent())return false;
   const hint=sanitize(event,table);
   if(!hint)return false;
   try{
    if(mode==='refresh-only'||event.eventType==='DELETE'){
     // Do NOT pass full row or old DELETE record to refresh-only callbacks.
     listener(hint,isCurrent);
     return true;
    }
    if(validator(event,scope)!==true)return false;
    listener(event,isCurrent);
    return true;
   }catch{report('listener_or_validator_failed');return false}
  };
  return frozen({callback:wrapped,isCurrent});
 }
 function lock(reason='server-denied'){
  if(disposed)throw error('disposed');
  if(!R131_SIGNAL_REASONS.includes(reason))throw error('invalid_signal');
  return maskAndRetire(reason).retirement;
 }
 async function signal(reason){
  if(disposed)throw error('disposed');
  if(!R131_SIGNAL_REASONS.includes(reason))throw error('invalid_signal');
  if(!R131_SAFE_RECHECK_REASONS.includes(reason)){
   // Critical denial must NOT silently re-authorize after a cached
   // membership proof or user-supplied client version.
   await lock(reason);
   return false;
  }
  return reauthorize(reason);
 }
 async function dispose(){
  if(disposed)return true;
  let task;
  try{task=maskAndRetire('dispose').retirement}
  finally{disposed=true;scope=null;phase='disposed'}
  return task;
 }
 return frozen({
  begin:scope=>reauthorize('begin',scope),
  signal,lock,registerChannel,dispose,snapshot
 });
}
