import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=x=>readFileSync(join(root,x),'utf8');
const live=read('tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql');
const benchmark=read('tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r05.sh');
const workflow=read('.github/workflows/world-v2-r18-54-fog-commit.yml');
const pinned=[
 ['forge_visibility.cross2','65c4bff8aaa6ecf38e335a44e95d874e'],
 ['forge_visibility.wall_passes','5c52255db93f2a9ed892e684dd11f898'],
 ['forge_visibility.ray_blocked','a9fc198168c29fd5d80041b05337017e'],
 ['forge_visibility.is_lit','cec916b326a14937ceee2e170619cca2'],
 ['forge_visibility.fog_cells_diff','0c477595f2fd916d3520a792bbe52cd7'],
 ['forge_visibility.viewers_affected_by_token_move','18ee8bd8e81d681dc22aecd50eb66425'],
 ['forge_visibility.bump_viewer_ticks','fead41e37dfd6e2fa30499829e24bd02'],
 ['forge_visibility.bump_tick_scoped','f75e231c06bef2912c9b013ea9735cdc'],
 ['forge_visibility.bump_tick','adfc0d91e3e7e6011b46a98d14c83ad9'],
 ['forge_visibility.authorized_viewer_fog_frame','ee3356af321fec1a3e167a75c6245e86'],
 ['forge_visibility.tick_tokens','f6c2eef860141bff253024e0f6d8c7ba'],
 ['forge_visibility.enforce_collision','7e652f0f2334980ccc724e1748d334ba'],
 ['forge_world_v2.commit_allows_piece_v2','7298cb6051ba259a9c5be1963e1a46a5']
];
test('R18-54 original exact 13 live SQL definitions and hashes are pinned',()=>{
 assert.equal((live.match(/^CREATE OR REPLACE FUNCTION /gm)||[]).length,13);
 for(const [name,digest] of pinned){
  assert.ok(live.includes('CREATE OR REPLACE FUNCTION '+name+'('),name);
  assert.ok(live.includes(digest),name+' digest missing');
  assert.ok(benchmark.includes(digest),name+' benchmark pin missing');
 }
 assert.equal((live.match(/SET search_path TO ''/g)||[]).length,13);
 assert.match(live,/R54 refuses non-fixture database or missing isolated test schema/);
});
test('R18-54 source-real benchmark executes signed Begin, Advance, Commit only',()=>{
 assert.match(benchmark,/public\.begin_world_motion_v2/);
 assert.match(benchmark,/public\.advance_world_motion_v2/);
 assert.match(benchmark,/public\.commit_world_motion_v2/);
 assert.match(benchmark,/forge_visibility\.authorized_viewer_fog_frame/);
 assert.match(benchmark,/forge_visibility\.bump_viewer_ticks/);
 assert.match(benchmark,/R54-09 original wall blocks unauthorized crossing/);
 assert.match(benchmark,/R54-10 revoked fixture viewer/);
 assert.match(benchmark,/r54_samples/);
 assert.match(benchmark,/percentile_cont\(0\.95\)/);
 assert.doesNotMatch(benchmark,/\bUPDATE\s+public\.map_tokens\b/i);
 assert.doesNotMatch(benchmark,/\b(DISABLE TRIGGER|TRUNCATE|ALTER SYSTEM|GRANT EXECUTE TO PUBLIC)\b/i);
});
test('R18-54 exact fog fixture is rollback-only and asserts full restoration',()=>{
 assert.match(benchmark,/^BEGIN;$/m);
 assert.match(benchmark,/^ROLLBACK;$/m);
 assert.match(benchmark,/R54-11 rollback removes fog functions\/triggers/);
 assert.match(benchmark,/current_database\(\)<>'world_v2_b10_r05'/);
 assert.match(benchmark,/pg_get_functiondef\(to_regprocedure\(row\.signature\)\)/);
 assert.match(benchmark,/forge_visibility_token_tick/);
 assert.match(benchmark,/forge_player_collision/);
});
test('R18-54 measures local fog-on and fog-off cost but NEVER promises production speed',()=>{
 assert.match(benchmark,/mode IN \('fog-off','fog-on'\)/);
 assert.match(benchmark,/iteration BETWEEN 1 AND 8/);
 assert.match(benchmark,/SELECT mode,count\(\*\) AS samples/);
 assert.match(benchmark,/viewer_delta/);
 assert.match(benchmark,/No authorized private sight or map geometry/);
 assert.doesNotMatch(benchmark,/\bCREATE\s+EXTENSION\b/i);
});
test('R18-54 runner limits source-real test to existing disposable R05 DB',()=>{
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOST/);
 assert.match(runner,/PGDATABASE/);
 assert.match(runner,/PGHOSTADDR/);
 const r42=runner.indexOf('authority-throughput-r18-42.sql');
 const r54=runner.indexOf('r54-fog-commit-source-real.sql');
 const r05=runner.indexOf('versioned-release-r05.sql');
 assert.ok(r42>=0&&r54>r42&&r05>r54);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:link|db\s+push|migration\s+repair)\b/i);
});
test('R18-54 GitHub workflow has ephemeral PG17 and no production secrets',()=>{
 assert.match(workflow,/image:\s*postgres:17/);
 assert.match(workflow,/WORLD_V2_B10_ISOLATED: 'yes'/);
 assert.match(workflow,/PGHOST: '127\.0\.0\.1'/);
 assert.match(workflow,/rehearse-r05\.sh/);
 assert.match(workflow,/timeout-minutes:\s*12/);
 assert.match(workflow,/contents: read/);
 assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN|service_role|migration repair|db push/);
});
