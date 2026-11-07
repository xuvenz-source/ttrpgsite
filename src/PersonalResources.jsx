import React from 'react';
import {uid,num,safeList,clampNumber} from './SheetMath.js';
import {PERSONAL_RESOURCE_KEY,PERSONAL_RESOURCE_TAB} from './SheetDerived.js';

export {PERSONAL_RESOURCE_KEY,PERSONAL_RESOURCE_TAB};
const rechargeOptions=[
 ['none','No automatic recharge'],['short','Short rest'],['long','Long rest'],
 ['daily','Daily'],['other','Other / custom']
];
const blank=()=>({
 id:uid('personal_'),name:'New resource',current:1,max:1,
 recharge:'long',customRecharge:'',notes:''
});
/** Stored under a reserved character value key, not a DM template field.
 * Players can add/edit these resources without the DM modifying the sheet.
 */
export default function PersonalResources({value,onChange}){
 const rows=safeList(value,60);
 function edit(id,patch){
  onChange(rows.map(row=>row.id===id?{...row,...patch}:row));
 }
 return <div className="personal-resources">
  <div className="personal-resources-heading">
   <div><strong>Personal resources</strong>
    <p className="muted tiny">Track abilities, charges, inspiration, attunements or
     anything else. These entries belong to your character.</p></div>
   <button type="button" className="secondary" disabled={rows.length>=60}
    onClick={()=>onChange([...rows,blank()])}>+ Add resource</button>
  </div>
  {rows.length===0&&<div className="personal-resource-empty">
   Add a resource to track its current amount, maximum and how it recharges.
  </div>}
  {rows.length>0&&<div className="personal-resource-grid">
   <div className="personal-resource-head" aria-hidden="true">
    <span>Name</span><span>Recharge</span><span>Current</span><span>Max</span><span/>
   </div>
   {rows.map(row=><div className="personal-resource-row" key={row.id}>
    <input aria-label="Resource name" value={row.name||''} maxLength={75}
     onChange={e=>edit(row.id,{name:e.target.value})}/>
    <div className="personal-resource-recharge">
     <select aria-label={row.name+' recharge'} value={row.recharge||'none'}
      onChange={e=>edit(row.id,{recharge:e.target.value})}>
      {rechargeOptions.map(([v,label])=><option key={v} value={v}>{label}</option>)}
     </select>
     {row.recharge==='other'&&<input aria-label="Custom recharge condition"
      placeholder="e.g. Dawn" maxLength={90} value={row.customRecharge||''}
      onChange={e=>edit(row.id,{customRecharge:e.target.value})}/>}
    </div>
    <div className="personal-resource-current">
     <button type="button" className="secondary" title={'Decrease '+row.name}
      onClick={()=>edit(row.id,{current:Math.max(0,num(row.current)-1)})}>−</button>
     <input type="number" min="0" max="99999" aria-label={row.name+' current'}
      value={row.current??0}
      onChange={e=>edit(row.id,{current:clampNumber(e.target.value,0,99999)})}/>
     <button type="button" className="secondary" title={'Increase '+row.name}
      onClick={()=>edit(row.id,{current:Math.min(99999,num(row.current)+1)})}>+</button>
    </div>
    <input type="number" min="0" max="99999" aria-label={row.name+' maximum'}
     value={row.max??0}
     onChange={e=>edit(row.id,{max:clampNumber(e.target.value,0,99999)})}/>
    <div className="personal-resource-actions">
     <button type="button" className="secondary" title={'Refill '+row.name}
      onClick={()=>edit(row.id,{current:clampNumber(row.max,0,99999)})}>Refill</button>
     <button type="button" className="secondary" title={'Remove '+row.name}
      aria-label={'Remove '+row.name}
      onClick={()=>onChange(rows.filter(x=>x.id!==row.id))}>×</button>
    </div>
    <input className="personal-resource-notes" aria-label={row.name+' notes'}
     value={row.notes||''} maxLength={180} placeholder="Notes (optional)"
     onChange={e=>edit(row.id,{notes:e.target.value})}/>
   </div>)}
  </div>}
 </div>;
}
