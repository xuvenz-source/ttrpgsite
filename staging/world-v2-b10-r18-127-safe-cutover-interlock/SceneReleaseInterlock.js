/**
 * B10-R18-127: SOURCE-ONLY cutover/rollback evidence interlock.
 *
 * NOT a security authorization endpoint, a deployer, or proof that receipts
 * are true. NO network, DOM, secrets, timers, SQL or production side effects.
 * Human / CI sign-offs must be independently substantiated. Live integration
 * may not treat snapshots from this module as server authorization.
 *
 * The only valid rollout is FENCE -> SERVER V3 -> CLIENT V3 -> SIGNED QA ->
 * HUMAN REVIEW. Unexpected results demand ABORT, then independently verified
 * SERVER-SIDE FENCE. There is NEVER a legacy V2 re-enable transition.
 */
export const R127_LIVE_ENABLED=false;
export const R127_REVISION='B10-R18-127';
const SHA=/^[0-9a-f]{40}$/;
const RECEIPT=/^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{11,299}$/;
const required=Object.freeze({
 fence:Object.freeze([
  'maintenanceWindowConfirmed',
  'serverSideOldClientDenialVerified',
  'existingOldSocketDeliveryStopped',
  'allSensitiveViewsMaskedBeforeCutover',
  'oldMapWidePublishingQuiesced',
  'writeAndReadFenceEnforced',
  'independentObserverFogSheetStorageReview'
 ]),
 server:Object.freeze([
  'serverV3AuthorizationRpcAvailable',
  'v3PrivateReceivePolicyEnabled',
  'oldV2SceneReceivePolicyRemoved',
  'allOldV2ScenePublishersDisabled',
  'recipientCurrentMembershipVerified',
  'generationMonotonicPreserved',
  'oldClientApiRoutesStillServerDenied',
  'oldSocketCannotReceiveNewSceneMetadata'
 ]),
 client:Object.freeze([
  'r123SynchronousMaskMounted',
  'r123RevocationTeardownMounted',
  'r126V3ClientMounted',
  'noV2FallbackOrUnverifiedReopen',
  'newAndExistingTabsVersionFenced',
  'reconnectRequiresFreshSignedEpoch',
  'staleCallbacksCannotRevealContent',
  'artUnsubscribedBeforeSignedAssetClear',
  'movementRenderAndFogHotPathsUnchanged'
 ]),
 qa:Object.freeze([
  'qaMigrationsIndependentlyVerified',
  'signedDmP1P2OutsiderScenariosPassed',
  'removedAndReinstatedAccountScenariosPassed',
  'oldConnectedSocketReceivesNoNewData',
  'signedStorageAccessExposureRemediated',
  'all67PrivilegedRpcReviewCompleted',
  'all83OriginalMigrationBodyReviewCompleted',
  'criticalRevocationAndPrivilegeIssuesResolved',
  'noFogFlashNoMovementLagRegression',
  'recipientFanoutAndFreeTierBudgetsMet',
  'abortAndRecoveryDrillPassed'
 ]),
 release:Object.freeze([
  'releaseReviewOwnerAssigned',
  'samePinnedShaForClientServerAndQa',
  'productionPreflightRechecked',
  'maintenanceFenceExitPlanReviewed',
  'oldClientDenialContinuesAfterUnseal',
  'v3SignedActorFreshSceneConfirmed',
  'noUnsafeV2RollbackPath',
  'noOutstandingCriticalSecurityExceptions'
 ]),
 abortFence:Object.freeze([
  'serverSideMaintenanceFenceConfirmed',
  'unverifiedClientViewsRemainMasked',
  'oldV2ScenePublishingRemainsDisabled',
  'v3PrivateDataDeliveryStoppedOrScoped',
  'pendingWritersAndReadersDenied',
  'incidentRecordedWithoutLegacyRollback'
 ])
});
export const R127_REQUIRED_ATTESTATIONS=required;
const fail=(code)=>Object.assign(new Error('Scene release must remain blocked.'),{code});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function sceneClientCompatibility({
 bundledProtocol,serverProtocol,serverMode,signedActorMatch,
 membershipChecked,sceneAuthorized,legacyClientBlocked,clientMaskActive
}={}){
 // This is only a deterministic compatibility prediction, not server proof.
 // A bad, stale, unsigned or V2 client cannot be a release-compatible scene.
 return Object.freeze({
  action:bundledProtocol==='v3'&&serverProtocol==='v3'&&
   serverMode==='serving-v3'&&signedActorMatch===true&&
   membershipChecked===true&&sceneAuthorized===true&&
   legacyClientBlocked===true&&clientMaskActive===true
   ?'attempt-v3-join':'remain-masked',
  fallback:'never-v2',
  authorizesUser:false
 });
}
export function createSceneReleaseInterlock({
 candidateSha,attemptId,expectedParentSha
}={}){
 if(!SHA.test(candidateSha||'')||!SHA.test(expectedParentSha||'')||
  !RECEIPT.test(attemptId||''))throw fail('invalid_release_identity');
 let phase='planning',proofs=[],seen=new Set(),aborted=false;
 let abortReason=null,abortedFrom=null;
 const snapshot=()=>Object.freeze({
  phase,attemptId,candidateSha,expectedParentSha,
  attested:Object.freeze(proofs.map(x=>x.step)),
  abortReason,abortedFrom,
  productionAuthorized:false,
  hostedActionPerformed:false,
  canRequestHumanReleaseReview:phase==='ready-for-human-release-review',
  requiresServerSideFence:phase==='abort-required',
  legacyV2FallbackAllowed:false,
  aborted
 });
 const verify=(name,attestation)=>{
  if(!attestation||typeof attestation!=='object'||Array.isArray(attestation))
   throw fail('missing_attestation');
  if(attestation.candidateSha!==candidateSha||
   attestation.expectedParentSha!==expectedParentSha||
   attestation.attemptId!==attemptId)throw fail('stale_or_mismatched_proof');
  if(typeof attestation.receipt!=='string'||
   !RECEIPT.test(attestation.receipt)||seen.has(attestation.receipt))
   throw fail('invalid_or_reused_receipt');
  for(const key of required[name]){
   if(!own(attestation,key)||attestation[key]!==true)
    throw fail('missing_required_'+key);
  }
  return attestation.receipt;
 };
 function transition(from,to,name,attestation){
  if(phase!==from)throw fail('out_of_order_'+name);
  const receipt=verify(name,attestation);
  seen.add(receipt);
  proofs.push(Object.freeze({step:name,receipt}));
  phase=to;
  return snapshot();
 }
 function abort(reason){
  if(typeof reason!=='string'||reason.trim().length<8)
   throw fail('abort_reason_required');
  if(phase==='aborted-fenced')return snapshot();
  if(!aborted)abortedFrom=phase;
  abortReason=reason.trim();
  phase='abort-required';aborted=true;
  // This DOES NOT imply traffic has actually stopped. Host MUST engage
  // independent server-side fence and then attest that fact.
  return snapshot();
 }
 return Object.freeze({
  attestFence:proof=>transition('planning','fenced','fence',proof),
  attestServerV3:proof=>transition('fenced','server-v3','server',proof),
  attestClientV3:proof=>transition('server-v3','client-v3','client',proof),
  attestSignedQa:proof=>transition('client-v3','signed-qa-v3','qa',proof),
  attestReleaseReadiness:proof=>transition(
   'signed-qa-v3','ready-for-human-release-review','release',proof),
  abort,
  attestAbortFence:proof=>transition(
   'abort-required','aborted-fenced','abortFence',proof),
  snapshot
 });
}
