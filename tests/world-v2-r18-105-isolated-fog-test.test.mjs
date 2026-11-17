import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR105IsolatedFogTest}
 from '../scripts/release/validate-world-v2-r18-105-isolated-fog-test.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(join(ROOT,p),'utf8'));
const path='staging/world-v2-b10-r18-105-isolated-fog-test/manifest.json';
const m=()=>read(path);
const invalid=fn=>{const v=m();fn(v);
 assert.throws(()=>validateR105IsolatedFogTest(v),/R105 ISOLATED PG17 NO-GO/);};
test('R105 source-bound successful isolated PG17 proof keeps hosted release NO_GO',()=>{
 const r=validateR105IsolatedFogTest(m());
 assert.equal(r.workPackage,'B10-R18-105');
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.isolatedPg17CandidateCiObserved,'SUCCESS');
 assert.equal(r.sourceFilesHashPinned,8);
 assert.equal(r.realGitFunctionBodiesExtracted,4);
 assert.equal(r.localOriginalLeakAndGuardReproduced,true);
 assert.equal(r.localSourceRestoreAndReapplyDemonstrated,true);
 assert.equal(r.actualHostedSignedUserCasesExecuted,0);
 assert.equal(r.qaMigrationsApplied,0);
 assert.equal(r.productionReleaseAuthorized,false);
});
test('R105 four Git source definitions and actual historical combat RLS use original pinned SHA',()=>{
 const x=m();
 assert.equal(x.source.sourceSealCount,8);
 assert.equal(x.source.fourVerifiedOriginalFunctionBodies,true);
 assert.equal(x.source.originalCombatRosterPolicyExtractedFromGit,true);
 assert.equal(x.source.originalPrivate83HistoryRecovered,false);
 assert.equal(x.source.syntheticAuthUidUsed,true);
 assert.equal(x.source.syntheticIsCampaignDmUsed,true);
 assert.equal(x.source.fullOriginalSchemaInstalled,false);
});
test('R105 refuses altered successful CI evidence, Git blob hashes and hosted state claims',()=>{
 invalid(x=>x.parentSha='0'.repeat(40));
 invalid(x=>x.decision='GO');
 invalid(x=>x.original.sqlOrGrantsChanged=true);
 invalid(x=>x.qa.migrations=83);
 invalid(x=>x.source.fixtureFilesGitBlobs[
  'tests/world-v2-r18-105-postgres/run.sh']='0'.repeat(40));
 invalid(x=>x.source.sourceSealCount=7);
 invalid(x=>x.source.fullOriginalSchemaInstalled=true);
 invalid(x=>x.priorIsolatedProof.frozenCommit='0'.repeat(40));
 invalid(x=>x.priorIsolatedProof.outcome='PENDING');
 invalid(x=>x.priorIsolatedProof.originalOrQaHostedSqlWritten=true);
 invalid(x=>x.priorIsolatedProof.userSignedSupabaseSessionsExecuted=true);
});
test('R105 cannot forge passing signed Supabase accounts or production approvals',()=>{
 for(const key of Object.keys(m().gates))
  invalid(x=>x.gates[key]=true);
 for(const key of Object.keys(m().unchanged))
  invalid(x=>x.unchanged[key]=false);
 invalid(x=>x.acceptance.actualSignedAccountCasesExecuted=12);
 invalid(x=>x.acceptance.terminalReleaseDecision='GO');
 invalid(x=>x.acceptance.verifiedFixtureKind='SIGNED_REAL_SUPABASE');
});
test('R105 fixture run is GitHub-only, loopback-only, DB-qualified and rejects DSN overrides',()=>{
 const code=readFileSync(join(ROOT,'tests/world-v2-r18-105-postgres/run.sh'),'utf8');
 assert.match(code,/GITHUB_ACTIONS/);
 assert.match(code,/R105_ISOLATED/);
 assert.match(code,/PGHOST/);
 assert.match(code,/127\.0\.0\.1/);
 assert.match(code,/world_v2_r18_105/);
 assert.match(code,/PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS/);
 assert.match(code,/DATABASE_URL DIRECT_URL SUPABASE_DB_URL/);
 assert.match(code,/staging\/world-v2-b10-r18-104-fog-guard\/unapplied-fog-status-guard\.sql/);
 assert.doesNotMatch(code,/supabase\s+(db\s+push|migration\s+up|db\s+reset|link)/i);
});
test('R105 PostgreSQL 17 service cannot become a hosted SQL pipeline',()=>{
 const code=readFileSync(join(ROOT,
  '.github/workflows/world-v2-r18-105-fog-guard-isolated.yml'),'utf8');
 assert.match(code,/image: postgres:17/);
 assert.match(code,/POSTGRES_DB: world_v2_r18_105/);
 assert.match(code,/PGHOST: '127\.0\.0\.1'/);
 assert.match(code,/permissions:\n  contents: read/);
 assert.doesNotMatch(code,/supabase\.co|sb_secret_|service_role|DATABASE_URL:/i);
 assert.match(code,/tests\/world-v2-r18-105-postgres\/run\.sh/);
});
test('R105 actual PostgreSQL SQL fixtures simulate role isolation and record original leak recovery',()=>{
 const root='tests/world-v2-r18-105-postgres/';
 const baseline=readFileSync(join(ROOT,root+'baseline.sql'),'utf8');
 const patched=readFileSync(join(ROOT,root+'post-candidate.sql'),'utf8');
 const rollback=readFileSync(join(ROOT,root+'rollback-observation.sql'),'utf8');
 const reapply=readFileSync(join(ROOT,root+'reapply-observation.sql'),'utf8');
 assert.match(baseline,/ORIGINAL SOURCE BASELINE PASS/);
 assert.match(patched,/FOREIGN/i.test(patched)?/foreign/i:/R105/);
 assert.match(patched,/SET LOCAL ROLE authenticated/);
 assert.match(patched,/map_combats/);
 assert.match(patched,/end_map_motion_sessions/);
 assert.match(rollback,/reintroduce|restor/i);
 assert.match(reapply,/RE-APPLY PASS/);
});
test('R105 original 12 signed-user QA scenarios remain expressly NOT_RUN',()=>{
 const matrix=read('staging/world-v2-b10-r18-104-fog-guard/signed-acceptance-matrix.json');
 assert.equal(matrix.caseCount,12);
 assert.equal(matrix.signedCasesExecuted,0);
 assert.equal(matrix.cases.every(c=>c.status==='NOT_RUN'&&
  c.signedAccountTested===false&&c.sqlInstalled===false),true);
});
test('R105 Node source checker uses no SQL execution, network or shell invocation',()=>{
 const c=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-105-isolated-fog-test.mjs'),'utf8');
 assert.doesNotMatch(c,/\b(?:fetch|spawn|execSync|writeFileSync|execute_sql|apply_migration)\s*\(/);
});
test('R105 release ledger extends immutable historical QA/production NO_GO records',()=>{
 const l=read('staging/next-release-ledger.json');
 assert.equal(l.branches.length,191);
 assert.equal(l.upcomingRelease.outstandingBranches.length,126);
 assert.equal(l.branches.at(-2).linkedPullRequest,206);
 assert.equal(l.branches.at(-1).linkedPullRequest,207);
 assert.equal(l.branches.at(-1).releaseReady,false);
 assert.equal(l.releaseFogGuardIsolatedPg17.decision,'NO_GO');
 assert.equal(l.releaseFogGuardIsolatedPg17.verifiedRuntimeRunId,44058183100);
 assert.equal(l.releaseFogGuardIsolatedPg17.disposablePg17RuntimePassed,true);
 assert.equal(l.releaseFogGuardIsolatedPg17.qaRegisteredMigrations,0);
 assert.equal(l.releaseFogGuardIsolatedPg17.signedHostedSecurityAccepted,false);
 assert.equal(l.releaseFogGuardIsolatedPg17.productionReleaseAuthorized,false);
});
