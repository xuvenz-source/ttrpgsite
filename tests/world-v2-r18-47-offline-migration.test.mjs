import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {validateR47OfflinePackage} from '../scripts/release/validate-world-v2-r18-47-offline-package.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(join(root,'staging/world-v2-b10-r18-47-isolated-pending/manifest.json'),'utf8'));
const mutate=(edit)=>{const m=structuredClone(manifest);edit(m);return m};
const fails=(edit,why)=>assert.throws(
 ()=>validateR47OfflinePackage({repoRoot:root,manifest:mutate(edit)}),
 /R47 NO-GO:/,why);
test('R18-47 exact 9 official Supabase CLI v2.81.3 filenames are staged OFF active migrations path',()=>{
 const report=validateR47OfflinePackage({repoRoot:root});
 assert.equal(report.decision,'NO_GO');
 assert.equal(report.safeToApply,false);
 assert.equal(report.cliGenerated,9);
 assert.equal(report.reviewedSourceBlobs,9);
 assert.equal(report.excludedPerformanceFromApproval,2);
 assert.equal(report.sourceRunId,43350078071);
});
test('R18-47 refuses any CLI version, project, live count or authorization drift',()=>{
 fails(m=>m.officialCli.version='3.1.0','CLI version');
 fails(m=>m.officialCli.linked=true,'linked unexpectedly');
 fails(m=>m.live.appliedCount=84,'unseen history');
 fails(m=>m.live.verifiedRemoteContentDigests=82,'SQL digests');
 fails(m=>m.live.projectRef='wrong','wrong project');
 fails(m=>m.releaseDecision='GO','unsafe promotion');
 fails(m=>m.neverPushFromRepoRoot=false,'repository-root push');
});
test('R18-47 rejects changed generated version identity, order and historical SQL source',()=>{
 fails(m=>m.packages[2].filename='20261113021011_r47_cross_map_collision_guards.sql','CLI timestamp mismatch');
 fails(m=>m.packages.reverse(),'reordered backend scripts');
 fails(m=>m.packages[6].gitBlobSha='0000000000000000000000000000000000000000','SQL source mutation');
 fails(m=>m.packages[8].source=m.packages[7].source,'dependency overlaid');
 fails(m=>m.packages.pop(),'incomplete package');
});
test('R18-47 never silently promotes mixed-performance R18-26/27 candidates',()=>{
 assert.equal(manifest.packages[4].gate,'performance_no_go');
 assert.equal(manifest.packages[5].gate,'performance_no_go');
 fails(m=>m.packages[4].gate='required','bbox optimization prematurely included');
 fails(m=>m.packages[5].gate='required','empty-work commit prematurely included');
 fails(m=>m.releaseBlockers=[],'unmet reviewer gates hidden');
});
test('R18-47 CLI generation is credential-free and cannot apply or link a remote database',()=>{
 const sh=readFileSync(join(root,'scripts/release/generate-world-v2-r18-47-offline-cli-shells.sh'),'utf8');
 for(const item of ['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','DATABASE_URL',
  'SUPABASE_PROJECT_ID','GITHUB_ACTIONS','RUNNER_TEMP',
  'npx --yes supabase@2.81.3 migration new','supabase@2.81.3 --version'])
  assert.ok(sh.includes(item),item);
 assert.doesNotMatch(sh,/^\s*(?:supabase|npx\s+supabase)\s+(?:db\s+push|migration\s+(?:up|repair)|link|login)\b/m);
 assert.match(sh,/R47_OFFICIAL_MANIFEST/);
});
test('R18-47 histories are not silently rewritten and verified production baseline is retained',()=>{
 const previous=JSON.parse(readFileSync(join(root,'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
 assert.equal(previous.originalMigrationVersionCount,83);
 assert.equal(previous.rows.length,83);
 assert.equal(previous.expectedNewestVersion,'20261109171247');
 assert.equal(previous.targetVersionAbsent,true);
 const seen=new Set(previous.rows.map(x=>x.version));
 assert.equal(seen.size,83);
 assert.equal(seen.has('20261111023204'),false);
 assert.equal(seen.has('20261113021005'),false);
});
