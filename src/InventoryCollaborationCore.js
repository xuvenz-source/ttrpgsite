import {inventoryRows} from './InventoryMath.js';

// Shared, pure primitives for tool and character/NPC inventory collaboration.
// The server still authorizes each claim, mutation and lease release.
export const validInventoryItemId=value=>
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
export const itemIdentity=row=>validInventoryItemId(row?._inventoryId)?row._inventoryId:null;
export const removeItemIdentity=row=>{
 const copy={...(row||{})};
 delete copy._inventoryId;
 return copy;
};
export function mergeInventoryRows(rows,optimistic={}){
 const seen=new Set();
 const next=inventoryRows(rows).flatMap(row=>{
  const id=itemIdentity(row);
  if(!id)return [row];
  seen.add(id);
  if(!Object.hasOwn(optimistic,id))return [row];
  return optimistic[id]===null?[]:[optimistic[id]];
 });
 for(const [id,row] of Object.entries(optimistic))
  if(!seen.has(id)&&row!==null)next.push(row);
 return next;
}
export function inventoryChangeSet(current,next,createId=()=>crypto.randomUUID()){
 const previous=new Map(inventoryRows(current).map(row=>[itemIdentity(row),row]));
 const incoming=new Map();
 for(const item of inventoryRows(next)){
  const id=itemIdentity(item)||createId();
  incoming.set(id,{...item,_inventoryId:id});
 }
 const changes=[];
 for(const [id,row] of incoming)
  if(!previous.has(id)||JSON.stringify(previous.get(id))!==JSON.stringify(row))
   changes.push({id,row});
 for(const [id] of previous)
  if(id&&!incoming.has(id))changes.push({id,row:null});
 return changes;
}
export const activeInventoryLocks=(claims,now=Date.now())=>
 Object.fromEntries((claims||[]).filter(l=>Date.parse(l.expires_at)>now)
  .map(l=>[l.item_id,l.holder_id]));
