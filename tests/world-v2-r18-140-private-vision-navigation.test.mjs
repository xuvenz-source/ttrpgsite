import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditGameplayContracts} from
 '../staging/world-v2-b10-r18-139-gameplay-contract-gate-probe/GameplayContractAudit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const dir='staging/world-v2-b10-r18-140-private-vision-navigation/';
const sql=read(dir+'unapplied-private-vision-navigation-v3.sql');
const manifest=JSON.parse(read(dir+'manifest.json'));
const fixture=read('tests/world-v2-r18-140-postgres/setup-original-viewer-stubs.sql');
const verify=read('tests/world-v2-r18-140-postgres/verify-closed-vision-navigation.sql');
const runner=read('tests/world-v2-r18-140-postgres/run.sh');
const handoff=read('docs/testing/world-v2-r18-140-private-vision-navigation-2026-11-21.md');
const names=[
 'get_authorized_world_preview_v3',
 'get_authorized_world_preview_at_v3',
 'get_authorized_world_fog_delta_v3',
 'get_authorized_world_light_masks_v3',
 'get_authorized_world_navigation_v3'
];

test('R140 inherits exact 26 dynamic references and six R139 reviewed groups',()=>{
 const r=auditGameplayContracts({root});
 assert.equal(r.r138DynamicClassified,26);
 assert.equal(r.r139ExactCallsiteGroups,6);
 assert.equal(r.candidateBrowserGrantsAdded,0);
 assert.equal(manifest.parentPr,247);
 assert.equal(manifest.parentSha,'a5de4681558be7aceaec4060915137eb4f814df7');
});
test('R140 exactly five private definer + invoker stubs and explicit deny',()=>{
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_internal\./gm)||[]).length,5);
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_api\./gm)||[]).length,5);
 assert.equal((sql.match(/^REVOKE ALL ON FUNCTION forge_v3_internal\./gm)||[]).length,5);
 assert.equal((sql.match(/^REVOKE ALL ON FUNCTION forge_v3_api\./gm)||[]).length,5);
 assert.equal((sql.match(/LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''/gm)||[]).length,5);
 assert.equal((sql.match(/LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''/gm)||[]).length,5);
 assert.doesNotMatch(sql,/^\s*GRANT\s/mi);
 assert.doesNotMatch(sql,/^\s*(?:CREATE|ALTER)\s+(?:TABLE|POLICY|PUBLICATION)\b/mi);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION/i);
 for(const name of names){
  assert.ok(sql.includes('forge_v3_internal.'+name+'('),name);
  assert.ok(sql.includes('forge_v3_api.'+name+'('),name);
 }
 assert.match(sql,/R140 expected eight inherited plus five new API entries/);
 assert.match(sql,/R140 original signed role\/vision\/navigation authority absent/);
 assert.match(sql,/R140 old V2 shared scene channel still subscribable/);
 assert.match(sql,/R140 no experimental API can be callable by browser roles/);
 assert.match(sql,/R140 legacy public RPC schema reopened/);
});
test('R140 typed delegations use original actor-bound V2, not legacy fallbacks',()=>{
 for(const original of ['public.preview_world_visibility_v2(',
  'public.preview_world_visibility_at_v2(',
  'public.get_authorized_map_fog_delta(',
  'public.get_authorized_map_light_masks_v2(',
  'public.get_authorized_map_navigation('])
  assert.ok(sql.includes(original),original);
 assert.doesNotMatch(sql,/reply\s*:=\s*public\.get_authorized_map_fog\s*\(/);
 assert.doesNotMatch(sql,/reply\s*:=\s*public\.get_authorized_map_light_masks\s*\(/);
 assert.match(sql,/forge_world_v2\.viewer_on_map\(camp,p_map,p_viewer\)/);
 assert.match(sql,/public\.is_campaign_dm\(camp\)/);
 assert.match(sql,/reply->>'scope' IS DISTINCT FROM 'viewer'/);
 assert.match(sql,/p_base_epoch IS NULL AND/);
 assert.match(sql,/reply->>'baseSequence' IS DISTINCT FROM p_base_sequence::text/);
 assert.match(sql,/reply->>'mode'='noop'/);
 assert.match(sql,/reply->>'kind' IS DISTINCT FROM p_kind/);
 assert.ok((sql.match(/forge_scene_drain\.scene_v3_publish_allowed\(\)/g)||[]).length>=6);
 assert.ok((sql.match(/public\.get_authorized_scene_channel_v3\(p_map\)/g)||[]).length>=5);
});
test('R140 PG17 fixture and runner simulate scoped actors and assert denial',()=>{
 for(const term of ['R140 non-DM granted preview','R140 player crossed token/map authorization',
  'R140 outsider read cross-campaign gameplay','R140 revoked actor retained fresh server API access',
  'R140 temporary test GRANT escaped rollback','R140 partial fog base accepted',
  'R140 authorized fog noop mismatch','R140 owner tool navigation mismatch',
  'R140 fenced mode unexpectedly served gameplay'])
  assert.ok(verify.includes(term),term);
 for(const term of ['R138_ISOLATED','R140_ISOLATED','127.0.0.1','world_v2_r18_138',
  'r138_disposable_only','SUPABASE_SERVICE_ROLE_KEY',
  'verify-closed-vision-navigation.sql'])
  assert.ok(runner.includes(term),term);
 assert.match(runner,/tests\/world-v2-r18-138-postgres\/run\.sh/);
 assert.doesNotMatch(runner,/supabase\s+(?:link|db|deploy|migration)/);
 assert.match(fixture,/synthetic PG17 only/);
 assert.match(fixture,/REVOKE ALL ON FUNCTION public\.get_authorized_map_navigation/);
});
test('R140 ledger remains NO_GO and no hosted, app, production changes',()=>{
 assert.equal(manifest.workPackage,'B10-R18-140');
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.newGameplayFunctions,5);
 assert.equal(manifest.newBrowserCallableFunctions,0);
 assert.equal(manifest.totalProposedApiFunctions,13);
 assert.equal(manifest.signedDmP1P2OutsiderRealQa,false);
 assert.equal(manifest.realOriginalLosOrNavigationRun,false);
 for(const k of ['noHostedWrites','noApplicationSourceEdits','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources','noNewGrants','noDataApiExposure'])
  assert.equal(manifest[k],true,k);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const term of ['NO_GO','R18-140','R128','R132','R138','R139','DM',
  'P1','P2','outsider','fog','lighting','navigation','Storage',
  '17 Realtime','old socket','free-tier'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
});
