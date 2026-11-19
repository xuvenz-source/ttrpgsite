import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const manifest=JSON.parse(read('staging/world-v2-b10-r18-124-server-access/manifest.json'));
const patch=read('staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql');
const setup=read('tests/world-v2-r18-124-postgres/setup.sql');
const before=read('tests/world-v2-r18-124-postgres/verify-before.sql');
const after=read('tests/world-v2-r18-124-postgres/verify-after.sql');
const runner=read('tests/world-v2-r18-124-postgres/run.sh');

test('R124 is parent-pinned, staging-only, and explicitly NO_GO',()=>{
 assert.equal(manifest.workPackage,'B10-R18-124');
 assert.equal(manifest.parentPr,230);
 assert.equal(manifest.parentSha,'a016b57380d68978ce1774ee17e2caccf1f02694');
 assert.equal(manifest.originalMigrationCountObserved,83);
 assert.equal(manifest.qaMigrationCountObserved,0);
 assert.equal(manifest.qaPublicApplicationTableCountObserved,0);
 assert.equal(manifest.decision,'NO_GO');
 for(const f of ['noLiveSourceChanges','noVersionedMigration','noHostedSqlWrites',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[f],true);
 assert.equal(manifest.productionReleaseAuthorized,false);
});
test('R124 reuses the R115 UNAPPLIED membership SQL rather than a new migration',()=>{
 assert.match(patch,/SOURCE-ONLY SECURITY CANDIDATE/);
 assert.match(patch,/p_campaign uuid,p_source text,p_source_id uuid/);
 assert.match(patch,/not exists\([\s\S]+public\.campaign_members m/);
 assert.match(patch,/m\.campaign_id=p_campaign and m\.user_id=actor/);
 assert.match(patch,/REVOKE ALL ON FUNCTION public\.can_edit_campaign_sheet/);
 assert.match(runner,/r18-115-revocation-guard\/unapplied-campaign-membership-required\.sql/);
});
test('R124 first reproduces original revoked owner gap in a synthetic privileged caller',()=>{
 assert.match(setup,/CREATE FUNCTION public\.can_edit_campaign_sheet/);
 assert.match(setup,/c\.user_id=actor OR public\.is_campaign_dm/);
 assert.match(setup,/CREATE FUNCTION public\.synthetic_sheet_edit_guard/);
 assert.match(setup,/REVOKE ALL ON public\.campaigns/);
 assert.match(before,/DELETE FROM public\.campaign_members/);
 assert.match(before,/original revoked-owner gap not reproduced/);
});
test('R124 post-patch SQL verifies revocation, other DM, null actor, reinstatement',()=>{
 for(const term of ['revoked sheet owner','valid DM rights','outsider DM',
  'null identity','reinstated character owner','non-DM player'])
  assert.ok(after.includes(term),term);
 assert.match(after,/SET LOCAL ROLE authenticated/);
 assert.match(after,/IS DISTINCT FROM true/);
});
test('R124 scratch runner cannot connect to a hosted Supabase or remote database',()=>{
 for(const term of ['GITHUB_ACTIONS','R124_ISOLATED','127.0.0.1',
 'world_v2_r18_124','r124_disposable_only','SUPABASE_URL',
 'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','PGHOSTADDR','PGOPTIONS'])
  assert.ok(runner.includes(term),term);
 assert.match(runner,/permission denied for function/);
 assert.match(runner,/permission denied for table/);
 assert.doesNotMatch(runner,/\bsupabase\s+(db|migration|link|deploy)\b/);
});
test('R124 does not falsely certify connected Realtime or previously signed URLs',()=>{
 const s=manifest.surfaces;
 for(const f of ['movement','fog','sheets','storage','realtime'])
  assert.ok(s[f]?.finding.length>40,f);
 assert.equal(s.sheets.hostedPatchApplied,false);
 assert.equal(s.storage.previouslyIssuedBearerUrlsRevoked,false);
 assert.equal(s.realtime.existingConnectedChannelRevocationVerified,false);
 assert.equal(manifest.originalPrivateMigrationBodiesFullyReviewed,false);
 assert.equal(manifest.allPrivilegedRpcsReviewed,false);
 assert.equal(manifest.signedDmP1P2OutsiderQaPassed,false);
 assert.equal(manifest.isolatedPackage.originalHostedSqlTested,false);
 assert.equal(manifest.isolatedPackage.actualHostedPrivilegedRpcTested,false);
});
test('R124 changes do not claim hot-path polling or server-stream cutoffs',()=>{
 const doc=read('docs/testing/world-v2-r18-124-server-enforcement-2026-11-19.md');
 assert.match(doc,/Do not add a membership network call to each movement event or frame/i);
 assert.match(doc,/already-connected/i);
 assert.match(doc,/NO_GO/);
});
