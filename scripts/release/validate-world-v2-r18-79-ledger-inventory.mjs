/**
 * R18-79. Audits the frozen, public GitHub branch/PR observation against the
 * shared next-release ledger. Offline, NO_GO-only. It cannot attest that
 * GitHub branch heads remain unchanged after the snapshot or authorize release.
 */
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const INVENTORY='staging/world-v2-b10-r18-79-github-branch-inventory.json';
const LEDGER='staging/next-release-ledger.json';
const BRANCH='stage/world-v2-b10-r18-79-release-ledger-reconciliation-2026-11-15';
const NEXT='stage/world-v2-b10-r18-80-preview-activation-preflight-2026-11-15';
const NEXT81='stage/world-v2-b10-r18-81-v2-preview-activation-2026-11-15';
const NEXT82='stage/world-v2-b10-r18-82-coalesced-advance-dispatch-2026-11-15';
const NEXT83='stage/world-v2-b10-r18-83-commit-trigger-attribution-2026-11-15';
const NEXT84='stage/world-v2-b10-r18-84-full-commit-trigger-fidelity-2026-11-15';
const NEXT85='stage/world-v2-b10-r18-85-signed-commit-phase-attribution-2026-11-15';
const NEXT86='stage/world-v2-b10-r18-86-full-trigger-eight-viewer-candidate-matrix-2026-11-15';
const NEXT87='stage/world-v2-b10-r18-87-balanced-signed-candidate-cost-2026-11-15';
const NEXT88='stage/world-v2-b10-r18-88-combined-qa-release-preflight-2026-11-15';
const NEXT89='stage/world-v2-b10-r18-89-linked-cli-qa-prerequisite-attestation-2026-11-15';
const NEXT90='stage/world-v2-b10-r18-90-pinned-cli-offline-help-2026-11-15';
const NEXT91='stage/world-v2-b10-r18-91-readonly-cli-capture-gate-2026-11-15';
const NEXT92='stage/world-v2-b10-r18-92-r12-regrab-ci-diagnostics-2026-11-16';
const NEXT93='stage/world-v2-b10-r18-93-cli-streams-positive-offline-2026-11-16';
const NEXT94='stage/world-v2-b10-r18-94-phase3-chromium-shutdown-2026-11-16';
const NEXT95='stage/world-v2-b10-r18-95-free-isolated-qa-project-preflight-2026-11-16';
const NEXT96='stage/world-v2-b10-r18-96-free-qa-provisioning-2026-11-16';
const MAIN='90df8c960e79e8d66c322095611427da7bb09de4';
const CANONICAL='5ca8c83bdef4a5d9870020b0f2b16723f7790e38';
const PARENT='5102f62ffe1017a1c7f66df738bee5bfaaaebc38';
const fail=()=>{throw Error('R79 LEDGER NO-GO: invalid or incomplete GitHub release inventory')};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(x)&&
 x.length<=200&&!x.includes('..')&&!x.endsWith('/');
const stage=x=>/^(stage|fix|feature)\//.test(x);
const special=new Map([
 [139,'CANONICAL_LIVE_UNMERGED'],[140,'REJECTED_ROLLED_BACK'],
 [144,'FAILED_SOLO_DM_QA_DIVERGED'],[130,'EXCLUDED_FROM_NARROW_SQL'],
 [131,'EXCLUDED_FROM_NARROW_SQL'],[161,'OPTIONAL_SQL_NOT_INSTALLED'],
 [179,'OPTIONAL_SQL_NOT_INSTALLED'],[181,'CURRENT_RECONCILIATION_ONLY']
]);
const allowed=new Set([
 ...special.values(),'NO_PR_UNREVIEWED',
 'MERGED_GITHUB_UNVERIFIED_CANONICAL_ALIAS','CLOSED_UNMERGED_UNVERIFIED',
 'OPEN_UNMERGED_NOT_RELEASE_APPROVED'
]);
const branchStatus=x=>x==='CANONICAL_LIVE_UNMERGED'?'released':
 ['REJECTED_ROLLED_BACK','FAILED_SOLO_DM_QA_DIVERGED'].includes(x)?'superseded':
 x==='MERGED_GITHUB_UNVERIFIED_CANONICAL_ALIAS'?'merged':
 x==='CLOSED_UNMERGED_UNVERIFIED'?'closed-unmerged':'staged';

