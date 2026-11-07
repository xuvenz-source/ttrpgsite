/** Shared inventory maths; original list rows stay compatible with grid rows.
 * An item is one object, generally {Item, Qty, Weight, Notes, gridX, gridY}. */
export const DEFAULT_ENCUMBRANCE={
 enabled:false,unit:'lb',capacityMode:'ability',scoreField:'strength',
 multiplier:15,bonus:0,fixedCapacity:150,thresholdMode:'score',
 tiers:[
  {id:'light',label:'Light encumbrance',threshold:5,icon:'⚖️',showOnToken:true},
  {id:'heavy',label:'Heavy encumbrance',threshold:10,icon:'🐌',showOnToken:true},
  {id:'maximum',label:'At carry capacity',threshold:15,icon:'⛓️',showOnToken:true}
 ]
};
const finite=(v,defaultValue=0)=>v===null||v===undefined||String(v).trim()===''?
 defaultValue:(Number.isFinite(Number(v))?Number(v):defaultValue);
export const inventoryRows=value=>Array.isArray(value)?value.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)):[];
const matchKey=(r,key)=>Object.keys(r).find(k=>k.toLowerCase()===key.toLowerCase());
export const rowValue=(r,key)=>r?.[matchKey(r||{},key)||key];
export function inventoryWeight(rows){
 return inventoryRows(rows).reduce((total,row)=>{
  const qty=Math.max(0,Math.min(100000,finite(rowValue(row,'Qty'),1)));
  const weight=Math.max(0,Math.min(100000,finite(rowValue(row,'Weight'),0)));
  return total+qty*weight;
 },0);
}
export function evaluateEncumbrance(template,values={}){
 const config={...DEFAULT_ENCUMBRANCE,...(template?.inventoryRules||{})};
 const inventoryFields=(template?.tabs||[]).flatMap(t=>t.fields||[])
  .filter(f=>f.type==='inventory');
 const weight=inventoryFields.reduce((sum,f)=>sum+inventoryWeight(values?.[f.id]),0);
 const strength=finite(values?.[config.scoreField],10);
 const capacity=Math.max(0,config.capacityMode==='fixed'?
  finite(config.fixedCapacity,150):
  strength*finite(config.multiplier,15)+finite(config.bonus,0));
 const tiers=(Array.isArray(config.tiers)?config.tiers:DEFAULT_ENCUMBRANCE.tiers)
  .filter(t=>t&&typeof t==='object')
  .map(t=>({...t,weightAt:Math.max(0,config.thresholdMode==='fixed'?finite(t.threshold):
   config.thresholdMode==='percent'?capacity*finite(t.threshold)/100:
   strength*finite(t.threshold))}))
  .sort((a,b)=>a.weightAt-b.weightAt);
 const tier=tiers.filter(t=>weight>=t.weightAt).at(-1)||null;
 return {weight,capacity,tier,tiers,unit:config.unit||'lb',enabled:config.enabled===true,
  strength};
}
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export function itemSize(row,cols=8,rows=5){
 return {w:clamp(Math.floor(finite(row?.gridW,1)),1,cols),
  h:clamp(Math.floor(finite(row?.gridH,1)),1,rows)};
}
export function gridLayout(items,columns=8,rows=5){
 const cols=clamp(Math.floor(finite(columns,8)),2,20),height=clamp(Math.floor(finite(rows,5)),2,20);
 const used=new Set(),placed=[],unplaced=[];
 const fits=(x,y,w,h)=>x>=0&&y>=0&&x+w<=cols&&y+h<=height&&
  Array.from({length:w*h},(_,i)=>(x+i%w)+','+(y+Math.floor(i/w))).every(key=>!used.has(key));
 inventoryRows(items).forEach((row,index)=>{
  const {w,h}=itemSize(row,cols,height);
  let x=Number.isInteger(row.gridX)?row.gridX:-1,y=Number.isInteger(row.gridY)?row.gridY:-1;
  if(!fits(x,y,w,h)){
   x=-1;y=-1;
   outer:for(let py=0;py<=height-h;py++)for(let px=0;px<=cols-w;px++)
    if(fits(px,py,w,h)){x=px;y=py;break outer}
  }
  if(x<0){unplaced.push(index);return}
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)used.add(xx+','+yy);
  placed.push({index,x,y,w,h,row});
 });
 return {placed,unplaced,cols,rows:height};
}
/** A footprint can only occupy empty, in-bounds slots. Other items may never
 * be displaced by a move or rotation, even when their positions were auto-filled.
 */
export function canPlaceInventoryItem(items,index,x,y,cols,rows,rotationTurns=0){
 const all=inventoryRows(items);
 if(!all[index]||!Number.isInteger(x)||!Number.isInteger(y))return false;
 const width=clamp(Math.floor(finite(cols,8)),2,20);
 const height=clamp(Math.floor(finite(rows,5)),2,20);
 const size=itemSize(all[index],width,height);
 const turns=((Math.trunc(finite(rotationTurns,0))%4)+4)%4;
 const w=turns%2?size.h:size.w,h=turns%2?size.w:size.h;
 if(x<0||y<0||x+w>width||y+h>height)return false;
 const others=gridLayout(all,width,height).placed.filter(p=>p.index!==index);
 return others.every(p=>x+w<=p.x||p.x+p.w<=x||y+h<=p.y||p.y+p.h<=y);
}
/** Rotate on drop: changes both the footprint and the cosmetic rotation.
 * All legacy inventory keys remain intact for list/weight compatibility.
 */
export function moveInventoryItem(items,index,x,y,cols,rows,rotationTurns=0){
 const updated=inventoryRows(items).map(row=>({...row}));
 if(!canPlaceInventoryItem(updated,index,x,y,cols,rows,rotationTurns))return null;
 const turns=((Math.trunc(finite(rotationTurns,0))%4)+4)%4;
 const size=itemSize(updated[index],cols,rows);
 Object.assign(updated[index],{
  gridX:x,gridY:y,
  ...(turns?{gridW:turns%2?size.h:size.w,gridH:turns%2?size.w:size.h,
   gridRotation:((Math.trunc(finite(updated[index].gridRotation,0))+90*turns)%360+360)%360}:{})
 });
 return updated;
}
