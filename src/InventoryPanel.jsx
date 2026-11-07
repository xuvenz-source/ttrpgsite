import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {inventoryRows,inventoryWeight,gridLayout,moveInventoryItem,
 canPlaceInventoryItem,rowValue,itemSize,evaluateEncumbrance} from './InventoryMath.js';
import InventoryItemEditor,{updateInventoryItem} from './InventoryItemEditor.jsx';

const CELL_SIZE=48,GAP=2,GRID_PADDING=5;
const freshItem={Item:'',Qty:'1',Weight:'0',Notes:'',gridW:1,gridH:1,
 gridShortName:'',gridIcon:'🎒',gridBorderColor:'#91b4e9',
 gridBackgroundColor:'#263e5c',gridTextColor:'#f0f6ff'};
const shortLabel=row=>String(row.gridShortName||rowValue(row,'Item')||'Item').slice(0,12);
const tileStyle=row=>({
 '--inventory-tile-border':row.gridBorderColor||'#91b4e9',
 '--inventory-tile-back':row.gridBackgroundColor||'#263e5c',
 '--inventory-tile-text':row.gridTextColor||'#f0f6ff'
});

/** Same saved rows are used by classic list and fixed-cell inventory grid. */
export default function InventoryPanel({field,value,onChange,template,sheetValues,
 collaboration=null}){
 const items=inventoryRows(value),mode=field.inventoryPreset==='grid'?'grid':'list';
 const itemId=index=>items[index]?._inventoryId;
 const bound=index=>{
  const id=itemId(index),other=id&&collaboration?.locks?.[id];
  return !!other&&other!==collaboration.userId;
 };
 const claim=(index,force=false)=>{
  const id=itemId(index);
  if(!collaboration||!id)return;
  void collaboration.claim(id,force).catch(e=>setError(e.message||String(e)));
 };
 const release=index=>{
  const id=itemId(index);
  if(collaboration&&id)void collaboration.release(id);
 };
 const allow=index=>!bound(index);
 const cols=Math.max(2,Math.min(20,Number(field.gridColumns)||8));
 const height=Math.max(2,Math.min(20,Number(field.gridRows)||5));
 const layout=gridLayout(items,cols,height);
 const enc=template?evaluateEncumbrance(template,sheetValues||{}):null;
 const columns=field.columns?.length?field.columns:['Item','Qty','Weight','Notes'];
 const [error,setError]=useState('');
 const [editing,setEditing]=useState(null);
 const editingIndex=editing&&typeof editing==='object'?
  items.findIndex(row=>row._inventoryId===editing.itemId):editing;
 const releaseEditing=()=>{
  if(collaboration&&editing&&typeof editing==='object')
   void collaboration.release(editing.itemId);
  else if(Number.isInteger(editing))release(editing);
 };
 const dragIndex=current=>current?.itemId?
  items.findIndex(row=>row._inventoryId===current.itemId):current?.index;
 const [drag,setDragState]=useState(null);
 const dragRef=useRef(null),gridRef=useRef(null);
 const setDrag=next=>{dragRef.current=next;setDragState(next)};
 // Surface server-side inventory write failures rather than treating an
 // optimistic update as a successfully persisted item.
 const applyItems=next=>{
  try{
   const operation=onChange(next);
   if(operation?.then)void operation.catch(e=>setError(e?.message||String(e)));
   return operation;
  }catch(e){setError(e?.message||String(e));throw e}
 };
 const edit=(index,patch)=>applyItems(items.map((row,i)=>i===index?{...row,...patch}:row));
 const openItem=index=>{
  if(index!=='new'&&bound(index))return;
  setError('');
  if(Number.isInteger(index))claim(index);
  setEditing(collaboration&&Number.isInteger(index)&&itemId(index)?
   {itemId:itemId(index)}:index);
 };
 const saveItem=(draft,{keepOpen=false}={})=>{
  if(editing==='new'){
   if(items.length>=250)throw Error('Inventory can hold up to 250 item records.');
   const index=items.length;
   const write=applyItems([...items,updateInventoryItem(freshItem,draft)]);
   setEditing(keepOpen?index:null);
   return write;
  }else if(Number.isInteger(editingIndex)&&editingIndex>=0&&items[editingIndex]){
   const write=applyItems(items.map((row,i)=>i===editingIndex?updateInventoryItem(row,draft):row));
   if(!keepOpen){releaseEditing();setEditing(null)}
   return write;
  }else throw Error('This item is no longer available.');
  setError('');
 };
 const deleteItem=()=>{if(Number.isInteger(editingIndex)&&editingIndex>=0){
  applyItems(items.filter((_,i)=>i!==editingIndex));
  releaseEditing();setEditing(null);setError('');
 }};
 const remove=index=>applyItems(items.filter((_,i)=>i!==index));
 function gridPosition(clientX,clientY,grabX,grabY){
  const rect=gridRef.current?.getBoundingClientRect();
  if(!rect)return {x:-1,y:-1};
  return {
   x:Math.round((clientX-grabX-rect.left-GRID_PADDING)/(CELL_SIZE+GAP)),
   y:Math.round((clientY-grabY-rect.top-GRID_PADDING)/(CELL_SIZE+GAP))
  };
 }
 function startDrag(e,index,x,y){
  if(e.button!==0||dragRef.current||!allow(index))return;
  claim(index);
  const box=e.currentTarget.getBoundingClientRect();
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{return}
  e.currentTarget.focus();
  setDrag({
   index,itemId:collaboration?itemId(index):null,
   pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,
   grabX:e.clientX-box.left,grabY:e.clientY-box.top,
   x,y,turns:0,moved:false
  });
  e.preventDefault();e.stopPropagation();
 }
 function moveDrag(e){
  const current=dragRef.current;
  if(!current||current.pointerId!==e.pointerId)return;
  const moved=current.moved||Math.hypot(
   e.clientX-current.startX,e.clientY-current.startY)>5;
  if(!moved)return;
  const target=gridPosition(e.clientX,e.clientY,current.grabX,current.grabY);
  if(current.moved&&target.x===current.x&&target.y===current.y)return;
  setDrag({...current,moved:true,...target});
 }
 function endDrag(e,cancel=false){
  const current=dragRef.current;
  if(!current||current.pointerId!==e.pointerId)return;
  try{if(e.currentTarget.hasPointerCapture(e.pointerId))
   e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
  setDrag(null);
  const index=dragIndex(current);
  const releaseDrag=()=>current.itemId?void collaboration?.release(current.itemId):release(current.index);
  if(cancel||index<0){releaseDrag();return}
  if(!current.moved&&!current.turns){openItem(index);return}
  const placed=moveInventoryItem(items,index,current.x,current.y,cols,height,current.turns);
  if(!placed){
   setError('Not enough empty slots for that position or orientation. No items were moved.');
   releaseDrag();
   return;
  }
  applyItems(placed);setError('');
  releaseDrag();
 }
 // Browser-native HTML dragging suppresses keydown events. Pointer capture
 // keeps the left button held while we listen for R to rotate the footprint.
 useEffect(()=>{
  if(!drag)return;
  function key(e){
   const current=dragRef.current;
   if(!current)return;
   if(e.key.toLowerCase()==='r'&&!e.repeat){
    e.preventDefault();e.stopPropagation();
    setDrag({...current,turns:(current.turns+1)%4});
   }else if(e.key==='Escape'){
    e.preventDefault();e.stopPropagation();
    if(current.itemId)void collaboration?.release(current.itemId);
    else release(current.index);
    setDrag(null);
   }
  }
  window.addEventListener('keydown',key,true);
  return()=>window.removeEventListener('keydown',key,true);
 },[!!drag]);
 const active=drag&&items[dragIndex(drag)];
 const activeSize=active?itemSize(active,cols,height):null;
 const previewW=activeSize&&(drag.turns%2?activeSize.h:activeSize.w);
 const previewH=activeSize&&(drag.turns%2?activeSize.w:activeSize.h);
 const previewVisible=drag&&(drag.moved||drag.turns>0)&&drag.x>=0&&drag.y>=0&&
  drag.x+previewW<=cols&&drag.y+previewH<=height;
 const canDrop=previewVisible&&canPlaceInventoryItem(
  items,dragIndex(drag),drag.x,drag.y,cols,height,drag.turns);
 return <>
  <section className={'inventory-panel inventory-'+mode}>
   <div className="inventory-summary"><strong>{items.length} items</strong>
    <span>{inventoryWeight(items).toLocaleString()} {enc?.unit||'weight units'}</span>
    <button className="secondary" type="button" disabled={items.length>=250||(!!collaboration&&!collaboration.ready)}
     onClick={()=>{
      setError('');
      if(collaboration){
       // A new tile must exist in the authoritative inventory before opening
       // an editor that autosaves by item ID. Otherwise it reports "gone".
       const id=crypto.randomUUID();
       const initial={...freshItem,Item:'New item',_inventoryId:id};
       void Promise.resolve().then(()=>applyItems([...items,initial])).then(()=>{
        setEditing({itemId:id});
       }).catch(e=>setError(e?.message||String(e)));
      }else setEditing('new');
     }}>+ Item</button>
   </div>
   {enc?.enabled&&<div className="inventory-carry-summary" role="status">
    Total carried: <strong>{enc.weight.toLocaleString()} / {enc.capacity.toLocaleString()} {enc.unit}</strong>
    {enc.tier&&<span> · {enc.tier.label}</span>}
   </div>}
   {mode==='list'?<div className="inventory-list">
    <div className="invrow inventory-table-head">{columns.map(c=><b key={c}>{c}</b>)}</div>
    {items.map((row,i)=><div className={'invrow'+(bound(i)?' inventory-row-bound':'')}
     key={row._inventoryId||i}
     onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))release(i)}}>
     {columns.map(c=><input key={c} aria-label={c} value={rowValue(row,c)??''}
      disabled={bound(i)}
      onFocus={()=>claim(i)}
      onChange={e=>edit(i,{[c]:e.target.value})}/>)}
     {bound(i)&&<span className="inventory-bound-indicator" title="Another player is using this item">In use</span>}
     {bound(i)&&collaboration?.isDM&&<button type="button" className="secondary"
      onClick={()=>claim(i,true)} title="DM: take control of this item">Take</button>}
     <button type="button" className="secondary" disabled={bound(i)}
      onClick={()=>openItem(i)} title="Open item details">Details</button>
     <button type="button" className="secondary" disabled={bound(i)}
      onClick={()=>{
       if(window.confirm('Remove this item?'))remove(i);
     }} title="Remove item">×</button>
    </div>)}
   </div>:<>
    <p className="muted tiny">Click a tile to see its details. Hold the left mouse button
     and drag to move it; press <kbd>R</kbd> while holding to rotate 90°. Grid cells always
     remain the same size.</p>
    <div className="inventory-grid-scroll">
     <div className="inventory-slot-grid" ref={gridRef}
      style={{
       gridTemplateColumns:'repeat('+cols+', '+CELL_SIZE+'px)',
       gridTemplateRows:'repeat('+height+', '+CELL_SIZE+'px)'
      }}>
      {Array.from({length:cols*height},(_,i)=>{
       const x=i%cols,y=Math.floor(i/cols);
       return <div className="inventory-grid-cell" key={'slot_'+i}
        style={{gridColumn:x+1,gridRow:y+1}}/>;
      })}
      {layout.placed.map(({index,row,x,y,w,h})=>
       <button key={'item_'+(row._inventoryId||index)} type="button"
        className={'inventory-grid-item'+(dragIndex(drag)===index?' inventory-grid-item-held':'')+
         (bound(index)?' inventory-grid-item-bound':'')}
        style={{...tileStyle(row),
         gridColumn:(x+1)+' / span '+w,gridRow:(y+1)+' / span '+h}}
        aria-label={'Open '+(rowValue(row,'Item')||'item')+' details'}
        title={bound(index)?'In use by another player':
         (rowValue(row,'Item')||'Item')+' — click for details; hold and press R to rotate'}
        onPointerDown={e=>startDrag(e,index,x,y)}
        onPointerMove={moveDrag}
        onPointerUp={e=>endDrag(e)}
        onPointerCancel={e=>endDrag(e,true)}
        onClick={e=>{if(e.detail===0)openItem(index)}}>
        <span className="inventory-tile-icon" aria-hidden="true"
         style={{transform:'rotate('+((Number(row.gridRotation)||0)%360)+'deg)'}}>
         {row.gridIcon||'📦'}</span>
        <strong className="inventory-tile-name">{shortLabel(row)}</strong>
        {bound(index)&&<span className="inventory-bound-indicator">In use</span>}
        {bound(index)&&collaboration?.isDM&&<span className="inventory-bound-take"
         role="button" tabIndex={0} title="DM: take control of this item"
         onPointerDown={e=>e.stopPropagation()}
         onClick={e=>{e.stopPropagation();claim(index,true)}}
         onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){
          e.preventDefault();e.stopPropagation();claim(index,true);
         }}}>Take</span>}
        {Number(rowValue(row,'Qty')??1)!==1&&
         <span className="inventory-tile-qty">×{rowValue(row,'Qty')}</span>}
       </button>)}
      {previewVisible&&<div className={'inventory-grid-drag-preview'+
       (canDrop?' is-valid':' is-invalid')}
       style={{gridColumn:(drag.x+1)+' / span '+previewW,
        gridRow:(drag.y+1)+' / span '+previewH}}>
       <span>{canDrop?'✓':'×'} {shortLabel(active)}</span>
       <small>{((Number(active.gridRotation)||0)+drag.turns*90)%360}°</small>
      </div>}
     </div>
    </div>
    {layout.unplaced.length>0&&<div className="inventory-grid-overflow">
     <strong>Unplaced items ({layout.unplaced.length})</strong>
     <p className="muted tiny">These items remain saved. Free enough space, then
      drag a tile into the grid.</p>
     <div className="inventory-grid-overflow-items">
      {layout.unplaced.map(i=><button key={items[i]._inventoryId||i} type="button"
       className={'inventory-overflow-tile'+(bound(i)?' inventory-grid-item-bound':'')}
       style={tileStyle(items[i])}
       onPointerDown={e=>startDrag(e,i,-1,-1)}
       onPointerMove={moveDrag}
       onPointerUp={e=>endDrag(e)}
       onPointerCancel={e=>endDrag(e,true)}
       onClick={e=>{if(e.detail===0)openItem(i)}}>
       {items[i].gridIcon||'📦'} {shortLabel(items[i])}
      </button>)}
     </div>
    </div>}
   </>}
   {error&&<p className="error tiny" role="alert">{error}</p>}
  </section>
  {editing!==null&&createPortal(<InventoryItemEditor
   key={editing&&typeof editing==='object'?editing.itemId:String(editing)}
   item={editing==='new'?null:items[editingIndex]} cols={cols} rows={height}
   onSave={saveItem} onDelete={deleteItem}
   onClose={()=>{releaseEditing();setEditing(null)}}/>,document.body)}
 </>;
}
