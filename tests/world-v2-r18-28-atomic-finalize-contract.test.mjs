import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const candidate=read('supabase/candidates/world_v2_r18_28_atomic_finalize.sql');
const suite=read('tests/world-v2-b10-postgres/atomic-finalize-r18-28.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r18-22.sh');
const sha=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0')
 .update(source).digest('hex');

test('R18-28 does not alter the six previously reviewed SQL sources',()=>{
 const frozen=new Map([
  ['supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql',
   'f4e296725c09055685321726cbe4bc6e09dbce5a'],
  ['supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql',
   'c78998da8a9013591f2bb479cca4b222f41ef2d7'],
  ['supabase/candidates/world_v2_r18_19_cross_map_guard.sql',
   '55db7e6b6839d1d8b489203baa11c99264648a55'],
  ['supabase/candidates/world_v2_r18_20_campaign_affinity.sql',
   '3980808966ec56ad74120bc4f737c78ddd2056bb'],
  ['supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql',
   '57522d2d801ca69c92a136c5c915c58101644e51'],
  ['supabase/candidates/world_v2_r18_27_commit_empty_work.sql',
   'bbc2dcf4c770ce857845691c80bd2c11418c3d77']
 ]);
 for(const [path,expected] of frozen)assert.equal(sha(read(path)),expected,path);
});
test('R18-28 only adds two private actor receipt fields and one narrow new public RPC',()=>{
 const sql=candidate.replace(/^--.*$/gm,'');
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.match(sql,/ALTER TABLE forge_world_v2\.motion_sessions\s+ADD COLUMN final_request_r28 jsonb,\s+ADD COLUMN final_reply_r28 jsonb/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.finalize_world_motion_v2\(/);
 assert.match(sql,/RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER\s+SET search_path TO ''/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bCREATE TABLE\b|\bCREATE TRIGGER\b|\bCREATE INDEX\b/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.finalize_world_motion_v2\([\s\S]+?FROM PUBLIC,anon,authenticated;/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.finalize_world_motion_v2\([\s\S]+?TO authenticated;/);
 assert.doesNotMatch(sql,/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON/i);
});
test('R18-28 chains exact already-authorized Advance then Commit, no endpoint argument',()=>{
 assert.match(candidate,/advanced:=public\.advance_world_motion_v2\(/);
 assert.match(candidate,/endpoint:=advanced->'accepted'->last_accepted/);
 assert.match(candidate,/canonical:=public\.commit_world_motion_v2\(/);
 assert.ok(candidate.indexOf('advanced:=public.advance_world_motion_v2(')<
  candidate.lastIndexOf('canonical:=public.commit_world_motion_v2('));
 assert.match(candidate,/jsonb_array_length\(advanced->'accepted'\)<1/);
 assert.match(candidate,/p_targets\) NOT BETWEEN 1 AND 8/);
 assert.match(candidate,/p_seq NOT BETWEEN 1 AND 9223372036854775806/);
 assert.match(candidate,/forge_world_v2\.session_valid\(s\) IS DISTINCT FROM true/);
 assert.match(candidate,/WHERE id=p_session AND actor_id=auth\.uid\(\) FOR UPDATE/);
 assert.match(candidate,/s\.mode='preview'/);
 assert.doesNotMatch(candidate,/p_endpoint\b/);
});
test('R18-28 failures rollback one nested transaction and do not produce a local unapproved ACK',()=>{
 assert.match(candidate,/BEGIN\s+advanced:=public\.advance_world_motion_v2/);
 assert.match(candidate,/RAISE EXCEPTION 'R28 canonical Commit denied'\s+USING ERRCODE='PZ828'/);
 assert.match(candidate,/EXCEPTION WHEN SQLSTATE 'PZ828' THEN/);
 assert.match(candidate,/RETURN NULL;/);
 assert.match(candidate,/UPDATE forge_world_v2\.motion_sessions\s+SET final_request_r28=fingerprint,final_reply_r28=combined/);
 assert.match(candidate,/WHERE id=p_session AND actor_id=auth\.uid\(\)\s+AND status='committed' AND last_seq=p_seq\+1/);
});
test('R18-28 idempotency is exact input-bound and reauthorizes the original Commit retry',()=>{
 assert.match(candidate,/'seq',p_seq,'from',p_from,'targets',p_targets/);
 assert.match(candidate,/s\.final_request_r28 IS DISTINCT FROM fingerprint/);
 assert.match(candidate,/s\.final_reply_r28 IS NULL/);
 assert.match(candidate,/clock_timestamp\(\)>s\.expires_at/);
 assert.match(candidate,/canonical:=public\.commit_world_motion_v2\(\s*p_session,p_seq\+1,endpoint/);
 assert.match(candidate,/RETURN s\.final_reply_r28/);
});
test('R18-28 integrated test covers actor replay, blocked prefix, queued privacy and canonical failure',()=>{
 for(const word of [
  'authenticated-only final RPC',
  'wrong actor cannot finalize',
  'atomically move token',
  'identical final retry',
  'changed target, origin or revision',
  'mounted-tool canonical checkpoint',
  'private observer drain',
  'blocked multi-cell final batch',
  'wholly blocked final step',
  'mismatched permission generation',
  'failed canonical write cannot persist',
  'new public entrypoint cannot grant',
  'new RPC, retry fields',
  'cached final ACK revoked after permission generation change'
 ]) assert.ok(suite.includes(word),word);
 for(let i=1;i<=16;i++)assert.ok(suite.includes('R28-'+String(i).padStart(2,'0')));
 assert.match(suite,/ROLLBACK;/);
 assert.match(suite,/\bBEGIN;/);
 assert.ok(runner.indexOf('ordered-stack-r18-22.sql')<
  runner.indexOf('step-bbox-r18-26.sql'));
 assert.ok(runner.indexOf('step-bbox-r18-26.sql')<
  runner.indexOf('commit-empty-r18-27.sql'));
 assert.ok(runner.indexOf('commit-empty-r18-27.sql')<
  runner.indexOf('atomic-finalize-r18-28.sql'));
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGDATABASE:-/);
});
test('R18-28 no frontend calls new server RPC without a separately reviewed client protocol',()=>{
 const transport=read('src/engine/v2/AuthorityClient.js');
 const controller=read('src/engine/v2/MovementController.js');
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 for(const src of [transport,controller,runtime])
  assert.equal(src.includes('finalize_world_motion_v2'),false);
 assert.match(transport,/commit_world_motion_v2/);
 assert.match(transport,/advance_world_motion_v2/);
});
