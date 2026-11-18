import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 CAMPAIGN_MEMBER_ADMIN_LIVE_ENABLED, CAMPAIGN_MEMBER_ADMIN_RPC_NAMES,
 createCampaignMemberAdminContract
} from '../src/CampaignMemberAdminContract.js';

const C='00000000-0000-4000-8000-000000000101';
const OTHER='00000000-0000-4000-8000-000000000102';
const DM='00000000-0000-4000-8000-000000000301';
const P1='00000000-0000-4000-8000-000000000302';
const P2='00000000-0000-4000-8000-000000000303';
const removedTime='2026-11-19T00:00:00.000Z';
const dmState=()=>({
 campaignId:C,userId:DM,isDM:true,
 members:[{user_id:DM,role:'dm'},{user_id:P1,role:'player'}]
});
function fixture(overrides={}){
 let state=overrides.state??dmState();
 const calls=[];
 let refreshes=0;
 let api=overrides.api??(async()=>({data:true,error:null}));
 const db={
  auth:{getUser:overrides.getUser??(async()=>({data:{user:{id:state.userId}},error:null}))},
  rpc:(name,args)=>{calls.push({name,args});return api(name,args);}
 };
 const controller=createCampaignMemberAdminContract({
  db,context:()=>state,
  onReconcile:overrides.onReconcile??(async()=>{refreshes++;return true;})
 });
 return {
  controller,calls,
  setState:next=>{state=next;},
  setApi:next=>{api=next;},
  getRefreshes:()=>refreshes
 };
}

test('R122 contract is deliberately not mounted on live frontend',()=>{
 const source=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const sidebar=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
 assert.equal(CAMPAIGN_MEMBER_ADMIN_LIVE_ENABLED,false);
 assert.doesNotMatch(source,/CampaignMemberAdminContract|CampaignMemberAdminPanel/);
 assert.doesNotMatch(sidebar,/CampaignMemberAdminContract|CampaignMemberAdminPanel/);
 assert.deepEqual(Object.keys(CAMPAIGN_MEMBER_ADMIN_RPC_NAMES).sort(),
  ['leave','list','reinstate','remove']);
});

test('R122 DM removes only visible active player via exact authenticated RPC args',async()=>{
 const f=fixture();
 const result=await f.controller.removePlayer(P1);
 assert.equal(result.status,'server_acknowledged');
 assert.equal(result.rosterReconciled,true);
 assert.equal(result.requiresReconciliation,false);
 assert.deepEqual(f.calls,[{
  name:'dm_remove_campaign_player',
  args:{p_campaign:C,p_player:P1}
 }]);
 assert.equal(f.getRefreshes(),1);
 assert.equal(f.controller.isBusy(),false);
});

