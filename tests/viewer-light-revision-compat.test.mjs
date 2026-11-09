import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAuthorizedFogFrame} from '../src/MapFogModel.js';
import {normalizeAuthorizedLightMasks} from '../src/AuthorizedLightMasks.js';
import {retainFogSnapshot} from '../src/FogVisibilityContinuity.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const mapId='00000000-0000-4000-8000-000000000001';
const lightId='00000000-0000-4000-8000-000000000002';
const fog={mapId,width:4,height:4,revision:8,enabled:true,
 partyShared:false,visible:[5],explored:[5]};
const light={mapId,width:4,height:4,revision:8,
 masks:[{id:lightId,cells:[5]}]};

test('v2 viewer fog revision stays labeled after sanitization',()=>{
 const legacy=normalizeAuthorizedFogFrame(fog,mapId);
 const viewer=normalizeAuthorizedFogFrame({...fog,protocolVersion:2},mapId);
 assert.equal(legacy.protocolVersion,undefined);
 assert.equal(viewer.protocolVersion,2);
 assert.equal(viewer.revision,8);
 assert.equal(retainFogSnapshot(legacy,viewer),viewer,
  'identical numeric revisions across different protocols are NOT equivalent');
 assert.equal(retainFogSnapshot(viewer,{...viewer}),viewer,
  'identical viewer revision should preserve object identity');
});

test('a global light revision cannot masquerade as a per-viewer light revision',()=>{
 const legacy=normalizeAuthorizedLightMasks(light,mapId);
 const viewer=normalizeAuthorizedLightMasks({...light,protocolVersion:2},mapId);
 assert.equal(legacy.protocolVersion,undefined);
 assert.equal(viewer.protocolVersion,2);
 assert.equal(legacy.revision,viewer.revision,
  'same numeric revision alone must not prove authorization parity');
 assert.equal(normalizeAuthorizedLightMasks({...light,protocolVersion:3},mapId),null);
 assert.equal(normalizeAuthorizedLightMasks({...light,protocolVersion:0},mapId),null);
});

test('hook selects v2 RPC only for confirmed viewer fog, and never silently falls back',()=>{
 const app=read('src/TabletopApp.jsx');
 const hook=read('src/useAuthorizedMapLights.js');
 assert.match(app,/protocolVersion:fog\.frame\?\.protocolVersion===2\?2:1/);
 assert.match(hook,/protocolVersion===2\?\s*'get_authorized_map_light_masks_v2':'get_authorized_map_light_masks'/);
 assert.match(hook,/\(safe\.protocolVersion===2\?2:1\)===protocolVersion/);
 assert.match(hook,/\(result\.protocolVersion===2\?2:1\)===protocolVersion/);
 assert.doesNotMatch(hook,/get_authorized_map_light_masks_v2'[\s\S]*?catch[\s\S]*?db\.rpc\('get_authorized_map_light_masks'/);
});

test('additive viewer light wrapper preserves original authorized light calculation and checks revision',()=>{
 const sql=read('staging/sql-candidates/viewer_light_masks_v2.sql');
 const undo=read('staging/sql-candidates/rollback_viewer_light_masks_v2.sql');
 assert.match(sql,/create or replace function public\.get_authorized_map_light_masks_v2\(p_map uuid\)/);
 assert.match(sql,/public\.can_view_campaign_map\(camp,p_map\)/);
 assert.match(sql,/result := public\.get_authorized_map_light_masks\(p_map\)/);
 assert.match(sql,/before_rev is distinct from after_rev/);
 assert.match(sql,/'protocolVersion',2,'revision',after_rev/);
 assert.match(sql,/revoke all on function public\.get_authorized_map_light_masks_v2\(uuid\)\s+from public,anon/);
 assert.match(sql,/grant execute on function public\.get_authorized_map_light_masks_v2\(uuid\)\s+to authenticated/);
 assert.doesNotMatch(sql,/drop\s+(?:function|table)\s+public\./i);
 assert.match(undo,/drop function if exists public\.get_authorized_map_light_masks_v2\(uuid\)/);
 assert.doesNotMatch(undo,/drop function.*get_authorized_map_light_masks\(uuid\)/);
});

test('observer hide markers survive timer expiry until later trusted grant',()=>{
 const app=read('src/TabletopApp.jsx');
 assert.match(app,/if\(payload.action==='hide'\)\{/);
 assert.match(app,/setRemoteTokenPositions\(markHidden\)/);
 assert.match(app,/if\(isToken\)setRemoteTokenPositions\(clearHidden\)/);
 assert.match(app,/acceptObserverMovementPacket\(payload,observerRevisions\.current\)/);
 assert.doesNotMatch(app,/const unhide=prior/);
 assert.match(app,/Timeout may reconcile positions but must/);
});

test('switching fog notification streams cannot clear a confirmed map to black',()=>{
 const source=read('src/useAuthorizedMapFog.js');
 const start=source.indexOf('Authorization identity changes must discard');
 const end=source.indexOf('// Invalidate in-flight RPCs',start);
 assert.ok(start>=0&&end>start,'identity-only initialization must be isolated');
 const identity=source.slice(start,end);
 assert.match(identity,/setFrame\(null\);setPublished\(null\);setError\(''\)/);
 assert.match(identity,/\[db,campaignId,mapId,userId,isDM,refresh,key,coordinator(?:,enabled)?\]/);
 assert.doesNotMatch(identity,/scope\]/);
 assert.match(source,/if\(state==='SUBSCRIBED'\)\{[\s\S]*?fogFrameDuringRefresh\(previous,mapId\)/);
});
