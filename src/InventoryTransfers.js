import {gridLayout,inventoryRows,itemSize} from './InventoryMath.js';

/** Only inventory panels mounted in this browser document are drop targets.
 * Cross-window transfers use the item-details Move menu instead. */
const openInventories=new Map();
export const inventoryScope=ctx=>ctx?.kind==='tool'?
 'tool:'+ctx.issueId:ctx?.kind==='sheet'?
 'sheet:'+ctx.sourceType+':'+ctx.sourceId+':'+ctx.fieldId:'';
export function registerOpenInventory(context,entry){
 const key=inventoryScope(context);
 if(!key)return ()=>{};
 openInventories.set(key,entry);
 return ()=>{if(openInventories.get(key)===entry)openInventories.delete(key)};
}
export function inventoryAtPoint(doc,x,y,source){
 const node=doc.elementFromPoint(x,y)?.closest?.('[data-inventory-key]');
 const key=node?.getAttribute('data-inventory-key');
 if(!key||key===source)return null;
 const entry=openInventories.get(key);
 return entry?{...entry,key,node}:null;
}
export function requestedTransferPosition(target,x,y){
 if(target.field?.inventoryPreset!=='grid')return null;
 const rect=target.node?.querySelector('.inventory-slot-grid')?.getBoundingClientRect();
 if(!rect)return null;
 const col=Math.floor((x-rect.left-5)/50);
 const row=Math.floor((y-rect.top-5)/50);
 const width=Math.max(2,Math.min(20,Number(target.field.gridColumns)||8));
 const height=Math.max(2,Math.min(20,Number(target.field.gridRows)||5));
 return col>=0&&row>=0&&col<width&&row<height?{x:col,y:row}:null;
}
export function suggestInventoryPosition(items,field,item,requested=null){
 if(field.inventoryPreset!=='grid')return null;
 const width=Math.max(2,Math.min(20,Number(field.gridColumns)||8));
 const height=Math.max(2,Math.min(20,Number(field.gridRows)||5));
 const w=Number(item.gridW)||1,h=Number(item.gridH)||1;
 if(w>width||h>height)return null;
 const {placed}=gridLayout(inventoryRows(items),width,height);
 const fits=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&
  x+w<=width&&y+h<=height&&placed.every(p=>
   x+w<=p.x||p.x+p.w<=x||y+h<=p.y||p.y+p.h<=y);
 if(requested)return fits(requested.x,requested.y)?requested:null;
 for(let y=0;y<=height-h;y++)for(let x=0;x<=width-w;x++)
  if(fits(x,y))return {x,y};
 return null;
}
export async function loadInventoryTransferTargets({db,campaignId,context,userId,isDM=false}){
 if(!db||!campaignId||!context)throw Error('Inventory transfer is unavailable.');
 if(context.kind==='sheet'){
  const {data,error}=await db.from('campaign_tool_issues')
   .select('id,name,kind,party_shared,owner_id,config')
   .eq('campaign_id',campaignId).in('kind',['inventory','mount']);
  if(error)throw error;
  return (data||[]).filter(t=>isDM||t.party_shared||t.owner_id===userId)
   .map(t=>({kind:'tool',issueId:t.id,label:t.name+
    (t.party_shared?' (party inventory)':''),field:{
     inventoryPreset:t.config?.inventoryMode||'list',
     gridColumns:t.config?.columns||8,gridRows:t.config?.rows||5
    }}));
 }
 if(context.kind==='tool'){
  const [{data:chars,error:ce},{data:campaign,error:te}]=await Promise.all([
   db.from('characters').select('id,name,user_id').eq('campaign_id',campaignId),
   db.from('campaigns').select('sheet_template').eq('id',campaignId).single()
  ]);
  if(ce||te)throw ce||te;
  const fields=(campaign?.sheet_template?.tabs||[]).flatMap(tab=>tab.fields||[])
   .filter(f=>f.type==='inventory');
  return (chars||[]).filter(c=>isDM||c.user_id===userId).flatMap(c=>
   fields.map(f=>({kind:'sheet',sourceType:'character',sourceId:c.id,
    fieldId:f.id,label:c.name+' — '+(f.label||'Inventory'),field:f})));
 }
 return [];
}
export function sameInventory(a,b){return inventoryScope(a)===inventoryScope(b)}
export async function transferInventoryItem({db,campaignId,source,target,itemId,position=null}){
 if(!source||!target||sameInventory(source,target)||
  !['sheet','tool'].includes(source.kind)||!['sheet','tool'].includes(target.kind)||
  source.kind===target.kind)throw Error('Choose a different character or shared inventory.');
 const sheet=source.kind==='sheet'?source:target;
 const tool=source.kind==='tool'?source:target;
 if(sheet.sourceType!=='character')throw Error('Only character and shared-tool transfers are supported.');
 const {error}=await db.rpc('transfer_campaign_inventory_item',{
  p_campaign:campaignId,p_sheet:sheet.sourceId,p_field:sheet.fieldId,
  p_issue:tool.issueId,p_item:itemId,
  p_direction:source.kind==='sheet'?'to_tool':'to_sheet',
  p_x:position?.x??null,p_y:position?.y??null
 });
 if(error)throw error;
 return true;
}
