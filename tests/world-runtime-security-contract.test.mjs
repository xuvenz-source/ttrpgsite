import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=path=>source('staging/sql-candidates/world_runtime_'+path+'.sql');

test('atomic movement keeps player RLS, explicit DM bypass and full-footprint collision',()=>{
 const s=sql('collision_and_group_move');
 assert.match(s,/language plpgsql volatile security invoker/);
 assert.match(s,/current_setting\('forge\.collision_override',true\)='on'/);
 assert.match(s,/p_ignore_collision and not dm/);
 assert.match(s,/p_token_ids uuid\[\]/);
 assert.match(s,/p_tool_issue_ids uuid\[\]/);
 assert.match(s,/for update/);
 assert.match(s,/forge_visibility\.swept_hits_segment/);
 assert.match(s,/before update of x,y,span_x,span_y,map_id/);
 assert.doesNotMatch(s,/if actor is null or public\.is_campaign_dm\(new\.campaign_id\) then return new/);
 assert.doesNotMatch(s,/disable row level security|grant all on public\.map_tokens/i);
});
test('all trajectory waypoints are committed in a single RLS-invoker transaction',()=>{
 const s=sql('atomic_trajectory');
 assert.match(s,/language plpgsql volatile security invoker/);
 assert.match(s,/jsonb_array_length\(p_steps\) not between 1 and 64/);
 assert.match(s,/public\.move_map_group\(p_map,p_token_ids,p_tool_issue_ids/);
 assert.match(s,/grant execute on function public\.commit_map_trajectory/);
 const board=source('src/BattlemapBoard.jsx');
 const app=source('src/TabletopApp.jsx');
 assert.match(board,/appendMovementWaypoint/);
 assert.match(board,/path:info\.path\|\|\[\]/);
 assert.match(app,/db\.rpc\('commit_map_trajectory'/);
 assert.match(app,/movementPathDeltas/);
});
test('observer motion cannot spoof actor or deliver private maps to other players',()=>{
 const s=sql('private_observer_motion');
 assert.match(s,/actor uuid:=auth\.uid\(\)/);
 assert.match(s,/split_part\(\(select realtime\.topic\(\)\),':',3\)::uuid=auth\.uid\(\)/);
 assert.match(s,/public\.can_view_campaign_map/);
 assert.match(s,/revoke all on forge_visibility\.movement_preview_rates/);
 assert.match(s,/revoke all on function forge_visibility\.dispatch_movement_preview/);
 assert.match(s,/grant execute on function public\.preview_map_motion[\s\S]*?to authenticated/);
 assert.doesNotMatch(s,/create policy "forge observer motion send"/i);
 assert.match(s,/if p_ignore_collision and not dm/);
 assert.match(s,/last_sent-interval '100 milliseconds'/);
 assert.match(s,/history\.last_x/);
 assert.match(s,/forge_visibility\.observer_can_see/);
 assert.match(s,/probe_x:=bx\+\(p_x-bx\)\*probe/);
 assert.match(s,/action','hide'/);
});
test('light masks only disclose authorized lit grid cells and never private wall data',()=>{
 const s=sql('authorized_light_masks');
 assert.match(s,/public\.get_authorized_map_fog\(p_map\)/);
 assert.match(s,/forge_visibility\.ray_blocked\(scene,cx,cy/);
 assert.match(s,/forge_visibility\.point_visible\(p_map,cx,cy,actor\)/);
 assert.match(s,/seen @> jsonb_build_array\(index_cell\)/);
 assert.match(s,/grant execute on function public\.get_authorized_map_light_masks/);
 const layer=source('src/CampaignToolMapLayer.jsx');
 assert.match(layer,/authorizedLightMasks/);
 assert.match(layer,/clipPath=isDM\?occlusion\|\|'inset\(100%\)'/);
 assert.match(layer,/lightCells\?'url\(#'/);
});
test('fog tick hints cannot keep fog-on sight open while awaiting authorization',()=>{
 const s=sql('visibility_tick_metadata');
 assert.match(s,/fog_enforced boolean not null default false/);
 const hook=source('src/useAuthorizedMapFog.js');
 assert.match(hook,/event\?\.new\?\.fog_enforced===false&&previous\?\.enabled===false/);
 assert.match(hook,/previous:fogFrameDuringRefresh\(previous,mapId\)/);
});

test('accepted previews extend fog only through server-authorized sources',()=>{
 const s=sql('preview_visibility');
 assert.match(s,/forge_visibility\.movement_preview_rates rate/);
 assert.match(s,/rate\.actor_id=t\.owner_id/);
 assert.match(s,/rate\.base_x=t\.x and rate\.base_y=t\.y/);
 assert.match(s,/statement_timestamp\(\)-interval '2 seconds'/);
 assert.match(s,/forge_visibility\.point_visible/);
 assert.match(s,/CREATE OR REPLACE FUNCTION public\.get_authorized_map_fog/);
 assert.match(s,/forge_visibility\.is_lit/);
 const app=source('src/TabletopApp.jsx');
 assert.match(app,/queuePreviewFogRefresh\(\)/);
 assert.match(app,/movementSessionTransport\.current\?\.end\(mapId,tokenIds,issueIds\)/);
 assert.match(app,/lastObservedFog\.current/);
 assert.match(app,/current\.revision!==previous\.revision/);
});
test('DM footprint override is explicit and cannot be called by players',()=>{
 const s=sql('dm_footprint_override');
 assert.match(s,/language plpgsql volatile security invoker/);
 assert.match(s,/not public\.is_campaign_dm\(row\.campaign_id\)/);
 assert.match(s,/current_setting|set_config\('forge\.collision_override','on',true\)/);
 assert.match(source('src/MapSettingPanel.jsx'),/DM override: allow moving through walls/);
 assert.match(source('src/TabletopApp.jsx'),/db\.rpc\('resize_map_token'/);
});

test('every staged SQL procedure has matching PostgreSQL dollar delimiters',()=>{
 for(const part of [
  'collision_and_group_move','dm_footprint_override','atomic_trajectory',
  'private_observer_motion','preview_visibility','authorized_light_masks',
  'visibility_tick_metadata']){
  const body=sql(part);
  assert.equal((body.match(/\bas \$\$/g)||[]).length,
   (body.match(/(?:end )?\$\$;/g)||[]).length,part+' $ delimiters');
  assert.equal((body.match(/\bas \$function\$/gi)||[]).length,
   (body.match(/end \$function\$;/gi)||[]).length,part+' named delimiters');
  assert.doesNotMatch(body,/\bas \$(?:\r?\n)/,part+' bare opener');
  assert.doesNotMatch(body,/end \$;/,part+' bare closer');
 }
});

test('temporary movement visibility is revoked on cancel, success and failure',()=>{
 const app=source('src/TabletopApp.jsx');
 assert.match(app,/function clearMapMovementPreview\(mapId,tokenIds=\[\],issueIds=\[\]\)/);
 assert.equal((app.match(/movementSessionTransport\.current\?\.end\(mapId,tokenIds,issueIds\)/g)||[]).length,1);
 assert.match(app,/if\(fog\.frame\?\.enabled===true&&fog\.frame\.mapId===mapId\)\s*void fog\.refresh\(true\)/);
 assert.match(app,/clearMapMovementPreview\(selectedMap,\[token\.id\],\[\]\)/);
 assert.match(app,/clearMapMovementPreview\(selectedMap,\[\],\[placement\.issue_id\]\)/);
 assert.match(app,/previewing:false,ignoreCollision:false,previewTokenId/);
});
