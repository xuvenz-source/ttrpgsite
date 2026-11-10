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
 assert.match(ledger.productionBaseSha,/^[0-9a-f]{40}$/);
 assert.equal(ledger.upcomingRelease.productionBaseSha,ledger.productionBaseSha);
 assert.equal(ledger.upcomingRelease.releaseBranch,ledger.releaseBranch);
 // Multiple draft branches can exist before a consolidated release candidate.
 const staged=ledger.branches.filter(item=>item.status==='staged');
 assert.deepEqual([...ledger.upcomingRelease.outstandingBranches].sort(),
  staged.map(item=>item.name).sort());
 assert.ok(staged.length>=1);
 assert.ok(staged.every(item=>item.productionBaseSha===ledger.productionBaseSha&&
  item.releaseReady===false));
 if(ledger.releaseBranch){
  assert.match(ledger.releaseBranch,/^(?:stage|fix)\//);
  assert.ok(staged.some(item=>item.name===ledger.releaseBranch));
 }else assert.ok(staged.every(item=>Number.isInteger(item.linkedPullRequest)));
 assert.ok(ledger.branches.some(item=>item.linkedPullRequest===71&&
  item.releaseReady===false),'blocked PR #71 cannot be silently published');
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
 assert.ok(ledger.releaseHistory.length>0);
 const latestHistory=ledger.releaseHistory.at(-1);
 assert.deepEqual(ledger.lastRelease.approvedPullRequests,latestHistory.pullRequests);
 assert.equal(ledger.lastRelease.productionCommit,ledger.productionBaseSha,
  'last release SHA must match the recorded verified production main');
 assert.equal(latestHistory.productionCommit,ledger.productionBaseSha);
 assert.match(ledger.lastRelease.productionBaseSha,/^[0-9a-f]{40}$/);
 // The earlier PR #53 release is historical: keep evidence, never call it latest.
 const release53=ledger.releaseHistory.find(x=>x.pullRequests?.includes(53));
 assert.ok(release53);
 assert.equal(release53.productionCommit,'55d5d704c47c60f04100ce13fb81a5d4357b999e');
 assert.deepEqual(release53.databaseDependencies,
  ['20261108111759','20261108112135','20261108112252','20261108112544']);
 assert.ok(ledger.releaseHistory.some(x=>x.pullRequests?.includes(51)&&x.includedStagedPullRequests?.includes(50)));
 assert.ok(Array.isArray(ledger.lastRelease.databaseDependencies));
 assert.ok(ledger.features.some(x=>x.id==='movement-fog-phase1-rendering-and-visibility-parity'&&x.status==='released'&&x.releaseReady===true));
 for(const id of ['movement-fog-phase2-authorized-sessions','movement-fog-phase3-viewer-visibility-deltas','movement-fog-phase4-supabase-query-memory'])
  assert.ok(ledger.features.some(x=>x.id===id&&x.status==='released'&&x.releaseReady===true),id);
 assert.ok(ledger.branches.some(x=>x.name==='stage/solid-wall-drag-and-player-token-no-flash-2026-11-08'&&x.status==='released'));
 for(const id of ['solid-wall-input-and-final-movement-gating','no-flash-player-token-sprite-lifecycle'])
  assert.ok(ledger.features.some(x=>x.id===id&&x.releaseReady===true&&x.status==='released'));
 assert.ok(ledger.releaseHistory.some(x=>x.pullRequests?.includes(53)&&x.productionCommit==='55d5d704c47c60f04100ce13fb81a5d4357b999e'));
 assert.ok(ledger.databaseDependencies.some(x=>x.name==='viewer_light_masks_v2'&&x.status==='applied-production'&&x.appliedVersion==='20261108111759'&&x.mustApplyBeforeFrontend===true));
 for(const name of ['observer_path_cached_scene','movement_sessions_and_visibility_delta'])
  assert.ok(ledger.databaseDependencies.some(x=>x.name===name&&x.status==='applied-production'&&x.appliedVersion==='20261108111759'));
 assert.ok(ledger.lastRelease.paidInfrastructure===false);
 assert.equal(ledger.appliedMigrationAudit?.v2VersionAliases?.length,8);
 assert.ok(ledger.appliedMigrationAudit.v2VersionAliases.every(alias=>
  ledger.databaseDependencies.some(dep=>dep.appliedName===alias.name&&
   dep.status==='applied-production'&&dep.appliedVersion===alias.applied)));
 assert.ok(ledger.migrationProvenanceGaps?.some(issue=>issue.issue===69&&
  issue.noLiveSqlAction===true));
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
 assert.deepEqual([...ledger.upcomingRelease.outstandingBranches].sort(),
  ledger.branches.filter(x=>x.status==='staged').map(x=>x.name).sort());
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
