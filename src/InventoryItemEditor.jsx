import React,{useMemo,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import {itemSize,rowValue} from './InventoryMath.js';

const PRESET_ICONS=['🎒','⚔️','🛡️','🧪','📜','💎','🗝️','🪙','🔮','🧰','🍖','🏹','💍','🧭','📦','✨'];
const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?value:fallback;
const bounded=(value,max)=>Math.max(1,Math.min(max,Math.floor(Number(value)||1)));
const defaults={Item:'',Qty:'1',Weight:'0',Notes:'',gridW:1,gridH:1,
 gridShortName:'',gridIcon:'🎒',gridBorderColor:'#91b4e9',
 gridBackgroundColor:'#263e5c',gridTextColor:'#f0f6ff',gridRotation:0};

export function inventoryItemDraft(item,cols=8,rows=5){
 const old=item&&typeof item==='object'?item:{};
 const size=itemSize(old,cols,rows);
 return {...defaults,
  Item:String(rowValue(old,'Item')??''),
  Qty:String(rowValue(old,'Qty')??'1'),
  Weight:String(rowValue(old,'Weight')??'0'),
  Notes:String(rowValue(old,'Notes')??''),
  gridW:size.w,gridH:size.h,
  gridShortName:String(old.gridShortName||'').slice(0,12),
  gridIcon:String(old.gridIcon??'🎒').slice(0,12),
  gridBorderColor:color(old.gridBorderColor,defaults.gridBorderColor),
  gridBackgroundColor:color(old.gridBackgroundColor,defaults.gridBackgroundColor),
  gridTextColor:color(old.gridTextColor,defaults.gridTextColor),
  gridRotation:(Number(old.gridRotation)||0)%360
 };
}
/** Preserve the casing and any additional fields of legacy list items. */
export function updateInventoryItem(item,draft){
 const next={...(item||{})};
 for(const key of ['Item','Qty','Weight','Notes']){
  const existing=Object.keys(next).find(k=>k.toLowerCase()===key.toLowerCase())||key;
  next[existing]=draft[key];
 }
 for(const key of ['gridW','gridH','gridShortName','gridIcon','gridBorderColor',
  'gridBackgroundColor','gridTextColor','gridRotation'])
  next[key]=draft[key];
 return next;
}

export default function InventoryItemEditor({item,cols,rows,onSave,onDelete,onClose}){
 const initial=useMemo(()=>inventoryItemDraft(item,cols,rows),[item,cols,rows]);
 const [draft,setDraft]=useState(initial);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const changed=JSON.stringify(draft)!==JSON.stringify(initial);
 const update=(key,value)=>{setDraft(s=>({...s,[key]:value}));setError('')};
 const title=item?'Item details':'Create inventory item';
 function close(){
  if(changed&&!window.confirm('Discard unsaved item changes?'))return;
  onClose();
 }
 function submit(e){
  e.preventDefault();
  if(saving)return;
  if(!draft.Item.trim()){setError('Give the item a name.');return}
  if(!Number.isFinite(Number(draft.Qty))||Number(draft.Qty)<0||
     !Number.isFinite(Number(draft.Weight))||Number(draft.Weight)<0){
   setError('Quantity and weight must be zero or positive numbers.');return;
  }
  setSaving(true);
  try{
   onSave({...draft,Item:draft.Item.trim(),gridW:bounded(draft.gridW,cols),
    gridH:bounded(draft.gridH,rows)});
  }catch(e){setError(e?.message||String(e));setSaving(false)}
 }
 function rotate(){
  setDraft(prev=>({...prev,gridW:bounded(prev.gridH,cols),
   gridH:bounded(prev.gridW,rows),gridRotation:((prev.gridRotation||0)+90)%360}));
 }
 return <FloatingWindow kind="inventory" onClose={close}>
  <section className="modal inventory-item-editor" role="dialog" aria-label={title}>
   <header className="heading">
    <h2>{title}</h2>
    <button type="button" className="secondary" onClick={close} aria-label="Close item editor">✕</button>
   </header>
   <form className="inventory-item-form" onSubmit={submit}>
    <div className="inventory-item-preview-row">
     <div className="inventory-item-preview" style={{
      borderColor:draft.gridBorderColor,
      backgroundColor:draft.gridBackgroundColor,color:draft.gridTextColor
     }}>
      <span className="inventory-item-preview-icon">{draft.gridIcon||'📦'}</span>
      <strong>{draft.gridShortName.trim()||draft.Item.trim().slice(0,8)||'ITEM'}</strong>
      <small>x{draft.Qty||'0'}</small>
     </div>
     <p className="muted tiny">This is the appearance of the block on the grid.
      Click a block to open these details; hold and drag to move it, and press R to rotate.</p>
    </div>
    <div className="inventory-item-editor-grid">
     <label className="inventory-item-wide">Full item name
      <input maxLength={120} required autoFocus value={draft.Item}
       onChange={e=>update('Item',e.target.value)}/>
     </label>
     <label>Abbreviated block name
      <input maxLength={12} placeholder="Auto from name" value={draft.gridShortName}
       onChange={e=>update('gridShortName',e.target.value)}/>
     </label>
     <label>Block icon
      <input maxLength={12} aria-label="Block icon" value={draft.gridIcon}
       onChange={e=>update('gridIcon',e.target.value)}/>
     </label>
     <div className="inventory-icon-presets inventory-item-wide" aria-label="Suggested icons">
      {PRESET_ICONS.map(icon=><button type="button" key={icon} className="secondary"
       aria-label={'Use icon '+icon} onClick={()=>update('gridIcon',icon)}>{icon}</button>)}
     </div>
     <label>Border colour
      <input type="color" value={draft.gridBorderColor}
       onChange={e=>update('gridBorderColor',e.target.value)}/>
     </label>
     <label>Background colour
      <input type="color" value={draft.gridBackgroundColor}
       onChange={e=>update('gridBackgroundColor',e.target.value)}/>
     </label>
     <label>Text colour
      <input type="color" value={draft.gridTextColor}
       onChange={e=>update('gridTextColor',e.target.value)}/>
     </label>
     <label>Quantity
      <input type="number" min="0" max="100000" step="1" value={draft.Qty}
       onChange={e=>update('Qty',e.target.value)}/>
     </label>
     <label>Weight per item
      <input type="number" min="0" max="100000" step=".01" value={draft.Weight}
       onChange={e=>update('Weight',e.target.value)}/>
     </label>
     <label>Grid width (slots)
      <input type="number" min="1" max={cols} step="1" value={draft.gridW}
       onChange={e=>update('gridW',e.target.value)}/>
     </label>
     <label>Grid height (slots)
      <input type="number" min="1" max={rows} step="1" value={draft.gridH}
       onChange={e=>update('gridH',e.target.value)}/>
     </label>
     <div className="inventory-item-rotation">
      <span className="muted tiny">Orientation: {draft.gridRotation||0}°</span>
      <button type="button" className="secondary" onClick={rotate}>↻ Rotate 90°</button>
     </div>
     <label className="inventory-item-wide">Notes and item details
      <textarea rows={4} value={draft.Notes} onChange={e=>update('Notes',e.target.value)}
       placeholder="Description, effects, charges, or other information"/>
     </label>
    </div>
    {error&&<p className="error small" role="alert">{error}</p>}
    <div className="inventory-item-editor-actions">
     {item&&<button type="button" className="secondary inventory-item-delete"
      onClick={()=>{
       if(window.confirm('Permanently remove '+(draft.Item||'this item')+' from this inventory?'))
        onDelete();
      }}>Delete item</button>}
     <button type="button" className="secondary" onClick={close}>Cancel</button>
     <button type="submit" disabled={saving}>{saving?'Saving…':item?'Save item':'Create item'}</button>
    </div>
   </form>
  </section>
 </FloatingWindow>;
}
