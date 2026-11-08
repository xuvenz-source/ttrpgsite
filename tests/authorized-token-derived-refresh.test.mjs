import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authorizedTokenDerivedInputsChanged as changed} from '../src/AuthorizedTokenDerivedRefresh.js';

const token=(id,x=1)=>({
 id,map_id:'map-a',x,y:2,visible:true,
 owner_id:'player',character_id:null,npc_bars_public:false
});

test('movement alone and authorized roster order do not force derived monitor and encumbrance RPCs',()=>{
 const original=[token('a',1),token('b',2)];
 const moved=[token('b',5),token('a',7)];
 assert.equal(changed(original,moved,'map-a'),false);
 assert.equal(changed(original,original,'map-a'),false);
});

test('new or revoked RLS-visible tokens refresh derived stats',()=>{
 const a=token('a'),b=token('b');
 assert.equal(changed([a],[a,b],'map-a'),true);
 assert.equal(changed([a,b],[a],'map-a'),true);
});

test('permission, map, character and monitor disclosure changes invalidate derived resources',()=>{
 const a=token('a');
 for(const patch of [
  {map_id:'map-b'}, {owner_id:'other'}, {character_id:'npc-id'},
  {visible:false},{npc_bars_public:true}
 ]){
  assert.equal(changed([a],[{...a,...patch}],'map-a'),true,JSON.stringify(patch));
 }
});

test('invalid/unknown authorization results fail conservatively, not as false cache hits',()=>{
 const a=token('a');
 assert.equal(changed([a],null,'map-a'),true);
 assert.equal(changed(null,[a],'map-a'),true);
 assert.equal(changed([a],[a],''),true);
 assert.equal(changed([a],[a,a],'map-a'),true);
 assert.equal(changed([a,null],[a,a],'map-a'),true);
});

test('fog reconcilers always re-query RLS before deciding whether to refresh costly derived data',()=>{
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 assert.match(app,/async function refreshFogAwareTokens\(\)/);
 assert.match(app,/const authorized=await refreshTokens\(true\)/);
 assert.match(app,/if\(authorizedTokenDerivedInputsChanged\(previous,authorized,context\.mapId\)\)/);
 assert.match(app,/await refreshMonitors\(true\)/);
 assert.match(app,/void refreshFogAwareTokens\(\);void campaignTools\.refresh\(undefined,true\)/);
 assert.match(app,/if\(!Array\.isArray\(authorized\)\|\|/);
 assert.match(app,/tokenContextRef\.current\.userId!==context\.userId/);
 // Server-authoritative per-row patches and explicit sheet/resource invalidation survive.
 assert.match(app,/if\(isMotionOnly\)motionUpdates\.request\(\)/);
 assert.match(app,/else tokenUpdates\.request\(\)/);
 assert.match(app,/event:'monitors-changed'/);
});
