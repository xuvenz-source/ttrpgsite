import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditGameplayContracts,contracts,R139_LIVE_ENABLED} from
 '../staging/world-v2-b10-r18-139-gameplay-contract-gate-probe/GameplayContractAudit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const manifest=JSON.parse(read(
 'staging/world-v2-b10-r18-139-gameplay-contract-gate-probe/manifest.json'));

test('R139 exact source producer inventory is pinned and no route is authorized',()=>{
 const result=auditGameplayContracts({root});
 assert.equal(result.workPackage,'B10-R18-139');
 assert.equal(R139_LIVE_ENABLED,false);
 assert.equal(result.r138DynamicClassified,26);
 assert.equal(result.r139ExactCallsiteGroups,6);
 assert.equal(result.candidateBrowserGrantsAdded,0);
 assert.equal(result.originalSignedDbTestsPerformed,false);
 assert.equal(result.transitiveGameplayScopeComplete,false);
 assert.equal(result.lockPerformanceOnFreeTier,'UNMEASURED');
 assert.equal(contracts.length,6);
 for(const c of result.contracts){
  assert.equal(c.publicExecutable,false,c.id);
  assert.equal(c.authorizationProved,false,c.id);
  assert.equal(c.gate,'BLOCKED_SIGNED_ACTOR_QA',c.id);
  assert.ok(c.gaps.length>=2,c.id);
 }
});
test('R139 explicitly retains hard actor, migration, old socket and fog blockers',()=>{
 const result=auditGameplayContracts({root});
 const by=Object.fromEntries(result.contracts.map(c=>[c.id,c]));
 assert.deepEqual(by['gesture-session'].observed.sort(),
  ['advance_world_motion_v2','begin_world_motion_v2','cancel_world_motion_v2',
   'commit_world_motion_v2','finalize_world_motion_v2'].sort());
 assert.ok(by['gesture-session'].gaps.some(s=>s.includes('atomic terminal')));
 assert.ok(by['viewer-and-dm-preview'].gaps.some(s=>s.includes('preview')));
 assert.ok(by['viewer-light-masks'].gaps.some(s=>s.includes('V3')));
 assert.ok(by['combat-actions'].gaps.some(s=>s.includes('isDM')));
 assert.ok(by['fog-private-delta'].gaps.some(s=>s.includes('Postgres Changes')));
 assert.ok(by['inventory-source-mapping'].gaps.some(s=>s.includes('map_tokens')));
});
test('R139 remains fully inert and parent R138 must stay source-only',()=>{
 assert.equal(manifest.parentPr,246);
 assert.equal(manifest.parentSha,'300fb92786bf66f8c61dcb36488f51be0709aa7c');
 assert.equal(manifest.decision,'NO_GO');
 for(const k of ['noHostedWrites','noApplicationSourceEdits','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources','noNewBrowserGrants'])
  assert.equal(manifest[k],true,k);
 assert.equal(manifest.qaSignedActorTests,'NOT_RUN');
 assert.equal(manifest.freeTierWorldLatency,'NOT_MEASURED');
 assert.equal(manifest.originalMigrationCount,83);
 assert.equal(manifest.qaMigrationCount,0);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 const doc=read('docs/testing/world-v2-r18-139-gameplay-contract-gate-probe-2026-11-21.md');
 for(const term of ['R18-139','NO_GO','FOR SHARE','preview','fog',
  'DM','P1','P2','outsider','R128','R132','R138','Realtime',
  'Storage','free-tier','signed','old socket'])
  assert.ok(doc.toLowerCase().includes(term.toLowerCase()),term);
});
