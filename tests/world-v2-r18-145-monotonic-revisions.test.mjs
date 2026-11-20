import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR145,R145_LIVE_ENABLED,R145_DECLARED_API} from
 '../staging/world-v2-b10-r18-145-monotonic-mutation-revisions/RevisionProtocolAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-145-monotonic-mutation-revisions/';
const manifest=JSON.parse(read(base+'manifest.json'));
const sql=read(base+'unapplied-revisioned-mutations-v3.sql');
const pg=read('tests/world-v2-r18-145-postgres/verify-revisioned-mutations.sql');
const run=read('tests/world-v2-r18-145-postgres/run.sh');
const docs=read('docs/testing/world-v2-r18-145-monotonic-mutation-revisions-2026-11-21.md');

test('R145 exact parent 252, inherited risk inventory and default-denied API',()=>{
 const v=auditR145({root});
 assert.equal(R145_LIVE_ENABLED,false);
 assert.equal(v.decision,'NO_GO');
 assert.equal(v.allWriterTableCounters,2);
 assert.equal(v.newTriggers,2);
 assert.equal(v.newPrivateHelpers,6);
 assert.equal(v.newApiInvokers,5);
 assert.equal(v.newBrowserGrants,0);
 assert.equal(v.hostedSqlApplied,false);
 assert.equal(R145_DECLARED_API.length,5);
 assert.equal(manifest.parentPr,252);
 assert.equal(manifest.parentSha,'c4c26fb8d736e021862a754008c0361ba67fd2eb');
 assert.equal(manifest.inheritedApiFunctions,20);
 assert.equal(manifest.totalProposedApiFunctions,25);
 assert.equal(manifest.totalProposedPrivateFunctions,26);
 assert.equal(manifest.newBrowserGrants,0);
});
test('R145 counters fire for any row UPDATE, including original privileged writers',()=>{
 for(const t of ['characters','campaign_handouts']){
  assert.ok(sql.includes('ALTER TABLE public.'+t+'\n ADD COLUMN forge_mutation_revision'),t);
  assert.ok(sql.includes('BEFORE UPDATE ON public.'+t+'\n FOR EACH ROW'),t);
  assert.doesNotMatch(sql,new RegExp('BEFORE UPDATE OF.*'+t));
 }
 assert.match(sql,/NEW\.forge_mutation_revision:=OLD\.forge_mutation_revision\+1/);
 assert.match(sql,/R145 revision column already installed/);
 assert.match(sql,/R145 revision trigger name conflict/);
 assert.match(sql,/R145 expects 25 API invokers and 26 private helpers/);
 assert.doesNotMatch(sql,/^\s*GRANT\s/mi);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION/);
 assert.equal((sql.match(/^CREATE TRIGGER /gm)||[]).length,2);
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_api\./gm)||[]).length,5);
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_internal\./gm)||[]).length,6);
});
test('R145 source audit catches a dangerously scoped trigger',()=>{
 const tampered=sql.replace(
  'BEFORE UPDATE ON public.characters\n FOR EACH ROW',
  'BEFORE UPDATE OF field_values ON public.characters\n FOR EACH ROW');
 assert.notEqual(tampered,sql);
 assert.throws(()=>auditR145({root,candidate:tampered}),
  /characters must cover ALL privileged writers/);
 const grant=sql+'\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA forge_v3_api TO authenticated;\n';
 assert.throws(()=>auditR145({root,candidate:grant}),
  /unexpected schema objects, API functions, or browser grants/);
});
test('R145 ensures monotonic CAS and collector HANDOUT before PIN in source',()=>{
 const v=auditR145({root});
 assert.equal(v.lockOrdering,'HANDOUT_BEFORE_PIN');
 assert.equal(v.legacyUnfencedWritersStillPossible,true);
 assert.equal(v.signedSupabaseOriginalQAVerified,false);
 for(const term of ['R145 same-transaction revision CAS failed to stop stale write',
  'R145 legacy writer failed to bump all-writer revision',
  'R145 stale revision accepted after legacy character edit',
  'R145 stale DM handout revision accepted',
  'R145 repeat collect changed state more than once',
  'R145 hidden collected pin disclosed post-revoke metadata',
  'R145 outsider crossed campaign','R145 revoked actor retained data access',
  'R145 temporary browser role grants not rolled back','R145 SYNTHETIC PG17 PASS'])
  assert.ok(pg.includes(term),term);
 for(const term of ['R138_ISOLATED','R140_ISOLATED',
  'R142_ISOLATED','R143_ISOLATED','R145_ISOLATED',
  '127.0.0.1','world_v2_r18_138',
  'SUPABASE_SERVICE_ROLE_KEY','tests/world-v2-r18-143-postgres/run.sh'])
  assert.ok(run.includes(term),term);
 assert.doesNotMatch(run,/\bsupabase\s+(?:link|db|migration|deploy)\b/);
});
test('R145 has no host writes, security release or free-tier performance claim',()=>{
 assert.equal(manifest.productionReleaseAuthorized,false);
 assert.equal(manifest.hostedSqlApplied,false);
 assert.equal(manifest.noRuntimeSrcEdits,true);
 assert.equal(manifest.noVersionedMigrations,true);
 assert.equal(manifest.noNewGrants,true);
 assert.equal(manifest.noDeploy,true);
 assert.equal(manifest.R127HumanReleaseApproval,false);
 assert.equal(manifest.syntheticPg17.realSignedSupabaseActors,false);
 assert.equal(manifest.syntheticPg17.actualFreeTierDDLPerformanceMeasured,false);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const term of ['R18-145','R18-144','R128','R132','NO_GO',
  'original','DM','P1','P2','outsider','revoked','old socket',
  'Storage','Realtime','free-tier','DDL','lock','idempotence'])
  assert.ok(docs.toLowerCase().includes(term.toLowerCase()),term);
});
