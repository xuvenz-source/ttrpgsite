import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const candidate=read('tests/world-v2-b10-postgres/r55-dirty-fog-candidate.sql');
const fixture=read('tests/world-v2-b10-postgres/r55-dirty-fog-prototype.sql');
const r54=read('tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r05.sh');
const workflow=read('.github/workflows/world-v2-r18-54-fog-commit.yml');

test('R18-55 prototype executes only in disposable R05 PG17 sandbox, never production',()=>{
 assert.match(candidate,/current_database\(\)<>'world_v2_b10_r05'/);
 assert.match(candidate,/R55 candidate refused outside source-real local fixture/);
 assert.match(fixture,/current_database\(\)<>'world_v2_b10_r05'/);
 assert.match(fixture,/^BEGIN;$/m);
 assert.match(fixture,/^ROLLBACK;$/m);
 assert.match(fixture,/R55-19 all prototype functions\/tables\/roles\/positions rolled back/);
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOSTADDR/);
 assert.doesNotMatch(candidate+fixture+runner,/\bsupabase\s+(?:db\s+push|migration\s+repair|link)\b/i);
});
test('R18-55 keeps original source-real canonical Commit and collision authority',()=>{
 assert.match(fixture,/\\i tests\/world-v2-b10-postgres\/r54-live-fog-function-sources.sql/);
 assert.match(fixture,/forge_player_collision/);
 assert.match(fixture,/forge_visibility_token_tick/);
 assert.match(fixture,/public\.begin_world_motion_v2/);
 assert.match(fixture,/public\.advance_world_motion_v2/);
 assert.match(fixture,/public\.commit_world_motion_v2/);
 assert.match(fixture,/R55-16 original wall\/collision authority preserved/);
 assert.doesNotMatch(fixture,/\bUPDATE public\.map_tokens\b/i);
 assert.doesNotMatch(candidate,/\b(DISABLE TRIGGER|DROP TRIGGER|GRANT EXECUTE|ALTER TABLE public\.map_tokens)\b/i);
});
test('R18-55 invalidates all affected recipient frames inside Commit, no private cells on wire',()=>{
 assert.match(candidate,/authorized_frame=NULL/);
 assert.match(candidate,/frame='\{\}'::jsonb/);
 assert.match(candidate,/ON CONFLICT\(map_id,user_id\) DO UPDATE/);
 assert.match(candidate,/ORDER BY cm\.user_id LIMIT 32/);
 assert.match(candidate,/p_viewers IS NULL OR cm\.user_id=ANY\(p_viewers\)/);
 assert.match(fixture,/R55-07 dirty Commit synchronously scrubs/);
 assert.match(fixture,/R55-08 independent viewer cannot read old/);
 assert.match(fixture,/R55-09 second legal motion remains pending\/dirty/);
});
test('R18-55 never trusts a supplied recipient or mere authenticated role for private recovery',()=>{
 assert.match(candidate,/DECLARE actor uuid:=auth\.uid\(\)/);
 assert.match(candidate,/current_setting\('request\.jwt\.claim\.role',true\)<>'authenticated'/);
 assert.match(candidate,/cm\.role='player'/);
 assert.match(candidate,/coalesce\(pm\.map_id,c\.active_map_id\)=m\.id/);
 assert.match(candidate,/r55_try_authorized_frame\(p_map\)/);
 assert.match(candidate,/r55_source_full_bump_viewer_ticks/);
 assert.match(candidate,/pg_advisory_xact_lock/);
 assert.doesNotMatch(candidate,/r55_refresh_for_caller\(p_map uuid,\s*p_viewer uuid/);
 assert.match(fixture,/R55-14 unrelated actor cannot request someone else/);
 assert.match(fixture,/R55-18 postrevocation fresh reads fail closed/);
});
test('R18-55 prevents duplicate refresh or stale frame replay under sequential moves',()=>{
 assert.match(fixture,/R55-11 idempotent same-viewer refresh/);
 assert.match(fixture,/R55-12 duplicate refresh does not re-publish/);
 assert.match(fixture,/R55-13 second player receives distinct current authorized fog/);
 assert.match(candidate,/\(frame->>'revision'\)::bigint IS DISTINCT FROM revision_now/);
 assert.match(candidate,/\(frame->>'protocolVersion'\) IS DISTINCT FROM '2'/);
 assert.match(candidate,/EXCEPTION WHEN others THEN/);
 assert.match(fixture,/R55-15 exactly 8\+8 original\/candidate/);
 assert.match(fixture,/r55_refresh_samples/);
 assert.match(fixture,/p50_commit_plus_refresh_ms/);
 assert.match(fixture,/mean_commit_plus_refresh_ms/);
});
test('R18-55 prototype adds no public privileged API or browser role grants',()=>{
 assert.match(candidate,/REVOKE ALL ON FUNCTION forge_visibility\.r55_refresh_for_caller\(uuid\)/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION forge_visibility\.r55_try_authorized_frame\(uuid\)/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION forge_visibility\.r55_source_full_bump_viewer_ticks/);
 assert.match(fixture,/NOT has_schema_privilege\('authenticated','forge_visibility','USAGE'\)/);
 assert.doesNotMatch(candidate,/CREATE OR REPLACE FUNCTION public\./i);
 assert.doesNotMatch(candidate,/pg_notify\(|realtime\.send\(|realtime\.broadcast_changes\(/i);
});
test('R18-55 maintains existing R54 and R05 guards, runs before release rehearsal',()=>{
 const a=runner.indexOf('authority-throughput-r18-42.sql');
 const b=runner.indexOf('r54-fog-commit-source-real.sql');
 const c=runner.indexOf('r55-dirty-fog-prototype.sql');
 const d=runner.indexOf('versioned-release-r05.sql');
 assert.ok(a>=0&&a<b&&b<c&&c<d);
 assert.match(r54,/R54-11 rollback removes fog functions\/triggers/);
 assert.match(workflow,/tests\/world-v2-b10-postgres\/r55-\*/);
 assert.match(workflow,/image:\s*postgres:17/);
 assert.match(workflow,/PGHOST: '127\.0\.0\.1'/);
 assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN|service_role/);
});
