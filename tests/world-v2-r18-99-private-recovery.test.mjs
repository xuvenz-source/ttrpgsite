import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,
 readFileSync,unlinkSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR99Source}
 from '../scripts/release/validate-world-v2-r18-99-source.mjs';
import {verifyR99OperatorCapture}
 from '../scripts/release/validate-world-v2-r18-99-private-recovery.mjs';
import {inspectR98PrivateHistory}
 from '../scripts/release/validate-world-v2-r18-98-private-history.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=()=>JSON.parse(readFileSync(join(ROOT,
 'staging/world-v2-b10-r18-99-private-attestation/manifest.json'),'utf8'));
const fail=/R99 (?:SOURCE|PRIVATE RECOVERY) NO-GO/;
function synthetic(){
 const workspace=mkdtempSync(join(tmpdir(),'r99-private-'));
 const sb=join(workspace,'supabase'),dir=join(sb,'migrations');
 mkdirSync(dir,{recursive:true});mkdirSync(join(sb,'.temp'));
 writeFileSync(join(sb,'.temp','project-ref'),'lwhwgqaunxbmvyndswze\n');
 writeFileSync(join(sb,'config.toml'),
  '[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n');
 const rows=[];
 for(let i=0;i<83;i++){
  const version=i===82?'20261109171247':
   '20261105'+String(i+1).padStart(6,'0');
  const name='synthetic_r99_'+String(i).padStart(3,'0');
  const sql='-- synthetic test only\nselect '+i+';\n';
  rows.push({version,name,statement_count:1,
   fetched_sql_md5:createHash('md5').update(sql).digest('hex')});
  writeFileSync(join(dir,version+'_'+name+'.sql'),sql);
 }
 const inspector=({workspace:w,env,phase})=>inspectR98PrivateHistory({
  workspace:w,repoRoot:ROOT,rows,env,phase
 });
 const fresh=inspector({workspace,env:{},phase:'fetched'});
 const capture={
  workPackage:'B10-R18-98',decision:'NO_GO',
  originalProjectRef:'lwhwgqaunxbmvyndswze',
  historicalSqlFilesLocallyVerified:83,
  aggregateSha256:fresh.aggregateSha256,
  reviewMarkerFiles:fresh.reviewMarkerFiles,
  actualAuthenticatedLinkedSessionIndependentlyAttested:false,
  cliSessionAcceptedAsIndependentProof:false,
  recoveredBodiesLeftInPrivateWorkspace:true,
  qaTargetUsed:false,qaSchemaModified:false,productionSchemaModified:false,
  installApproved:false,productionReleaseAuthorized:false
 };
 return {workspace,dir,rows,inspector,capture,
  cleanup:()=>rmSync(workspace,{recursive:true,force:true})};
}
test('R99 source-only receipt inherits exact R98 incomplete source and does not claim actual authenticated recovery',()=>{
 const m=manifest(),x=validateR99Source(m);
 assert.equal(x.workPackage,'B10-R18-99');
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.baselineHistoryMatched,83);
 assert.equal(x.privateReceiptGenerated,false);
 assert.equal(x.authenticatedHistoricalFetchVerified,false);
 assert.equal(x.qaSchemaInstalled,false);
 assert.equal(x.productionReleaseAuthorized,false);
 assert.equal(m.qa.registeredMigrations,0);
 assert.equal(m.evidence.verifiedOperatorSessionProvenance,false);
});
test('R99 static receipt rejects falsified capture, source history, QA SQL and approvals',()=>{
 const raw=manifest();
 const invalid=modify=>{const m=structuredClone(raw);modify(m);
  assert.throws(()=>validateR99Source(m),/R99 SOURCE NO-GO/);};
 invalid(x=>x.parentSha='0'.repeat(40));
 invalid(x=>x.decision='GO');
 invalid(x=>x.source.readOnlyHistoricalDigestMatches=82);
 invalid(x=>x.source.sqlBodiesReturnedToChat=true);
 invalid(x=>x.qa.registeredMigrations=83);
 invalid(x=>x.qa.bootstrapApplied=true);
 invalid(x=>x.evidence.operatorReceiptCaptured=true);
 invalid(x=>x.evidence.private83BodyAuditExecutedByOperator=true);
 invalid(x=>x.evidence.verifiedOperatorSessionProvenance=true);
 invalid(x=>x.evidence.actualAuthCliFetchCompleted=true);
 invalid(x=>x.evidence.qaOnlyDryRunPerformed=true);
 invalid(x=>x.safeguards.pendingEightExcluded=false);
 invalid(x=>x.safeguards.rawSqlCommitted=true);
 invalid(x=>x.safeguards.credentialsCommitted=true);
 invalid(x=>x.safeguards.productionReleaseAuthorized=true);
 invalid(x=>x.evidence.unapprovedField='leak');
});
test('R99 recomputes original-body digest and independently compares private operator receipt',()=>{
 const f=synthetic();
 try{
  const x=verifyR99OperatorCapture({workspace:f.workspace,capture:f.capture,
   inspector:f.inspector,env:{}});
  assert.equal(x.decision,'NO_GO');
  assert.equal(x.historicalFilesCrossChecked,83);
  assert.equal(x.privateBodyFingerprintMatch,true);
  assert.equal(x.operatorCaptureMatchedPrivateBytes,true);
  assert.equal(x.operatorSessionAuthenticatedIndependently,false);
  assert.equal(x.historicalSqlSecurityReviewed,false);
  assert.equal(x.qaSqlApplied,false);
  assert.equal(x.productionReleaseAuthorized,false);
 }finally{f.cleanup();}
});
test('R99 rejects a forged or unbound R98 receipt, extra fields and false operator authenticity',()=>{
 const f=synthetic();try{
  const invalid=mutate=>{const c=structuredClone(f.capture);mutate(c);
   assert.throws(()=>verifyR99OperatorCapture({workspace:f.workspace,
    capture:c,inspector:f.inspector,env:{}}),fail);};
  invalid(c=>c.originalProjectRef='bgydsamxypjslergfpla');
  invalid(c=>c.historicalSqlFilesLocallyVerified=82);
  invalid(c=>c.aggregateSha256='0'.repeat(64));
  invalid(c=>c.reviewMarkerFiles++);
  invalid(c=>c.actualAuthenticatedLinkedSessionIndependentlyAttested=true);
  invalid(c=>c.cliSessionAcceptedAsIndependentProof=true);
  invalid(c=>c.qaTargetUsed=true);
  invalid(c=>c.qaSchemaModified=true);
  invalid(c=>c.productionSchemaModified=true);
  invalid(c=>c.installApproved=true);
  invalid(c=>c.productionReleaseAuthorized=true);
  invalid(c=>c.serviceRoleKey='secret');
  invalid(c=>delete c.recoveredBodiesLeftInPrivateWorkspace);
 }finally{f.cleanup();}
});
test('R99 detects private file modification, missing original and unexpected extra SQL',()=>{
 const f=synthetic();try{
  const f0=f.rows[0],filename=f0.version+'_'+f0.name+'.sql';
  const file=join(f.dir,filename);
  writeFileSync(file,'select 6000;\n');
  assert.throws(()=>verifyR99OperatorCapture({workspace:f.workspace,
   capture:f.capture,inspector:f.inspector,env:{}}),/R98 PRIVATE HISTORY NO-GO/);
  writeFileSync(file,'-- synthetic test only\nselect 0;\n');
  unlinkSync(file);
  assert.throws(()=>verifyR99OperatorCapture({workspace:f.workspace,
   capture:f.capture,inspector:f.inspector,env:{}}),/R98 PRIVATE HISTORY NO-GO/);
  writeFileSync(file,'-- synthetic test only\nselect 0;\n');
  writeFileSync(join(f.dir,'20261111023204_world_v2_b10_integrated_motion.sql'),'select 3;\n');
  assert.throws(()=>verifyR99OperatorCapture({workspace:f.workspace,
   capture:f.capture,inspector:f.inspector,env:{}}),/R98 PRIVATE HISTORY NO-GO/);
 }finally{f.cleanup();}
});
test('R99 never accepts symlinked input, CI or database-target override',()=>{
 const f=synthetic();try{
  const linked=f.workspace+'-alias';
  symlinkSync(f.workspace,linked,'dir');
  try{assert.throws(()=>verifyR99OperatorCapture({workspace:linked,
   capture:f.capture,inspector:f.inspector,env:{}}),/R98 PRIVATE HISTORY NO-GO/);}
  finally{unlinkSync(linked);}
  for(const env of [{CI:'true'},{DATABASE_URL:'postgres://unsafe'},
   {SUPABASE_PROJECT_ID:'bgydsamxypjslergfpla'}])
   assert.throws(()=>verifyR99OperatorCapture({workspace:f.workspace,
    capture:f.capture,inspector:f.inspector,env}),/R98 PRIVATE HISTORY NO-GO/);
 }finally{f.cleanup();}
});
test('R99 forged mock inspector cannot turn a partial or edited source check into a pass',()=>{
 const f=synthetic();
 try{
  const bad=[
   {decision:'GO'},
   {decision:'NO_GO',phase:'fetched',historicalFilesVerified:83,
    exactHistoricalBytesVerified:true,originalRefVerified:true,
    aggregateSha256:'0'.repeat(64),reviewMarkerFiles:0},
   {decision:'NO_GO',phase:'fetched',historicalFilesVerified:83,
    exactHistoricalBytesVerified:true,originalRefVerified:true,
    aggregateSha256:f.capture.aggregateSha256,reviewMarkerFiles:0,
    qaInstallApproved:true,sqlApplied:false,releaseAuthorized:false,
    privateDataAndPortabilityReviewCompleted:false}
  ];
  for(const x of bad)assert.throws(()=>verifyR99OperatorCapture({
   workspace:f.workspace,capture:f.capture,env:{},inspector:()=>x
  }),fail);
 }finally{f.cleanup();}
});
test('R99 source stays no-network/no-write and staged release ledger remains NO_GO',()=>{
 const source=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-99-source.mjs'),'utf8');
 const local=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-99-private-recovery.mjs'),'utf8');
 assert.doesNotMatch(source,/\b(?:fetch|spawn|apply_migration|writeFileSync)\s*\(/);
 assert.doesNotMatch(local,/\b(?:fetch|spawn|execSync|apply_migration|writeFileSync)\s*\(/);
 const ledger=JSON.parse(readFileSync(join(ROOT,'staging/next-release-ledger.json'),'utf8'));
 assert.equal(ledger.branches.length,186);
 assert.equal(ledger.branches.at(-3).linkedPullRequest,200);
 assert.equal(ledger.branches.at(-2).linkedPullRequest,201);
 assert.equal(ledger.branches.at(-2).releaseReady,false);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,121);
 assert.equal(ledger.releasePrivateRecoveryAttestation.decision,'NO_GO');
 assert.equal(ledger.releasePrivateRecoveryAttestation.operatorAuthenticatedFetchVerified,false);
 assert.equal(ledger.releasePrivateRecoveryAttestation.qaRegisteredMigrations,0);
 assert.equal(ledger.releasePrivateRecoveryAttestation.productionReleaseAuthorized,false);
});
