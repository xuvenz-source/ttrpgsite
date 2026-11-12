import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const live=read('tests/world-v2-b10-postgres/live-collision-baseline-r18-21.sql');
const candidate=read('supabase/candidates/world_v2_r18_19_cross_map_guard.sql');
const checkpoint=read('tests/world-v2-b10-postgres/live-v2-checkpoint-r18-21.sql');
const sql=read('tests/world-v2-b10-postgres/checkpoint-parity-r18-21.sql');

function body(source,name){
 const header='create or replace function forge_visibility.'+name+'(';
 const offset=source.toLowerCase().indexOf(header);
 assert.ok(offset>=0,'missing source body '+name);
 const full=source.slice(offset);
 const match=/\bas\s+(\$[a-z0-9_]*\$)/i.exec(full);
 assert.ok(match,'missing dollar-quote delimiter for '+name);
 const open=match.index+match[0].length;
 const close=full.indexOf(match[1],open);
 assert.ok(close>=0,'unterminated source body '+name);
 return full.slice(open,close).toLowerCase().replace(/--[^\n]*/g,'').replace(/\s+/g,'');
}
const delta={
 enforce_collision:
  "ifnew.map_idisdistinctfromold.map_idandnotexists(select1frompublic.battle_mapsbmwherebm.id=new.map_idandbm.campaign_id=new.campaign_id)thenraiseexception'tokendestinationmapoutsidecampaign';endif;",
 enforce_tool_collision:
  "ifnew.map_idisdistinctfromold.map_idthenifnotpublic.is_campaign_dm(new.campaign_id)thenraiseexception'onlythedmcantransferissuedtoolsbetweenmaps';endif;ifnew.map_idisnotnullandnotexists(select1frompublic.battle_mapsbmwherebm.id=new.map_idandbm.campaign_id=new.campaign_id)thenraiseexception'tooldestinationmapoutsidecampaign';endif;endif;"
};

test('R18-21 pins deployed V2 checkpoint-aware trigger definitions before editing SQL',()=>{
 assert.match(live,/enforce_collision: 7e652f0f2334980ccc724e1748d334ba/);
 assert.match(live,/enforce_tool_collision: 771ea1716498a43210661532f9c24977/);
 assert.match(checkpoint,/MD5: 7298cb6051ba259a9c5be1963e1a46a5/);
 assert.match(checkpoint,/txid_current\(\)/);
 assert.match(checkpoint,/motion\.accepted_steps/);
 assert.match(checkpoint,/motion\.accepted_cells|motion\s+.*accepted_cells/s);
 assert.match(checkpoint,/motion\.actor_id=actor/);
 assert.match(checkpoint,/motion\.mode<>'preview'/);
});
test('R18-21 each corrected guard differs from LIVE body ONLY in its planned map-transfer condition',()=>{
 for(const name of ['enforce_collision','enforce_tool_collision']){
  const actual=body(live,name),staged=body(candidate,name);
  const token=delta[name];
  assert.equal(staged.split(token).length,2,'expected one precise guard '+name);
  assert.equal(staged.replace(token,''),actual,
   'DANGEROUS: '+name+' would overwrite other deployed logic');
  assert.match(staged,/forge_world_v2\.commit_allows_piece_v2\(/,
   name+' must retain signed canonical-commit bypass');
 }
 assert.match(candidate,/SOURCE-REAL CORRECTION/);
 assert.match(candidate,/NOT A VERSIONED MIGRATION/);
 assert.doesNotMatch(candidate,/CREATE POLICY|DROP POLICY|ALTER POLICY|\bGRANT\b/i);
});
test('R18-21 source-real authorized token/tool commits require private checkpoint and reject plain walls',()=>{
 assert.deepEqual([...sql.matchAll(/'C(\d\d) /g)].map(x=>Number(x[1])),
  Array.from({length:10},(_,i)=>i+1));
 for(const needle of [
  'public.b04_issue_token_session',
  'public.b04_issue_tool_session',
  'forge_world_v2.commit_allows_piece_v2(',
  'forge_world_v2.commit_checkpoints',
  'UPDATE public.map_tokens SET x=2',
  'UPDATE public.campaign_tool_issues SET x=2',
  'UPDATE forge_world_v2.motion_sessions',
  'DELETE FROM forge_world_v2.commit_checkpoints',
  'C04 signed V2 token Commit',
  'C08 signed V2 tool Commit',
  'C09 checkpoint deletion restores'
 ])assert.ok(sql.includes(needle),needle);
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^ROLLBACK;\s*$/m);
 assert.doesNotMatch(sql,/postgres:\/\/|dblink|service_role_secret|supabase_migrations/i);
});
test('R18-21 PG17 runner preserves all prior release gates and R05 rehearsal',()=>{
 const runner=read('tests/world-v2-b10-postgres/run.sh');
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOST/);
 assert.match(runner,/PGDATABASE/);
 assert.ok(runner.indexOf('dm-workflow-affinity-r18-21.sql')<
  runner.indexOf('checkpoint-parity-r18-21.sql'));
 assert.ok(runner.indexOf('checkpoint-parity-r18-21.sql')<
  runner.indexOf('rehearse-r05.sh'));
 assert.match(read('staging/next-release-ledger.json'),/20261111023204_world_v2_b10_integrated_motion/);
 assert.doesNotMatch(read('src/engine/v2/SceneManager.js'),/clearanceCells:\s*0\.1/);
});