test('R122 denies malformed, zero, own-DM and another DM target before RPC',async()=>{
 const f=fixture();
 for(const target of ['nope','00000000-0000-0000-0000-000000000000',DM,P2,'']){
  await assert.rejects(f.controller.removePlayer(target),{code:'invalid_player'});
 }
 assert.equal(f.calls.length,0);
});
test('R122 stale roster or non-DM context fails closed locally, never authorization',async()=>{
 const f=fixture({state:{
  campaignId:C,userId:P1,isDM:false,
  members:[{user_id:DM,role:'dm'},{user_id:P1,role:'player'}]
 }});
 await assert.rejects(f.controller.removePlayer(DM),{code:'wrong_role'});
 await assert.rejects(f.controller.reinstatePlayer(P2),{code:'wrong_role'});
 await assert.rejects(f.controller.listRemovedPlayers(),{code:'wrong_role'});
 const own=await f.controller.leaveCampaign();
 assert.equal(own.status,'server_acknowledged');
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0],{name:'leave_campaign',args:{p_campaign:C}});
});
test('R122 current DM cannot voluntarily leave via player-only RPC',async()=>{
 const f=fixture();
 await assert.rejects(f.controller.leaveCampaign(),{code:'wrong_role'});
 assert.equal(f.calls.length,0);
});
test('R122 reinstatement permits only a previously removed absent identity hint',async()=>{
 const f=fixture();
 await assert.rejects(f.controller.reinstatePlayer(P1),{code:'invalid_player'});
 const r=await f.controller.reinstatePlayer(P2);
 assert.equal(r.status,'server_acknowledged');
 assert.deepEqual(f.calls,[{name:'dm_reinstate_campaign_player',
  args:{p_campaign:C,p_player:P2}}]);
 // The server checks the private tombstone; local absence is NOT proof.
});
test('R122 list of removed players never accesses the private table directly',async()=>{
 const f=fixture({api:async()=>({
  data:[{user_id:P2,removed_at:removedTime}],error:null
 })});
 const r=await f.controller.listRemovedPlayers();
 assert.equal(r.status,'listed');
 assert.deepEqual(r.removed,[{user_id:P2,removed_at:removedTime}]);
 assert.ok(Object.isFrozen(r.removed));
 assert.deepEqual(f.calls,[{name:'dm_list_removed_campaign_players',
  args:{p_campaign:C}}]);
 assert.equal(f.getRefreshes(),0);
});
test('R122 rejects malformed/duplicate/active removed-roster responses',async()=>{
 for(const rows of [
  null, {}, [{user_id:'?',removed_at:removedTime}],
  [{user_id:P2,removed_at:'bad-date'}],
  [{user_id:P2,removed_at:removedTime},{user_id:P2,removed_at:removedTime}],
  [{user_id:P1,removed_at:removedTime}],
  Array.from({length:101},()=>({user_id:P2,removed_at:removedTime}))
 ]){
  const f=fixture({api:async()=>({data:rows,error:null})});
  await assert.rejects(f.controller.listRemovedPlayers(),
   {code:'invalid_server_response'});
 }
});
test('R122 server returning false never becomes a claimed successful removal',async()=>{
 const f=fixture({api:async()=>({data:false,error:null})});
 const r=await f.controller.removePlayer(P1);
 assert.equal(r.status,'stale');
 assert.equal(r.rosterReconciled,true);
 assert.equal(f.getRefreshes(),1);
});
test('R122 failed authoritative refresh does not become a confirmed roster',async()=>{
 const f=fixture({onReconcile:async()=>{throw Error('private refresh detail')}});
 const r=await f.controller.removePlayer(P1);
 assert.equal(r.status,'server_acknowledged');
 assert.equal(r.rosterReconciled,false);
 assert.equal(r.requiresReconciliation,true);
});
test('R122 network/SQL failure is unknown outcome with sanitized error and refresh',async()=>{
 const f=fixture({api:async()=>{throw Error('some secret SQL/internal details')}});
 await assert.rejects(f.controller.removePlayer(P1),e=>{
  assert.equal(e.code,'unconfirmed');
  assert.doesNotMatch(e.message,/secret|SQL|internal/);
  return true;
 });
 assert.equal(f.getRefreshes(),1);
 assert.equal(f.calls.length,1);
});
test('R122 identity mismatch rejects before any RPC',async()=>{
 const f=fixture({getUser:async()=>({data:{user:{id:P1}},error:null})});
 await assert.rejects(f.controller.removePlayer(P1),{code:'identity_changed'});
 assert.equal(f.calls.length,0);
});
test('R122 context switching after identity verification prevents old-context RPC',async()=>{
 let release;let entered;
 const enteredP=new Promise(resolve=>{entered=resolve;});
 const f=fixture({getUser:async()=>{
  entered();
  return await new Promise(resolve=>{release=resolve;});
 }});
 const action=f.controller.removePlayer(P1);
 await enteredP;
 f.setState({...dmState(),campaignId:OTHER});
 release({data:{user:{id:DM}},error:null});
 await assert.rejects(action,{code:'context_changed'});
 assert.equal(f.calls.length,0);
});
test('R122 context switching during RPC cannot display prior-campaign success',async()=>{
 const f=fixture();
 f.setApi(async()=>{
  f.setState({...dmState(),campaignId:OTHER});
  return {data:true,error:null};
 });
 await assert.rejects(f.controller.removePlayer(P1),{code:'context_changed_after_call'});
 assert.equal(f.getRefreshes(),0);
});
test('R122 one in-flight membership write prevents double-submit/replay',async()=>{
 let release;let started;
 const startedP=new Promise(resolve=>{started=resolve;});
 const f=fixture({api:async()=>{
  started();
  return await new Promise(resolve=>{release=resolve;});
 }});
 const first=f.controller.removePlayer(P1);
 await startedP;
 await assert.rejects(f.controller.removePlayer(P1),{code:'already_pending'});
 release({data:true,error:null});
 await first;
 assert.equal(f.calls.length,1);
});
test('R122 SQL candidate enforces DM-only private roster and denies UPDATE bypass',()=>{
 const sql=readFileSync(new URL('../staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql',import.meta.url),'utf8');
 assert.match(sql,/RETURNS TABLE\(user_id uuid,removed_at timestamptz\)/);
 assert.match(sql,/m\.campaign_id=p_campaign AND m\.user_id=actor AND m\.role='dm'/);
 assert.match(sql,/RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501'/);
 assert.match(sql,/FROM forge_security\.campaign_member_revocations/);
 assert.match(sql,/LIMIT 100/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.dm_list_removed_campaign_players\(uuid\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.dm_list_removed_campaign_players\(uuid\)\s+TO authenticated/);
 assert.match(sql,/BEFORE UPDATE OF campaign_id,user_id ON public\.campaign_members/);
 assert.match(sql,/CREATE FUNCTION forge_security\.reject_campaign_member_identity_update\(\)/);
 assert.match(sql,/OLD\.user_id IS DISTINCT FROM NEW\.user_id/);
 assert.match(sql,/OLD\.campaign_id IS DISTINCT FROM NEW\.campaign_id/);
 assert.match(sql,/RAISE EXCEPTION 'Membership identity immutable' USING ERRCODE='42501'/);

 assert.doesNotMatch(sql,/GRANT (?:SELECT|UPDATE|DELETE|INSERT) ON forge_security\.campaign_member_revocations TO authenticated/i);
 assert.match(sql,/NOT a versioned migration/);
});
