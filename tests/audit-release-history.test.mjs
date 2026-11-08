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
 assert.equal(ledger.releaseBranch,'stage/movement-fog-realtime-memory-redesign-2026-11-08');
 assert.equal(ledger.productionBaseSha,'9c66bde70fcf021ea1499adb52cd52fe77712e33');
 assert.deepEqual(ledger.upcomingRelease.outstandingBranches,['stage/movement-fog-realtime-memory-redesign-2026-11-08']);
 assert.ok(ledger.branches.some(item=>item.name==='stage/fog-pending-tick-dedupe-and-memory-audit-2026-11-08'&&item.status==='released'));
 assert.ok(ledger.branches.some(x=>
  x.name==='stage/supabase-multiplayer-performance-2026-11-08'&&
  x.status==='released'));
 assert.ok(ledger.branches.some(x=>
  x.name==='stage/player-remote-reconciliation-2026-11-08'&&x.status==='released'));
 for(const id of ['player-authoritative-position-reconciliation',
  'player-fog-visual-continuity-fast-reauthorization',
  'viewer-scoped-campaign-refresh-coordinator',
  'targeted-campaign-tool-realtime-refresh'])assert.ok(
   ledger.features.some(x=>x.id===id&&x.status==='released'&&
    x.releaseReady===true&&x.databaseDependencies.length===0),id);
 assert.ok(ledger.features.some(feature=>feature.id==='movement-visual-handoff-and-observer-request-coalescing'
  &&feature.status==='released'&&feature.releaseReady===true));
 assert.ok(ledger.features.some(feature=>feature.id==='single-write-trajectory-server-redesign'
  &&feature.status==='released'&&feature.releaseReady===true));
 assert.ok(ledger.databaseDependencies.some(dep=>
  dep.name==='world_runtime_single_write_trajectory' &&
  dep.status==='applied-production' && dep.appliedVersion==='20261108055943' &&
  dep.mustApplyBeforeFrontend===true &&
  dep.releaseApprovalRequired===true));
 assert.deepEqual(ledger.lastRelease.approvedPullRequests,[52]);
 assert.deepEqual(ledger.lastRelease.includedStagedPullRequests,[]);
 assert.equal(ledger.lastRelease.productionBaseSha,'309e96c7b3ca6550e491392d9e32ba5189497175');
 assert.equal(ledger.lastRelease.productionCommit,'9c66bde70fcf021ea1499adb52cd52fe77712e33','the last release SHA must match the verified Vercel production commit');
 assert.ok(ledger.releaseHistory.some(x=>x.pullRequests?.includes(51)&&x.includedStagedPullRequests?.includes(50)));
 assert.deepEqual(ledger.lastRelease.databaseDependencies,['20261108091818']);
 assert.ok(ledger.features.some(x=>x.id==='movement-fog-phase1-rendering-and-visibility-parity'&&x.status==='included'&&x.releaseReady===true));
 for(const id of ['movement-fog-phase2-authorized-sessions','movement-fog-phase3-viewer-visibility-deltas','movement-fog-phase4-supabase-query-memory'])
  assert.ok(ledger.features.some(x=>x.id===id&&x.status==='included'&&x.releaseReady===true),id);
 assert.ok(ledger.databaseDependencies.some(x=>x.name==='viewer_light_masks_v2'&&x.status==='applied-production'&&x.appliedVersion==='20261108111759'&&x.mustApplyBeforeFrontend===true));
 for(const name of ['observer_path_cached_scene','movement_sessions_and_visibility_delta'])
  assert.ok(ledger.databaseDependencies.some(x=>x.name===name&&x.status==='applied-production'&&x.appliedVersion==='20261108111759'));
 assert.ok(ledger.lastRelease.paidInfrastructure===false);
 assert.ok(ledger.releaseHistory.some(x=>x.pullRequests?.includes(52)&&x.databaseDependencies?.includes('20261108091818')));
 for(const name of ['observer_path_visibility_single_snapshot','per_viewer_visibility_v2']){
  const dep=ledger.databaseDependencies.find(x=>x.name===name);
  assert.equal(dep?.status,'applied-production');
  assert.equal(dep?.appliedVersion,'20261108091818');
 }
 assert.match(read('supabase/migrations/20261108091818_observer_and_per_viewer_visibility_release_20261108.sql'),/function public\.get_authorized_map_fog_v2/);
 assert.ok(ledger.branches.some(item=>
  item.name==='stage/movement-latency-rubberband-2026-11-08'&&item.status==='released'));
 assert.ok(ledger.releaseHistory.some(item=>item.pullRequests?.includes(49)&&
  item.databaseDependencies?.includes('20261108055943')));
 assert.match(read('supabase/migrations/20261108055943_world_runtime_single_write_trajectory.sql'),
  /revoke all on function forge_visibility\.validate_piece_trajectory/);
 assert.doesNotMatch(read('supabase/migrations/20261108055943_world_runtime_single_write_trajectory.sql'),
  /^begin;|^commit;/m);
 assert.deepEqual(ledger.upcomingRelease.outstandingBranches,['stage/movement-fog-realtime-memory-redesign-2026-11-08']);
 assert.ok(ledger.branches.some(item=>item.name==='stage/fog-pending-tick-dedupe-and-memory-audit-2026-11-08'&&item.status==='released'));
 assert.ok(ledger.branches.some(x=>
  x.name==='stage/supabase-multiplayer-performance-2026-11-08'&&
  x.status==='released'));
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
