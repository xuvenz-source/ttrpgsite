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
 const successor=[NEXT,NEXT81,NEXT82,NEXT83].includes(l?.releaseBranch);
 const deployedSuccessor=[NEXT81,NEXT82,NEXT83].includes(l?.releaseBranch);
 const failedPreviewSuccessor=[NEXT82,NEXT83].includes(l?.releaseBranch);
 const commitProfileSuccessor=l?.releaseBranch===NEXT83;
 const expectedCount=165+(successor?1:0)+(deployedSuccessor?1:0)+
  (failedPreviewSuccessor?1:0)+(commitProfileSuccessor?1:0);
 if(s?.schema!==1||s.workPackage!=='B10-R18-79'||
  s.sourceKind!=='GITHUB_READ_ONLY_BRANCH_AND_PR_METADATA'||
  s.recordedOn!=='2026-11-15'||s.releaseDecision!=='NO_GO'||
  s.safeToRelease!==false||s.operatorApproved!==false||
  s.parent?.pr!==180||s.parent.sha!==PARENT||s.currentPr!==181||
  l?.updated!=='2026-11-15'||l.productionBaseSha!==MAIN||
  ![BRANCH,NEXT,NEXT81,NEXT82,NEXT83].includes(l.releaseBranch)||
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
   [...ledgerByName.keys()].filter(x=>x!==NEXT&&x!==NEXT81&&x!==NEXT82&&x!==NEXT83).sort()))fail();

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
   !entry||l.branches.at(commitProfileSuccessor?-4:failedPreviewSuccessor?-3:deployedSuccessor?-2:-1)!==entry||
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
   !entry||l.branches.at(commitProfileSuccessor?-3:failedPreviewSuccessor?-2:-1)!==entry||
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
   !entry||l.branches.at(commitProfileSuccessor?-2:-1)!==entry||
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
   !entry||l.branches.at(-1)!==entry||
   entry.status!=='staged'||entry.releaseReady!==false||
   entry.classification!=='ORIGINAL_COMMIT_TRIGGER_COVERAGE_AND_DISPOSABLE_FUNCTION_PROFILE'||
   entry.linkedPullRequest!==185||entry.productionBaseSha!==MAIN||
   entry.reviewedAgainstCanonicalProduction!==false||
   !entry.note?.includes('NO production/preview deploy'))fail();
 }else if(l.releaseCommitAttribution!==undefined)fail();
 const out=l.upcomingRelease.outstandingBranches;
 if(!Array.isArray(out)||out.length!==100+(successor?1:0)+
  (deployedSuccessor?1:0)+(failedPreviewSuccessor?1:0)+
  (commitProfileSuccessor?1:0)||
  new Set(out).size!==out.length||
  !out.includes(BRANCH)||(successor&&!out.includes(NEXT))||
  (deployedSuccessor&&!out.includes(NEXT81))||
  (failedPreviewSuccessor&&!out.includes(NEXT82))||
  (commitProfileSuccessor&&!out.includes(NEXT83))||
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
