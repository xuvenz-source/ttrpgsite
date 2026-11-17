import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR101HistoricalRiskAudit}
 from '../scripts/release/validate-world-v2-r18-101-history-risk-audit.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=p=>JSON.parse(readFileSync(join(ROOT,p),'utf8'));
const prefix='staging/world-v2-b10-r18-101-history-risk-audit/';
const m=()=>json(prefix+'manifest.json');
const index=()=>json(prefix+'metadata-index.json');
function invalid(fn){
 const a=m(),i=index();
 fn(a,i);
 assert.throws(()=>validateR101HistoricalRiskAudit(a,i),
  /R101 HISTORICAL SQL NO-GO/);
}
test('R101 read-only original 83 SQL metadata risk audit stays NO_GO',()=>{
 const x=validateR101HistoricalRiskAudit(m(),index());
 assert.equal(x.workPackage,'B10-R18-101');
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.historicalFilesChecked,83);
 assert.equal(x.storedSqlMetadataBytes,709936);
 assert.equal(x.definerContainingFiles,66);
 assert.equal(x.dataDmlContainingFiles,51);
 assert.equal(x.originalAuthenticatedDefinerAdvisorWarnings,67);
 assert.equal(x.sourceSqlBodiesFetched,false);
 assert.equal(x.qaSqlInstalled,false);
 assert.equal(x.productionReleaseAuthorized,false);
});
test('R101 index binds every metadata-only record to the frozen original MD5 history',()=>{
 const i=index(),f=json('staging/world-v2-b10-r18-08-remote-history-content-hashes.json');
 assert.equal(i.entries.length,83);
 assert.equal(f.rows.length,83);
 for(let k=0;k<83;k++){
  assert.equal(i.entries[k].version,f.rows[k].version);
  assert.equal(i.entries[k].name,f.rows[k].name);
  assert.equal(i.entries[k].body_md5,f.rows[k].fetched_sql_md5);
  assert.deepEqual(Object.keys(i.entries[k]).sort(),
   ['version','name','sql_bytes','body_md5','flags'].sort());
  assert.equal(Object.values(i.entries[k].flags).every(x=>typeof x==='boolean'),true);
 }
});
test('R101 detects body digest, migration order, row identity, size and extraneous raw SQL',()=>{
 invalid((a,i)=>i.entries[0].body_md5='0'.repeat(32));
 invalid((a,i)=>i.entries[0].name='injected');
 invalid((a,i)=>i.entries.reverse());
 invalid((a,i)=>i.entries.pop());
 invalid((a,i)=>i.entries[0].sql_bytes=-5);
 invalid((a,i)=>i.entries[0].sql_bytes+=1);
 invalid((a,i)=>i.entries[0].sql='raw SQL must not be committed');
 invalid((a,i)=>i.entries[0].flags.rawSql=true);
 invalid((a,i)=>i.entries[0].flags.data_dml='false');
});
test('R101 historical risk flag totals cannot be changed or under-reported',()=>{
 invalid((a,i)=>i.metrics.flagged_file_counts.security_definer=65);
 invalid((a,i)=>i.metrics.total_sql_bytes=709937);
 invalid((a,i)=>i.metrics.largest_sql_bytes=30000);
 invalid((a,i)=>i.entries.find(x=>x.flags.security_definer).flags.security_definer=false);
 invalid((a,i)=>i.entries.find(x=>x.flags.data_dml).flags.data_dml=false);
 invalid((a,i)=>i.entries[0].flags.hardcoded_endpoint=true);
 invalid((a,i)=>a.metadataIndex.flagCounts.routine_execute_acl=0);
 invalid((a,i)=>i.flags.reverse());
});
test('R101 advisory observations remain precisely labeled and not certified vulnerabilities',()=>{
 const a=m();
 assert.equal(a.originalSecurityAdvisors.authenticatedDefinerExecutable.count,67);
 assert.equal(a.originalSecurityAdvisors.authenticatedDefinerExecutable.level,'WARN');
 assert.equal(a.originalSecurityAdvisors.rlsEnabledNoPolicy.level,'INFO');
 assert.equal(a.originalSecurityAdvisors.leakedPasswordProtection.count,1);
 assert.equal(a.originalSecurityAdvisors.validatedAsVulnerabilities,false);
 assert.equal(a.qaSecurityAdvisors.securityApprovalGranted,false);
 invalid((a,i)=>a.originalSecurityAdvisors.authenticatedDefinerExecutable.count=0);
 invalid((a,i)=>a.originalSecurityAdvisors.authenticatedDefinerExecutable.level='PASS');
 invalid((a,i)=>a.originalSecurityAdvisors.validatedAsVulnerabilities=true);
 invalid((a,i)=>a.qaSecurityAdvisors.securityApprovalGranted=true);
});
test('R101 prevents premature original/QA recovery and schema installation',()=>{
 invalid((a,i)=>a.decision='GO');
 invalid((a,i)=>a.parentSha='0'.repeat(40));
 invalid((a,i)=>a.original.projectRef=a.qa.projectRef);
 invalid((a,i)=>a.original.rawSqlReturned=true);
 invalid((a,i)=>a.qa.registeredMigrations=83);
 invalid((a,i)=>a.qa.publicApplicationTables=10);
 for(const key of Object.keys(m().releaseGates))invalid((a,i)=>a.releaseGates[key]=true);
 for(const key of Object.keys(m().unchanged))invalid((a,i)=>a.unchanged[key]=false);
});
test('R101 static validator is offline and source-only',()=>{
 const x=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-101-history-risk-audit.mjs'),'utf8');
 assert.doesNotMatch(x,/\b(?:fetch|spawn|execSync|writeFileSync|apply_migration)\s*\(/);
 assert.match(x,/decision:'NO_GO'/);
 assert.match(x,/sourceSqlBodiesFetched:false/);
 assert.match(x,/qaSqlInstalled:false/);
});
test('R101 immutable release ledger records one staged NO_GO risk index only',()=>{
 const l=json('staging/next-release-ledger.json');
 assert.equal(l.branches.length,189);
 assert.equal(l.branches.at(-4).linkedPullRequest,202);
 assert.equal(l.branches.at(-3).linkedPullRequest,203);
 assert.equal(l.branches.at(-3).releaseReady,false);
 assert.equal(l.upcomingRelease.outstandingBranches.length,124);
 assert.equal(l.releaseHistoricalSqlRiskAudit.decision,'NO_GO');
 assert.equal(l.releaseHistoricalSqlRiskAudit.historicalOriginalCount,83);
 assert.equal(l.releaseHistoricalSqlRiskAudit.privilegedRpcReviewCompleted,false);
 assert.equal(l.releaseHistoricalSqlRiskAudit.qaRegisteredMigrations,0);
 assert.equal(l.releaseHistoricalSqlRiskAudit.productionReleaseAuthorized,false);
});
