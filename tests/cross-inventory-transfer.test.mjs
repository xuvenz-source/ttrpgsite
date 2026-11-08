import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventoryScope,suggestInventoryPosition,requestedTransferPosition,
 transferInventoryItem,loadInventoryTransferTargets} from '../src/InventoryTransfers.js';

const source={kind:'sheet',sourceType:'character',sourceId:'char1',fieldId:'pack'};
const party={kind:'tool',issueId:'issue1'};
const grid={inventoryPreset:'grid',gridColumns:4,gridRows:3};
const one={Item:'Rope',gridW:2,gridH:1};
const sql=readFileSync(new URL('../staging/sql-candidates/campaign_cross_inventory_item_transfers.sql',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/InventoryPanel.jsx',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/InventoryItemEditor.jsx',import.meta.url),'utf8');

test('inventory drag scopes do not confuse source and target',()=>{
 assert.equal(inventoryScope(source),'sheet:character:char1:pack');
 assert.equal(inventoryScope(party),'tool:issue1');
 assert.notEqual(inventoryScope(source),inventoryScope(party));
 assert.equal(requestedTransferPosition({
  field:grid,node:{querySelector:()=>({getBoundingClientRect:()=>({left:100,top:200})})}
 },207,257).x,2);
 assert.deepEqual(requestedTransferPosition({
  field:{inventoryPreset:'list'},node:null
 },207,257),null);
});
test('transferred footprints use contiguous empty cells, not raw item count',()=>{
 const rows=[
  {_inventoryId:'one',gridX:0,gridY:0,gridW:2,gridH:1},
  {_inventoryId:'two',gridX:2,gridY:0,gridW:2,gridH:1},
  {_inventoryId:'three',gridX:0,gridY:1,gridW:1,gridH:2}
 ];
 assert.deepEqual(suggestInventoryPosition(rows,grid,one),{x:1,y:1});
 assert.equal(suggestInventoryPosition(rows,grid,one,{x:0,y:0}),null);
 assert.equal(suggestInventoryPosition(rows,grid,{gridW:5,gridH:1}),null);
 assert.deepEqual(suggestInventoryPosition([],grid,one,{x:0,y:0}),{x:0,y:0});
});
test('one atomic RPC handles both transfer directions and carries destination coordinates',async()=>{
 const calls=[];
 const db={rpc:async(name,params)=>{calls.push({name,params});return {error:null}}};
 await transferInventoryItem({db,campaignId:'campaign1',source,target:party,
  itemId:'item1',position:{x:2,y:0}});
 await transferInventoryItem({db,campaignId:'campaign1',source:party,target:source,
  itemId:'item2'});
 assert.deepEqual(calls.map(c=>c.params.p_direction),['to_tool','to_sheet']);
 assert.equal(calls[0].name,'transfer_campaign_inventory_item');
 assert.equal(calls[0].params.p_sheet,'char1');
 assert.equal(calls[0].params.p_issue,'issue1');
 assert.equal(calls[0].params.p_x,2);
 assert.equal(calls[1].params.p_x,null);
 await assert.rejects(transferInventoryItem({db,campaignId:'campaign1',
  source,target:source,itemId:'item3'}),/different/);
});
test('destination picker filters unauthorized tools and characters in the client',async()=>{
 const db={from(table){
  const data=table==='campaign_tool_issues'?[
   {id:'a',name:'Shared Stash',kind:'inventory',party_shared:true},
   {id:'b',name:'Other Backpack',kind:'mount',owner_id:'someone-else',party_shared:false}
  ]:table==='characters'?[
   {id:'own',name:'Hero',user_id:'player'},
   {id:'other',name:'NPC Friend',user_id:'someone-else'}
  ]:[{sheet_template:{tabs:[{fields:[{
   type:'inventory',id:'bag',label:'Backpack',inventoryPreset:'grid',gridColumns:8,gridRows:5
  }]}]}}];
  const chain={select:()=>chain,eq:()=>chain,in:()=>chain,
   single:async()=>({data:data[0],error:null}),then(resolve){
    return Promise.resolve({data,error:null}).then(resolve);
   }};
  return chain;
 }};
 const tools=await loadInventoryTransferTargets({db,campaignId:'campaign1',
  context:source,userId:'player'});
 assert.deepEqual(tools.map(t=>t.issueId),['a']);
 const sheets=await loadInventoryTransferTargets({db,campaignId:'campaign1',
  context:party,userId:'player'});
 assert.deepEqual(sheets.map(t=>t.sourceId),['own']);
});
test('server candidate requires source lease, both permissions and transactional writes',()=>{
 assert.match(sql,/can_edit_campaign_sheet_inventory/);
 assert.match(sql,/p_direction is null/);
 assert.match(sql,/coalesce\(tool_row\.owner_id=actor,false\)/);
 assert.match(sql,/coalesce\(tool_row\.party_shared,false\)/);
 assert.match(sql,/campaign_tool_item_leases/);
 assert.match(sql,/campaign_sheet_item_leases/);
 assert.match(sql,/holder_id=actor and l.expires_at>now\(\)/);
 assert.match(sql,/for update/);
 assert.match(sql,/find_campaign_inventory_transfer_slot/);
 assert.match(sql,/updated_from/);
 assert.match(sql,/next_target/);
 assert.match(sql,/grant execute on function public.transfer_campaign_inventory_item[\s\S]*to authenticated/);
 assert.doesNotMatch(sql,/grant execute on function public.transfer_campaign_inventory_item[\s\S]*to anon/);
});
test('both transfer gestures use one destination-aware path and surface errors',()=>{
 assert.match(panel,/inventoryAtPoint\(document,e.clientX,e.clientY,transferKey\)/);
 assert.match(panel,/transferInventoryItem\(\{db:transferContext.db/);
 assert.match(panel,/loadInventoryTransferTargets\(\{\s*\.\.\.transferContext,context:transferContext/);
 assert.match(panel,/onRequestMoveTargets=/);
 assert.match(panel,/onMove=/);
 assert.match(editor,/Move item…/);
 assert.match(editor,/await persist\(\)/);
});
