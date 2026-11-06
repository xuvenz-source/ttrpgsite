import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryWeight,gridLayout,moveInventoryItem,evaluateEncumbrance} from '../src/InventoryMath.js';
test('old inventory row values stay valid when layouts change',()=>{
 const items=[{Item:'Rope',Qty:'2',Weight:'10',Notes:'50 feet'},{Item:'Coin',Qty:'3',Weight:'0.1'}];
 assert.equal(inventoryWeight(items),20.3);
 assert.equal(gridLayout(items,4,3).placed.length,2);
 assert.equal(moveInventoryItem(items,0,2,2,4,3)[0].gridX,2);
});
test('grid rejects unavailable spaces and preserves overflow items',()=>{
 const a=[{Item:'Chest',gridX:0,gridY:0,gridW:2,gridH:2},{Item:'Torch',gridX:2,gridY:0}];
 assert.equal(moveInventoryItem(a,1,1,1,3,3),null);
 assert.equal(gridLayout(Array(10).fill({Item:'Box'}),2,2).unplaced.length,6);
});
test('encumbrance defaults match D&D strength-based carrying weights',()=>{
 const template={tabs:[{fields:[{id:'items',type:'inventory'}]}],
  inventoryRules:{enabled:true,scoreField:'strength',capacityMode:'ability',multiplier:15,thresholdMode:'score'}};
 const result=evaluateEncumbrance(template,{strength:12,items:[{Item:'Rock',Qty:1,Weight:125}]});
 assert.equal(result.capacity,180);assert.equal(result.tier?.id,'heavy');
 assert.equal(evaluateEncumbrance(template,{strength:12,items:[]}).tier,null);
});
test('custom fixed capacity, percentages, and hidden icon tiers',()=>{
 const t={tabs:[{fields:[{id:'bag',type:'inventory'}]}],inventoryRules:{
  enabled:true,capacityMode:'fixed',fixedCapacity:80,thresholdMode:'percent',
  tiers:[{id:'slow',label:'Slow',threshold:50,showOnToken:false}]}};
 const e=evaluateEncumbrance(t,{bag:[{Qty:2,Weight:30}]});
 assert.equal(e.capacity,80);assert.equal(e.tier?.id,'slow');assert.equal(e.tier.showOnToken,false);
});
