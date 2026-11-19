/**
 * B10-R18-123 / UNMOUNTED REVOCATION TEARDOWN CONTRACT.
 *
 * This file is NOT imported in the live app and is NOT a complete
 * implementation of local campaign eviction. It defines safe integration
 * ordering with all hooks mandatory, then tests that order in isolation.
 *
 * IMPORTANT: SignedAssetUrls.clear() re-requests URLs for ACTIVE subscribers.
 * Never call it until the view has actually unmounted and listeners have
 * unsubscribed. Issued signed URLs remain valid until their server expiry.
 */
export const R123_SYNC_PURGE_STEPS=Object.freeze([
 'maskCampaign',
 'invalidatePendingReads',
 'cancelQueuedWrites',
 'stopMovementAndPreview',
 'clearFogAndMapTokens',
 'clearSheetsAndEditors',
 'clearHandoutsAndTools',
 'clearChatAndRoster',
 'closeCampaignPopouts',
 'routeToCampaignHub'
]);
export const R123_ASYNC_PURGE_STEPS=Object.freeze([
 'awaitConfirmedUnmount',
 'disposeWorldV2Runtime',
 'unsubscribeAllCampaignChannels',
 'clearSignedAssetUrls'
]);
const all=[...R123_SYNC_PURGE_STEPS,...R123_ASYNC_PURGE_STEPS];
const failed=code=>Object.assign(new Error('Revocation teardown is incomplete.'),{code});
const safe=steps=>Object.freeze([...new Set(steps)]);

/**
 * onLock from the access sentinel must synchronously hide all sensitive
 * content BEFORE this teardown begins. maskCampaign repeats that guarantee.
 * All sync callbacks must be truly synchronous. Async cleanup uses a strict
 * unmount barrier; when it fails, signed asset clearing is SKIPPED to avoid
 * issuing new URLs to still-active artwork subscribers.
 */
export function createCampaignRevocationTeardown(steps){
 if(!steps||all.some(k=>typeof steps[k]!=='function'))throw failed('missing_required_step');
 let finished=null,started=false,issues=[];
 function callSync(key){
  try{
   const r=steps[key]();
   if(r&&typeof r.then==='function'){
    // A promise-returning synchronous security boundary is a design error.
    void Promise.resolve(r).catch(()=>{});
    issues.push(key);
   }
  }catch{issues.push(key)}
 }
 async function callAsync(key){
  try{return await steps[key]()}
  catch{issues.push(key);return false}
 }
 function revoke(){
  if(started)return Object.freeze({started:true,finished});
  started=true;
  // All of these execute BEFORE the first await. One failed optional sink
  // cannot prevent synchronous masking, movement-stop or route-to-hub.
  for(const key of R123_SYNC_PURGE_STEPS)callSync(key);
  finished=(async()=>{
   // Must strictly return true after the actual React unmount/effect cleanup.
   const unmounted=await callAsync('awaitConfirmedUnmount');
   if(unmounted!==true){
    issues.push('awaitConfirmedUnmount');
    return Object.freeze({status:'incomplete',failedSteps:safe(issues),
     signedAssetCacheClearAttempted:false});
   }
   const results=await Promise.all([
    callAsync('disposeWorldV2Runtime'),
    callAsync('unsubscribeAllCampaignChannels')
   ]);
   if(results.some(r=>r!==true)){
    if(results[0]!==true)issues.push('disposeWorldV2Runtime');
    if(results[1]!==true)issues.push('unsubscribeAllCampaignChannels');
    return Object.freeze({status:'incomplete',failedSteps:safe(issues),
     signedAssetCacheClearAttempted:false});
   }
   const cleared=await callAsync('clearSignedAssetUrls');
   if(cleared!==true)issues.push('clearSignedAssetUrls');
   return Object.freeze({
    status:issues.length?'incomplete':'complete',
    failedSteps:safe(issues),signedAssetCacheClearAttempted:true
   });
  })();
  return Object.freeze({started:true,finished});
 }
 return Object.freeze({revoke,snapshot:()=>Object.freeze({
  started,finished:!!finished,hasFailures:issues.length>0
 })});
}
