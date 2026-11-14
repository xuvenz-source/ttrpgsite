import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validAtomicFinalizationAck} from '../src/engine/v2/MovementController.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0')
 .update(s).digest('hex');
const BASE='tests/world-v2-b10-postgres/';
const CAND='supabase/candidates/';
const sources={
 [CAND+'world_v2_r18_17_wall_edge_clearance.sql']:'c78998da8a9013591f2bb479cca4b222f41ef2d7',
 [CAND+'world_v2_r18_19_cross_map_guard.sql']:'55db7e6b6839d1d8b489203baa11c99264648a55',
 [CAND+'world_v2_r18_20_campaign_affinity.sql']:'3980808966ec56ad74120bc4f737c78ddd2056bb',
 [CAND+'world_v2_r18_28_atomic_finalize.sql']:'9f22adbe0de09148a67ba1a1ef0397df1cd85be9',
 [CAND+'world_v2_r18_30_blocked_final_semantics.sql']:'6741a9f31e72bd354818de9d77b9a893aca51c51',
 [BASE+'extract_real_collision_triggers_r18_18.py']:'0f14a8c2e9256dc3ba222835473c711b828477c2',
 [BASE+'extract_latest_trajectory_r18_19.py']:'e5a5bd12a2be54bbe5c4d0e8d553c9495bb86900',
 [BASE+'live-v2-checkpoint-r18-21.sql']:'331564bfba1a9653457853da267bd2a0a473df18',
 [BASE+'live-collision-baseline-r18-21.sql']:'d548a9b0b8e91f5c16981189fb7eeea660844365',
 [BASE+'live-validators-r18-20.sql']:'571b9a07a19dcdbd12dcbd7bda8c2dcbe8151d28',
 [BASE+'ordered-stack-r18-22.sql']:'2e7ccf6c2b3c56b880e96c6bda2762a594f6e428',
 [BASE+'atomic-finalize-r18-28.sql']:'75633cced46043c33b6a1cb9bddd073683dcc7b3',
 [BASE+'blocked-final-r18-30.sql']:'01d3c2e1cb3c135b22ddefcb1aad549752b5a400',
 [BASE+'verify-blocked-final-r18-30.mjs']:'748c974e57d699a9be1935756faa724bac26869b'
};
test('R18-44 imports EXACT historical reviewed SQL and test blobs, no rewrites',()=>{
 for(const [path,expected] of Object.entries(sources))
  assert.equal(blob(read(path)),expected,path+' historical Git blob drift');
 assert.equal(blob(read('supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql')),
  'f4e296725c09055685321726cbe4bc6e09dbce5a');
});
test('R18-44 SQL candidates remain unversioned, source-actor-bound and disallow anon',()=>{
 const original=read(CAND+'world_v2_r18_28_atomic_finalize.sql');
 const corrected=read(CAND+'world_v2_r18_30_blocked_final_semantics.sql');
 assert.match(original,/REVOKE ALL ON FUNCTION public\.finalize_world_motion_v2/);
 assert.match(original,/GRANT EXECUTE ON FUNCTION public\.finalize_world_motion_v2\(/);
 assert.match(original,/TO authenticated/);
 assert.match(corrected,/WHERE id=p_session AND actor_id=auth\.uid\(\) FOR UPDATE/);
 assert.match(corrected,/SET search_path TO ''/);
 assert.match(corrected,/forge_world_v2\.session_valid\(s\)/);
 assert.match(corrected,/public\.can_view_campaign_map/);
 assert.match(corrected,/canonical:=public\.commit_world_motion_v2\(/);
 assert.match(corrected,/advanced:=public\.advance_world_motion_v2\(/);
 assert.match(corrected,/EXCEPTION WHEN SQLSTATE 'PZ828'/);
 assert.doesNotMatch(corrected,/^\s*GRANT\b|^\s*CREATE POLICY\b|^\s*ALTER ROLE\b/m);
});
test('R18-44 finalizer cannot forge blocked-only no-motion or hidden-wall route',()=>{
 const sid='22222222-2222-4222-8222-222222222222',
  from={x:3,y:1},targets=[{x:4,y:1}];
 const prior={version:2,sessionId:sid,seq:2,commitSeq:3,
  blocked:true,accepted:[],endpoint:from,finalized:true};
 assert.equal(validAtomicFinalizationAck(prior,sid,2,from,targets,true),true);
 assert.equal(validAtomicFinalizationAck({...prior,noMotion:true},sid,2,from,targets,true),false);
 const first={...prior,seq:1,commitSeq:2,noMotion:true};
 assert.equal(validAtomicFinalizationAck(first,sid,1,from,targets,false),true);
 assert.equal(validAtomicFinalizationAck({...first,noMotion:undefined},sid,1,from,targets,false),false);
 assert.equal(validAtomicFinalizationAck({...first,wall:{x:4,y:1}},sid,1,from,targets,false),false);
 assert.equal(validAtomicFinalizationAck({...first,endpoint:targets[0]},sid,1,from,targets,false),false);
});
test('R18-44 third database runner rejects any remote/external target',()=>{
 const sh=read(BASE+'rehearse-r18-44.sh');
 for(const marker of ['WORLD_V2_B10_ISOLATED','PGHOST','PGPORT',
  'PGUSER','PGDATABASE','PGHOSTADDR','PGSERVICE','PGSERVICEFILE',
  'DATABASE_URL','SUPABASE_DB_URL',
  "createdb -h 127.0.0.1 -p 5432 -U postgres",
  "psql -X -h 127.0.0.1 -p 5432 -U postgres",
  "world_v2_b10_r18_44"])
  assert.ok(sh.includes(marker),'missing isolation marker '+marker);
 assert.doesNotMatch(sh,/supabase\s+db\s+(push|reset)|pg_dump|curl|wget/i);
 const run=read(BASE+'run.sh');
 assert.ok(run.indexOf('rehearse-r05.sh')<run.indexOf('rehearse-r18-44.sh'));
});
test('R18-44 installation order is exactly frozen baseline then R05 wall guards, then rollback-only atomic',()=>{
 const runner=read(BASE+'rehearse-r18-44.sh');
 const pos=s=>runner.indexOf(s);
 const steps=['r44_core.sql','r44_viewers.sql','ordered-stack-r18-22.sql',
  'atomic-finalize-r18-28.sql','blocked-final-r18-30.sql',
  'verify-blocked-final-r18-30.mjs','authority-bridge-r18-44.sql'];
 let last=-1;
 for(const step of steps){
  const next=pos(step);
  assert.ok(next>last,'missing or out-of-order '+step);
  last=next;
 }
 const sql=read(BASE+'ordered-stack-r18-22.sql');
 const phases=['20261111023204_world_v2_b10_integrated_motion.sql',
  'world_v2_r18_17_wall_edge_clearance.sql',
  'world_v2_r18_19_cross_map_guard.sql',
  'world_v2_r18_20_campaign_affinity.sql'];
 last=-1;
 for(const step of phases){
  const next=sql.indexOf(step);
  assert.ok(next>last,'missing or out-of-order SQL dependency '+step);
  last=next;
 }
 assert.match(sql,/commit_allows_piece_v2/);
});
test('R18-44 real PG17 wire suite exercises five receipts against the real controller',()=>{
 const sql=read(BASE+'blocked-final-r18-30.sql');
 const js=read(BASE+'verify-blocked-final-r18-30.mjs');
 for(const s of ['no-motion','no-motion-retry','normal',
  'prior-approved','prior-approved-retry'])assert.ok(sql.includes(s));
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^ROLLBACK;/m);
 assert.match(js,/createMovementController/);
 assert.match(js,/validAtomicFinalizationAck/);
 assert.match(js,/calls\.commit,0/);
 assert.match(js,/process\.argv\[2\]/);
 assert.match(sql,/realtime\.b07_outbox/);
});
test('R18-44 hostile fixture enforces signed actor and canonical idempotency, then rolls back',()=>{
 const sql=read(BASE+'authority-bridge-r18-44.sql');
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^ROLLBACK;/m);
 assert.match(sql,/set_config\('request\.jwt\.claim\.sub',other_actor::text,true\)/);
 assert.match(sql,/has_function_privilege\('anon'/);
 assert.match(sql,/status='active' AND last_seq=0/);
 assert.match(sql,/status='committed' AND last_seq=2/);
 assert.match(sql,/updated_at=old_updated/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM realtime\.b07_outbox WHERE NOT is_private\)/);
 assert.match(sql,/to_regprocedure\(/);
 for(let i=1;i<=11;i++)assert.ok(sql.includes('R44-'+String(i).padStart(2,'0')));
});
test('R18-44 dual feature gates remain default OFF and preview-safe until installed',()=>{
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 const authority=read('src/engine/v2/AuthorityClient.js');
 const movement=read('src/engine/v2/MovementController.js');
 assert.match(runtime,/atomicFinalizeEnabled=!dmPreview&&/);
 assert.match(runtime,/VITE_WORLD_V2_ATOMIC_FINALIZE==='1'/);
 assert.match(runtime,/VITE_WORLD_V2_ATOMIC_FINALIZE_READY==='1'/);
 assert.match(authority,/atomicFinalizeEnabled=false/);
 assert.match(movement,/enableAtomicFinalize=false/);
 assert.match(movement,/g\.mode!=='preview'/);
});
