import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isFreshVisibilityTick} from '../src/FogVisibilityContinuity.js';

const confirmed={mapId:'map-a',revision:12,enabled:true};
const pending={mapId:'map-a',revision:13,fogEnforced:true};

test('duplicate pending visibility ticks do not cancel an in-flight authorized fog request',()=>{
 assert.equal(isFreshVisibilityTick(
  {revision:13,fog_enforced:true},confirmed,'map-a',pending),false);
 assert.equal(isFreshVisibilityTick(
  {revision:12,fog_enforced:true},confirmed,'map-a',pending),false);
});

test('a genuinely newer fog revision must still revoke stale sight immediately',()=>{
 assert.equal(isFreshVisibilityTick(
  {revision:14,fog_enforced:true},confirmed,'map-a',pending),true);
});

test('fog mode changes must not be suppressed by a pending revision',()=>{
 assert.equal(isFreshVisibilityTick(
  {revision:13,fog_enforced:false},confirmed,'map-a',pending),true);
});

test('unknown or malformed notifications remain fail closed',()=>{
 assert.equal(isFreshVisibilityTick(null,confirmed,'map-a',pending),true);
 assert.equal(isFreshVisibilityTick(
  {revision:13,fog_enforced:'true'},confirmed,'map-a',pending),true);
 assert.equal(isFreshVisibilityTick(
  {revision:'not-a-number',fog_enforced:true},confirmed,'map-a',pending),true);
});

test('pending revisions are isolated by map and confirmed RPCs still dedupe old ticks',()=>{
 assert.equal(isFreshVisibilityTick(
  {revision:13,fog_enforced:true},confirmed,'map-b',pending),true);
 assert.equal(isFreshVisibilityTick(
  {revision:12,fog_enforced:true},confirmed,'map-a',null),false);
 assert.equal(isFreshVisibilityTick(
  {revision:13,fog_enforced:true},confirmed,'map-a',null),true);
});

test('the hook stores pending ticks and clears them after a confirmed response or cleanup',()=>{
 const source=readFileSync(new URL('../src/useAuthorizedMapFog.js',import.meta.url),'utf8');
 assert.match(source,/pendingTick\.current=\{/u);
 // The ternary writes a structured pending revision when notifications are valid.
 assert.match(source,/\{mapId,revision,fogEnforced:tick\.fog_enforced\}/u);
 assert.match(source,/pendingTick\.current=null;\s*setFrame\(previous=>retainFogSnapshot/u);
 assert.match(source,/pendingTick\.current=null;coordinator\.invalidate\(key\);changed\.cancel/u);
});
