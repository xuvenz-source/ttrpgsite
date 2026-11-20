import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR146,R146_LIVE_ENABLED} from
 '../staging/world-v2-b10-r18-146-original-revocation-lock-graph/OriginalRevocationGraphAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-146-original-revocation-lock-graph/';
const snap=JSON.parse(read(base+'original-trigger-and-revocation-snapshot.json'));
const manifest=JSON.parse(read(base+'manifest.json'));
const race=read('tests/world-v2-r18-146-postgres/lock-order-races.mjs');
const run=read('tests/world-v2-r18-146-postgres/run.sh');
const docs=read('docs/testing/world-v2-r18-146-original-revocation-lock-graph-2026-11-21.md');

test('R146 exact original read-only catalog snapshot and parent',()=>{
 const v=auditR146({root});
 assert.equal(R146_LIVE_ENABLED,false);
 assert.equal(v.workPackage,'B10-R18-146');
 assert.equal(v.decision,'NO_GO');
 assert.equal(v.originalCharacterTriggers,6);
 assert.equal(v.originalTokenTriggers,10);
 assert.equal(v.originalHandoutTriggers,3);
 assert.equal(v.originalPinTriggers,2);
 assert.equal(v.campaignMemberRevocationTriggerCount,0);
 assert.equal(v.realOldSocketRevocationProved,false);
 assert.equal(v.allOriginalMigrationCompatibilityProven,false);
 assert.equal(manifest.parentPr,253);
 assert.equal(manifest.parentSha,'a922556ccd49f19251dfb2bad399d0aea8ee67d9');
 assert.equal(snap.originalMigrations,83);
 assert.equal(snap.qaMigrations,0);
 assert.equal(snap.qaPublicApplicationTables,0);
});
test('R146 rejects optimistic masking of old SQL revoke, invite or trigger counts',()=>{
 const mutate=x=>JSON.parse(JSON.stringify(x));
 for(const [field,value] of [
  ['revokedCharacterOwnerStillMatchesCanEditSheetOwnerBranch',false],
  ['joinCampaignAcceptsUnchangedInviteCode',false],
  ['serviceRoleCanTruncateCampaignMembers',false]
 ]){
  const fake=mutate(snap);fake.originalAuthorityFindings[field]=value;
  assert.throws(()=>auditR146({root,snapshot:fake}),/original issue risk suppressed/);
 }
 const t=mutate(snap);t.originalTriggerCounts.campaign_members=1;
 assert.throws(()=>auditR146({root,snapshot:t}),/pg_catalog evidence inconsistent/);
});
test('R146 enumerates opposite lock order and exact successor handout-first',()=>{
 const v=auditR146({root});
 assert.equal(v.revokedOwnerOldRpcRisk,true);
 assert.equal(v.unchangedInviteRejoinRisk,true);
 assert.equal(v.privilegedMemberMutationRevocationRisk,true);
 assert.equal(v.releaseAuthorized,false);
 assert.equal(snap.mutationLockGraph.find(x=>x.from==='public.collect_campaign_map_pin').hazard,'PIN_TO_HANDOUT');
 assert.equal(snap.mutationLockGraph.find(x=>x.from==='public.hide_campaign_handout_pins').hazard,'HANDOUT_TO_PIN');
 assert.equal(snap.mutationLockGraph.find(x=>x.from==='R145.collect_authorized_pin_once_v3').hazard,'HANDOUT_THEN_PIN');
});
test('R146 PG17 race script contains controlled scenarios and mandatory isolation',()=>{
 for(const term of [
  'r146_dm_hides_pin','r146_new_collector_waits',
  'r146_new_collector_first','r146_dm_hides_after_collect',
  'r146_old_collector_pin_first','r146_dm_old_inverse_order',
  'deadlock detected','PGAPPNAME','RowShareLock','FOR UPDATE',
  'R146_ISOLATED','originalSupabaseDatabaseTested:false',
  "mode='fenced'"
 ])assert.ok(race.includes(term),term);
 for(const term of [
  'GITHUB_ACTIONS','R145_ISOLATED','R146_ISOLATED','127.0.0.1',
  'world_v2_r18_138','SUPABASE_SERVICE_ROLE_KEY',
  'tests/world-v2-r18-145-postgres/run.sh'
 ])assert.ok(run.includes(term),term);
 assert.doesNotMatch(run,/\bsupabase\s+(?:link|db|deploy|migration)\b/);
});
test('R146 never authorizes old routes or claims real-world performance',()=>{
 assert.equal(manifest.productionReleaseAuthorized,false);
 assert.equal(manifest.noHostedWrites,true);
 assert.equal(manifest.noVersionedMigrations,true);
 assert.equal(manifest.noRuntimeSourceEdits,true);
 assert.equal(manifest.noNewGrants,true);
 assert.equal(manifest.noMerge,true);
 assert.equal(manifest.noDeploy,true);
 assert.equal(manifest.realSignedQaPerformed,false);
 assert.equal(manifest.realFreeTierTransactionMetricsMeasured,false);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const s of ['R18-146','R18-145','NO_GO','R128','DM',
  'P1','P2','outsider','Storage','Realtime','old socket',
  'free-tier','invite','member','handout','TRUNCATE','R127'])
  assert.ok(docs.toLowerCase().includes(s.toLowerCase()),s);
});
