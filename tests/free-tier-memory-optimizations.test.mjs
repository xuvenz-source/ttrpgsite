import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tokenEventMayAffectDerivedResources as dirty}
 from '../src/AuthorizedTokenDerivedRefresh.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const base={id:'a',map_id:'map',campaign_id:'campaign',
 character_id:'sheet',owner_id:'owner',visible:true,npc_bars_public:false,
 x:2,y:2,status_effects:[],image_path:'old'};
const event=(update,type='UPDATE')=>({eventType:type,new:{...base,...update}});

test('movement, status, and artwork updates avoid redundant expensive HUD-stat reads',()=>{
 for(const update of [{x:3,y:5},{status_effects:['poisoned']},{image_path:'new'}])
  assert.equal(dirty(event(update),[base],'map'),false);
});
test('permission, ownership, roster and character identity changes invalidate HUD reads',()=>{
 for(const update of [{owner_id:'new'},{visible:false},{character_id:null},
  {npc_bars_public:true},{map_id:'other'},{campaign_id:'other'}])
  assert.equal(dirty(event(update),[base],'map'),true);
 assert.equal(dirty(event({},'INSERT'),[base],'map'),true);
 assert.equal(dirty(event({},'DELETE'),[base],'map'),true);
 assert.equal(dirty(event({}),[],'map'),true);
});
test('NPC stats fail closed on incomplete or changed authorized snapshots',()=>{
 const npc={...base,character_id:null,npc_values:{hp:4}};
 const {npc_values, ...redacted}=npc;
 assert.equal(dirty({eventType:'UPDATE',new:{...npc,npc_values:{hp:5}}},[npc],'map'),true);
 assert.equal(dirty({eventType:'UPDATE',new:{...npc}},[npc],'map'),false);
 assert.equal(dirty({eventType:'UPDATE',new:{...npc}},[redacted],'map'),true);
 assert.equal(dirty({eventType:'UPDATE',new:redacted},[npc],'map'),true);
});
test('routing keeps assignment change subscription and moves campaign changes onto shared channel',()=>{
 const app=read('src/TabletopApp.jsx');
 const routing=app.slice(app.indexOf("db.channel('vtt-routing-'"),
  app.indexOf('// Fast ephemeral movement updates:'));
 const shared=app.slice(app.indexOf("db.channel('vtt-'+activeId)"),
  app.indexOf('// Keep the latest closures'));
 assert.match(routing,/table:'campaign_player_maps'/);
 assert.doesNotMatch(routing,/table:'campaigns'/);
 assert.match(shared,/table:'campaigns'/);
 assert.match(shared,/event.eventType==='UPDATE'&&!isDM\)void refreshPlayerMapRouting\(\)/);
 assert.match(app,/if\(isMotionOnly\)motionUpdates.request\(\)/);
 assert.match(app,/else tokenUpdates.request\(\)/);
});
test('Realtime burst schedulers stop on teardown',()=>{
 const app=read('src/TabletopApp.jsx');
 const presence=read('src/useCampaignPresence.js');
 assert.match(app,/chatUpdates=createCoalescedRefresh/);
 assert.match(app,/chatUpdates.cancel\(\)/);
 assert.match(presence,/signature!==lastSignature/);
 assert.match(presence,/rosterUpdates.cancel\(\)/);
 assert.match(presence,/db.removeChannel\(channel\)/);
});
test('RLS migration retains per-viewer topic gates and uses no privilege expansions',()=>{
 const policy=read('supabase/migrations/20261110050000_free_tier_rls_initplan_optimization.sql');
 assert.equal((policy.match(/alter policy /g)||[]).length,13);
 assert.match(policy,/forge-world-v2:/);
 assert.match(policy,/forge-observer:/);
 assert.match(policy,/select auth.uid\(\)/);
 assert.doesNotMatch(policy,/\bgrant\b|\bdisable row level security\b|\bsecurity definer\b/i);
});
