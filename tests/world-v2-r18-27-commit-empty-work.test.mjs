import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql');
const candidate=read('supabase/candidates/world_v2_r18_27_commit_empty_work.sql');
const suite=read('tests/world-v2-b10-postgres/commit-empty-r18-27.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r18-22.sh');
const source='CREATE OR REPLACE FUNCTION public.commit_world_motion_v2(';
function commitSection(sql){
 const start=sql.indexOf(source);
 assert.ok(start>=0);
 const end=sql.indexOf('END $$;',start);
 assert.ok(end>start);
 return sql.slice(start,end+'END $$;'.length);
}
function gitBlob(s){
 return createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0')
 .update(s).digest('hex');
}
test('R18-27 freezes original R05 migration and all previous staged SQL packages',()=>{
 const pinned=new Map([
  ['supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql',
  'f4e296725c09055685321726cbe4bc6e09dbce5a'],
  ['supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql',
  'c78998da8a9013591f2bb479cca4b222f41ef2d7'],
  ['supabase/candidates/world_v2_r18_19_cross_map_guard.sql',
  '55db7e6b6839d1d8b489203baa11c99264648a55'],
  ['supabase/candidates/world_v2_r18_20_campaign_affinity.sql',
  '3980808966ec56ad74120bc4f737c78ddd2056bb']
 ]);
 for(const [path,expected] of pinned)
  assert.equal(gitBlob(read(path)),expected,path);
});
test('R18-27 replaces only exact Commit source with four audited empty-work guards',()=>{
 let patched=commitSection(migration);
 const gate=(oldText,newText)=>{
  assert.equal(patched.split(oldText).length,2,'missing unique original block');
  patched=patched.replace(oldText,newText);
 };
 const retry=`  BEGIN
   PERFORM forge_world_v2.drain_committed_observers_b08(s.id);
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'B08 observer terminal drain deferred';
  END;`;
 gate(retry,`  -- R18-27: No private observer session row means there is nothing to
  -- drain. The same locked session and original helper handle any queue.
  IF EXISTS (SELECT 1 FROM forge_world_v2.observer_pending_b07
    WHERE session_id=s.id) THEN
${retry}
  END IF;`);
 const normal=` BEGIN
  PERFORM forge_world_v2.drain_committed_observers_b08(s.id);
 EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'B08 observer terminal drain deferred';
 END;`;
 gate(normal,` -- R18-27: Nothing is emitted when no private queue row exists.
 -- On actual queued hides/path frames, execute the EXACT original helper.
 IF EXISTS (SELECT 1 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=s.id) THEN
${normal}
 END IF;`);
 const token=` UPDATE public.map_tokens tok SET x=tok.x+s.last_x-s.origin_x,
  y=tok.y+s.last_y-s.origin_y
 WHERE tok.id=ANY(token_ids) AND tok.map_id=s.map_id
  AND tok.campaign_id=s.campaign_id;`;
 gate(token,` -- R18-27: do not issue a 0-row UPDATE for a tool-only gesture.
 -- No permission check or checkpoint condition is skipped for tokens.
 IF cardinality(token_ids)>0 THEN
${token}
 END IF;`);
 const tool=` UPDATE public.campaign_tool_issues tool SET
  x=tool.x+s.last_x-s.origin_x,
  y=tool.y+s.last_y-s.origin_y
 WHERE tool.id=ANY(tool_ids) AND tool.map_id=s.map_id
  AND tool.campaign_id=s.campaign_id;`;
 gate(tool,` -- R18-27: do not issue a 0-row UPDATE for a token-only gesture.
 IF cardinality(tool_ids)>0 THEN
${tool}
 END IF;`);
 assert.equal(commitSection(candidate),patched,
  'Complete function must be byte-identical to frozen R05 after ONLY four guarded insertions');
});
test('R18-27 preserves all three revocation checks and signed position lock authority',()=>{
 const c=commitSection(candidate);
 assert.equal((c.match(/forge_world_v2\.session_valid\(s\)/g)||[]).length,3);
 assert.match(c,/WHERE id=p_session AND actor_id=auth\.uid\(\) FOR UPDATE/);
 assert.match(c,/ORDER BY id FOR UPDATE/);
 assert.match(c,/FOR step IN SELECT value FROM jsonb_array_elements\(s\.accepted_steps\)/);
 assert.match(c,/forge_world_v2\.step_allowed\(/);
 assert.match(c,/INSERT INTO forge_world_v2\.commit_checkpoints\(/);
 assert.match(c,/DELETE FROM forge_world_v2\.commit_checkpoints/);
 assert.match(c,/last_commit_request_b08/);
 assert.match(c,/expires_at=clock_timestamp\(\)\+interval '10 seconds'/);
 assert.doesNotMatch(c,/\bGRANT\b|\bREVOKE\b|\bTRUNCATE\b|\bDROP\b|\bALTER\b/i);
});
test('R18-27 source maintains exact security definer, schema and RPC signature',()=>{
 const body=commitSection(candidate);
 assert.match(body,/^CREATE OR REPLACE FUNCTION public\.commit_world_motion_v2\(/);
 assert.match(body,/RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''/);
 assert.equal((candidate.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.doesNotMatch(candidate.replace(/^--.*$/gm,''),/\bGRANT\b|\bREVOKE\b|\bCREATE TABLE\b|\bCREATE INDEX\b/i);
});
test('R18-27 combined suite is isolated and after R05, wall, map, affinity and R26',()=>{
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOST/);
 assert.match(runner,/PGDATABASE/);
 const script='commit-empty-r18-27.sql';
 assert.ok(runner.indexOf('ordered-stack-r18-22.sql')<
  runner.indexOf('step-bbox-r18-26.sql'));
 assert.ok(runner.indexOf('step-bbox-r18-26.sql')<
  runner.indexOf(script));
 assert.ok(suite.indexOf('BEGIN;')<
  suite.indexOf('world_v2_r18_27_commit_empty_work.sql'));
 assert.ok(suite.indexOf('ROLLBACK;')>
  suite.indexOf('world_v2_r18_27_commit_empty_work.sql'));
 assert.match(suite,/pg_get_functiondef/);
 assert.match(suite,/drain_reference_r18_27/);
 assert.match(suite,/commit_reference_r18_27/);
 for(let n=1;n<=13;n++)assert.ok(
  suite.includes('R27-'+String(n).padStart(2,'0')),
  'missing test R27-'+n);
});
test('R18-27 authentic no-empty shortcut does not bypass queued private hides or actor ownership',()=>{
 assert.match(suite,/SELECT call_count INTO calls FROM pg_temp\.r27_drain_calls/);
 assert.match(suite,/calls=1/);
 assert.match(suite,/VALUES\(sid,other,test_map,campaign,actor,1,1,/);
 assert.match(suite,/action','hide'/);
 assert.match(suite,/NOT is_private/);
 assert.match(suite,/request\.jwt\.claim\.sub/);
 assert.match(suite,/other actor cannot commit/);
 assert.match(suite,/changed replay cannot reuse ACK/);
 assert.match(suite,/original private schema restrictions/);
 assert.doesNotMatch(suite,/SUPABASE_DB_URL|http:\/\/|https:\/\//);
});
