/**
 * R223 terminal, non-live authorization lifecycle wrapper for the R222
 * staging-only R123 membership -> R221 signed-asset revocation bridge.
 *
 * No src/ imports, timers, network/database calls or movement-loop hooks.
 * The cache lock is irreversible for this bridge instance. Reinstatement
 * requires a NEW bridge and a NEW unlocked signed-asset store plus fresh proof.
 * This is not an authorization substitute for server RLS/signed URL expiry.
 */
import {createSignedAssetRevocationBridge} from
 '../world-v2-b10-r18-222-signed-asset-revocation-bridge/SignedAssetRevocationBridge.js';

const failure=code=>Object.assign(
 new Error('Campaign access requires new verified context.'),{code}
);
const isFn=x=>typeof x==='function';

/**
 * Deliberately refuses a pre-sealed cache, even if an RLS membership SELECT
 * might currently pass. Do not silently remount assets with a locked signer.
 */
export function createTerminalRevocationBridge(options={}){
 const {assetStore,allowCampaign,maskCampaign}=options;
 if(!isFn(assetStore?.isRevocationLocked)||
    !isFn(allowCampaign)||!isFn(maskCampaign))
  throw failure('missing_required_security_surface');
 let terminal=false;
 function sealed(){
  try{return terminal||assetStore.isRevocationLocked()!==false;}
  catch{return true}
 }
 if(sealed())throw failure('fresh_asset_store_required');

 const bridge=createSignedAssetRevocationBridge({
  ...options,
  allowCampaign(info){
   if(sealed())throw failure('sealed_asset_store_cannot_reauthorize');
   const value=allowCampaign(info);
   if(value&&typeof value.then==='function'){
    void Promise.resolve(value).catch(()=>{});
    throw failure('asynchronous_allow_callback');
   }
   // Validate again in case the host synchronously revoked assets while
   // constructing the authorized campaign surface.
   if(sealed())throw failure('asset_store_sealed_during_allow');
   return value;
  }
 });

 function snapshot(){
  const base=bridge.snapshot();
  if(base.revocationStarted)terminal=true;
  const isTerminal=sealed();
  return Object.freeze({
   ...base,
   allowed:base.allowed&&!isTerminal,
   terminalRevocation:isTerminal,
   requiresFreshBridge:isTerminal,
  });
 }
 function ensureFresh(){
  if(sealed()||bridge.snapshot().revocationStarted){
   terminal=true;
   throw failure('fresh_bridge_required_after_revocation');
  }
 }
 function begin(context){
  ensureFresh();
  return bridge.begin(context);
 }
 function notify(reason){
  if(sealed()||bridge.snapshot().revocationStarted){
   terminal=true;
   return Promise.resolve(snapshot());
  }
  return bridge.notify(reason);
 }
 return Object.freeze({
  begin,notify,
  close:()=>bridge.close(),
  dispose:()=>bridge.dispose(),
  snapshot,
  getRevocationCompletion:()=>bridge.getRevocationCompletion(),
 });
}
