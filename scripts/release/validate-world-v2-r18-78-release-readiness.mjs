/**
 * R18-78: offline, privacy-bounded release-state reconciliation.
 * This does not authenticate the linked CLI, browser participants, Vercel,
 * Supabase access or operator approval. It CAN ONLY output NO_GO.
 * With --receipt it delegates full 83-body / 10-function verification to R50.
 */
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR50ReadOnlyReceipt} from './validate-world-v2-r18-50-readonly-evidence.mjs';
import {validateR58MultiplayerQa} from './validate-world-v2-r18-58-multiplayer-qa.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const STATE='staging/world-v2-b10-r18-78-release-readiness.json';
const NARROW='staging/world-v2-b10-r18-48-narrow-pending/manifest.json';
const HISTORY='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const LEDGER='staging/next-release-ledger.json';
const PENDING=[
 '20261111023204','20261113021005','20261113021007','20261113021010',
 '20261113021012','20261113021020','20261113021022','20261113024116'
];
const fail=()=>{throw Error('R78 RELEASE NO-GO: inconsistent or unsafe release evidence')};
const sha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(x,required)=>x&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).length===required.length&&required.every(k=>Object.hasOwn(x,k));
const pathExists=(root,path)=>{
 try{return statSync(join(root,path)).isFile()}catch{return false}
};
function assertPart(x,reference){
 if(!keys(x,Object.keys(reference)))fail();
 for(const [name,value] of Object.entries(reference)){
  if(!eq(x[name],value))fail();
 }
}
const BLOCKERS=Object.freeze([
 'OFFICIAL_LINKED_SUPABASE_CLI_83_PLUS_8_FETCH_LIST_DRY_RUN',
 'INDEPENDENT_SIGNED_DM_P1_PASSIVE_P2_MULTIPLAYER',
 'PROTECTED_QA_BUILD_AND_INDEPENDENT_AUTH_VERIFICATION',
 'TRUE_COLLISION_FOG_REVOCATION_AND_INSTANT_REGRAB',
 'BROWSER_INPUT_TO_COMMIT_P95',
 'SUPABASE_FREE_PHYSICAL_RAM_LOCKS_UNDER_MULTIPLAYER_LOAD',
 'NEXT_RELEASE_LEDGER_AND_MAIN_PRODUCTION_ALIAS_RECONCILIATION',
 'EXPLICIT_DESIGNER_RELEASE_AUTHORIZATION'
]);
export function validateR78ReleaseStatus({
 snapshot,repoRoot=ROOT,now=new Date(),freshReadOnlyReceipt
}={}){
 const root=realpathSync(resolve(repoRoot));
 const s=snapshot??JSON.parse(readFileSync(join(root,STATE),'utf8'));
 if(!keys(s,['schema','workPackage','recordedOn','kind','releaseDecision',
  'safeToDeploy','productionApproval','sqlApproval','operationPerformed',
  'source','liveReadOnly','pendingNarrowRelease','canonicalDeployment',
  'releaseLedger','outstanding','supportingTools']))fail();
 assertPart({
  schema:s.schema,workPackage:s.workPackage,recordedOn:s.recordedOn,
  kind:s.kind,releaseDecision:s.releaseDecision,
  safeToDeploy:s.safeToDeploy,productionApproval:s.productionApproval,
  sqlApproval:s.sqlApproval,operationPerformed:s.operationPerformed
 },{
  schema:1,workPackage:'B10-R18-78',recordedOn:'2026-11-15',
  kind:'READ_ONLY_RELEASE_GATE_SNAPSHOT',releaseDecision:'NO_GO',
  safeToDeploy:false,productionApproval:false,sqlApproval:false,
  operationPerformed:'NO_DEPLOY_OR_WRITE'
 });
 const baseline=JSON.parse(readFileSync(join(root,HISTORY),'utf8'));
 const narrow=JSON.parse(readFileSync(join(root,NARROW),'utf8'));
 const ledger=JSON.parse(readFileSync(join(root,LEDGER),'utf8'));
 if(baseline.originalMigrationVersionCount!==83||
  baseline.expectedNewestVersion!=='20261109171247'||
  !Array.isArray(baseline.rows)||baseline.rows.length!==83||
  new Set(baseline.rows.map(x=>x.version)).size!==83||
  narrow.releaseDecision!=='NO_GO'||narrow.safeToApply!==false||
  narrow.expectedPendingTotalWithR05!==8||
  !Array.isArray(narrow.pending)||narrow.pending.length!==7||
  !/^\d{4}-\d{2}-\d{2}$/.test(ledger.updated)||
  ledger.updated<'2026-11-12'||!Array.isArray(ledger.branches)||
  !ledger.branches.some(x=>x.name==='stage/world-v2-b10-r18-15-drag-corner-collision-settle-2026-11-12')||
  (ledger.updated!=='2026-11-12'&&(
   ledger.releaseReconciliation?.decision!=='NO_GO'||
   ledger.releaseReconciliation?.independentlyAuthorized!==false||
   ledger.releaseReconciliation?.releaseCandidatesApproved!==0||
   ledger.releaseReconciliation?.totalLedgerBranches!==165||
   ![165,166,167,168,169,170,171,172].includes(ledger.branches.length)||
   (ledger.branches.length>=166&&(
    ledger.releasePreviewPreparation?.decision!=='NO_GO'||
    ledger.releasePreviewPreparation?.workPackage!=='B10-R18-80'||
    ledger.releasePreviewPreparation?.originalR79AuditLedgerBranches!==165||
    ledger.releasePreviewPreparation?.currentLedgerBranches!==166||
    ledger.releasePreviewPreparation?.addedBranch!==
     'stage/world-v2-b10-r18-80-preview-activation-preflight-2026-11-15'||
    ledger.releasePreviewPreparation?.previewConfigChangesMade!==false||
    ledger.releasePreviewPreparation?.newPreviewDeployed!==false||
    ledger.releasePreviewPreparation?.productionDeployed!==false||
    ledger.releasePreviewPreparation?.explicitOperatorApproval!==false||
    ledger.releasePreviewPreparation?.officialLinkedCli83Plus8DryRun!==false||
    ledger.branches.at(ledger.branches.length===172?-7:ledger.branches.length===171?-6:ledger.branches.length===170?-5:ledger.branches.length===169?-4:ledger.branches.length===168?-3:ledger.branches.length===167?-2:-1)?.name!==
     'stage/world-v2-b10-r18-80-preview-activation-preflight-2026-11-15'||
    ledger.branches.at(ledger.branches.length===172?-7:ledger.branches.length===171?-6:ledger.branches.length===170?-5:ledger.branches.length===169?-4:ledger.branches.length===168?-3:ledger.branches.length===167?-2:-1)?.status!=='staged'||
    ledger.branches.at(ledger.branches.length===172?-7:ledger.branches.length===171?-6:ledger.branches.length===170?-5:ledger.branches.length===169?-4:ledger.branches.length===168?-3:ledger.branches.length===167?-2:-1)?.releaseReady!==false))||
   (ledger.branches.length>=167&&(
    ledger.releasePreviewActivation?.workPackage!=='B10-R18-81'||
    ledger.releasePreviewActivation?.decision!=='NO_GO'||
    ledger.releasePreviewActivation?.priorR80LedgerBranches!==166||
    ledger.releasePreviewActivation?.currentLedgerBranches!==167||
    ledger.releasePreviewActivation?.branchScopedV2KeysCreated!==2||
    ledger.releasePreviewActivation?.genericPreviewV2KeysCreated!==0||
    ledger.releasePreviewActivation?.previewDeploymentId!==
     'dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F'||
    ledger.releasePreviewActivation?.productionEnvChanged!==false||
    ledger.releasePreviewActivation?.productionDeploymentChanged!==false||
    ledger.releasePreviewActivation?.supabaseWritesThisStep!==0||
    ledger.releasePreviewActivation?.liveBrowserV2Verified!==false||
    ledger.releasePreviewActivation?.independentDmP1P2Verified!==false||
    ledger.releasePreviewActivation?.productionReleaseAuthorization!==false||
    ledger.branches.at(ledger.branches.length===172?-6:ledger.branches.length===171?-5:ledger.branches.length===170?-4:ledger.branches.length===169?-3:ledger.branches.length===168?-2:-1)?.name!==
     'stage/world-v2-b10-r18-81-v2-preview-activation-2026-11-15'||
    ledger.branches.at(ledger.branches.length===172?-6:ledger.branches.length===171?-5:ledger.branches.length===170?-4:ledger.branches.length===169?-3:ledger.branches.length===168?-2:-1)?.status!=='staged'||
    ledger.branches.at(ledger.branches.length===172?-6:ledger.branches.length===171?-5:ledger.branches.length===170?-4:ledger.branches.length===169?-3:ledger.branches.length===168?-2:-1)?.releaseReady!==false))||
   (ledger.branches.length>=168&&(
    ledger.releaseMovementDiagnostic?.workPackage!=='B10-R18-82'||
    ledger.releaseMovementDiagnostic?.decision!=='NO_GO'||
    ledger.releaseMovementDiagnostic?.previousLedgerBranches!==167||
    ledger.releaseMovementDiagnostic?.currentLedgerBranches!==168||
    ledger.releaseMovementDiagnostic?.sourceFailedPreviewId!==
     'dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F'||
    ledger.releaseMovementDiagnostic?.browserAdvanceP95Ms!==740.1||
    ledger.releaseMovementDiagnostic?.browserCommitP95Ms!==1451.7||
    ledger.releaseMovementDiagnostic?.browserReleaseToTerminalP95Ms!==2226.1||
    ledger.releaseMovementDiagnostic?.touchesServerProtocol!==false||
    ledger.releaseMovementDiagnostic?.productionDeployed!==false||
    ledger.releaseMovementDiagnostic?.previewDeployed!==false||
    ledger.releaseMovementDiagnostic?.supabaseMigrationApplied!==false||
    ledger.releaseMovementDiagnostic?.candidatePerformanceVerifiedInBrowser!==false||
    ledger.releaseMovementDiagnostic?.releaseAuthorized!==false||
    ledger.branches.at(ledger.branches.length===172?-5:ledger.branches.length===171?-4:ledger.branches.length===170?-3:ledger.branches.length===169?-2:-1)?.name!==
     'stage/world-v2-b10-r18-82-coalesced-advance-dispatch-2026-11-15'||
    ledger.branches.at(ledger.branches.length===172?-5:ledger.branches.length===171?-4:ledger.branches.length===170?-3:ledger.branches.length===169?-2:-1)?.status!=='staged'||
    ledger.branches.at(ledger.branches.length===172?-5:ledger.branches.length===171?-4:ledger.branches.length===170?-3:ledger.branches.length===169?-2:-1)?.releaseReady!==false))||
   (ledger.branches.length>=169&&(
    ledger.releaseCommitAttribution?.workPackage!=='B10-R18-83'||
    ledger.releaseCommitAttribution?.decision!=='NO_GO'||
    ledger.releaseCommitAttribution?.previousLedgerBranches!==168||
    ledger.releaseCommitAttribution?.currentLedgerBranches!==169||
    ledger.releaseCommitAttribution?.actualLiveTokenPositionTriggerCount!==6||
    ledger.releaseCommitAttribution?.disposableSourceRealTokenTriggerCount!==2||
    ledger.releaseCommitAttribution?.actualLiveToolPositionTriggerCount!==4||
    ledger.releaseCommitAttribution?.newSignedCommitSessions!==0||
    ledger.releaseCommitAttribution?.existingSignedCommitCallsProfiled!==72||
    ledger.releaseCommitAttribution?.liveTrackFunctions!=='none'||
    ledger.releaseCommitAttribution?.changedLiveTrackFunctions!==false||
    ledger.releaseCommitAttribution?.fullLiveTriggerCoverageVerified!==false||
    ledger.releaseCommitAttribution?.productionDeployed!==false||
    ledger.releaseCommitAttribution?.previewDeployed!==false||
    ledger.releaseCommitAttribution?.supabaseSqlWritten!==false||
    ledger.releaseCommitAttribution?.sqlMigrationApplied!==false||
    ledger.releaseCommitAttribution?.performanceAcceptedInBrowser!==false||
    ledger.releaseCommitAttribution?.officialCli83Plus8Verified!==false||
    ledger.releaseCommitAttribution?.productionReleaseAuthorized!==false||
    ledger.branches.at(ledger.branches.length===172?-4:ledger.branches.length===171?-3:ledger.branches.length===170?-2:-1)?.name!==
     'stage/world-v2-b10-r18-83-commit-trigger-attribution-2026-11-15'||
    ledger.branches.at(ledger.branches.length===172?-4:ledger.branches.length===171?-3:ledger.branches.length===170?-2:-1)?.status!=='staged'||
    ledger.branches.at(ledger.branches.length===172?-4:ledger.branches.length===171?-3:ledger.branches.length===170?-2:-1)?.releaseReady!==false))||
   (ledger.branches.length>=170&&(
    ledger.releaseFullTriggerFidelity?.workPackage!=='B10-R18-84'||
    ledger.releaseFullTriggerFidelity?.decision!=='NO_GO'||
    ledger.releaseFullTriggerFidelity?.previousLedgerBranches!==169||
    ledger.releaseFullTriggerFidelity?.currentLedgerBranches!==170||
    ledger.releaseFullTriggerFidelity?.fullFixtureTokenPositionTriggerCount!==6||
    ledger.releaseFullTriggerFidelity?.fullFixtureToolPositionTriggerCount!==4||
    ledger.releaseFullTriggerFidelity?.separateOriginalR83BenchmarkPreserved!==true||
    ledger.releaseFullTriggerFidelity?.testOnlyRollback!==true||
    ledger.releaseFullTriggerFidelity?.fixtureEquivalentToFullProductionRLS!==false||
    ledger.releaseFullTriggerFidelity?.liveDatabaseSqlWritten!==false||
    ledger.releaseFullTriggerFidelity?.sqlMigrationApplied!==false||
    ledger.releaseFullTriggerFidelity?.previewDeployed!==false||
    ledger.releaseFullTriggerFidelity?.productionDeployed!==false||
    ledger.releaseFullTriggerFidelity?.performanceAcceptedInBrowser!==false||
    ledger.releaseFullTriggerFidelity?.productionReleaseAuthorized!==false||
    ledger.branches.at(ledger.branches.length===172?-3:ledger.branches.length===171?-2:-1)?.name!==
     'stage/world-v2-b10-r18-84-full-commit-trigger-fidelity-2026-11-15'||
    ledger.branches.at(ledger.branches.length===172?-3:ledger.branches.length===171?-2:-1)?.status!=='staged'||
    ledger.branches.at(ledger.branches.length===172?-3:ledger.branches.length===171?-2:-1)?.releaseReady!==false))||
   (ledger.branches.length>=171&&(
    ledger.releaseCommitPhaseIsolation?.workPackage!=='B10-R18-85'||
    ledger.releaseCommitPhaseIsolation?.decision!=='NO_GO'||
    ledger.releaseCommitPhaseIsolation?.priorLedgerBranches!==170||
    ledger.releaseCommitPhaseIsolation?.currentLedgerBranches!==171||
    ledger.releaseCommitPhaseIsolation?.sourceParentPr!==186||
    ledger.releaseCommitPhaseIsolation?.fullSourceRealTokenTriggers!==6||
    ledger.releaseCommitPhaseIsolation?.fullSourceRealToolTriggers!==4||
    ledger.releaseCommitPhaseIsolation?.additionalSignedSessions!==4||
    ledger.releaseCommitPhaseIsolation?.pairedFogStateCount!==2||
    ledger.releaseCommitPhaseIsolation?.testTransactionRollback!==true||
    ledger.releaseCommitPhaseIsolation?.liveTrackFunctionsChanged!==false||
    ledger.releaseCommitPhaseIsolation?.fullHostedRlsParityEstablished!==false||
    ledger.releaseCommitPhaseIsolation?.supabaseSqlWritten!==false||
    ledger.releaseCommitPhaseIsolation?.sqlMigrationApplied!==false||
    ledger.releaseCommitPhaseIsolation?.previewDeployed!==false||
    ledger.releaseCommitPhaseIsolation?.productionDeployed!==false||
    ledger.releaseCommitPhaseIsolation?.browserReleasePerformanceAccepted!==false||
    ledger.releaseCommitPhaseIsolation?.officialLinkedCli83Plus8Accepted!==false||
    ledger.releaseCommitPhaseIsolation?.independentSignedDmP1P2Accepted!==false||
    ledger.releaseCommitPhaseIsolation?.freeTierLoadRamAccepted!==false||
    ledger.releaseCommitPhaseIsolation?.productionReleaseAuthorized!==false||
    ledger.branches.at(ledger.branches.length===172?-2:-1)?.name!==
     'stage/world-v2-b10-r18-85-signed-commit-phase-attribution-2026-11-15'||
    ledger.branches.at(ledger.branches.length===172?-2:-1)?.status!=='staged'||
    ledger.branches.at(ledger.branches.length===172?-2:-1)?.releaseReady!==false))||
   (ledger.branches.length===172&&(
    ledger.releaseFogCandidateMatrix?.workPackage!=='B10-R18-86'||
    ledger.releaseFogCandidateMatrix?.decision!=='NO_GO'||
    ledger.releaseFogCandidateMatrix?.previousLedgerBranches!==171||
    ledger.releaseFogCandidateMatrix?.currentLedgerBranches!==172||
    ledger.releaseFogCandidateMatrix?.originalTokenPositionTriggers!==6||
    ledger.releaseFogCandidateMatrix?.originalToolPositionTriggers!==4||
    ledger.releaseFogCandidateMatrix?.syntheticFixtureViewerCount!==8||
    ledger.releaseFogCandidateMatrix?.plannedFullFrameComparisons!==192||
    ledger.releaseFogCandidateMatrix?.plannedSignedCanonicalCommits!==8||
    ledger.releaseFogCandidateMatrix?.sourceFrozenOriginalFogAndRay!==true||
    ledger.releaseFogCandidateMatrix?.sourceSealedActualCandidateInstallAndInverse!==true||
    ledger.releaseFogCandidateMatrix?.testOnlyRollback!==true||
    ledger.releaseFogCandidateMatrix?.syntheticMigrationHistoryNotCliProof!==true||
    ledger.releaseFogCandidateMatrix?.originalAuthorizerOrCollisionBypassed!==false||
    ledger.releaseFogCandidateMatrix?.fullHostedRlsParityEstablished!==false||
    ledger.releaseFogCandidateMatrix?.liveSupabaseSqlWritten!==false||
    ledger.releaseFogCandidateMatrix?.sqlMigrationApplied!==false||
    ledger.releaseFogCandidateMatrix?.previewDeployed!==false||
    ledger.releaseFogCandidateMatrix?.productionDeployed!==false||
    ledger.releaseFogCandidateMatrix?.browserMovementAccepted!==false||
    ledger.releaseFogCandidateMatrix?.productionReleaseAuthorized!==false||
    ledger.branches.at(-1)?.name!==
     'stage/world-v2-b10-r18-86-full-trigger-eight-viewer-candidate-matrix-2026-11-15'||
    ledger.branches.at(-1)?.status!=='staged'||
    ledger.branches.at(-1)?.releaseReady!==false)))))


  fail();
 const names=['20261111023204_world_v2_b10_integrated_motion.sql',
  ...narrow.pending.map(x=>x.filename)];
 const versions=names.map(x=>x.slice(0,14));
 if(!eq(versions,PENDING)||new Set(versions).size!==8||
  narrow.pending.some(x=>!/^[0-9]{14}_[a-zA-Z0-9_-]+\.sql$/.test(x.filename))||
  narrow.pending.some(x=>PENDING.indexOf(x.filename.slice(0,14))<1)||
  versions.some(v=>v<='20261109171247'))fail();
 assertPart(s.source,{
  repository:'xuvenz-source/ttrpgsite',sourceParentPr:179,
  sourceParentSha:'23d1d39b0f9f01b50c3c801a783e39371fdd7e80',
  mainShaAtObservation:'90df8c960e79e8d66c322095611427da7bb09de4',
  branch:'stage/world-v2-b10-r18-78-readonly-release-evidence-2026-11-15'
 });
 assertPart(s.liveReadOnly,{
  projectRef:'lwhwgqaunxbmvyndswze',projectState:'ACTIVE_HEALTHY',
  postgresVersion:'17.11',observedAt:'2026-11-14T15:12:23.615177+00:00',
  migrationCount:83,latestVersion:'20261109171247',
  historicalSqlBodiesMatched:83,criticalAuthoritySourcesMatched:10,
  r05Installed:false,atomicFinalizationRpcPresent:false,
  campaignAffinityGuardInstalled:false,activeMotionSessions:0,
  waitingDatabaseLocks:0,databaseSessions:7,configuredMaxConnections:60,
  limits:'point-in-time catalog and activity evidence; no RAM or browser/network performance proof'
 });
 assertPart(s.pendingNarrowRelease,{
  manifestPath:NARROW,pendingTotal:8,versions:PENDING,
  excluded:['20261113021015','20261113021017'],
  officialLinkedCli:'NOT_PERFORMED',fullyAuthenticatedHistoryAndDryRun:'NOT_VERIFIED'
 });
 assertPart(s.canonicalDeployment,{
  hostname:'ttrpgsite.vercel.app',
  deploymentId:'dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN',
  gitSha:'5ca8c83bdef4a5d9870020b0f2b16723f7790e38',
  separateNewerProductionTarget:{
   deploymentId:'dpl_5GWtYfXnbL4LvkJZqMuKUTStspom',
   gitSha:'da078abe7e0e5f28dbb9eeaa5f26fa570fbc7c19',
   canonicalAliasAttached:false
  },
  mainSha:'90df8c960e79e8d66c322095611427da7bb09de4',
  r18_58ReceiptPanelInCanonicalBuild:false,stagedReceiptPanelExists:true,
  protectedQaDeployment:'NOT_PERFORMED',targetBuildForFutureQa:'NOT_SELECTED'
 });
 assertPart(s.releaseLedger,{
  ledgerPath:LEDGER,lastUpdated:'2026-11-12',lastTrackedStep:'R18-15',
  untrackedLaterStagingRequiresReconciliation:true,
  fullNextReleaseBundleReviewed:false
 });
 assertPart(s.outstanding,{
  officialPinnedCliVersion:'2.81.3',
  officialLinkedFetchListDryRun:'NOT_VERIFIED',
  independentSignedDmP1PassiveP2:'NOT_VERIFIED',
  reviewedRevocationAndHiddenSight:'NOT_VERIFIED',
  trueWallCollisionAndInstantRegrab:'NOT_VERIFIED',
  browserMovementInputToCommitP95:'NOT_MEASURED',
  freeTierPhysicalRamAndLocksUnderMultiplayerLoad:'NOT_MEASURED',
  releaseLedgerReconciled:false,explicitOperatorApproval:false
 });
 assertPart(s.supportingTools,{
  liveSql:'supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql',
  liveValidator:'scripts/release/validate-world-v2-r18-50-readonly-evidence.mjs',
  linkedWorkspaceValidator:'scripts/release/validate-world-v2-r18-49-linked-workspace.mjs',
  cliValidator:'scripts/release/validate-world-v2-r18-51-cli-evidence.mjs',
  qaValidator:'scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs',
  qaPanel:'src/engine/v2/WorldTraceCapturePanel.jsx',
  stagedCandidate:'supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql',
  stagedInverse:'supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql'
 });
 if(!sha(s.source.sourceParentSha)||!sha(s.canonicalDeployment.gitSha)||
   !BLOCKERS.length||s.liveReadOnly.databaseSessions>
   s.liveReadOnly.configuredMaxConnections||s.liveReadOnly.observedAt===undefined||
   !Number.isFinite(Date.parse(s.liveReadOnly.observedAt)))fail();
 for(const p of Object.values(s.supportingTools)){
  if(!pathExists(root,p))fail();
 }
 if(!ledger.branches.some(x=>
  x.name==='stage/world-v2-b10-r18-15-drag-corner-collision-settle-2026-11-12'))
  fail();
 const qa=validateR58MultiplayerQa({
  receipts:[],expectedBuildSha:s.canonicalDeployment.gitSha,now
 });
 if(qa.decision!=='NO_GO'||!eq(qa.missingRoles,['dm','p1','p2']))fail();
 let freshAudit='NOT_SUPPLIED';
 if(freshReadOnlyReceipt!==undefined){
  const r=validateR50ReadOnlyReceipt({
   receipt:freshReadOnlyReceipt,repoRoot:root,now
  });
  if(r.decision!=='NO_GO'||r.safeToApply!==false||
   r.matchedRemoteHistory!==83||r.matchedAuthorityFunctions!==10)
   fail();
  freshAudit='STRUCTURE_VALID_NOT_INDEPENDENTLY_ATTESTED';
 }
 const observed=Date.parse(s.liveReadOnly.observedAt);
 const checked=new Date(now).getTime();
 if(!Number.isFinite(checked))fail();
 return Object.freeze({
  decision:'NO_GO',safeToDeploy:false,safeToApplySql:false,
  reportType:'READ_ONLY_STAGING_TRIAGE_NOT_RELEASE_PROOF',
  sourceParentPr:179,expectedPendingMigrations:8,recordedRemoteMigrations:83,
  recordedMatchingHistory:83,recordedMatchingAuthorityFunctions:10,
  recordedPreinstallNoActiveMotion:true,
  snapshotAgeMinutes:Math.max(0,Math.round((checked-observed)/60000)),
  snapshotCurrentlyFresh:observed<=checked+120000&&checked-observed<=15*60000,
  freshReadOnlyReceiptValidation:freshAudit,
  canonicalDeploymentSha:s.canonicalDeployment.gitSha,
  canonicalReceiptUiAvailable:false,
  nextReleaseLedgerReconciled:false,
  signedIndependentQaAvailable:false,
  linkedCliInvocationIndependentlyAttested:false,
  freeTierRamUnderLoadMeasured:false,
  blockers:BLOCKERS
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length>1||args.some(x=>!x.startsWith('--fresh-receipt=')))fail();
  let receipt;
  if(args.length){
   const p=resolve(args[0].slice('--fresh-receipt='.length));
   if(!args[0].slice('--fresh-receipt='.length)||
     statSync(p).size>200000)fail();
   receipt=JSON.parse(readFileSync(p,'utf8'));
  }
  const report=validateR78ReleaseStatus({freshReadOnlyReceipt:receipt});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  process.stderr.write('R78 RELEASE NO-GO: invalid, stale or unsafe evidence; inspect privately.\n');
  process.exitCode=1;
 }
}
