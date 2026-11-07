import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normaliseToolConfig,toolCanBeHeld,toolMapProjection} from '../src/CampaignTools.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('holdable is opt-in, retained across tool kinds and excludes invalid values',()=>{
 for(const kind of ['torch','mount','inventory']){
  assert.equal(normaliseToolConfig(kind,{}).holdable,false);
  assert.equal(normaliseToolConfig(kind,{holdable:true}).holdable,true);
  assert.equal(normaliseToolConfig(kind,{holdable:'true'}).holdable,false);
  assert.equal(toolCanBeHeld({kind,config:{holdable:true}}),true);
  assert.equal(toolCanBeHeld({kind,config:{holdable:false}}),false);
 }
 assert.equal(toolCanBeHeld(null),false);
});
test('carrier identity reaches sanitized map projection without duplicating inventory',()=>{
 const projection=toolMapProjection({id:'tool',campaign_id:'campaign',kind:'torch',
  name:'Torch',icon:'🔥',config:{holdable:true,bright:20,dim:10},state:{lit:true},
  held_by_token_id:'carrier'},'map',2,3);
 assert.equal(projection.held_by_token_id,'carrier');
 assert.equal(projection.light_enabled,true);
 assert.equal(projection.light_bright,20);
 assert.equal(projection.light_dim,10);
 assert.ok(!Object.hasOwn(projection,'state'));
 assert.ok(!Object.hasOwn(projection,'items'));
});
test('pin preview uses RLS note reader, safe shared body and separate deletion route',()=>{
 const board=read('src/BattlemapBoard.jsx');
 const layer=read('src/MapPinLayer.jsx');
 const body=read('src/HandoutBody.jsx');
 const settings=read('src/MapSettingPanel.jsx');
 const app=read('src/TabletopApp.jsx');
 assert.match(layer,/onRead\?\.\(pin\)/);
 assert.match(layer,/onDelete\?\.\(selectedPin\)/);
 assert.match(layer,/role="dialog"/);
 assert.match(layer,/onSelect\?\.\(pin\)/);
 assert.match(board,/onDeleteHandoutPin\?\.\(pin\)/);
 assert.match(settings,/Selected pin/);
 assert.match(settings,/Delete selected pin/);
 assert.match(app,/onReadHandoutPin=\{readMapHandoutPin\}/);
 assert.match(body,/https:\\\/\\\//);
 assert.match(body,/referrerPolicy="no-referrer"/);
 assert.doesNotMatch(body,/dangerouslySetInnerHTML/);
 assert.doesNotMatch(settings,/These edits are drafts until published/);
 assert.doesNotMatch(settings,/Published map rules/);
});
test('issued holdable tools attach through map drops and disappear as separate icons',()=>{
 const board=read('src/BattlemapBoard.jsx'),layer=read('src/CampaignToolMapLayer.jsx');
 const hook=read('src/useCampaignTools.js'),panel=read('src/CampaignToolsPanel.jsx');
 const quick=read('src/TokenQuickEdit.jsx'),app=read('src/TabletopApp.jsx');
 assert.match(panel,/Can be picked up or held by a token/);
 assert.match(board,/onToolHold\?\.\(id,carrier\)/);
 assert.match(board,/onToolHold\?\.\(issue\.id,carrier\.id\)/);
 assert.match(layer,/!carrier&&<button type="button"/);
 assert.match(layer,/tokenPositions\[carrier\.id\]/);
 assert.match(hook,/\.is\('held_by_token_id',null\)/);
 assert.match(hook,/\.eq\('held_by_token_id',token\.id\)/);
 assert.match(hook,/async function dropHeld/);
 assert.match(app,/heldTools=\{campaignTools\.issued\.filter/);
 assert.match(quick,/Held tools/);
 assert.match(quick,/onDropHeldTool\(tool\)/);
});
test('staged SQL validates same-map ownership, carrier release and public light projection',()=>{
 const sql=read('supabase/migrations/20261108023000_holdable_campaign_tools.sql');
 assert.match(sql,/public\.map_tokens\(id\) on delete set null/);
 assert.match(sql,/campaign_tool_templates_holdable_bool/);
 assert.match(sql,/Only the current carrier or DM can drop a held tool/);
 assert.match(sql,/v_carrier\.campaign_id is distinct from new\.campaign_id/);
 assert.match(sql,/v_carrier\.map_id is distinct from new\.map_id/);
 assert.match(sql,/v_carrier\.owner_id is distinct from \(select auth\.uid\(\)\)/);
 assert.match(sql,/new\.held_by_token_id is not distinct from old\.held_by_token_id/);
 assert.match(sql,/held_by_token_id=excluded\.held_by_token_id/);
 assert.doesNotMatch(sql,/alter table.*disable row level security/i);
});
