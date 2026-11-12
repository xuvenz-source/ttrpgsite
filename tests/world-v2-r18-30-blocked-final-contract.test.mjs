import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMovementController,validAtomicFinalizationAck}
 from '../src/engine/v2/MovementController.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const original=read('supabase/candidates/world_v2_r18_28_atomic_finalize.sql');
const candidate=read('supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql');
const suite=read('tests/world-v2-b10-postgres/blocked-final-r18-30.sql');
const crossLayer=read('tests/world-v2-b10-postgres/verify-blocked-final-r18-30.mjs');
const runner=read('tests/world-v2-b10-postgres/rehearse-r18-22.sh');
const blob=value=>createHash('sha1')
 .update('blob '+Buffer.byteLength(value)+'\0').update(value).digest('hex');
const SID='22222222-2222-4222-8222-222222222222';
const base={version:2,sessionId:SID,seq:1,commitSeq:2,
 finalized:true,blocked:true,accepted:[],endpoint:{x:3,y:1}};

test('R18-30 never rewrites the R18-28 pinned backend or frozen original R05',()=>{
 assert.equal(blob(original),'9f22adbe0de09148a67ba1a1ef0397df1cd85be9');
 assert.equal(blob(read('supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql')),
  'f4e296725c09055685321726cbe4bc6e09dbce5a');
 assert.equal(blob(read('supabase/candidates/world_v2_r18_27_commit_empty_work.sql')),
  'bbc2dcf4c770ce857845691c80bd2c11418c3d77');
});
test('R18-30 is one strictly matching function overlay with no new SQL privileges',()=>{
 const sql=candidate.replace(/^--.*$/gm,'');
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.finalize_world_motion_v2\(/);
 assert.match(sql,/RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER\s+SET search_path TO ''/);
 assert.doesNotMatch(sql,/\bGRANT\b|\bREVOKE\b|\bDROP\b|\bALTER TABLE\b|\bCREATE TABLE\b|\bCREATE INDEX\b|\bCREATE TRIGGER\b/i);
 assert.match(sql,/auth\.uid\(\) IS NULL/);
 assert.match(sql,/WHERE id=p_session AND actor_id=auth\.uid\(\) FOR UPDATE/);
 assert.match(sql,/forge_world_v2\.session_valid\(s\) IS DISTINCT FROM true/);
 assert.match(sql,/advanced:=public\.advance_world_motion_v2\(/);
 assert.match(sql,/canonical:=public\.commit_world_motion_v2\(/);
 assert.match(sql,/EXCEPTION WHEN SQLSTATE 'PZ828'/);
 assert.match(sql,/RETURN s\.final_reply_r28/);
});
test('R18-30 no-motion outcome cannot forge canonical Commit or expose hidden route',()=>{
 assert.match(candidate,/IF s.status='cancelled' THEN/);
 assert.match(candidate,/s\.accepted_cells<>0 OR/);
 assert.match(candidate,/s\.final_request_r28 IS DISTINCT FROM fingerprint/);
 assert.match(candidate,/public\.can_view_campaign_map\(s\.campaign_id,s\.map_id\)/);
 assert.match(candidate,/status='cancelled',last_seq=p_seq\+1/);
 assert.match(candidate,/AND accepted_cells=0 AND accepted_steps='\[\]'::jsonb/);
 assert.match(candidate,/AND last_x=s\.last_x AND last_y=s\.last_y/);
 assert.match(candidate,/'finalized',true,'noMotion',true/);
 assert.match(candidate,/s\.accepted_cells=0 THEN/);
 assert.match(candidate,/IF advanced->'blocked' IS DISTINCT FROM 'true'::jsonb/);
 assert.match(candidate,/endpoint:=jsonb_build_object\('x',s\.last_x,'y',s\.last_y\)/);
});
test('R18-30 accepted prior route remains canonical and never returns false noMotion',()=>{
 assert.match(candidate,/-- Older, already-approved batches exist/);
 assert.match(candidate,/canonical:=public\.commit_world_motion_v2\(/);
 assert.match(candidate,/jsonb_array_length\(advanced->'accepted'\)=0/);
 assert.match(candidate,/'commitSeq',p_seq\+1,'accepted',advanced->'accepted'/);
 assert.match(candidate,/SET final_request_r28=fingerprint,final_reply_r28=combined/);
});
test('R18-30 JS wire validator distinguishes both blocked-only states and rejects forgeries',()=>{
 const from={x:3,y:1},targets=[{x:4,y:1}];
 assert.equal(validAtomicFinalizationAck({...base,noMotion:true},SID,1,from,targets),true);
 assert.equal(validAtomicFinalizationAck(base,SID,1,from,targets,true),true);
 for(const [reply,prior] of [
  [{...base,noMotion:true},true],[base,false],
  [{...base,blocked:false,noMotion:true},false],
  [{...base,noMotion:false},false],
  [{...base,noMotion:true,endpoint:{x:4,y:1}},false],
  [{...base,noMotion:true,endpoint:{x:3,y:1,secret:true}},false],
  [{...base,noMotion:true,accepted:[{x:4,y:1}]},false],
  [{...base,noMotion:true,hiddenNpc:'secret'},false],
  [{...base,noMotion:true,commitSeq:99},false]
 ])assert.equal(validAtomicFinalizationAck(reply,SID,1,from,targets,prior),false,
  JSON.stringify(reply));
});
test('R18-30 test runner proves actual PG17 signed wire is validated through client',()=>{
 assert.ok(runner.indexOf('atomic-finalize-r18-28.sql')<
  runner.indexOf('blocked-final-r18-30.sql'));
 assert.ok(runner.indexOf('blocked-final-r18-30.sql')<
  runner.indexOf('verify-blocked-final-r18-30.mjs'));
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGDATABASE:-/);
 assert.match(suite,/BEGIN;/);
 assert.match(suite,/ROLLBACK;/);
 assert.match(suite,/\\copy \(SELECT jsonb_build_object/);
 assert.match(crossLayer,/validAtomicFinalizationAck\(/);
 assert.match(crossLayer,/createMovementController\(/);
 assert.match(crossLayer,/calls\.commit,0/);
 for(let i=1;i<=13;i++)
  assert.ok(suite.includes('R30-'+String(i).padStart(2,'0')),'missing R30-'+i);
});
test('R18-30 no-motion terminal event cannot create a false canonical handoff',()=>{
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 const controller=read('src/engine/v2/MovementController.js');
 assert.match(runtime,/event\.type==='committed'&&!event\.noMotion&&/);
 assert.match(controller,/noMotion:response\.noMotion===true/);
 assert.match(controller,/reply\.noMotion===undefined:\s+reply\.noMotion===true/);
 assert.match(controller,/g\.hadMotion\):/);
 assert.match(controller,/enableAtomicFinalize=false/);
});
