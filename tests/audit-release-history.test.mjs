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
test('the next release is the current draft while previously deployed fog stays recorded',()=>{
 const ledger=JSON.parse(read('staging/next-release-ledger.json'));
 assert.ok(ledger.branches.some(x=>
  x.name==='stage/project-audit-correctness-optimization-2026-11-07'&&
  x.status==='released'));
 const staged=ledger.upcomingRelease.outstandingBranches.find(x=>x.pullRequest===38);
 assert.ok(staged);
 assert.equal(staged.status,'staging-pending-live-test-rollout');
 assert.equal(staged.databaseDependencies.length,1);
 assert.equal(staged.databaseDependencies[0].status,'staged-not-applied');
 assert.equal(staged.databaseDependencies[0].requiresApproval,true);
 assert.match(staged.databaseDependencies[0].file,/inventory_lease_expiry_qualification\.sql$/);
 const ci=read('.github/workflows/verify-staged.yml');
 assert.doesNotMatch(ci,/supabase db push|supabase migration up|vercel deploy/);
});
