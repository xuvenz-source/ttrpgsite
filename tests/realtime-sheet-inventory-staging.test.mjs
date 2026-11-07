import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {itemIdentity,removeItemIdentity} from '../src/useCampaignToolCollaboration.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/main.jsx'),editor=read('src/InventoryItemEditor.jsx'),
 panel=read('src/InventoryPanel.jsx'),dm=read('src/TabletopSidebar.jsx'),
 style=read('src/style.css'),char=read('src/CharacterEditor.jsx'),
 npc=read('src/NpcEditor.jsx'),tool=read('src/CampaignToolSheet.jsx');
const sqlTool=read('staging/sql-candidates/campaign_tool_item_collaboration.sql'),
 sqlSheet=read('staging/sql-candidates/campaign_sheet_inventory_collaboration.sql');

test('item identity survives edits without exposing the reserved internal field',()=>{
 const id='ebe41ab3-733a-42f3-83eb-12d15db48698',
  row={_inventoryId:id,Item:'Rope',Qty:'2',gridX:2};
 assert.equal(itemIdentity(row),id);
 assert.equal(itemIdentity({Item:'legacy'}),null);
 assert.equal(itemIdentity({_inventoryId:'not-a-uuid'}),null);
 assert.deepEqual(removeItemIdentity(row),{Item:'Rope',Qty:'2',gridX:2});
 assert.equal(row._inventoryId,id);
});

test('DM tab subcategories preserve the actual three workflows',()=>{
 assert.match(dm,/setDmSubsection\('live'\)/);
 assert.match(dm,/dmSubsection==='live'/);
 assert.match(dm,/dmSubsection==='maps'/);
 assert.match(dm,/dmSubsection==='campaign'/);
 assert.match(dm,/label:'Live play'/);
 assert.match(dm,/label:'Maps'/);
 assert.match(dm,/label:'Campaign'/);
 for(const key of ['bestiary','combat','distribute','maps','map-setting',
  'token','template','invites'])
  assert.ok(dm.includes("menuKey={'dm/"+key+"'}"),key);
 assert.match(style,/\.dm-subtabs button\.selected/);
});
test('weapon chat header is condensed without sacrificing its green theme',()=>{
 assert.match(style,/\.macro-chat-card\.weapon-attack \.macro-chat-header\{\s*background:linear-gradient\(180deg,#527b56,#365e3a\)/);
 assert.match(style,/\.macro-chat-card\.weapon-attack \.macro-chat-header\{\s*flex-direction:row/);
 assert.match(style,/\.macro-chat-card\.weapon-attack \.macro-chat-header strong\{font-size:11px/);
});
test('character, NPC and issued tool sheets autosave with live grid items',()=>{
 assert.match(app,/<SharedInventoryPanel db=\{db\} campaignId=\{activeId\}/);
 assert.match(char,/<SharedInventoryPanel db=\{db\} campaignId=\{campaignId\}/);
 assert.match(npc,/<SharedInventoryPanel db=\{db\} campaignId=\{campaignId\}/);
 assert.match(tool,/onChange=\{collab\.changeItems\}/);
 assert.match(char,/useSheetAutosave/);
 assert.match(npc,/useSheetAutosave/);
 assert.doesNotMatch(tool,/>Save changes<\/button>/);
 assert.doesNotMatch(char,/>Save player character<\/button>/);
 assert.doesNotMatch(npc,/>Save & close<\/button>/);
 assert.doesNotMatch(editor,/>Save item<\/button>/);
 assert.match(editor,/Edits save automatically/);
});
test('item edits and releases use leases rather than entire inventory saves',()=>{
 const hook=read('src/useCampaignSheetInventory.js');
 const toolHook=read('src/useCampaignToolCollaboration.js');
 for(const [text,claim,mutate,release] of [
  [hook,'claim_campaign_sheet_item','mutate_campaign_sheet_item','release_campaign_sheet_item'],
  [toolHook,'claim_campaign_tool_item','mutate_campaign_tool_item','release_campaign_tool_item']
 ]){
  assert.ok(text.includes("db.rpc('"+claim+"'"));
  assert.ok(text.includes("db.rpc('"+mutate+"'"));
  assert.ok(text.includes("db.rpc('"+release+"'"));
  assert.match(text,/writes\.current\.set\(id,/);
  assert.match(text,/claimsInFlight\.current/);
 }
 assert.match(panel,/inventory-grid-item-bound/);
 assert.match(panel,/title="DM: take control of this item"/);
 assert.match(panel,/claim\(index,true\)/);
 assert.match(style,/\.inventory-grid-item-bound/);
});
test('tool item SQL authorizes edits server-side, applies one row and blocks older direct writes',()=>{
 assert.match(sqlTool,/campaign_tool_item_leases enable row level security/);
 assert.match(sqlTool,/public\.is_campaign_dm\(target\.campaign_id\)/);
 assert.match(sqlTool,/target\.party_shared or target\.owner_id=actor/);
 assert.match(sqlTool,/gm and p_takeover/);
 assert.match(sqlTool,/for update/);
 assert.match(sqlTool,/if not exists\(select 1 from public\.campaign_tool_item_leases/);
 assert.match(sqlTool,/holder_id=actor and l\.expires_at>now\(\)/);
 assert.match(sqlTool,/jsonb_set\(target\.state,'\{items\}',next_items,true\)/);
 assert.match(sqlTool,/current_user='authenticated'/);
 assert.match(sqlTool,/reject_direct_tool_inventory_overwrite/);
 assert.match(sqlTool,/grant execute on function public\.mutate_campaign_tool_item/);
});
test('sheet Inventory RPCs check owner and actual field type and refuse overwrite',()=>{
 assert.match(sqlSheet,/campaign_sheet_item_leases enable row level security/);
 assert.match(sqlSheet,/source_type text not null check/);
 assert.match(sqlSheet,/c\.user_id=actor or public\.is_campaign_dm\(p_campaign\)/);
 assert.match(sqlSheet,/f\.value->>'type'='inventory'/);
 assert.match(sqlSheet,/get_campaign_sheet_inventory/);
 assert.match(sqlSheet,/mutate_campaign_sheet_item/);
 assert.match(sqlSheet,/p_takeover/);
 assert.match(sqlSheet,/for update/);
 assert.match(sqlSheet,/reject_direct_sheet_inventory_overwrite/);
 assert.match(sqlSheet,/jsonb_set\(coalesce\(field_values,'\{\}'::jsonb\),array\[p_field\],next_rows,true\)/);
 assert.match(sqlSheet,/p_values-inventory_fields/);
 assert.match(sqlSheet,/grant execute on function public\.patch_campaign_sheet_noninventory/);
 assert.match(app,/patch_campaign_sheet_noninventory/);
 assert.match(char,/patch_campaign_sheet_noninventory/);
});
test('staging backend candidates are explicitly non-production',()=>{
 for(const candidate of [sqlTool,sqlSheet]){
  assert.match(candidate,/STAGING ONLY/);
  assert.doesNotMatch(candidate,/create extension .*pg_cron/);
  assert.doesNotMatch(candidate,/alter table .* disable row level security/);
 }
 const workflow=read('docs/development-workflow.md');
 assert.match(workflow,/existing live test campaigns/);
});
