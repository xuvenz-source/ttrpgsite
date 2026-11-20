import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR144,R144_LIVE_ENABLED,R144_REQUEST_CONTRACTS} from
 '../staging/world-v2-b10-r18-144-mutation-cas-client-compat/MutationCompatibilityAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-144-mutation-cas-client-compat/';
const ledger=JSON.parse(read(base+'manifest.json'));
const pg=read('tests/world-v2-r18-144-postgres/prove-timestamp-cas-and-collect-risk.sql');
const runner=read('tests/world-v2-r18-144-postgres/run.sh');
const doc=read('docs/testing/world-v2-r18-144-mutation-cas-client-compat-2026-11-21.md');
test('R144 exactly five observed browser flow gaps; everything stays blocked',()=>{
 const result=auditR144({root});
 assert.equal(R144_LIVE_ENABLED,false);
 assert.equal(R144_REQUEST_CONTRACTS.length,5);
 assert.equal(result.reviewedClientFlows,5);
 assert.equal(result.decision,'NO_GO');
 assert.equal(result.clientIntegrationDone,false);
 assert.equal(result.timestampCASMonotonicProven,false);
 assert.equal(result.sameTransactionStaleCASRisk,true);
 assert.equal(result.doubleCollectEventRisk,true);
 assert.equal(result.unmappedMetadataAndNpcChanges,true);
 for(const c of result.contracts){
  assert.equal(c.v3ClientWired,false,c.client);
  assert.equal(c.releaseReady,false,c.client);
  assert.ok(c.status.startsWith('BLOCKED_'),c.client);
  assert.ok(c.required.length>c.covered.length,c.client);
 }
});
test('R144 detects browser source drift in existing mutation providers',()=>{
 const r=auditR144({root});
 const by=Object.fromEntries(r.contracts.map(c=>[c.client,c]));
 assert.ok(by['character-auto-save'].required.includes('name metadata'));
 assert.equal(by['npc-editor'].covered.length,0);
 assert.ok(by['handout-author'].required.includes('folder CRUD'));
 assert.ok(by['handout-collect'].required.includes('idempotent repeated collect'));
 assert.ok(by['inventory-editor'].required.includes('handle mutating read normalization'));
});
test('R144 synthetic risk replay explicitly proves and rolls back stale CAS and double collect',()=>{
 for(const token of [
  'R144 expected timestamp-only stale-CAS ambiguity not observed',
  'second_response->>\'updatedAt\' IS DISTINCT FROM first_response->>\'updatedAt\'',
  'third_response->>\'updatedAt\' IS DISTINCT FROM first_response->>\'updatedAt\'',
  'R144 expected duplicate synthetic handout update not observed',
  'r140_fiction.r144_update_count','ROLLBACK;','R144 RISK PROOF PASS'
 ])assert.ok(pg.includes(token),token);
 for(const term of ['GITHUB_ACTIONS','R144_ISOLATED',
  'R143_ISOLATED','127.0.0.1','world_v2_r18_138',
  'SUPABASE_SERVICE_ROLE_KEY','tests/world-v2-r18-143-postgres/run.sh'])
  assert.ok(runner.includes(term),term);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:link|db|migration|deploy)\b/);
});
test('R144 release ledger remains source-only, cannot hide untested signed QA',()=>{
 assert.equal(ledger.parentPr,251);
 assert.equal(ledger.parentSha,'123a4e7ad1ce179d3b2de0690c6f8a1ee296bfbd');
 assert.equal(ledger.decision,'NO_GO');
 assert.equal(ledger.productionReleaseAuthorized,false);
 assert.equal(ledger.runtimeSourceModified,false);
 assert.equal(ledger.newDatabaseFunctions,0);
 assert.equal(ledger.qaMigrationCount,0);
 assert.equal(ledger.originalMigrationCount,83);
 assert.equal(ledger.timestampCAS.strictlyMonotonic,false);
 assert.equal(ledger.collection.idempotent,false);
 assert.deepEqual(ledger.unresolvedIssues,[220,223,229,231]);
 for(const key of ['noHostedWrites','noRuntimeEdits','noVersionedMigrations',
   'noMerge','noDeploy','noPaidResources','noNewGrants'])
  assert.equal(ledger[key],true,key);
 for(const term of ['R18-144','R18-143','R128','NO_GO','Storage',
  'Realtime','old socket','DM','P1','P2','original','free-tier',
  'revision','autosave','handout','inventory'])
  assert.ok(doc.toLowerCase().includes(term.toLowerCase()),term);
});
