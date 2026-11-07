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
test('audit release remains a draft staging branch with no paid or automatic SQL deployment',()=>{
 const ledger=JSON.parse(read('staging/next-release-ledger.json'));
 const staged=ledger.upcomingRelease.outstandingBranches.find(x=>x.pullRequest===37);
 assert.ok(staged);
 assert.equal(staged.status,'staging-verified-not-deployed');
 assert.deepEqual(staged.databaseDependencies,[]);
 const ci=read('.github/workflows/verify-staged.yml');
 assert.doesNotMatch(ci,/supabase db push|supabase migration up|vercel deploy/);
});
