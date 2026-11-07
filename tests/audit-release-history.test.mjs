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
test('combined release records both approved drafts and compatible migration requirements',()=>{
 const ledger=JSON.parse(read('staging/next-release-ledger.json'));
 assert.equal(ledger.releaseBranch,'stage/player-sheets-token-artwork-fog-2026-11-08');
 assert.deepEqual(ledger.lastRelease.approvedPullRequests,[41]);
 assert.equal(ledger.lastRelease.databaseDependencies.length,0);
 assert.ok(ledger.lastRelease.edgeFunctionDependencies.some(item=>item.name==='username-register'&&item.version===7&&item.status==='deployed-production'));
 assert.ok(ledger.databaseDependencies.some(item=>item.name==='player_owned_token_artwork'&&item.status==='staged-not-applied'&&item.mustApplyBeforeFrontend));
 const pending=ledger.upcomingRelease.outstandingBranches.map(item=>item.name);
 assert.ok(pending.includes(ledger.releaseBranch),'previously staged release must remain included');
 assert.ok(pending.includes('stage/seamless-multiplayer-token-movement-2026-11-08'),
  'new staged movement must join previous release work');
 assert.equal(new Set(pending).size,pending.length,'no staged branch should be duplicated');
 assert.ok(ledger.branches.filter(x=>x.name.startsWith('stage/live-qa-light-')||x.name.startsWith('stage/interactive-pins-')).every(x=>x.status==='released'));
 const ci=read('.github/workflows/verify-staged.yml');
 assert.doesNotMatch(ci,/supabase db push|supabase migration up|vercel deploy/);
});
