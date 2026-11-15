/**
 * B10-R18-89 — READ ONLY, offline/reviewer-facing live-attestation gate.
 * This tracks an observed 15 November 2026 R50 SELECT-only
 * receipt against original 83 SQL-body digests and ten authority digests.
 *
 * The manifest is a frozen observation, NOT live credentialed CLI proof.
 * Optional independently collected fresh R50 JSON must pass the existing
 * R50 strict full-payload verifier. This always returns NO_GO and never
 * performs remote calls, SQL, filesystem writes or deployments.
 */
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR88CombinedQa} from './validate-world-v2-r18-88-combined-qa.mjs';
import {validateR50ReadOnlyReceipt} from './validate-world-v2-r18-50-readonly-evidence.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PATH='staging/world-v2-b10-r18-89-readonly-qa-prerequisites/manifest.json';
const REF='lwhwgqaunxbmvyndswze';
const BRANCH='stage/world-v2-b10-r18-89-linked-cli-qa-prerequisite-attestation-2026-11-15';
const VERSIONS=[
 '20261111023204','20261113021005','20261113021007','20261113021010',
 '20261113021012','20261113021020','20261113021022','20261113024116'
];
const fail=(v)=>{throw Error('R89 READONLY QA NO-GO: '+v)};
const exact=(v,s)=>JSON.stringify(v)===JSON.stringify(s);
const all=(object,keys,value)=>object&&keys.every(k=>object[k]===value);
const bools=(o,allow)=>o&&Object.keys(o).length===allow.length&&
 allow.every(k=>Object.hasOwn(o,k));

