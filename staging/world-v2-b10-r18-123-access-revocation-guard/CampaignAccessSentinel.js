/**
 * B10-R18-123 / SCRATCH-ONLY ACCESS SENTINEL.
 *
 * Not imported into the live frontend. No browser timers or movement listeners.
 * Future integration must keep a synchronous view mask while unauthorised,
 * and protect every server data path independently using current membership.
 *
 * Membership proof: signed actor identity + RLS-scoped SELECT of their own
 * public.campaign_members row. Never JWT user_metadata, tokens, fog snapshots,
 * realtime presence, or a cached client DM flag.
 */
export const R123_LIVE_ENABLED=false;
export const R123_PASSIVE_PROBE_MS=60_000;
export const R123_TRIGGERS=Object.freeze([
 'periodic','focus','reconnect','membership-hint','server-denied','manual'
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=x=>typeof x==='string'&&UUID.test(x)&&
 !/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(x);
const same=(a,b)=>!!a&&!!b&&a.campaignId===b.campaignId&&a.userId===b.userId;
const isFn=f=>typeof f==='function';
const invalid=code=>Object.assign(new Error('Campaign access is unavailable.'),{code});

/**
 * A pure host-controlled security gate, with one bounded membership query
 * per successful probe. It does NOT auto-poll and has no hooks into movement.
 *
 * Future mounted integration:
 *  - onLock must synchronously hide/unmount the campaign view and stop input;
 *    promise-only masking is NOT acceptable.
 *  - onRevoked executes the separate full teardown checklist.
 *  - onAllow may display a campaign only AFTER this probe has succeeded.
 *  - getContext must return live campaign/user IDs on every evaluation.
 *  - notify('periodic') is host-scheduled no more than once/minute, and
 *    MUST NOT be called per movement/frame.
 *
 * This is defense-in-depth, not guaranteed instant remote revocation:
 * external membership revocation may be discovered only by next probe.
 */
export function createCampaignAccessSentinel({
 db,getContext,onLock,onAllow,onRevoked,
 onSuspended=()=>{},now=()=>Date.now(),passiveProbeMs=R123_PASSIVE_PROBE_MS
}={}){
 if(!db?.from||!isFn(db.auth?.getUser)||!isFn(getContext)||
  !isFn(onLock)||!isFn(onAllow)||!isFn(onRevoked)||
  !isFn(onSuspended)||!isFn(now)||
  !Number.isInteger(passiveProbeMs)||passiveProbeMs<30_000)
  throw invalid('invalid_configuration');

 let context=null,phase='closed',disposed=false,revision=0;
 let pending=false,pumpPromise=null,lastProbedAt=-Infinity,checks=0;
 const snapshot=()=>Object.freeze({
  phase,allowed:phase==='authorized',checks,active:!!context,disposed
 });
 const matchesLive=()=>{try{return same(context,getContext())}catch{return false}};

 function lock(reason){
  // Fail closed if a future host supplies an async mask: a promise cannot
  // provide the synchronous view/input cutoff this contract requires.
  const r=onLock(Object.freeze({reason}));
  if(r&&typeof r.then==='function'){
   void Promise.resolve(r).catch(()=>{});
   throw invalid('asynchronous_mask');
  }
 }
 function suspend(code){
  const needLock=phase!=='suspended'&&phase!=='locked'&&phase!=='revoked';
  phase='suspended';
  if(needLock)lock('unverified');
  onSuspended(Object.freeze({code}));
 }
 async function verify(current){
  const auth=await db.auth.getUser();
  if(auth?.error||auth?.data?.user?.id!==current.userId){
   return {kind:'unverified',code:'identity_unverified'};
  }
  if(!matchesLive())return {kind:'stale'};
  // A SELECT of the actual signed-in actor's own membership, never the
  // full roster or a presence/Realtime delete notification.
  const result=await db.from('campaign_members')
   .select('user_id,role')
   .eq('campaign_id',current.campaignId)
   .eq('user_id',current.userId)
   .maybeSingle();
  if(result?.error)return {kind:'unverified',code:'membership_query_failed'};
  if(result?.data===null)return {kind:'revoked'};
  if(result?.data?.user_id!==current.userId||
     !['dm','player'].includes(result?.data?.role))
   return {kind:'unverified',code:'invalid_membership_proof'};
  return {kind:'authorized'};
 }
 async function pump(){
  if(pumpPromise)return pumpPromise;
  // A simultaneous focus/permission-denied event may invalidate the first
  // probe without launching parallel requests.
  pumpPromise=(async()=>{
   while(pending&&!disposed&&context&&phase!=='revoked'){
    pending=false;
    const expected=context,seen=revision;
    let result;
    try{
     result=await verify(expected);
    }catch{
     result={kind:'unverified',code:'membership_query_failed'};
    }
    checks++;
    lastProbedAt=now();
    // Never let a successful old campaign/account response reopen the view.
    if(disposed||context!==expected||revision!==seen)continue;
    if(!matchesLive()){
     ++revision;
     suspend('context_changed');
     continue;
    }
    if(result.kind==='revoked'){
     if(phase!=='revoked'){
      const wasAuthorized=phase==='authorized';
      phase='revoked';
      if(wasAuthorized){
       try{lock('revoked')}
       catch{onSuspended(Object.freeze({code:'view_mask_failed'}))}
      }
      try{onRevoked(Object.freeze({reason:'membership_absent'}))}
      catch{onSuspended(Object.freeze({code:'revocation_teardown_failed'}))}
     }
     break; // terminal until new explicit begin()
    }
    if(result.kind==='authorized'){
     if(phase!=='authorized'){
      phase='authorized';
      try{onAllow(Object.freeze({reason:'membership_verified'}))}
      catch{
       phase='suspended';
       lock('render_reenable_failed');
       onSuspended(Object.freeze({code:'render_reenable_failed'}));
      }
     }
    }else{
     if(phase!=='suspended')suspend(result.code||'membership_query_failed');
    }
   }
   return snapshot();
  })().finally(()=>{pumpPromise=null;});
  return pumpPromise;
 }
 function begin(input){
  if(disposed)throw invalid('disposed');
  // On a context switch immediately mask old campaign content, even if the
  // requested new context is malformed. Do not await any network response.
  ++revision;
  context=null;pending=false;phase='locked';
  lock('enter');
  if(!valid(input?.campaignId)||!valid(input?.userId)){
   suspend('invalid_context');
   return Promise.resolve(snapshot());
  }
  context=Object.freeze({campaignId:input.campaignId,userId:input.userId});
  lastProbedAt=-Infinity;
  pending=true;
  return pump();
 }
 function notify(reason){
  if(disposed)throw invalid('disposed');
  if(!R123_TRIGGERS.includes(reason))throw invalid('invalid_trigger');
  if(!context||phase==='revoked')return Promise.resolve(snapshot());
  if(!matchesLive()){
   ++revision;
   if(phase==='authorized')lock('context_changed');
   suspend('context_changed');
   return Promise.resolve(snapshot());
  }
  if(reason==='periodic'){
   if(now()-lastProbedAt<passiveProbeMs||pumpPromise)
    return pumpPromise||Promise.resolve(snapshot());
   // Passive checks leave a currently authorised canvas mounted until their
   // actual result, avoiding continuous fog/map redraws and movement stalls.
  }else{
   // An access-related signal is untrusted: it masks first and always
   // rechecks the real signed actor. It never authorises or revokes by itself.
   ++revision;
   const wasAuthorized=phase==='authorized';
   phase='locked';
   if(wasAuthorized)lock('revalidating');
  }
  pending=true;
  return pump();
 }
 function close(){
  if(disposed)return;
  ++revision;context=null;pending=false;phase='closed';
  lock('exit');
 }
 function dispose(){
  if(disposed)return;
  close();disposed=true;phase='disposed';
 }
 return Object.freeze({begin,notify,close,dispose,snapshot});
}
