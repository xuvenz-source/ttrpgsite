import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextConcealedStep,needsConcealedStep,createConcealedMovementGate}
 from '../src/ConcealedMovementGate.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const navigation=source('supabase/migrations/20261109000100_authorized_predictive_navigation.sql');
const gestures=source('supabase/migrations/20261109000400_concealed_navigation_gestures.sql');
const board=source('src/BattlemapBoard.jsx');
const app=source('src/TabletopApp.jsx');
const map='10000000-0000-4000-8000-000000000001';
const token='10000000-0000-4000-8000-000000000002';
const session='10000000-0000-4000-8000-000000000003';

test('concealed collision never exposes advance topology in public navigation grants',()=>{
 const collisionBranch=navigation.match(/IF collision_on THEN\s+RETURN pg_catalog\.jsonb_build_object\(([\s\S]*?)\);\s+END IF;/);
 assert.ok(collisionBranch,'collision-enforced player grants must have an unconditional constant response');
 assert.match(collisionBranch[1],/'nodes','\[\]'::jsonb/);
 assert.doesNotMatch(collisionBranch[1],/barrier|wall_passes|swept_hits_segment|blockers/);
 assert.match(navigation,/-- A bounded graph of blocked edges is itself an oracle/);
});

test('private gesture table has RLS and no client table privileges',()=>{
 assert.match(gestures,/CREATE TABLE IF NOT EXISTS forge_visibility\.navigation_gestures/);
 assert.match(gestures,/ALTER TABLE forge_visibility\.navigation_gestures ENABLE ROW LEVEL SECURITY/);
 assert.match(gestures,/REVOKE ALL ON TABLE forge_visibility\.navigation_gestures\s+FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(gestures,/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON (?:TABLE )?forge_visibility\.navigation_gestures/i);
 for(const f of ['begin_authorized_navigation_gesture',
  'advance_authorized_navigation_gesture','end_authorized_navigation_gesture']){
  assert.match(gestures,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+f+'\\('));
  assert.match(gestures,new RegExp('REVOKE ALL ON FUNCTION public\\.'+f+'\\('));
 }
});

test('server requires actor-owned session, adjacency, revocation and atomic collision checks',()=>{
 assert.match(gestures,/WHERE id=p_session AND actor_id=actor FOR UPDATE/);
 assert.match(gestures,/abs\(step_x\)>1 OR abs\(step_y\)>1/);
 assert.match(gestures,/abs\(p_dx\)>12 OR abs\(p_dy\)>12/);
 assert.match(gestures,/environment_revision/);
 assert.match(gestures,/permission_generation/);
 assert.match(gestures,/current_token\.owner_id IS DISTINCT FROM actor/);
 assert.match(gestures,/current_tool\.owner_id IS DISTINCT FROM actor/);
 assert.match(gestures,/forge_visibility\.validate_piece_trajectory/g);
 assert.match(gestures,/UPDATE forge_visibility\.navigation_gestures\s+SET last_dx=/);
 assert.match(gestures,/EXCEPTION WHEN others THEN/);
 assert.doesNotMatch(gestures,/RETURN jsonb_build_object\([^)]*scene/i);
});

test('client requests only adjacent offsets and bounds exploratory gestures',()=>{
 assert.equal(needsConcealedStep({protocolVersion:2,collisionEnabled:true},false),true);
 assert.equal(needsConcealedStep({protocolVersion:2,collisionEnabled:false},false),false);
 assert.equal(needsConcealedStep({protocolVersion:2,collisionEnabled:true},true),false);
 assert.deepEqual(nextConcealedStep({dx:0,dy:0},{dx:8,dy:-3}),{dx:1,dy:-1});
 assert.deepEqual(nextConcealedStep({dx:1,dy:-1},{dx:8,dy:-3}),{dx:2,dy:-2});
 assert.equal(nextConcealedStep({dx:0,dy:0},{dx:0,dy:0}),null);
 assert.equal(nextConcealedStep({dx:12,dy:0},{dx:13,dy:0}),null);
 assert.equal(nextConcealedStep({dx:0.5,dy:0},{dx:1,dy:0}),null);
});

test('client accepts server-confirmed motion only and closes the gesture',async()=>{
 const calls=[];
 const gate=createConcealedMovementGate({db:{rpc:async(name,params)=>{
  calls.push([name,params]);
  if(name==='begin_authorized_navigation_gesture')
   return {data:{sessionId:session},error:null};
  if(name==='advance_authorized_navigation_gesture')
   return {data:params.p_dx===1&&params.p_dy===0,error:null};
  return {data:null,error:null};
 }}});
 const id=await gate.begin(map,[token],[]);
 assert.equal(id,session);
 assert.equal(await gate.approve(id,{dx:1,dy:0},1),true);
 assert.equal(await gate.approve(id,{dx:2,dy:0},2),false);
 await gate.end(id);
 assert.deepEqual(calls.map(([name])=>name),[
  'begin_authorized_navigation_gesture','advance_authorized_navigation_gesture',
  'advance_authorized_navigation_gesture','end_authorized_navigation_gesture']);
 gate.dispose();
 assert.equal(await gate.approve(id,{dx:1,dy:0},3),false);
});

test('pointer, keyboard, group and tool routes respect the separate authorization modes',()=>{
 assert.match(board,/requestConcealedOffset\(info,requested\)/);
 assert.match(board,/if\(!approved\)/);
 assert.match(board,/paintAcceptedOffset\(info,\{\.\.\.next,path:\[next\]\}\)/);
 assert.match(board,/secureValidated:info\.secureMode===true/);
 assert.match(app,/const singleStep=concealed&&!verifiedGesture/);
 assert.match(app,/if\(!singleStep\)\{/);
 assert.match(app,/if\(singleStep\)setTokens/);
 assert.match(app,/concealed&&Math\.max\(Math\.abs\(deltaX\),Math\.abs\(deltaY\)\)!==1/);
 assert.match(app,/if\(!\(concealed&&secureValidated===true\)&&pieces\.some/);
 assert.match(app,/commit_map_trajectory/);
});
