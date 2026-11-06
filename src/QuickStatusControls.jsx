import React,{useMemo} from 'react';
import {allStatusDefinitions,normalizedEffects,statusDefinition,
 StatusGlyph,MAX_ACTIVE_EFFECTS} from './TokenStatuses.jsx';

/** Small status editor embedded in Ctrl+click Quick Adjust. */
export default function QuickStatusControls({catalog,values,onChange,disabled=false}){
 const all=useMemo(()=>allStatusDefinitions(catalog).filter(d=>!d.archived),[catalog]);
 const selected=normalizedEffects(values);
 const active=new Set(selected.map(x=>x.id));
 const change=(id,level)=>{
  if(disabled)return;
  onChange(normalizedEffects(level===0?selected.filter(x=>x.id!==id):
   [...selected.filter(x=>x.id!==id),{id,level}]));
 };
 return <section className="quick-status-editor" aria-label="Quick adjust status effects">
  <div className="quick-status-heading">
   <strong>Status effects</strong>
   <span className="muted tiny">{selected.length}/{MAX_ACTIVE_EFFECTS} active</span>
  </div>
  <div className="quick-status-current">
   {!selected.length&&<span className="muted tiny">No effects currently active.</span>}
   {selected.map(effect=>{
    const def=statusDefinition(effect.id,catalog);
    const max=effect.id==='exhaustion'?6:def.stackable?9:1;
    return <span className="quick-status-chip" key={effect.id}
     style={{'--status-color':def.color}} title={def.name}>
     <StatusGlyph name={def.icon} size={15}/>
     <span>{def.name}</span>
     {max>1&&<label title={'Stack level for '+def.name}>
      <input type="number" min="1" max={max} disabled={disabled}
       aria-label={def.name+' level'} value={effect.level}
       onChange={e=>change(effect.id,Math.max(1,Math.min(max,Number(e.target.value)||1)))}/>
     </label>}
     <button type="button" className="secondary" disabled={disabled}
      aria-label={'Remove '+def.name} onClick={()=>change(effect.id,0)}>×</button>
    </span>;
   })}
  </div>
  <label className="quick-status-add">Add effect
   <select value="" disabled={disabled||selected.length>=MAX_ACTIVE_EFFECTS}
    onChange={e=>{if(e.target.value)change(e.target.value,1)}}>
    <option value="">Choose condition, buff, or resistance…</option>
    {all.filter(x=>!active.has(x.id)).map(def=>
     <option key={def.id} value={def.id}>{def.name}</option>)}
   </select>
  </label>
 </section>;
}
