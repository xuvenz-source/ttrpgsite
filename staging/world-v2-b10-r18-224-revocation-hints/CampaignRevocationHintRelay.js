/**
 * R224 — NON-LIVE, transport-injected cross-tab revocation HINT relay.
 *
 * A hint is NEVER authorization, nor proof of revocation. Each receiver must
 * use R123 signed getUser() + RLS-scoped membership SELECT via R223's bridge.
 * No browser globals, timers, storage, movement hooks, SQL, or network here.
 *
 * The injected transport may later be a same-origin BroadcastChannel adapter;
 * its identity/campaign IDs MUST NOT be logged or forwarded to analytics.
 * Delivery is best effort, not server-side Storage/RLS enforcement.
 */
const blocked=code=>Object.assign(new Error('Campaign recheck relay unavailable.'),{code});
const isFn=value=>typeof value==='function';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId=value=>typeof value==='string'&&UUID.test(value)&&
 !/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(value);
const SIGNAL='campaign-access-recheck';
const VERSION=1;
const FIELDS=['type','version','campaignId','userId'];

function validContext(value){
 return !!value&&validId(value.campaignId)&&validId(value.userId);
}
function validMessage(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=Object.keys(value);
 if(keys.length!==FIELDS.length||keys.some(k=>!FIELDS.includes(k)))return false;
 return value.type===SIGNAL&&value.version===VERSION&&
  validId(value.campaignId)&&validId(value.userId);
}

/**
 * `transport.subscribe(callback)` must return an unsubscribe function.
 * `transport.publish(fixedMessage)` is best effort. A malicious/fake sender
 * can only force a synchronous mask + fresh server proof, never unseal state.
 */
export function createCampaignRevocationHintRelay({
 bridge,transport,getContext
}={}){
 if(!isFn(bridge?.begin)||!isFn(bridge?.notify)||
    !isFn(bridge?.snapshot)||!isFn(transport?.subscribe)||
    !isFn(transport?.publish)||!isFn(getContext))
  throw blocked('missing_required_surface');
 let activeContext=null,disposed=false,published=false;
 let outboundFailed=false,inboundFailures=0,remoteRechecks=0;
 let remoteInFlight=null;

 function sameAsActive(){
  if(!validContext(activeContext))return false;
  try{
   const now=getContext();
   return validContext(now)&&
     now.campaignId===activeContext.campaignId&&
     now.userId===activeContext.userId;
  }catch{return false}
 }
 function publishIfRevoked(){
  if(disposed||published||!sameAsActive())return false;
  let state;
  try{state=bridge.snapshot()}catch{return false}
  if(state?.phase!=='revoked'||state?.terminalRevocation!==true)
   return false;
  // No reason, roles, signed URL, token, identity claim, or SQL content.
  const message=Object.freeze({
   type:SIGNAL,version:VERSION,
   campaignId:activeContext.campaignId,
   userId:activeContext.userId
  });
  // One outbound attempt per terminal bridge. A failed transport is NO
  // guarantee of other-tab removal; this boolean is never authority.
  published=true;
  try{
   const result=transport.publish(message);
   if(result&&typeof result.then==='function'){
    outboundFailed=true;
    void Promise.resolve(result).catch(()=>{});
    return false;
   }
   return true;
  }catch{
   outboundFailed=true;
   return false;
  }
 }
 function onMessage(message){
  if(disposed||!validMessage(message)||!sameAsActive())return;
  if(message.campaignId!==activeContext.campaignId||
     message.userId!==activeContext.userId)return;
  // Never trust the sender. R123 masks synchronously on membership-hint and
  // makes the DB membership query itself. No terminal cache lock from a hint.
  if(remoteInFlight)return;
  try{
   const pending=bridge.notify('membership-hint');
   remoteRechecks++;
   remoteInFlight=Promise.resolve(pending)
    .catch(()=>{inboundFailures++;})
    .finally(()=>{remoteInFlight=null});
  }catch{inboundFailures++}
 }
 let unsubscribe;
 try{unsubscribe=transport.subscribe(onMessage)}
 catch{throw blocked('transport_subscribe_failed')}
 if(!isFn(unsubscribe))throw blocked('transport_unsubscribe_missing');

 function begin(context){
  if(disposed)throw blocked('relay_disposed');
  // R223 begin may throw if this bridge/cache has already been sealed.
  const started=bridge.begin(context);
  activeContext=validContext(context)?
   Object.freeze({campaignId:context.campaignId,userId:context.userId}):null;
  return Promise.resolve(started).then(result=>{
   publishIfRevoked();
   return result;
  });
 }
 function notify(reason){
  if(disposed)throw blocked('relay_disposed');
  const notified=bridge.notify(reason);
  return Promise.resolve(notified).then(result=>{
   publishIfRevoked();
   return result;
  });
 }
 function dispose(){
  if(disposed)return false;
  disposed=true;
  try{unsubscribe()}catch{inboundFailures++}
  activeContext=null;
  // Caller still owns bridge.close()/dispose() and all view teardown.
  return true;
 }
 const snapshot=()=>{
  const base=bridge.snapshot();
  const currentContextMatches=!disposed&&sameAsActive();
  // A source switch must not claim access based on the old membership proof.
  // The future host is still responsible for synchronously masking its UI
  // and calling bridge.begin/close when actor or campaign identity changes.
  return Object.freeze({
   ...base,
   allowed:base.allowed&&currentContextMatches,
   relayDisposed:disposed,
   currentContextMatches,
   hintPublished:published,
   outboundDeliveryUnverified:published,
   outboundFailed,
   remoteRechecks,
   inboundFailures,
  });
 };
 return Object.freeze({begin,notify,dispose,snapshot});
}
