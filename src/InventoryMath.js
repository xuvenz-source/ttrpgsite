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
export function moveInventoryItem(items,index,x,y,cols,rows){
 const updated=inventoryRows(items).map(row=>({...row}));
 if(!updated[index])return null;
 updated[index].gridX=x;updated[index].gridY=y;
 const l=gridLayout(updated,cols,rows);
 const placement=l.placed.find(p=>p.index===index);
 return placement?.x===x&&placement?.y===y?updated:null;
}
