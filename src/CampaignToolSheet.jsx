import React,{useEffect,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import {toolInventoryField,toolCanControl,normaliseToolConfig} from './CampaignTools.js';

export default function CampaignToolSheet({tool,userId,isDM,onSave,onClose}){
 const [draft,setDraft]=useState(()=>structuredClone(tool.state||{}));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setDraft(structuredClone(tool.state||{}));setError('')},[tool.id,tool.revision]);
 const canEdit=toolCanControl(tool,userId,isDM);
 const config=normaliseToolConfig(tool.kind,tool.config);
 const inventory=toolInventoryField(tool);
 const hasInventory=tool.kind==='mount'||tool.kind==='inventory';
 const changed=JSON.stringify(draft)!==JSON.stringify(tool.state||{});
 async function save(){
  if(!canEdit||!changed||busy)return;
  setBusy(true);setError('');
  try{await onSave(tool,draft)}catch(e){setError(e?.message||String(e))}
  finally{setBusy(false)}
 }
 const close=()=>{if(changed&&!window.confirm('Discard unsaved tool changes?'))return;onClose()};
 return <FloatingWindow kind="inventory" onClose={close}>
  <section className="modal campaign-tool-sheet" role="dialog" aria-label={tool.name+' tool sheet'}>
   <div className="heading"><h2>{tool.icon} {tool.name}</h2>
    <button type="button" className="secondary" onClick={close} aria-label="Close tool sheet">×</button>
   </div>
   {tool.kind==='torch'&&<div className="campaign-tool-details">
    <div>Bright: <b>{config.bright} ft</b> · Dim: <b>{config.dim} ft</b></div>
    <label className="campaign-tool-switch"><input type="checkbox" checked={draft.lit!==false}
     disabled={!canEdit} onChange={e=>setDraft(prev=>({...prev,lit:e.target.checked}))}/>
     Emitting light</label>
   </div>}
   {tool.kind==='mount'&&<div className="campaign-tool-details">
    <h3>Attributes</h3>
    <div className="campaign-tool-sheet-stats">
     {Object.entries(draft.attrs||config.attributes||{}).map(([key,value])=><label key={key}>
      {key}<input type="number" step="any" min="-10000" max="10000" value={value}
       disabled={!isDM} onChange={e=>setDraft(prev=>({...prev,
        attrs:{...prev.attrs,[key]:Number(e.target.value)}}))}/>
     </label>)}
    </div>
   </div>}
   {hasInventory&&<div className="campaign-tool-sheet-inventory">
    <h3>Inventory</h3>
    {canEdit?<InventoryPanel field={inventory} value={draft.items||[]}
     onChange={items=>setDraft(prev=>({...prev,items}))}/>:
     <p className="muted">This tool is not assigned to you.</p>}
   </div>}
   {error&&<p className="error small" role="alert">{error}</p>}
   <div className="actions">
    <button type="button" className="secondary" onClick={close}>Close</button>
    {canEdit&&<button type="button" disabled={!changed||busy} onClick={()=>void save()}>
     {busy?'Saving…':'Save changes'}</button>}
   </div>
  </section>
 </FloatingWindow>;
}
