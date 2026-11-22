/**
 * R222 NON-LIVE SOURCE-ONLY INTEGRATION CANDIDATE.
 *
 * Connects R123 signed-membership revocation to R221's sealed signed-asset
 * candidate. Not imported into src/ or any deployed route. Fail closed.
 *
 * A local lock NEVER revokes already-issued 3,600-second bearer URLs and
 * does not prove server-side Storage RLS / membership enforcement.
 */
import {
 createCampaignAccessSentinel
} from '../world-v2-b10-r18-123-access-revocation-guard/CampaignAccessSentinel.js';
import {
 createCampaignRevocationTeardown
} from '../world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js';

const denied=code=>Object.assign(new Error('Revocation integration unavailable.'),{code});
const isFn=f=>typeof f==='function';
const isPromise=v=>!!v&&typeof v.then==='function';

/**
 * No internal polling, timer, extra network call, or movement-frame listener.
 * The caller must supply the proven actor's RLS-scoped DB client and use
 * begin/notify only at R123's approved external lifecycle triggers.
 */
export function createSignedAssetRevocationBridge({
 db,getContext,maskCampaign,allowCampaign,onSuspended,
 assetStore,teardownSteps,now
}={}){
 if(!isFn(maskCampaign)||!isFn(allowCampaign)||!isFn(onSuspended)||
    !isFn(assetStore?.lockForRevocation)||
    !isFn(assetStore?.isRevocationLocked)||
    !isFn(assetStore?.clear)||!teardownSteps)
  throw denied('missing_required_security_surface');

 // Never call an arbitrary cache-clearing callback that could reissue URLs.
 // Only clear the sealed R221 candidate after R123's confirmed-unmount barrier.
 const teardown=createCampaignRevocationTeardown({
  ...teardownSteps,
  clearSignedAssetUrls(){
   if(!assetStore.isRevocationLocked())return false;
   assetStore.clear();  // Intentionally inert after permanent revocation.
   return true;
  }
 });

 let lockConfirmed=false,revocationStarted=false,completion=null;
 function confirmedRevocation(){
  if(revocationStarted)return;
  revocationStarted=true;
  try{
   const value=assetStore.lockForRevocation();
   if(isPromise(value)){
    void Promise.resolve(value).catch(()=>{});
    lockConfirmed=false;
   }else{
    lockConfirmed=(value===true||assetStore.isRevocationLocked()===true);
   }
  }catch{
   lockConfirmed=false;
  }
  if(!lockConfirmed){
   // Public fixed code only, no raw signer / private exception exported.
   try{onSuspended(Object.freeze({code:'signed_asset_lock_failed'}))}catch{}
  }
  // Mandatory synchronous masks are repeated by R123 teardown before its
  // first await; even a failed lock cannot skip the view/route purge.
  const result=teardown.revoke();
  completion=Promise.resolve(result.finished).then(state=>Object.freeze({
   status:lockConfirmed?state.status:'incomplete',
   signedAssetLockConfirmed:lockConfirmed,
   signedAssetCacheClearAttempted:state.signedAssetCacheClearAttempted,
   failedSteps:Object.freeze([...new Set([
    ...(lockConfirmed?[]:['signedAssetLock']),...(state.failedSteps||[])
   ])])
  }));
 }

 const guard=createCampaignAccessSentinel({
  db,getContext,now,
  onLock:info=>maskCampaign(info),
  onAllow:info=>allowCampaign(info),
  onRevoked:()=>confirmedRevocation(),
  onSuspended
 });
 const snapshot=()=>Object.freeze({
  ...guard.snapshot(),
  revocationStarted,
  signedAssetLockConfirmed:lockConfirmed,
  teardownStarted:teardown.snapshot().started,
 });
 return Object.freeze({
  begin:input=>guard.begin(input),
  notify:kind=>guard.notify(kind),
  close:()=>guard.close(),
  dispose:()=>guard.dispose(),
  snapshot,
  getRevocationCompletion:()=>completion,
 });
}
