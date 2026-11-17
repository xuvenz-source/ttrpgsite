/**
 * R18-105 — source-sealed disposable PG17 runtime evidence gate.
 * Offline source/release validation; actual PostgreSQL fixture runs separately
 * in the isolated GitHub workflow, NOT from this Node validator.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR104FogGuard} from './validate-world-v2-r18-104-fog-guard.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const DIR='staging/world-v2-b10-r18-105-isolated-fog-test/';
const PREV='staging/world-v2-b10-r18-104-fog-guard/';
const fail=msg=>{throw Error('R105 ISOLATED PG17 NO-GO: '+msg)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(x=>Object.hasOwn(obj,x));
const read=(root,p)=>JSON.parse(readFileSync(join(root,p),'utf8'));
const BLOBS={
 '.github/workflows/world-v2-r18-105-fog-guard-isolated.yml':'2bd7420d025f8fac4ea9c3fc49ad0f3c57a82126',
 'tests/world-v2-r18-105-postgres/schema.sql':'e1864df68e4aa6a6640dd9acc965f6f38c8d78d9',
 'tests/world-v2-r18-105-postgres/extract_sources.py':'e4a1dc6b0bae612dfe6e4c74aa54851824ba1d36',
 'tests/world-v2-r18-105-postgres/baseline.sql':'807728845daf4d01900dd52bbccd665f7df2f95a',
 'tests/world-v2-r18-105-postgres/post-candidate.sql':'fe9c2a4045048661469166f517ca0cdc9296c4ed',
 'tests/world-v2-r18-105-postgres/rollback-observation.sql':'ff3d880b5f17026bccf028a5d0e17562fae1703d',
 'tests/world-v2-r18-105-postgres/reapply-observation.sql':'e1161c5b6d5bb4de9ed8cdcd19fd81e4c41daa75',
 'tests/world-v2-r18-105-postgres/run.sh':'e6a92d934fef4905216f86e18e77e5dba4f17503'
};
const GATES=[
 'private83OriginalSqlRetrieved','completeHistoricalSecurityReviewPassed',
 'independentlyAuthenticatedQaSchemaDryRunPassed','qaSchemaInstalled',
 'fogCandidateApprovedForHostedApplication',
 'realDmP1P2OutsiderAcceptancePassed',
 'realFogVisibilityAndCollisionAcceptancePassed',
 'qaVercelDeployed','pendingEightSqlInstalled',
 'productionReleaseAuthorized'
];
const UNCHANGED=[
 'noOriginalSqlWrites','noQaSqlWrites','noOriginalAuthChanges',
 'noOriginalVercelChanges','noQaVercelDeployments','noSecretOrUserDataExports',
 'noPaidResources','noMerge','noProductionDeploy'
];
export function validateR105IsolatedFogTest(m,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(!exact(m,['schema','workPackage','decision','parentPr','parentSha',
  'observedLocalDate','scope','original','qa','source',
  'priorIsolatedProof','acceptance','gates','unchanged'])||
  m.schema!==1||m.workPackage!=='B10-R18-105'||m.decision!=='NO_GO'||
  m.parentPr!==206||
  m.parentSha!=='0c4928ada3d51421e7f5b4f68dc9c7a6688be1c8'||
  m.observedLocalDate!=='2026-11-17'||
  m.scope!=='DISPOSABLE_POSTGRES17_REAL_FOG_CANDIDATE_COMBAT_RLS_AND_ORIGINAL_SOURCE_ROLLBACK')
  fail('source/release provenance altered');
 if(!same(m.original,{
   projectRef:'lwhwgqaunxbmvyndswze',status:'ACTIVE_HEALTHY',
   migrationHistory:83,sqlOrGrantsChanged:false
  })||!same(m.qa,{
   projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
   migrations:0,publicAppTables:0,sqlOrGrantsChanged:false
  }))
  fail('hosted database state misrepresented');
 if(!exact(m.source,['candidate','candidateGitBlobSha',
  'fourVerifiedOriginalFunctionBodies','originalCombatRosterPolicyExtractedFromGit',
  'fixtureFilesGitBlobs','sourceSealCount','originalPrivate83HistoryRecovered',
  'syntheticAuthUidUsed','syntheticIsCampaignDmUsed',
  'fullOriginalSchemaInstalled'])||
  m.source.candidate!==
   PREV+'unapplied-fog-status-guard.sql'||
  m.source.candidateGitBlobSha!=='c84d7cf8b0958621f11ec273cb36361e2501a77f'||
  m.source.fourVerifiedOriginalFunctionBodies!==true||
  m.source.originalCombatRosterPolicyExtractedFromGit!==true||
  m.source.sourceSealCount!==8||
  m.source.originalPrivate83HistoryRecovered!==false||
  m.source.syntheticAuthUidUsed!==true||
  m.source.syntheticIsCampaignDmUsed!==true||
  m.source.fullOriginalSchemaInstalled!==false||
  !same(m.source.fixtureFilesGitBlobs,BLOBS))
  fail('source pin or limitations changed');
 for(const [p,sha] of Object.entries(BLOBS)){
  const data=readFileSync(join(root,p));
  const git=createHash('sha1').update('blob '+data.length+'\0')
    .update(data).digest('hex');
  if(git!==sha)fail('source file drifted from successful PG17 run: '+p);
 }
 if(!same(m.priorIsolatedProof,{
  workflowRunId:44058183100,
  workflowRunUrl:'https://github.com/xuvenz-source/ttrpgsite/actions/runs/44058183100',
  frozenCommit:'a4bcc530722b7f7c6ead4ec2ca00e83b1af4f00a',
  outcome:'SUCCESS',databaseEngine:'PostgreSQL 17',
  sourceSha256AndPolicyExtracted:true,
  originalFogStatusOracleReproduced:true,
  stagedCandidateAppliedToDisposableOnly:true,
  anonExecuteDenied:true,nonmemberCrossCampaignFogDenied:true,
  validDmAndAssignedMapPreserved:true,combatRosterRlsNonfogPreserved:true,
  actorBoundP1P2CleanupPreserved:true,
  originalSourceRestoreReintroducedOracle:true,
  candidateReapplyClosedOracle:true,
  userSignedSupabaseSessionsExecuted:false,
  originalOrQaHostedSqlWritten:false
 }))
  fail('intermediate isolated CI observations changed');
 if(!same(m.acceptance,{
  previousSignedMatrix:PREV+'signed-acceptance-matrix.json',
  actualSignedAccountCasesExecuted:0,actualSignedAccountCasesPlanned:12,
  verifiedFixtureKind:'SYNTHETIC_JWT_GUC_NOT_HOSTED_AUTH_SESSION',
  runnableOnlyInGitHubDisposableContainer:true,
  terminalReleaseDecision:'NO_GO'
 })||!exact(m.gates,GATES)||GATES.some(k=>m.gates[k]!==false)||
  !exact(m.unchanged,UNCHANGED)||
  UNCHANGED.some(k=>m.unchanged[k]!==true))
  fail('signed-hosted authorization or release gate falsely approved');
 const old=validateR104FogGuard(
  read(root,PREV+'manifest.json'),
  read(root,PREV+'signed-acceptance-matrix.json'),{repoRoot:root});
 if(old.decision!=='NO_GO'||old.newExactLiveSourceMatches!==4||
  old.privacyCandidateStagedButNotApplied!==true||
  old.signedCasesExecuted!==0||old.originalOrQaSqlApplied!==false)
  fail('inherited R104 SQL candidate and host NO_GO drifted');
 const matrix=read(root,PREV+'signed-acceptance-matrix.json');
 if(matrix.caseCount!==12||
  matrix.cases?.some(x=>x.status!=='NOT_RUN'||x.signedAccountTested!==false||
   x.sqlInstalled!==false))
  fail('R104 signed-account tests have been falsely labelled passed');
 return Object.freeze({
  workPackage:'B10-R18-105',decision:'NO_GO',
  isolatedPg17CandidateCiObserved:'SUCCESS',
  sourceFilesHashPinned:8,realGitFunctionBodiesExtracted:4,
  originalCombatRlsSourceReplayed:true,
  localOriginalLeakAndGuardReproduced:true,
  localSourceRestoreAndReapplyDemonstrated:true,
  actualHostedSignedUserCasesExecuted:0,
  qaMigrationsApplied:0,productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('offline-only no DB or CLI arguments');
  process.stdout.write(JSON.stringify(validateR105IsolatedFogTest(
   read(ROOT,DIR+'manifest.json')),null,2)+'\n');
 }catch{
  process.stderr.write('R105 ISOLATED PG17 NO-GO: offline gate failed.\n');
  process.exitCode=1;
 }
}
