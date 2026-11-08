import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkTokenMovement} from '../src/MapCollision.js';

const sql=readFileSync(new URL('../staging/sql-candidates/world_runtime_single_write_trajectory.sql',import.meta.url),'utf8');
const old=readFileSync(new URL('../staging/sql-candidates/world_runtime_atomic_trajectory.sql',import.meta.url),'utf8');

test('full trajectory remains one RLS-invoker RPC with one final committed group mutation',()=>{
 assert.match(sql,/create or replace function public\.commit_map_trajectory/);
 assert.match(sql,/language plpgsql volatile security invoker set search_path=''/);
 assert.match(sql,/result:=public\.move_map_group\([\s\S]*?total_x,total_y,p_ignore_collision\)/);
 assert.equal((sql.match(/result:=public\.move_map_group\(/g)||[]).length,1);
 assert.doesNotMatch(sql,/update public\.(map_tokens|campaign_tool_issues)\s+(?:set|as)/i);
 assert.match(sql,/jsonb_array_length\(p_steps\) not between 1 and 64/);
 assert.match(sql,/total_x:=total_x\+dx;total_y:=total_y\+dy/);
 assert.match(sql,/abs\(total_x\)>128 or abs\(total_y\)>128/);
 assert.match(sql,/p_ignore_collision is null/);
 assert.match(sql,/revoke all on function public\.commit_map_trajectory\([\s\S]*?from public,anon/);
 assert.match(sql,/grant execute on function public\.commit_map_trajectory\([\s\S]*?to authenticated/);
 assert.match(old,/for step in select value from jsonb_array_elements\(p_steps\)/);
 assert.match(old,/result:=public\.move_map_group/);
});
test('token and tool collision triggers validate route by swept footprint, never blind bypass',()=>{
 assert.match(sql,/create or replace function forge_visibility\.enforce_collision\(\)/);
 assert.match(sql,/create or replace function forge_visibility\.enforce_tool_collision\(\)/);
 assert.equal((sql.match(/route_end:=forge_visibility\.validate_piece_trajectory\(/g)||[]).length,2);
 assert.match(sql,/scene,attrs,old\.x,old\.y,new\.span_x,new\.span_y/);
 assert.match(sql,/scene,attrs,old\.x,old\.y,old_span,old_span/);
 assert.match(sql,/Movement destination does not match validated route/);
 assert.match(sql,/Tool destination does not match validated route/);
 assert.match(sql,/forge_visibility\.wall_passes\(barrier,p_attrs,'movement'\)/);
 assert.equal((sql.match(/forge_visibility\.swept_hits_segment\(/g)||[]).length>=4,true);
 assert.match(sql,/barrier->>'state'='broken'/);
 assert.match(sql,/points\) not between 2 and 80/);
 assert.match(sql,/tx\+p_width>p_cells_w/);
 assert.match(sql,/ty\+p_height>p_cells_h/);
 assert.match(sql,/create or replace function forge_visibility\.validate_piece_trajectory/);
 assert.match(sql,/revoke all on function forge_visibility\.validate_piece_trajectory\([\s\S]*?from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant execute on function forge_visibility\.validate_piece_trajectory[\s\S]*?authenticated/);
});
test('transaction-local scoped settings limit trajectory checking to current map and actor',()=>{
 for(const setting of ['forge.trajectory_steps','forge.trajectory_map','forge.trajectory_actor']){
  const matches=sql.split('set_config(\''+setting+'\'').length-1;
  assert.equal(matches,2,setting+' set and clear');
 }
 assert.equal((sql.match(/current_setting\('forge\.trajectory_map',true\)=new\.map_id::text/g)||[]).length,2);
 assert.equal((sql.match(/current_setting\('forge\.trajectory_actor',true\)=actor::text/g)||[]).length,2);
 assert.match(sql,/set_config\('forge\.trajectory_steps',p_steps::text,true\)/);
 assert.match(sql,/set_config\('forge\.trajectory_steps','',true\)/);
 assert.match(sql,/result:=public\.move_map_group\(/);
 assert.doesNotMatch(sql,/disable row level security|drop policy|alter policy|grant all on public\.map_tokens/i);
});
test('all staged SQL function bodies use matched dollar tags',()=>{
 for(const tag of ['route','commit']){
  assert.equal(sql.split('$'+tag+'$').length-1,2,tag);
 }
 assert.equal((sql.match(/\bas \$\$/g)||[]).length,2);
 assert.equal((sql.match(/end \$\$;/g)||[]).length,2);
 assert.match(sql,/^begin;/m);
 assert.match(sql,/^commit;/m);
});
test('bent movement around a wall can succeed although direct teleport is blocked',()=>{
 const map={width:700,height:700,grid_size:70};
 const environment={objects:[{id:'wall',type:'wall',
  points:[{x:3,y:0},{x:3,y:3}],blocksMovement:true}]};
 let unit={x:1,y:1,span_x:1,span_y:1};
 const direct=checkTokenMovement({token:unit,destination:{x:4,y:1},map,environment});
 assert.equal(direct.allowed,false);
 for(const step of [{dx:0,dy:3},{dx:3,dy:0},{dx:0,dy:-3}]){
  const destination={x:unit.x+step.dx,y:unit.y+step.dy};
  const verdict=checkTokenMovement({token:unit,destination,map,environment});
  assert.equal(verdict.allowed,true,'every turn must be checked separately');
  unit={...unit,...destination};
 }
 assert.deepEqual({x:unit.x,y:unit.y},{x:4,y:1});
});
