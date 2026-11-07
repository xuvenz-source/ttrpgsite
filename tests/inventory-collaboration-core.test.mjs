import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeInventoryRows,inventoryChangeSet,activeInventoryLocks,
 itemIdentity,removeItemIdentity} from '../src/InventoryCollaborationCore.js';
const id1='a0000000-0000-4000-8000-000000000001';
const id2='a0000000-0000-4000-8000-000000000002';
test('shared inventory overlay applies optimistic edits, deletions and additions without losing unrelated rows',()=>{
 const base=[{_inventoryId:id1,Item:'Rope'},{_inventoryId:id2,Item:'Torch'}];
 const patched=mergeInventoryRows(base,{[id1]:{...base[0],Qty:'2'},[id2]:null});
 assert.deepEqual(patched,[{...base[0],Qty:'2'}]);
 assert.deepEqual(mergeInventoryRows(base,{[id2]:{...base[1],Qty:'3'}}),
  [base[0],{...base[1],Qty:'3'}]);
 assert.deepEqual(mergeInventoryRows(base,{}),base);
});
test('shared inventory diffs target only changed item IDs, including deletions',()=>{
 const base=[{_inventoryId:id1,Item:'Rope',Qty:1},{_inventoryId:id2,Item:'Torch'}];
 assert.deepEqual(inventoryChangeSet(base,[base[0],{...base[1],Qty:2}]),
  [{id:id2,row:{...base[1],Qty:2}}]);
 assert.deepEqual(inventoryChangeSet(base,[base[0]]),[{id:id2,row:null}]);
 assert.deepEqual(inventoryChangeSet(base,base),[]);
 assert.deepEqual(inventoryChangeSet([], [{Item:'New'}],()=>id1),
  [{id:id1,row:{_inventoryId:id1,Item:'New'}}]);
});
test('claims only gray items leased by a nonexpired owner',()=>{
 assert.deepEqual(activeInventoryLocks([
  {item_id:id1,holder_id:'u1',expires_at:new Date(5000).toISOString()},
  {item_id:id2,holder_id:'u2',expires_at:new Date(100).toISOString()}
 ],4000),{[id1]:'u1'});
 assert.equal(itemIdentity({_inventoryId:id1}),id1);
 assert.deepEqual(removeItemIdentity({_inventoryId:id1,Item:'Rope'}),{Item:'Rope'});
});
test('sheet and issued-tool components share a single inventory core and preserve renewals',async()=>{
 const fs=await import('node:fs');
 for(const file of ['src/useCampaignSheetInventory.js','src/useCampaignToolCollaboration.js']){
  const s=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(s,/mergeInventoryRows/);
  assert.match(s,/inventoryChangeSet/);
  assert.match(s,/activeInventoryLocks/);
  assert.match(s,/connected\|\|\+\+reconciliations%8===0/);
  assert.match(s,/\},8000\);/);
 }
});
