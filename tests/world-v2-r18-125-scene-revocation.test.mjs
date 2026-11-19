import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-125-private-scene-revocation/';
const m=JSON.parse(read(base+'manifest.json'));
const sql=read(base+'unapplied-scene-v3-prototype.sql');
const fixture=read('tests/world-v2-r18-125-postgres/setup.sql');
const verify=read('tests/world-v2-r18-125-postgres/verify-contract.sql');
const runner=read('tests/world-v2-r18-125-postgres/run.sh');
const sceneClient=read('src/engine/v2/SceneTransport.js');
const signing=read('src/SignedAssetUrls.js');
const handoff=read('docs/testing/world-v2-r18-125-private-scene-revocation-2026-11-19.md');

test('R125 is parent pinned, unapplied and held at release NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-125');
 assert.equal(m.parentPr,232);
 assert.equal(m.parentSha,'7de314357be6aa1c5ac11df6a0956443600bf453');
 assert.equal(m.decision,'NO_GO');
 for(const key of ['noHostWrites','noSourceRuntimeChanges','noVersionedMigrations',
   'noMerge','noDeploy','noPaidResources'])
  assert.equal(m[key],true,key);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.equal(m.prototype.originalSharedSceneV2SenderDisabled,false);
 assert.equal(m.prototype.actualRealtimeMessagesPolicyInstalled,false);
 assert.equal(m.prototype.actualClientSceneV3HookMounted,false);
});
test('current V2 client and artwork issuer remain unchanged and exposed to their known windows',()=>{
 assert.match(sceneClient,/forge-world-scene-v2:/);
 assert.match(sceneClient,/config:\{private:true/);
 assert.match(signing,/createSignedUrl\(path,3600\)/);
 assert.match(signing,/e\.listeners\.size>0\)void load\(e\)/);
 assert.equal(m.sourceReadOnlyAudit.originalSignedAssetUrlTtlSeconds,3600);
 assert.equal(m.prototype.signedUrlsRevoked,false);
 assert.match(handoff,/a new V3 policy alone does not revoke/i);
});
test('prototype epochs are scoped to live membership and map and are cascaded on deletion',()=>{
 assert.match(sql,/CREATE TABLE forge_scene_revoke\.member_scene_epochs/);
 assert.match(sql,/PRIMARY KEY\(campaign_id,map_id,user_id\)/);
 assert.match(sql,/REFERENCES public\.campaign_members\(campaign_id,user_id\) ON DELETE CASCADE/);
 assert.match(sql,/REFERENCES public\.battle_maps\(campaign_id,id\) ON DELETE CASCADE/);
 assert.match(sql,/DEFAULT pg_catalog\.gen_random_uuid\(\)/);
 assert.match(sql,/ALTER TABLE forge_scene_revoke\.member_scene_epochs ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON forge_scene_revoke\.member_scene_epochs/);
});
test('only signed current members can request their own map-bound new topic',()=>{
 assert.match(sql,/CREATE FUNCTION public\.get_authorized_scene_channel_v3\(p_map uuid\)/);
 assert.match(sql,/actor uuid:=auth\.uid\(\)/);
 assert.match(sql,/cm\.user_id=actor/);
 assert.match(sql,/FOR SHARE/);
 assert.match(sql,/public\.can_view_campaign_map\(camp,p_map\)/);
 assert.match(sql,/ON CONFLICT\(campaign_id,map_id,user_id\)/);
 assert.match(sql,/forge-world-scene-v3:/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.get_authorized_scene_channel_v3\(uuid\)/);
});
test('recipient receive policy predicate is strict, no public raw epoch or server resolver',()=>{
 assert.match(sql,/CREATE FUNCTION forge_scene_revoke\.can_receive_scene_topic_v3\(p_topic text\)/);
 assert.match(sql,/viewer_id IS DISTINCT FROM auth\.uid\(\)/);
 assert.match(sql,/l\.epoch=topic_epoch/);
 assert.match(sql,/public\.can_view_campaign_map\(l\.campaign_id,l\.map_id\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION forge_scene_revoke\.can_receive_scene_topic_v3\(text\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION forge_scene_revoke\.current_recipient_scene_topic_v3/);
 assert.doesNotMatch(sql,/PERFORM realtime\.send\(/);
 assert.doesNotMatch(sql,/CREATE POLICY\s+/i);
});
test('trusted future sender checks fresh member, map and server lease, with no client broadcast',()=>{
 assert.match(sql,/CREATE FUNCTION forge_scene_revoke\.current_recipient_scene_topic_v3/);
 assert.match(sql,/cm\.user_id=p_viewer/);
 assert.match(sql,/forge_world_v2\.viewer_on_map\(camp,p_map,p_viewer\)/);
 assert.match(sql,/FOR SHARE/);
 assert.equal(m.prototype.authorizedRoomPublisherInstalled,false);
 assert.equal(m.prototype.realtimeExistingChannelEjectionAchieved,false);
});
test('synthetic SQL exercises removed/reinstated, outsider, P2 and DM separation',()=>{
 for(const term of ['current_recipient_scene_topic_v3','reinstated P1',
  'member deletion','null actor','outsider','moved P1','could join P1',
  'revoked stream epoch','legacy map-wide topic'])
  assert.ok(verify.includes(term),term);
 assert.match(verify,/IS DISTINCT FROM false/);
 assert.match(verify,/IS DISTINCT FROM true/);
 assert.match(fixture,/CREATE ROLE authenticated NOLOGIN/);
 assert.match(fixture,/CREATE FUNCTION public\.can_view_campaign_map/);
 assert.match(fixture,/CREATE FUNCTION forge_world_v2\.viewer_on_map/);
});
test('scratch PG17 runner rejects remote config and checks ACL failures',()=>{
 for(const term of ['GITHUB_ACTIONS','R125_ISOLATED','127.0.0.1',
   'world_v2_r18_125','r125_disposable_only','SUPABASE_URL',
   'SUPABASE_SERVICE_ROLE_KEY','PGHOSTADDR','PGOPTIONS'])
  assert.ok(runner.includes(term),term);
 assert.match(runner,/anon-create-topic/);
 assert.match(runner,/auth-read-epoch-table/);
 assert.match(runner,/auth-call-server-publisher/);
 assert.match(runner,/anon-call-private-predicate/);
 assert.doesNotMatch(runner,/supabase (?:db|link|migration|deploy)/);
});
test('security handoff preserves old channel and signed URL release blockers',()=>{
 for(const term of ['shared V2 scene','already-connected','signed Storage',
  'old V2','NO_GO','83 private','67 privileged','no per-movement'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
 assert.equal(m.verification.signedDmP1P2OutsiderRealHostedTestsComplete,false);
 assert.equal(m.verification.privilegedAuthenticatedRpcReviewComplete,false);
});
