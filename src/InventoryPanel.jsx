import React,{useState} from 'react';
import {inventoryRows,inventoryWeight,gridLayout,moveInventoryItem,rowValue,itemSize} from './InventoryMath.js';

/** Both presets edit the same saved array; switching layouts never discards items. */
export default function InventoryPanel({field,value,onChange}){
 const rows=inventoryRows(value),mode=field.inventoryPreset==='grid'?'grid':'list';
 const [error,setError]=useState('');
 const columns=field.columns?.length?field.columns:['Item','Qty','Weight','Notes'];
 const cols=Math.max(2,Math.min(20,Number(field.gridColumns)||8));
 const height=Math.max(2,Math.min(20,Number(field.gridRows)||5));
 const layout=gridLayout(rows,cols,height);
 const edit=(index,patch)=>onChange(rows.map((r,i)=>i===index?{...r,...patch}:r));
 const remove=index=>onChange(rows.filter((_,i)=>i!==index));
 const add=()=>{
  if(rows.length>=250){setError('Inventory can hold up to 250 item records.');return}
  const newItem={Item:'New item',Qty:'1',Weight:'0',Notes:''};
  onChange([...rows,newItem]);setError('');
 };
 const dropAt=(e,x,y)=>{
  const raw=e.dataTransfer.getData('application/x-forge-inventory-index');
  if(raw==='')return;
  e.preventDefault();
  const index=Number(raw);
  if(!Number.isInteger(index)||index<0||index>=rows.length)return;
  const placed=moveInventoryItem(rows,index,x,y,cols,height);
  if(!placed){setError('That space is occupied or outside the inventory grid.');return}
  onChange(placed);setError('');
 };
 return <section className={'inventory-panel inventory-'+mode}>
  <div className="inventory-summary"><strong>{rows.length} items</strong>
   <span>{inventoryWeight(rows).toLocaleString()} weight units</span>
   <button className="secondary" type="button" onClick={add}>+ Item</button>
  </div>
  {mode==='list'?<div className="inventory-list">
   <div className="invrow inventory-table-head">{columns.map(c=><b key={c}>{c}</b>)}</div>
   {rows.map((row,i)=><div className="invrow" key={i}>
    {columns.map(c=><input key={c} aria-label={c} value={rowValue(row,c)??''}
     onChange={e=>edit(i,{[c]:e.target.value})}/>)}
    <button type="button" className="secondary" onClick={()=>remove(i)}
     title="Remove item">×</button>
   </div>)}
  </div>:<>
   <p className="muted tiny">Drag item cards onto empty grid slots. Each card retains its quantity, weight and notes.</p>
   <div className="inventory-grid" style={{
    gridTemplateColumns:'repeat('+cols+',minmax(0,1fr))',
    gridTemplateRows:'repeat('+height+',minmax(40px,1fr))'
   }}>
    {Array.from({length:cols*height},(_,i)=>{
     const x=i%cols,y=Math.floor(i/cols);
     return <div className="inventory-grid-cell" key={'slot_'+i}
      style={{gridColumn:x+1,gridRow:y+1}}
      onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-forge-inventory-index'))e.preventDefault()}}
      onDrop={e=>dropAt(e,x,y)}/>;
    })}
    {layout.placed.map(({index,row,x,y,w,h})=>
     <div key={'item_'+index} className="inventory-grid-item" draggable
      style={{gridColumn:(x+1)+' / span '+w,gridRow:(y+1)+' / span '+h}}
      onDragStart={e=>{
       e.dataTransfer.setData('application/x-forge-inventory-index',String(index));
       e.dataTransfer.effectAllowed='move';
      }}
      onDragOver={e=>e.preventDefault()}
      onDrop={e=>{e.stopPropagation();dropAt(e,x,y)}}>
      <div className="inventory-card-head">
       <strong title={rowValue(row,'Item')||'Item'}>{rowValue(row,'Item')||'Item'}</strong>
       <button type="button" className="secondary" onClick={()=>remove(index)} title="Remove item">×</button>
      </div>
      <label>Name<input value={rowValue(row,'Item')||''}
       onChange={e=>edit(index,{Item:e.target.value})}/></label>
      <div className="inventory-card-values">
       <label>Qty<input type="number" min="0" value={rowValue(row,'Qty')??1}
        onChange={e=>edit(index,{Qty:e.target.value})}/></label>
       <label>Each weighs<input type="number" min="0" step=".01"
        value={rowValue(row,'Weight')??0}
        onChange={e=>edit(index,{Weight:e.target.value})}/></label>
      </div>
      <label>Notes<input value={rowValue(row,'Notes')||''}
       onChange={e=>edit(index,{Notes:e.target.value})}/></label>
      <div className="inventory-card-values">
       <label>Width<input type="number" min="1" max={cols} value={itemSize(row,cols,height).w}
        onChange={e=>edit(index,{gridW:Number(e.target.value)})}/></label>
       <label>Height<input type="number" min="1" max={height} value={itemSize(row,cols,height).h}
        onChange={e=>edit(index,{gridH:Number(e.target.value)})}/></label>
      </div>
     </div>)}
   </div>
   {layout.unplaced.length>0&&<div className="inventory-grid-overflow">
    <strong>Unplaced items ({layout.unplaced.length})</strong>
    <p className="muted tiny">Expand grid dimensions or move an item to make space. These items are still saved.</p>
    {layout.unplaced.map(i=><div className="inventory-grid-overflow-row" key={i}>
      <input value={rowValue(rows[i],'Item')||''} onChange={e=>edit(i,{Item:e.target.value})}/>
      <button className="secondary" onClick={()=>remove(i)}>Remove</button>
     </div>)}
   </div>}
  </>}
  {error&&<p className="error tiny" role="alert">{error}</p>}
 </section>;
}