export function validateR79Ledger({snapshot,ledger}={}){
 const s=snapshot??JSON.parse(readFileSync(join(ROOT,INVENTORY),'utf8'));
 const l=ledger??JSON.parse(readFileSync(join(ROOT,LEDGER),'utf8'));
 const successor=[NEXT,NEXT81,NEXT82,NEXT83,NEXT84,NEXT85,NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const deployedSuccessor=[NEXT81,NEXT82,NEXT83,NEXT84,NEXT85,NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const failedPreviewSuccessor=[NEXT82,NEXT83,NEXT84,NEXT85,NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const commitProfileSuccessor=[NEXT83,NEXT84,NEXT85,NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const fullTriggerSuccessor=[NEXT84,NEXT85,NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const phaseIsolationSuccessor=[NEXT85,NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const candidateMatrixSuccessor=[NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const balancedCostSuccessor=[NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const combinedQaSuccessor=[NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const linkedCliQaSuccessor=[NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const pinnedCliHelpSuccessor=[NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const readOnlyCaptureSuccessor=[NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const regrabHarnessSuccessor=[NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const cliStreamsSuccessor=[NEXT93,NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const phase3ChromeSuccessor=[NEXT94,NEXT95,NEXT96].includes(l?.releaseBranch);
 const freeQaSuccessor=[NEXT95,NEXT96].includes(l?.releaseBranch);
 const qaProvisionSuccessor=l?.releaseBranch===NEXT96;
 const expectedCount=165+(successor?1:0)+(deployedSuccessor?1:0)+
  (failedPreviewSuccessor?1:0)+(commitProfileSuccessor?1:0)+
  (fullTriggerSuccessor?1:0)+(phaseIsolationSuccessor?1:0)+
  (candidateMatrixSuccessor?1:0)+(balancedCostSuccessor?1:0)+
  (combinedQaSuccessor?1:0)+(linkedCliQaSuccessor?1:0)+(pinnedCliHelpSuccessor?1:0)+(readOnlyCaptureSuccessor?1:0)+(regrabHarnessSuccessor?1:0)+(cliStreamsSuccessor?1:0)+(phase3ChromeSuccessor?1:0)+(freeQaSuccessor?1:0)+(qaProvisionSuccessor?1:0);
 if(s?.schema!==1||s.workPackage!=='B10-R18-79'||
  s.sourceKind!=='GITHUB_READ_ONLY_BRANCH_AND_PR_METADATA'||
  s.recordedOn!=='2026-11-15'||s.releaseDecision!=='NO_GO'||
  s.safeToRelease!==false||s.operatorApproved!==false||
  s.parent?.pr!==180||s.parent.sha!==PARENT||s.currentPr!==181||
  l?.updated!=='2026-11-15'||l.productionBaseSha!==MAIN||
  ![BRANCH,NEXT,NEXT81,NEXT82,NEXT83,NEXT84,NEXT85,NEXT86,NEXT87,NEXT88,NEXT89,NEXT90,NEXT91,NEXT92,NEXT93,NEXT94,NEXT95,NEXT96].includes(l.releaseBranch)||
  l.upcomingRelease?.releaseBranch!==l.releaseBranch||
  l.upcomingRelease.productionBaseSha!==MAIN)fail();
 const scope=s.scope;
 if(scope?.repository!=='xuvenz-source/ttrpgsite'||
  scope.branchPages!==3||scope.prPages!==2||
  scope.observedGithubBranchCount!==179||
  scope.observedGithubPrCount!==177||
  scope.stageFixFeatureBranches!==165||
  scope.previousLedgerEntries!==66||
  scope.newTrackedBranches!==99||
  scope.expectedUpdatedLedgerEntries!==165||
  scope.newlyTrackedLaterPrs!==62||
  scope.noMatchingPr!==2||
  scope.accountNonReleaseBranches!==14||
  !Array.isArray(s.githubBranchSnapshot)||s.githubBranchSnapshot.length!==179||
  !Array.isArray(s.newlyReconciled)||s.newlyReconciled.length!==99||
  !Array.isArray(s.laterPrs)||s.laterPrs.length!==62||
  !Array.isArray(l.branches)||l.branches.length!==expectedCount)fail();

 const branchByName=new Map(),snapshotNames=[];
 for(const x of s.githubBranchSnapshot){
  if(!x||Object.keys(x).sort().join(',')!=='name,sha'||
   !safe(x.name)||!sha(x.sha)||branchByName.has(x.name))fail();
  branchByName.set(x.name,x.sha);snapshotNames.push(x.name);
 }
 if(!same(snapshotNames,[...snapshotNames].sort((a,b)=>a.localeCompare(b))))fail();
 const allCandidateNames=snapshotNames.filter(stage);
 const ledgerByName=new Map(l.branches.map(x=>[x.name,x]));
 if(ledgerByName.size!==expectedCount||
  !same([...allCandidateNames].sort(),
   [...ledgerByName.keys()].filter(x=>x!==NEXT&&x!==NEXT81&&x!==NEXT82&&x!==NEXT83&&x!==NEXT84&&x!==NEXT85&&x!==NEXT86&&x!==NEXT87&&x!==NEXT88&&x!==NEXT89&&x!==NEXT90&&x!==NEXT91&&x!==NEXT92&&x!==NEXT93&&x!==NEXT94&&x!==NEXT95&&x!==NEXT96).sort()))fail();

 const added=new Set(),prRefs=new Set(),group={};
 for(const x of s.newlyReconciled){
  if(!x||!stage(x.name)||added.has(x.name)||!sha(x.observedBranchSha)||
   branchByName.get(x.name)!==x.observedBranchSha||
   x.releaseReady!==false||x.reviewedAgainstCanonicalProduction!==false||
   x.productionBaseSha!==MAIN||!allowed.has(x.classification)||
   x.status!==branchStatus(x.classification)||
   !same(ledgerByName.get(x.name),x))fail();
  if(x.linkedPullRequest!==null){
   if(!Number.isInteger(x.linkedPullRequest)||x.linkedPullRequest<1||
    prRefs.has(x.linkedPullRequest)||!['open','closed'].includes(x.pullRequestState))fail();
   prRefs.add(x.linkedPullRequest);
  }else if(x.classification!=='NO_PR_UNREVIEWED'||x.pullRequestState!=='NO_PR')fail();
  added.add(x.name);group[x.classification]=(group[x.classification]||0)+1;
 }
 const must={NO_PR_UNREVIEWED:2,CANONICAL_LIVE_UNMERGED:1,
  REJECTED_ROLLED_BACK:1,FAILED_SOLO_DM_QA_DIVERGED:1,
  EXCLUDED_FROM_NARROW_SQL:2,OPTIONAL_SQL_NOT_INSTALLED:2,
  CURRENT_RECONCILIATION_ONLY:1};
 if(added.size!==99)fail();
 for(const [key,count] of Object.entries(must)){
  if(group[key]!==count)fail();
 }
 const later=new Set();
 for(const [i,x] of s.laterPrs.entries()){
  if(!x||!Number.isInteger(x.pr)||x.pr<118||x.pr>181||
   [167,168].includes(x.pr)||later.has(x.pr)||
   (i>0&&x.pr<=s.laterPrs[i-1].pr)||
   x.url!=='https://github.com/xuvenz-source/ttrpgsite/pull/'+x.pr||
   !safe(x.headBranch)||!safe(x.baseBranch)||!sha(x.headSha)||
   !['open','closed'].includes(x.state)||
   typeof x.draft!=='boolean'||typeof x.merged!=='boolean'||
   typeof x.title!=='string'||x.title.length>300||
   !allowed.has(x.disposition))fail();
  later.add(x.pr);
  const row=s.newlyReconciled.find(y=>y.name===x.headBranch);
  if(!row||row.linkedPullRequest!==x.pr||
   row.observedBranchSha!==x.headSha||
   row.classification!==x.disposition||
   row.pullRequestState!==x.state||row.prMerged!==x.merged)fail();
 }
 if(later.size!==62||s.laterPrs[0]?.pr!==118||
  s.laterPrs.at(-1)?.pr!==181)fail();
 const expectedException={
  canonicalAlias:'ttrpgsite.vercel.app',canonicalSha:CANONICAL,
  rejectedRolledBackPr:140,failedPreviewQaPr:144,
  excludedNarrowSqlPrs:[130,131],
  uninstalledOptionalSqlPrs:[161,179],parentVerifiedInR78:true
 };
 if(!same(s.exceptional,expectedException)||
  !same(s.migrationGate,{
   remoteVersionCount:83,pendingCount:8,officialLinkedCliDryRun:'NOT_DONE',
   signedMultiAccountQa:'NOT_DONE',freeTierRamUnderLoad:'NOT_MEASURED'
  })||!s.policy?.includes('NOT bulk-merge approval'))fail();
 const r=l.releaseReconciliation;
 if(r?.schema!==1||r.workPackage!=='B10-R18-79'||r.decision!=='NO_GO'||
  r.sourceSnapshot!==INVENTORY||r.auditedGitHubBranches!==179||
  r.auditedGitHubPrs!==177||r.previousLedgerBranches!==66||
  r.newlyRecorded!==99||r.totalLedgerBranches!==165||
  r.sourceParentSha!==PARENT||
  r.currentCanonicalDeploymentSha!==CANONICAL||r.gitMainSha!==MAIN||
  r.independentlyAuthorized!==false||r.releaseCandidatesApproved!==0||
  r.officialSupabaseCliLinked83Plus8!==false||
  r.independentSignedDmP1P2Accepted!==false||
  r.freeTierPhysicalRamUnderLoadAccepted!==false||
  r.migrationsAppliedByThisStep!==0||r.frontendDeploymentsByThisStep!==0)fail();
 if(l.features?.length!==60||l.releaseHistory?.length!==9||
  l.databaseDependencies?.length!==28||l.edgeFunctionDependencies?.length!==1||
  l.lastRelease?.approvedPullRequests?.[0]!==53||
  l.lastRelease?.productionCommit!=='55d5d704c47c60f04100ce13fb81a5d4357b999e'||
  ledgerByName.get('stage/world-v2-b10-r18-15-drag-corner-collision-settle-2026-11-12')?.status!=='staged'||
  ledgerByName.get('stage/fog-pending-tick-dedupe-and-memory-audit-2026-11-08')?.status!=='released')fail();
 if(successor){
  const expected={
   schema:1,workPackage:'B10-R18-80',decision:'NO_GO',
   originalR79AuditLedgerBranches:165,currentLedgerBranches:166,
   addedBranch:NEXT,
   candidatePreviewGitSha:'380e31bda9e20638c3e1f660a2cdf001b8e37c0d',
   existingReadyPreviewId:'dpl_Pk7zo5VLppWs6hjc6WKsp4bMH2ZC',
   existingPreviewV2Ready:false,previewConfigChangesMade:false,
   newPreviewDeployed:false,productionDeployed:false,
   explicitOperatorApproval:false,independentSignedDmP1P2Accepted:false,
   officialLinkedCli83Plus8DryRun:false
  };
  const entry=ledgerByName.get(NEXT);
  if(!same(l.releasePreviewPreparation,expected)||
   !entry||l.branches[165]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='PREVIEW_SOURCE_PREFLIGHT_ONLY'||
   entry.linkedPullRequest!==182||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   typeof entry.note!=='string'||
   !entry.note.includes('no new preview build'))fail();
  }else if(l.releasePreviewPreparation!==undefined)fail();
 if(deployedSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-81',decision:'NO_GO',
   priorR79AuditLedgerBranches:165,priorR80LedgerBranches:166,
   currentLedgerBranches:167,addedBranch:NEXT81,
   userApprovedScopedPreviewOnly:true,
   sourcePreviewSha:'380e31bda9e20638c3e1f660a2cdf001b8e37c0d',
   previewDeploymentId:'dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F',
   previewReady:true,vercelPreviewProtected:true,
   branchScopedV2KeysCreated:2,genericPreviewV2KeysCreated:0,
   productionEnvChanged:false,productionDeploymentChanged:false,
   supabaseMigrationCount:83,supabaseWritesThisStep:0,
   liveBrowserV2Verified:false,independentDmP1P2Verified:false,
   physicalFreeRamAndLocksUnderLoadMeasured:false,
   officialLinkedCli83Plus8DryRun:false,
   productionReleaseAuthorization:false
  };
  const entry=ledgerByName.get(NEXT81);
  if(!same(l.releasePreviewActivation,exact)||
   !entry||l.branches[166]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='PREVIEW_ONLY_DEPLOYED_PENDING_SIGNED_BROWSER_QA'||
   entry.linkedPullRequest!==183||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NOT release approval'))fail();
 }else if(l.releasePreviewActivation!==undefined)fail();
 if(failedPreviewSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-82',decision:'NO_GO',
   previousLedgerBranches:167,currentLedgerBranches:168,addedBranch:NEXT82,
   sourceFailedPreviewId:'dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F',
   sourceFailedPreviewSha:'380e31bda9e20638c3e1f660a2cdf001b8e37c0d',
   observedRole:'dm',independentSignedPlayersVerified:false,
   observedGestureCount:7,observedAdvanceCalls:23,
   browserAdvanceP95Ms:740.1,browserCommitP95Ms:1451.7,
   browserReleaseToTerminalP95Ms:2226.1,
   optimization:'DEFER_ADVANCE_UNTIL_NATIVE_COALESCED_EVENT_COMPLETE',
   touchesServerProtocol:false,changesCanonicalCommit:false,
   changesFogAuthorization:false,
   productionDeployed:false,previewDeployed:false,
   supabaseMigrationApplied:false,optionalAtomicFinalizationEnabled:false,
   candidatePerformanceVerifiedInBrowser:false,
   officialCli83Plus8DryRunVerified:false,releaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT82);
  if(!same(l.releaseMovementDiagnostic,exact)||
   !entry||l.branches[167]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='COALESCED_ADVANCE_SOURCE_FIX_PREVIEW_PERFORMANCE_FAILED'||
   entry.linkedPullRequest!==184||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('Not deployed'))fail();
 }else if(l.releaseMovementDiagnostic!==undefined)fail();
 if(commitProfileSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-83',decision:'NO_GO',
   previousLedgerBranches:168,currentLedgerBranches:169,addedBranch:NEXT83,
   actualLiveTokenPositionTriggerCount:6,
   disposableSourceRealTokenTriggerCount:2,
   actualLiveToolPositionTriggerCount:4,
   newSignedCommitSessions:0,
   existingSignedCommitCallsProfiled:72,
   browserDMSignedCommitP95Ms:1451.7,
   historicalLiveCommitSQLMeanMs:305.46,
   liveTrackFunctions:'none',changedLiveTrackFunctions:false,
   R83TemporaryProfiler:'PG17_SOURCE_REAL_ONLY_SET_LOCAL_AND_ROLLBACK',
   fullLiveTriggerCoverageVerified:false,
   productionDeployed:false,previewDeployed:false,
   supabaseSqlWritten:false,sqlMigrationApplied:false,
   performanceAcceptedInBrowser:false,
   independentlyAuthenticatedP1P2Verified:false,
   officialCli83Plus8Verified:false,
   productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT83);
  if(!same(l.releaseCommitAttribution,exact)||
   !entry||l.branches[168]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='ORIGINAL_COMMIT_TRIGGER_COVERAGE_AND_DISPOSABLE_FUNCTION_PROFILE'||
   entry.linkedPullRequest!==185||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO production/preview deploy'))fail();
 }else if(l.releaseCommitAttribution!==undefined)fail();
 if(fullTriggerSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-84',decision:'NO_GO',
   previousLedgerBranches:169,currentLedgerBranches:170,addedBranch:NEXT84,
   originalR83TokenMovementTriggerCount:2,
   liveTokenPositionTriggerCount:6,fullFixtureTokenPositionTriggerCount:6,
   liveToolPositionTriggerCount:4,fullFixtureToolPositionTriggerCount:4,
   exactLiveTriggerFunctionSourcesPinned:10,
   originalR68SignedTokenCommitsRetained:72,
   separateOriginalR83BenchmarkPreserved:true,
   additionalSignedToolCommitsPlanned:8,testOnlyRollback:true,
   fixtureEquivalentToFullProductionRLS:false,
   liveSourceFunctionStatsChanged:false,liveDatabaseSqlWritten:false,
   sqlMigrationApplied:false,previewDeployed:false,productionDeployed:false,
   performanceAcceptedInBrowser:false,independentSignedDmP1P2Accepted:false,
   officialLinkedCli83Plus8Verified:false,
   freeTierRamAndLockLoadAccepted:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT84);
  if(!same(l.releaseFullTriggerFidelity,exact)||
   !entry||l.branches[169]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='DISPOSABLE_SOURCE_REAL_FULL_POSITION_TRIGGER_COVERAGE'||
   entry.linkedPullRequest!==186||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('Never deploys client'))fail();
 }else if(l.releaseFullTriggerFidelity!==undefined)fail();
 if(phaseIsolationSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-85',decision:'NO_GO',
   priorLedgerBranches:170,currentLedgerBranches:171,addedBranch:NEXT85,
   sourceParentPr:186,
   sourceParentSha:'76a66177a834acfc54afce4f3731d8442df3c953',
   originalR68SignedTokenCommitsPreserved:72,
   historicalR83AndR84ProfilesPreserved:true,
   fullSourceRealTokenTriggers:6,fullSourceRealToolTriggers:4,
   additionalSignedSessions:4,pairedFogStateCount:2,
   environment:'DISPOSABLE_LOCAL_POSTGRESQL_17_ONLY',
   phases:['begin_advance','commit'],
   liveTrackFunctionsChanged:false,testTransactionRollback:true,
   fullHostedRlsParityEstablished:false,
   productionDeployed:false,previewDeployed:false,
   supabaseSqlWritten:false,sqlMigrationApplied:false,
   browserReleasePerformanceAccepted:false,officialLinkedCli83Plus8Accepted:false,
   independentSignedDmP1P2Accepted:false,freeTierLoadRamAccepted:false,
   productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT85);
  if(!same(l.releaseCommitPhaseIsolation,exact)||
   !entry||l.branches[170]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='SIGNED_CANONICAL_COMMIT_AND_PRIVATE_FOG_PHASE_COST_ATTRIBUTION'||
   entry.linkedPullRequest!==187||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('never install or deploy'))fail();
 }else if(l.releaseCommitPhaseIsolation!==undefined)fail();
 if(candidateMatrixSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-86',decision:'NO_GO',
   previousLedgerBranches:171,currentLedgerBranches:172,addedBranch:NEXT86,
   directParentPr:187,
   directParentSha:'57b3916b34313070698e3ca1e13827e3154e4142',
   preservedR83R84R85Runs:true,fixtureDatabase:'world_v2_b10_r05',
   fourModes:['original','r57','r77','combined'],
   originalTokenPositionTriggers:6,originalToolPositionTriggers:4,
   sourceFrozenOriginalFogAndRay:true,
   syntheticFixtureViewerCount:8,plannedFullFrameComparisons:192,
   plannedSignedCanonicalCommits:8,syntheticMigrationHistoryNotCliProof:true,
   sourceSealedActualCandidateInstallAndInverse:true,
   testOnlyRollback:true,
   originalAuthorizerOrCollisionBypassed:false,
   original120GestureCapBypassed:false,
   fullHostedRlsParityEstablished:false,
   independentSignedDmP1P2Accepted:false,officialLinkedCli83Plus8Verified:false,
   browserMovementAccepted:false,freeTierRamAndLockLoadAccepted:false,
   liveSupabaseSqlWritten:false,sqlMigrationApplied:false,
   previewDeployed:false,productionDeployed:false,
   productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT86);
  if(!same(l.releaseFogCandidateMatrix,exact)||
   !entry||l.branches[171]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='DISPOSABLE_EIGHT_VIEWER_FULL_TRIGGER_R57_R77_FROZEN_SOURCE_CANDIDATE_MATRIX'||
   entry.linkedPullRequest!==188||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NEVER install or deploy'))fail();
 }else if(l.releaseFogCandidateMatrix!==undefined)fail();
 if(balancedCostSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-87',decision:'NO_GO',
   previousLedgerBranches:172,currentLedgerBranches:173,addedBranch:NEXT87,
   sourceParentPr:188,sourceParentSha:'45bd82800362d4eeb434cc58f1dae29b3631a9f7',
   preservedR83ThroughR86IndependentPasses:true,
   fixtureDatabase:'world_v2_b10_r05',fourModes:['original','r57','r77','combined'],
   counterbalancedLatinPhases:16,originalCombinedAbbaBaabPhases:8,
   measuredSignedOriginalCommitSamples:24,signedCanonicalReturnCommits:24,
   signedSessionsAdded:48,originalMotionRateCapPerMinute:120,
   syntheticFixtureViewerCount:8,expectedSourceExactFullFrameComparisons:192,
   originalTokenPositionTriggers:6,originalToolPositionTriggers:4,
   sourceFrozenOriginalFogAndRay:true,
   sourceSealedActualCandidateInstallAndInversePerPhase:true,
   candidateSourceOrPermissionsRelaxed:false,
   originalAuthorizerOrCollisionBypassed:false,original120GestureCapBypassed:false,
   testOnlyRollback:true,
   localSampleProvesHostedSpeedup:false,browserP95AcceptanceProven:false,
   fullHostedRlsParityEstablished:false,officialLinkedCli83Plus8Verified:false,
   independentSignedDmP1P2Accepted:false,freeTierRamAndLockLoadAccepted:false,
   liveSupabaseSqlWritten:false,sqlMigrationApplied:false,previewDeployed:false,
   productionDeployed:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT87);
  if(!same(l.releaseBalancedCandidateBenchmark,exact)||
   !entry||l.branches[172]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='BALANCED_SIGNED_FOUR_MODE_PRIVATE_FOG_CANDIDATE_COST_PROFILE'||
   entry.linkedPullRequest!==189||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('release NO_GO'))fail();
 }else if(l.releaseBalancedCandidateBenchmark!==undefined)fail();
 if(combinedQaSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-88',decision:'NO_GO',
   previousLedgerBranches:173,currentLedgerBranches:174,addedBranch:NEXT88,
   sourceParentPr:189,sourceParentSha:'26e6887f223653f2426f87145c3a86828ec41c1d',
   previewCandidateManifest:'staging/world-v2-b10-r18-88-combined-qa/manifest.json',
   liveRegisteredMigrations:83,requiredRegisteredMigrations:91,
   sourceSealedInstallCount:2,sourceSealedInverseCount:2,
   disposablePostgres17SixthR54Run:true,
   partialSavepointAbortExpected:true,combinedSavepointAbortExpected:true,
   syntheticFixtureEightViewers:true,allSixTokenAndFourToolTriggers:true,
   transactionalRollbackFixturePassedOnlyLocally:true,
   officialLinkedCli83Plus8Verified:false,independentDmP1PassiveP2Verified:false,
   browserP95Accepted:false,freeTierRamLocksAccepted:false,
   qaOperatorApproval:false,productionOperatorApproval:false,
   sqlMigrationApplied:false,liveSupabaseSqlWritten:false,
   previewDeployed:false,productionReleased:false,
   rootMigrationFilesModified:false,runtimeFilesModified:false,
   productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT88);
  if(!same(l.releaseCombinedQaPreflight,exact)||
   !entry||l.branches[173]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='COMBINED_SEALED_QA_PREFLIGHT_AND_ATOMIC_SAVEPOINT_ROLLBACK'||
   entry.linkedPullRequest!==190||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('release NO_GO'))fail();
 }else if(l.releaseCombinedQaPreflight!==undefined)fail();
 if(linkedCliQaSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-89',decision:'NO_GO',
   previousLedgerBranches:174,currentLedgerBranches:175,addedBranch:NEXT89,
   parentPr:190,parentSha:'8461b38a498eb1244407b232a1f700314a54d2fd',
   manifest:'staging/world-v2-b10-r18-89-readonly-qa-prerequisites/manifest.json',
   operatorPlan:'staging/world-v2-b10-r18-89-readonly-qa-prerequisites/operator-cli-plan.json',
   readOnlyLiveReceiptObservedAt:'2026-11-15T10:11:42.699481+00:00',
   historicalSqlDigestsReadOnlyMatched:83,criticalAuthoritySourceMd5Matched:10,
   liveRegisteredMigrations:83,requiredRegisteredMigrations:91,
   originalR05Absent:true,linkedSupabasePlan:'free',connectedAccessibleProjects:1,
   connectedVisibleNonMainBranches:0,isolatedQaBackendVerified:false,
   officialPinnedCliVersion:'2.81.3',officialAuthenticatedCliExecuted:false,
   officialLinkedMigrationFetchListDryRunVerified:false,readOnlyCliPlanPinned:true,
   credentialedCliRunnerProvisioned:false,
   independentAuthenticatedDmP1P2Verified:false,browserP95Accepted:false,
   physicalFreeMemoryAndLockLoadAccepted:false,explicitSqlOperatorApproval:false,
   rootMigrationFilesModified:false,runtimeFilesModified:false,
   migrationApplied:false,liveSupabaseSqlWritten:false,
   previewDeployed:false,productionDeployed:false,
   productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT89);
  if(!same(l.releaseLinkedCliQaAttestation,exact)||
   !entry||l.branches[174]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='LIVE_83_BODY_AND_10_AUTHORITY_FINGERPRINT_QA_ISOLATION_CLI_READONLY_ATTESTATION'||
   entry.linkedPullRequest!==191||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releaseLinkedCliQaAttestation!==undefined)fail();
 if(pinnedCliHelpSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-90',decision:'NO_GO',
   previousLedgerBranches:175,currentLedgerBranches:176,addedBranch:NEXT90,
   parentPr:191,parentSha:'e380933f43850b7884996fa0241e36ee70db66e8',
   manifest:'staging/world-v2-b10-r18-90-cli-help/manifest.json',
   offlineWorkflow:'.github/workflows/world-v2-r18-90-cli-offline.yml',
   originalPinnedCliVersion:'2.81.3',offlineHelpSurfaceCount:4,
   authenticationUsed:false,projectCredentialsSupplied:false,
   officialLinkedCliDryRunVerified:false,
   historicalSqlBodiesIndependentlyFetchedViaCli:false,
   liveRegisteredMigrations:83,requiredMigrations:91,
   priorReadOnlyHistoryMatched:83,priorReadOnlyAuthorityMatched:10,
   isolatedQaBackendVerified:false,independentSignedDmP1P2Accepted:false,
   browserP95Accepted:false,freeTierRamLockLoadAccepted:false,
   sqlMigrationApplied:false,liveSupabaseSqlWritten:false,
   runtimeFilesChanged:false,rootMigrationFilesChanged:false,
   previewDeployed:false,productionDeployed:false,
   paidInfrastructureCreated:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT90);
  if(!same(l.releasePinnedCliOfflineHelp,exact)||
   !entry||l.branches[175]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='PINNED_SUPABASE_CLI_V2_81_3_OFFLINE_FLAG_VERIFICATION_NO_CREDENTIALS'||
   entry.linkedPullRequest!==192||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releasePinnedCliOfflineHelp!==undefined)fail();
 if(readOnlyCaptureSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-91',decision:'NO_GO',
   previousLedgerBranches:176,currentLedgerBranches:177,addedBranch:NEXT91,
   parentPr:192,parentSha:'7c28ee15d835a0f1eb916215efaea9265ec48d7a',
   manifest:'staging/world-v2-b10-r18-91-operator-capture/manifest.json',
   runner:'scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs',
   sourceOnlyManualOperatorRunner:true,
   originalPinnedCliVersion:'2.81.3',
   original83HistoricalFilesRequired:true,originalEightPendingRequired:true,
   sourceExactR49R50R51R90ValidatorsRequired:true,
   strictLinkedListBeforeDryRun:true,approvedRemoteCommandCount:2,
   authenticatedLinkedCliExecutedByChatGPT:false,
   linkedCliDryRunIndependentlyAttested:false,
   priorReadOnlyLiveHistoryMatched:83,priorReadOnlyAuthorityMatched:10,
   liveRegisteredMigrations:83,requiredMigrations:91,
   separateQaBackendVerified:false,signedDmP1PassiveP2Accepted:false,
   browserP95Accepted:false,freeRamAndLockLoadAccepted:false,
   operatorReleasePermission:false,liveSqlWritten:false,
   rootMigrationFilesChanged:false,runtimeFilesChanged:false,
   previewDeployed:false,productionDeployed:false,
   paidInfrastructureCreated:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT91);
  if(!same(l.releaseLinkedCliOperatorCapture,exact)||
   !entry||l.branches[176]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='MANUAL_ONLY_LINKED_CLI_READONLY_CAPTURE_AFTER_R49_R50_R90_GATES'||
   entry.linkedPullRequest!==193||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releaseLinkedCliOperatorCapture!==undefined)fail();
 if(regrabHarnessSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-92',decision:'NO_GO',
   previousLedgerBranches:177,currentLedgerBranches:178,addedBranch:NEXT92,
   parentPr:193,parentSha:'6e293f52c38d0f4410cf5d8f53922021aa3c6b05',
   manifest:'staging/world-v2-b10-r18-92-regrab-ci-cleanup/manifest.json',
   originalCancelledGeneralRun:43713696848,originalIsolatedEnotemptyRun:43719325470,
   isolatedChromiumR12CheckAdded:true,chromiumChildProcessCloseAwaited:true,
   temporaryProfileRemoveRetried:true,assertionDisabledOrSkipped:false,
   realGameplayRuntimeModified:false,originalFogCollisionAuthorityChanged:false,
   productionSqlMigrationsModified:false,liveRegisteredMigrations:83,requiredMigrations:91,
   independentLinkedCli83Plus8DryRunAttested:false,combinedR57R77CandidateInstalled:false,
   independentDmP1P2BrowserPerformanceAccepted:false,
   physicalFreeRamAndLocksAccepted:false,separateQaBackendVerified:false,
   operatorReleaseApproved:false,databaseSqlWritten:false,
   previewDeployed:false,productionDeployed:false,
   paidInfrastructureCreated:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT92);
  if(!same(l.releaseReactRegrabHarnessRepair,exact)||
   !entry||l.branches[177]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='R12_REAL_CHROMIUM_PROFILE_CLEANUP_RACE_REGRESSION_DIAGNOSTICS_NO_RUNTIME_CHANGE'||
   entry.linkedPullRequest!==194||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releaseReactRegrabHarnessRepair!==undefined)fail();
 if(cliStreamsSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-93',decision:'NO_GO',
   previousLedgerBranches:178,currentLedgerBranches:179,addedBranch:NEXT93,
   parentPr:194,parentSha:'57a40017443eed36d097951ef186e7ba8500236b',
   manifest:'staging/world-v2-b10-r18-93-operator-cli-streams/manifest.json',
   operatorRunner:'scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs',
   boundedCliStdoutAndStderr:true,cliOutputSecretGuardMaintained:true,
   acceptedRemoteCommandCount:2,realCliReadOnlyDryRunExecuted:false,
   positiveSyntheticHistoricalFiles:83,positiveSyntheticPendingFiles:8,
   positiveSyntheticR49AndR51Checks:true,
   syntheticHistoryRejectedByFrozenOriginal:true,
   officialAuthenticatedCliProofCollected:false,
   liveRegisteredMigrations:83,requiredMigrations:91,
   originalHistoryReadOnlySourceMatched:83,originalCriticalFunctionsReadOnlyMatched:10,
   combinedR57R77Installed:false,independentSignedDmP1P2Passed:false,
   realBrowserP95Accepted:false,freeRamAndLocksMeasured:false,
   separateQaBackendVerified:false,operatorReleaseApproved:false,
   sourceSqlMigrationsModified:false,gameplayRuntimeModified:false,
   sharedSupabaseSqlApplied:false,previewDeployed:false,productionDeployed:false,
   paidInfrastructureCreated:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT93);
  if(!same(l.releaseCliOutputPositiveRehearsal,exact)||
   !entry||l.branches[178]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='R91_CLI_OUTPUT_CHANNEL_PARITY_POSITIVE_SYNTHETIC_83_PLUS_8_REHEARSAL'||
   entry.linkedPullRequest!==195||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releaseCliOutputPositiveRehearsal!==undefined)fail();
 if(phase3ChromeSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-94',decision:'NO_GO',
   previousLedgerBranches:179,currentLedgerBranches:180,addedBranch:NEXT94,
   parentPr:195,parentSha:'c365bd6a22b1b3c79b0a55d3c5c64cbd5131eaed',
   manifest:'staging/world-v2-b10-r18-94-phase3-chromium/manifest.json',
   originalGeneralCancelledRun:43725949176,
   isolatedRealPhase3TestAdded:true,chromeChildCloseWaited:true,
   chromeProfileDeletionRetried:true,playerDmPreviewLockedEditorAssertionsRetained:true,
   testSkippedOrWeakened:false,
   movementRuntimeChanged:false,supabaseMigrationChanged:false,
   liveRegisteredMigrations:83,requiredMigrations:91,
   officialAuthenticatedLinkedCli83Plus8DryRun:false,
   combinedR57R77Installed:false,
   independentDmP1PassiveP2Accepted:false,
   realHostedBrowserP95Accepted:false,freeRamSwapLocksAccepted:false,
   isolatedQaBackendVerified:false,sqlOperatorApproval:false,
   liveDatabaseSqlWritten:false,previewDeployed:false,productionDeployed:false,
   paidInfrastructureCreated:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT94);
  if(!same(l.releasePhase3ChromeTeardown,exact)||
   !entry||l.branches[179]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='PHASE3_REAL_CHROMIUM_DOM_POINTER_CAPTURE_PROFILE_SHUTDOWN_RACE_TEST_ONLY'||
   entry.linkedPullRequest!==196||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releasePhase3ChromeTeardown!==undefined)fail();
 if(freeQaSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-95',decision:'NO_GO',
   previousLedgerBranches:180,currentLedgerBranches:181,addedBranch:NEXT95,
   parentPr:196,parentSha:'a447e6bb52fd804cb8feafdc6aa37e949b5b706c',
   manifest:'staging/world-v2-b10-r18-95-free-qa-isolation/manifest.json',
   validator:'scripts/release/validate-world-v2-r18-95-free-qa-isolation.mjs',
   organizationName:'Xuven',organizationId:'uukoiflquxqdszrzgoyg',
   organizationPlan:'free',visibleActiveProjects:1,
   costFreeProjectMonthlyUsd:0,branchHourlyUsd:0.01344,
   freeProjectQuoted:true,branchDisallowedNonzeroCost:true,
   vercelSupabaseEnvSharedAcrossProductionPreviewDevelopment:true,
   existingQaBackendIndependentlyIsolated:false,
   userExplicitOrganizationSelection:false,
   newSupabaseQaProjectCreated:false,newVercelQaProjectCreated:false,
   existingVercelProductionEnvChanged:false,
   officialAuthenticated83Plus8CliDryRun:false,
   liveRegisteredMigrations:83,requiredMigrations:91,
   independentDmP1P2Validated:false,freePhysicalRamAndLocksValidated:false,
   candidateR57R77Installed:false,authRedirectAndRlsValidated:false,
   liveDatabaseSqlApplied:false,qaPreviewRepointed:false,
   productionDeployed:false,paidInfrastructureCreated:false,
   productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT95);
  if(!same(l.releaseFreeQaIsolation,exact)||
   !entry||l.branches[180]!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='ZERO_COST_SECOND_FREE_SUPABASE_QA_PROJECT_PLAN_WITH_SEPARATE_VERCEL_ENV_BOUNDARY'||
   entry.linkedPullRequest!==197||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releaseFreeQaIsolation!==undefined)fail();
 if(qaProvisionSuccessor){
  const exact={
   schema:1,workPackage:'B10-R18-96',decision:'NO_GO',
   previousLedgerBranches:181,currentLedgerBranches:182,addedBranch:NEXT96,
   parentPr:197,parentSha:'abfbceddef010eef7cca246bcd6e67bc5e09827f',
   manifest:'staging/world-v2-b10-r18-96-free-qa-provisioning/manifest.json',
   validator:'scripts/release/validate-world-v2-r18-96-qa-provisioning.mjs',
   organizationId:'uukoiflquxqdszrzgoyg',
   qaSupabaseRef:'bgydsamxypjslergfpla',
   qaVercelProjectId:'prj_49bkFS9Ti4FoPa38LjNNxjgEaZwX',
   qaRegisteredMigrations:0,newProjectMonthlyUsd:0,
   qaVercelDeployments:0,qaVercelGitLinked:false,qaVercelPreviewDevOnly:true,
   qaAuthProvidersConfigured:false,operatorExplicitlyConfirmed:true,
   existingVercelEnvEdited:false,existingQaAliasChanged:false,
   officialLinkedCli83Plus8DryRun:false,independentDmP1P2Validated:false,
   qaFrontendDeployed:false,productionSqlApplied:false,productionDeployed:false,
   paidInfrastructureCreated:false,productionReleaseAuthorized:false
  };
  const entry=ledgerByName.get(NEXT96);
  if(!same(l.releaseQaProvisioning,exact)||!entry||
   l.branches[181]!==entry||entry.status!=='staged'||
   entry.releaseReady!==false||
   entry.classification!=='INDEPENDENT_ZERO_COST_QA_BACKEND_AND_UNDEPLOYED_VERCEL_CONFIGURATION_ONLY'||
   entry.linkedPullRequest!==198||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO_GO'))fail();
 }else if(l.releaseQaProvisioning!==undefined)fail();
 const out=l.upcomingRelease.outstandingBranches;
 if(!Array.isArray(out)||out.length!==100+(successor?1:0)+
  (deployedSuccessor?1:0)+(failedPreviewSuccessor?1:0)+
  (commitProfileSuccessor?1:0)+(fullTriggerSuccessor?1:0)+
  (phaseIsolationSuccessor?1:0)+(candidateMatrixSuccessor?1:0)+(balancedCostSuccessor?1:0)+(combinedQaSuccessor?1:0)+(linkedCliQaSuccessor?1:0)+(pinnedCliHelpSuccessor?1:0)+(readOnlyCaptureSuccessor?1:0)+(regrabHarnessSuccessor?1:0)+(cliStreamsSuccessor?1:0)+(phase3ChromeSuccessor?1:0)+(freeQaSuccessor?1:0)+(qaProvisionSuccessor?1:0)||
  new Set(out).size!==out.length||
  !out.includes(BRANCH)||(successor&&!out.includes(NEXT))||
  (deployedSuccessor&&!out.includes(NEXT81))||
  (failedPreviewSuccessor&&!out.includes(NEXT82))||
  (commitProfileSuccessor&&!out.includes(NEXT83))||
  (fullTriggerSuccessor&&!out.includes(NEXT84))||
  (phaseIsolationSuccessor&&!out.includes(NEXT85))||
  (candidateMatrixSuccessor&&!out.includes(NEXT86))||
  (balancedCostSuccessor&&!out.includes(NEXT87))||
  (combinedQaSuccessor&&!out.includes(NEXT88))||
  (linkedCliQaSuccessor&&!out.includes(NEXT89))||
  (pinnedCliHelpSuccessor&&!out.includes(NEXT90))||
  (readOnlyCaptureSuccessor&&!out.includes(NEXT91))||
  (regrabHarnessSuccessor&&!out.includes(NEXT92))||
  (cliStreamsSuccessor&&!out.includes(NEXT93))||
  (phase3ChromeSuccessor&&!out.includes(NEXT94))||
  (freeQaSuccessor&&!out.includes(NEXT95))||
  (qaProvisionSuccessor&&!out.includes(NEXT96))||
  !same([...out].sort(),l.branches.filter(x=>x.status==='staged').map(x=>x.name).sort())||
  !l.upcomingRelease.stagePolicy.includes('NOT a bulk-merge queue'))fail();
 const pr=n=>s.newlyReconciled.find(x=>x.linkedPullRequest===n);
 if(pr(139)?.status!=='released'||pr(140)?.status!=='superseded'||
  pr(144)?.status!=='superseded'||
  [130,131,161,179].some(n=>pr(n)?.releaseReady!==false))fail();
 return Object.freeze({
  decision:'NO_GO',safeToRelease:false,
  snapshotOnly:true,authenticatedExternalProvenanceVerified:false,
  observedGitHubBranches:179,observedGitHubPullRequests:177,
  previouslyLedgered:66,newlyLedgered:99,totalLedgered:165,
  currentLedgered:l.branches.length,successorAudited:successor,
  deployedSuccessorAudited:deployedSuccessor,
  failedPreviewSuccessorAudited:failedPreviewSuccessor,
  commitProfileSuccessorAudited:commitProfileSuccessor,
   fullTriggerSuccessorAudited:fullTriggerSuccessor,
   phaseIsolationSuccessorAudited:phaseIsolationSuccessor,
   candidateMatrixSuccessorAudited:candidateMatrixSuccessor,
   balancedCostSuccessorAudited:balancedCostSuccessor,
   combinedQaSuccessorAudited:combinedQaSuccessor,
   linkedCliQaSuccessorAudited:linkedCliQaSuccessor,
   pinnedCliHelpSuccessorAudited:pinnedCliHelpSuccessor,
   readOnlyCaptureSuccessorAudited:readOnlyCaptureSuccessor,
   regrabHarnessSuccessorAudited:regrabHarnessSuccessor,
   cliStreamsSuccessorAudited:cliStreamsSuccessor,
   phase3ChromeSuccessorAudited:phase3ChromeSuccessor,
   freeQaSuccessorAudited:freeQaSuccessor,
   qaProvisionSuccessorAudited:qaProvisionSuccessor,
  laterPRsRecorded:62,unmatchedPRBranches:2,
  outstandingReviewBranches:out.length,
  canonicalLivePr:139,rejectedOrFailed:[140,144],
  optionalUninstalledSqlPrs:[161,179],
  linkedCli83Plus8Accepted:false,
  independentDmP1P2Accepted:false,
  freeTierRamUnderLoadAccepted:false,operatorApproved:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail();
  process.stdout.write(JSON.stringify(validateR79Ledger(),null,2)+'\n');
 }catch{
  process.stderr.write('R79 LEDGER NO-GO: review source inventory privately.\n');
  process.exitCode=1;
 }
}