export function validateR89ReadOnlyPrerequisites({
 repoRoot=ROOT,manifest,freshR50Receipt,now=new Date()
}={}){
 const root=realpathSync(resolve(repoRoot));
 const r88=validateR88CombinedQa({repoRoot:root});
 if(r88.decision!=='NO_GO'||r88.requiredMigrations!==91||r88.registeredMigrations!==83||
    r88.safeToApply!==false||r88.productionDeployed!==false)
  fail('R88 baseline no longer safely blocked');
 const m=manifest??JSON.parse(readFileSync(join(root,PATH),'utf8'));
 if(!m||m.schema!==1||m.workPackage!=='B10-R18-89'||
  m.kind!=='CONNECTED_READONLY_HISTORY_AND_QA_ISOLATION_ATTESTATION'||
  m.releaseDecision!=='NO_GO'||m.safeToApply!==false||
  m.sourceParent?.pr!==190||
  m.sourceParent?.sha!=='8461b38a498eb1244407b232a1f700314a54d2fd'||
  m.sourceBranch!==BRANCH||
  m.sourceScope!=='read-only live audit evidence, offline verifier and authenticated CLI operator protocol')
  fail('source branch, original parent or NO_GO plan drift');
 const p=m.project;
 if(!p||p.projectRef!==REF||p.organizationPlan!=='free'||
  p.observedAt!=='2026-11-15T10:11:42.699481+00:00'||
  p.readOnlyEvidenceSource!=='connected Supabase SELECT-only R18-50 authority/migration receipt'||
  p.historicalVersionsRegistered!==83||p.historicalVersionsUnique!==83||
  p.historicalVersionsMatchingFrozenNamesCountsAndSqlMd5!==83||
  p.historicalVersionDriftCount!==0||p.latestVersion!=='20261109171247'||
  p.criticalAuthorityFunctionsVerified!==10||p.criticalAuthorityFunctionDriftCount!==0||
  p.r05Installed!==false||p.atomicFinalizationRpcInstalled!==false||
  p.activeMovementSessions!==0||p.waitingDatabaseLocks!==0||
  p.databaseSessionsAtObservation!==7||p.configuredMaxConnections!==60||
  p.anonInternalSchemaUsage!==false||p.authenticatedInternalSchemaUsage!==false||
  p.anonCommitExecute!==false||p.authenticatedCommitExecute!==true||
  p.liveDatabaseWritePerformed!==false||p.liveMigrationApplied!==false)
  fail('recorded read-only migration/function source observation changed');
 const q=m.isolation;
 if(!q||q.connectedAccessibleProjectCountAtObservation!==1||
  !exact(q.connectedVisibleBranches,['main'])||
  q.verifiedSeparateQaDatabase!==false||
  q.permanentQaUrlIsIndependentBackend!==false||
  q.futureBackendEnvironmentNotProvisioned!==true||
  q.qaIsolationReady!==false||q.planVerificationOnly!==true||
  q.createdNewProject!==false||q.createdPaidBranch!==false)
  fail('separate QA database incorrectly attested');
 const c=m.cli;
 const cliFalse=['authenticatedLinkedInvocationPerformed',
  'officialVersionHelpVerifiedInRealCli','linkedMigrationFetchPerformed',
  'officialLinkedMigrationListPerformed',
  'officialLinkedDbPushDryRunPerformed','officialHistoryBodyVerificationThroughCli'];
 if(!c||c.officialPinnedVersion!=='2.81.3'||!all(c,cliFalse,false)||
   c.requiredRemoteHistoryCount!==83||c.requiredPendingMigrationCount!==8||
   c.requiredSourceManifest!=='staging/world-v2-b10-r18-48-narrow-pending/manifest.json'||
   c.existingWorkspaceVerifier!=='scripts/release/validate-world-v2-r18-49-linked-workspace.mjs'||
   c.existingReceiptVerifier!=='scripts/release/validate-world-v2-r18-50-readonly-evidence.mjs'||
   c.existingCliOutputVerifier!=='scripts/release/validate-world-v2-r18-51-cli-evidence.mjs'||
   c.requireIsolatedTemporaryWorkspace!==true||
   c.neverRunDbPushWithoutDryRun!==true||
   c.cliV3RemoteDefaultCompatibilityRisk!==true||
   !exact(c.pendingVersions,VERSIONS))
  fail('CLI pin, scope, pending versions or linked dry-run status drift');
 const s=m.candidate;
 if(!s||s.combinedR57R77SelectedForFutureQaOnly!==true||
    s.installedOnSharedBackend!==false||s.sourceSealedByR18_88!==true||
    s.hasTestedDisposableAtomicRollback!==true||
    s.realPostCommitRollbackProven!==false||
    s.permanentQaDeploymentChanged!==false||s.productionChanged!==false)
  fail('combined candidate incorrectly installed or approved');
 const gates=['officialPinnedLinkedCliDryRun','signedIndependentDmP1PassiveP2',
  'trueFogCollisionRevocationAndRegrab','browserP50P95AndObserverConvergence',
  'physicalFreeRamSwapCpuAndLocksUnderLoad',
  'separateQaOrSharedBackendOperatorSafetyReview','independentSecurityApproval',
  'explicitOperatorSqlAndDeploymentApproval'];
 if(!bools(m.releaseGates,gates)||!all(m.releaseGates,gates,false))
  fail('outstanding release gates falsely approved');
 const ops=['sqlApplied','migrationHistoryRepaired','secretsReadOrCommitted',
  'runnerExecutedAgainstLinkedCli','runtimeFilesChanged','rootMigrationFilesChanged',
  'previewDeployed','productionDeployed','releaseAuthorized'];
 if(!m.operation||m.operation.catalogSelectOnly!==true||
    !all(m.operation,ops,false))
  fail('an executable or deployment action is misrepresented as read-only');
 const result={workPackage:'B10-R18-89',decision:'NO_GO',
  safeToApply:false,sourceOnly:true,linkedProjectRef:REF,
  frozenCatalogHistoricalMatches:83,frozenCatalogAuthorityMatches:10,
  currentCredentialedCliVerified:false,officialLinkedDryRunVerified:false,
  separateQaBackendVerified:false,protectedMultiplayerQaAccepted:false,
  freeTierRamLoadAccepted:false,sqlApplied:false,previewDeployed:false,
  productionDeployed:false};
 // The old R50 freshness/hostile ACL validator checks a separate actual
 // receipt. A client-provided receipt is NOT authentication of its origin.
 if(freshR50Receipt!==undefined){
  const checked=validateR50ReadOnlyReceipt({
   receipt:freshR50Receipt,repoRoot:root,now
  });
  if(checked.decision!=='NO_GO'||checked.safeToApply!==false||
   checked.matchedRemoteHistory!==83||checked.matchedAuthorityFunctions!==10)
   fail('fresh R50 evidence did not meet strict source/ACL integrity');
  result.freshSuppliedReceiptValidated=true;
  result.receiptOriginIndependentlyAttested=false;
 }else{
  result.freshSuppliedReceiptValidated=false;
  result.receiptOriginIndependentlyAttested=false;
 }
 return Object.freeze(result);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('offline summary accepts no CLI or database arguments');
  process.stdout.write(JSON.stringify(validateR89ReadOnlyPrerequisites(),null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1}
}
