import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR97QaBootstrap}
 from '../scripts/release/validate-world-v2-r18-97-qa-bootstrap.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const src=()=>JSON.parse(readFileSync(join(ROOT,
 'staging/world-v2-b10-r18-97-qa-schema-preflight/manifest.json'),'utf8'));
const invalid=fn=>{const m=src();fn(m);assert.throws(
 ()=>validateR97QaBootstrap(m),/R97 QA BOOTSTRAP NO-GO/);};

test('R97 accepts only read-only 83-history parity and incomplete blank QA',()=>{
 const m=src(),r=validateR97QaBootstrap(m);
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.historicalMetadataMatched,83);
 assert.equal(r.completeSqlHistoryAvailable,false);
 assert.equal(r.safeToPushRepoRoot,false);
 assert.equal(r.qaSchemaInstalled,false);
 assert.equal(r.releaseAuthorized,false);
 assert.equal(m.original.liveSelectOnlyMatchedDigests,83);
 assert.equal(m.repository.originalHistoricalVersionsMissingInRoot,63);
 assert.equal(m.qa.registeredMigrations,0);
});
test('R97 fails closed on forged original parity, source fetch, or operator claim',()=>{
 invalid(m=>m.original.registeredMigrations=82);
 invalid(m=>m.original.liveSelectOnlyMatchedDigests=82);
 invalid(m=>m.original.liveSelectOnlyMismatchCount=1);
 invalid(m=>m.original.sqlBodiesFetchedToIsolatedWorkspace=true);
 invalid(m=>m.original.cliLinkedFetchExecuted=true);
 invalid(m=>m.parentSha='0'.repeat(40));
 invalid(m=>m.decision='GO');
});
test('R97 rejects production-targeted data copies and false QA schema readiness',()=>{
 invalid(m=>m.qa.projectRef=m.original.projectRef);
 invalid(m=>m.qa.status='DOWN');
 invalid(m=>m.qa.registeredMigrations=83);
 invalid(m=>m.qa.publicApplicationTables=1);
 invalid(m=>m.qa.bootstrapSqlApplied=true);
 invalid(m=>m.qa.productionDataImported=true);
});
test('R97 detects root history gaps, timestamp collision and unsafe direct push',()=>{
 invalid(m=>m.repository.rootSqlFiles=83);
 invalid(m=>m.repository.invalidTimestampedSqlFiles=[]);
 invalid(m=>m.repository.duplicateTimestampVersion='');
 invalid(m=>m.repository.historicalVersionsWithRootFile=83);
 invalid(m=>m.repository.originalHistoricalVersionsMissingInRoot=0);
 invalid(m=>m.repository.rootTimestampedSqlFilesNotHistorical=0);
 invalid(m=>m.repository.originalHistoryBodiesFullyReconstructed=true);
 invalid(m=>m.repository.rootDirectorySafeToPush=true);
});
test('R97 refuses promoting sealed pending SQL or optional candidates',()=>{
 invalid(m=>m.sealedPending.stagedNarrowPending=8);
 invalid(m=>m.sealedPending.totalWithR05=9);
 invalid(m=>m.sealedPending.candidateR57R77Included=true);
 invalid(m=>m.sealedPending.appliedOnQa=true);
});
test('R97 never invents approvals, completed security gates or deployments',()=>{
 for(const k of Object.keys(src().requiredGates))invalid(m=>m.requiredGates[k]=true);
 for(const k of Object.keys(src().changes))invalid(m=>m.changes[k]=true);
 invalid(m=>m.requiredGates.extra=false);
});
test('R97 bootstrap checker stays offline, has no SQL, filesystem or CLI mutation',()=>{
 const code=readFileSync(join(ROOT,'scripts/release/validate-world-v2-r18-97-qa-bootstrap.mjs'),'utf8');
 assert.doesNotMatch(code,/\b(?:fetch|spawn|execSync|writeFileSync|apply_migration|create_project|create_branch)\s*\(/);
 assert.match(code,/decision:'NO_GO'/);
 assert.match(code,/safeToPushRepoRoot:false/);
});
test('R97 ledger stays draft and historical R96 provisioning receipt is unchanged',()=>{
 const ledger=JSON.parse(readFileSync(join(ROOT,'staging/next-release-ledger.json'),'utf8'));
 const previous=JSON.parse(readFileSync(join(ROOT,
  'staging/world-v2-b10-r18-96-free-qa-provisioning/manifest.json'),'utf8'));
 assert.equal(previous.qaSupabase.registeredMigrations,0);
 assert.equal(ledger.branches.length,186);
 assert.equal(ledger.branches.at(-5).linkedPullRequest,198);
 assert.equal(ledger.branches.at(-4).linkedPullRequest,199);
 assert.equal(ledger.branches.at(-4).releaseReady,false);
 assert.equal(ledger.releaseQaSchemaPreflight.decision,'NO_GO');
 assert.equal(ledger.releaseQaSchemaPreflight.originalHashesMatched,83);
 assert.equal(ledger.releaseQaSchemaPreflight.qaRegisteredMigrations,0);
 assert.equal(ledger.releaseQaSchemaPreflight.rootHistoryMissingVersions,63);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,121);
});
