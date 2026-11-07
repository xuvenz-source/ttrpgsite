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
 assert.equal(ledger.releaseBranch,'stage/next-release-consolidated-2026-11-08');
 assert.deepEqual(ledger.lastRelease.approvedPullRequests,[38,39]);
 assert.equal(ledger.lastRelease.databaseDependencies.length,2);
 assert.ok(ledger.lastRelease.databaseDependencies.every(item=>item.status==='release-approved'));
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,0);
 assert.ok(ledger.branches.filter(x=>x.name.startsWith('stage/live-qa-light-')||x.name.startsWith('stage/interactive-pins-')).every(x=>x.status==='released'));
 const ci=read('.github/workflows/verify-staged.yml');
 assert.doesNotMatch(ci,/supabase db push|supabase migration up|vercel deploy/);
});
