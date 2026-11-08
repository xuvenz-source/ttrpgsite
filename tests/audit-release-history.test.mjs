import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('audit migration manifest is documentary and keeps live records separate from repo filenames',()=>{
 const data=JSON.parse(read('staging/db-migration-history-audit.json'));
 assert.ok(data.counts.productionApplied>=data.counts.exactVersionMatches);
 assert.ok(data.counts.repositorySqlFiles>=data.counts.exactVersionMatches);
 assert.equal(data.productionApplied.length,data.counts.productionApplied);
 assert.equal(data.trackedFiles.length,data.counts.repositorySqlFiles);
 assert.match(data.warning,/Never run every repo migration/);
});
test('release ledger records previous releases and pending authorized migrations',()=>{
 const ledger=JSON.parse(read('staging/next-release-ledger.json'));
 assert.equal(ledger.releaseBranch,'stage/movement-latency-rubberband-2026-11-08');
 assert.equal(ledger.productionBaseSha,'92f982ce23dcda706032c3abb235a84233324578');
 assert.ok(ledger.upcomingRelease.outstandingBranches.includes(ledger.releaseBranch));
 assert.ok(ledger.features.some(feature=>feature.id==='movement-visual-handoff-and-observer-request-coalescing'
  &&feature.status==='staged'&&feature.releaseReady===true));
 assert.ok(ledger.features.some(feature=>feature.id==='single-write-trajectory-server-redesign'
  &&feature.status==='planned'&&feature.releaseReady===false));
 assert.deepEqual(ledger.lastRelease.approvedPullRequests,[48]);
 assert.deepEqual(ledger.lastRelease.includedStagedPullRequests,[47]);
 assert.equal(ledger.lastRelease.productionBaseSha,'a763b8d106e2362033c16ce44966e9b122d6a47b');
 assert.ok(ledger.lastRelease.paidInfrastructure===false);
 assert.deepEqual(ledger.upcomingRelease.outstandingBranches,[ledger.releaseBranch]);
 assert.ok(ledger.features.some(feature=>feature.id==='unified-world-runtime-redesign'&&
  feature.status==='released'&&feature.releaseReady===true));
 assert.ok(ledger.branches.some(item=>item.name==='stage/world-runtime-movement-collision-fog-2026-11-08'&&item.status==='released'));
 assert.ok(ledger.branches.some(item=>item.name==='stage/inventory-cross-transfer-2026-11-08'&&item.status==='released'));
 assert.ok(ledger.branches.some(item=>
  item.name==='stage/next-release-inventory-token-continuity-2026-11-08'&&item.status==='released'));
 assert.ok(ledger.features.some(feature=>
  feature.id==='stable-token-movement-visual-continuity'&&feature.releaseReady===true&&feature.status==='released'));
 assert.ok(ledger.databaseDependencies.some(item=>item.name==='campaign_cross_inventory_item_transfers'
  &&item.status==='applied-production'&&item.appliedVersion==='20261108052335'&&item.mustApplyBeforeFrontend===true));
 assert.ok(ledger.databaseDependencies.some(item=>
  item.name==='world_runtime_private_observer_motion'&&
  item.appliedVersion==='20261108031754'&&
  item.status==='applied-production'));
 for(const name of ['player_owned_token_artwork','macro_quickcode_resolution',
  'nonfog_token_movement_tick_optimization'])assert.ok(
   ledger.databaseDependencies.some(item=>item.name===name&&
    item.status==='applied-production'&&item.appliedVersion),
   'Migration must be recorded as applied: '+name);
 assert.ok(ledger.releaseHistory.some(item=>item.productionCommit===
  'fba25209757d2c55d3303ea6b0582b8d61b6632c'&&item.pullRequests?.includes(42)));
 for(const name of ['stage/player-sheets-token-artwork-fog-2026-11-08',
  'stage/seamless-multiplayer-token-movement-2026-11-08',
  'stage/universal-roll-hotbar-drag-2026-11-08'])
  assert.ok(ledger.branches.some(item=>item.name===name&&item.status==='released'),name);
 for(const id of ['seamless-multiplayer-token-movement','universal-roll-button-hotbar-drag'])
  assert.ok(ledger.features.some(item=>item.id===id&&item.status==='released'),id);
 assert.ok(ledger.branches.filter(x=>x.name.startsWith('stage/live-qa-light-')||x.name.startsWith('stage/interactive-pins-')).every(x=>x.status==='released'));
 const ci=read('.github/workflows/verify-staged.yml');
 assert.doesNotMatch(ci,/supabase db push|supabase migration up|vercel deploy/);
});
