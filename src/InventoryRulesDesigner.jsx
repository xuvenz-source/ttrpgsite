import React from 'react';
import {DEFAULT_ENCUMBRANCE} from './InventoryMath.js';

const ICONS=['⚖️','📦','🐌','⛓️','🧳','❗','🏋️'];
const uid=()=>crypto.randomUUID().slice(0,8);
export default function InventoryRulesDesigner({template,changeTemplate}){
 const settings={...DEFAULT_ENCUMBRANCE,...(template?.inventoryRules||{})};
 const tiers=Array.isArray(settings.tiers)?settings.tiers:[];
 const numberFields=(template?.tabs||[]).flatMap(t=>t.fields||[]).filter(f=>f.type==='number');
 const patch=update=>changeTemplate(t=>t.inventoryRules={
  ...DEFAULT_ENCUMBRANCE,...t.inventoryRules,...update
 });
 const editTier=(index,change)=>patch({tiers:tiers.map((t,i)=>i===index?{...t,...change}:t)});
 return <details className="inventory-rules-designer">
  <summary>Inventory weight &amp; encumbrance rules</summary>
  <p className="muted tiny">All inventory fields contribute to carried weight: each item's Qty × Weight.
   Define the carry formula, optional tiers, and which icon appears on tokens.</p>
  <label className="inventory-rule-check">
   <input type="checkbox" checked={settings.enabled===true}
    onChange={e=>patch({enabled:e.target.checked})}/>
   Enable carry weight and encumbrance
  </label>
  <div className="inventory-rule-grid">
   <label>Weight unit<input value={settings.unit||'lb'} maxLength={8}
    onChange={e=>patch({unit:e.target.value})}/></label>
   <label>Carry capacity<select value={settings.capacityMode}
    onChange={e=>patch({capacityMode:e.target.value})}>
    <option value="ability">Ability score × multiplier + bonus</option>
    <option value="fixed">Fixed capacity</option>
   </select></label>
   {settings.capacityMode==='fixed'?
    <label>Fixed maximum<input type="number" min="0" max="1000000" step=".1"
     value={settings.fixedCapacity}
     onChange={e=>patch({fixedCapacity:Number(e.target.value)})}/></label>:<>
     <label>Ability score field<select value={settings.scoreField}
      onChange={e=>patch({scoreField:e.target.value})}>
      {numberFields.map(f=><option value={f.id} key={f.id}>{f.label} ({f.id})</option>)}
     </select></label>
     <label>Capacity multiplier<input type="number" min="0" max="10000" step=".1"
      value={settings.multiplier} onChange={e=>patch({multiplier:Number(e.target.value)})}/></label>
     <label>Flat capacity bonus<input type="number" min="-1000000" max="1000000" step=".1"
      value={settings.bonus} onChange={e=>patch({bonus:Number(e.target.value)})}/></label>
    </>}
   <label>Tier thresholds<select value={settings.thresholdMode}
    onChange={e=>patch({thresholdMode:e.target.value})}>
    <option value="score">Score × tier multiplier (D&amp;D)</option>
    <option value="percent">% of maximum capacity</option>
    <option value="fixed">Fixed carried weight</option>
   </select></label>
  </div>
  <div className="inventory-tier-heading"><strong>Weight tiers</strong>
   <span className="muted tiny">The highest reached threshold wins.</span></div>
  {tiers.map((tier,i)=><div className="inventory-tier-editor" key={tier.id||i}>
   <label>Tier name<input value={tier.label||''} maxLength={40}
    onChange={e=>editTier(i,{label:e.target.value})}/></label>
   <label>Threshold<input type="number" min="0" max="1000000" step=".1"
    value={tier.threshold??0} onChange={e=>editTier(i,{threshold:Number(e.target.value)})}/></label>
   <label>Token icon<select value={tier.icon||'⚖️'}
    onChange={e=>editTier(i,{icon:e.target.value})}>
    {ICONS.map(v=><option key={v} value={v}>{v}</option>)}
   </select></label>
   <label className="inventory-rule-check">
    <input type="checkbox" checked={tier.showOnToken===true}
     onChange={e=>editTier(i,{showOnToken:e.target.checked})}/>
    Show on token
   </label>
   <button type="button" className="secondary" title="Remove tier"
    onClick={()=>patch({tiers:tiers.filter((_,j)=>j!==i)})}>×</button>
  </div>)}
  <button className="secondary" type="button" disabled={tiers.length>=8}
   onClick={()=>patch({tiers:[...tiers,{
    id:'tier_'+uid(),label:'New tier',threshold:20,icon:'⚖️',showOnToken:false
   }]})}>+ Tier</button>
  <p className="muted tiny">D&amp;D variant defaults: maximum carrying capacity is Strength × 15;
   light at Strength × 5, heavy at Strength × 10, and capacity at Strength × 15.
   Disabling the overall rule removes token encumbrance icons.</p>
 </details>;
}
