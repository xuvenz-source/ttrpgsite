import React,{useEffect,useRef,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import {toolInventoryField,toolCanControl,normaliseToolConfig} from './CampaignTools.js';
import useCampaignToolCollaboration from './useCampaignToolCollaboration.js';

/** Tool sheet edits save item-by-item; no full-inventory last-writer-wins save. */
export default function CampaignToolSheet({db,tool,userId,isDM,onRefresh,onClose}){
 const canEdit=toolCanControl(tool,userId,isDM);
 const config=normaliseToolConfig(tool.kind,tool.config);
 const inventory=toolInventoryField(tool);
 const hasInventory=tool.kind==='mount'||tool.kind==='inventory';
 const collab=useCampaignToolCollaboration({db,tool,userId,refresh:onRefresh});
 const [meta,setMeta]=useState(()=>({lit:tool.state?.lit!==false,
  attrs:structuredClone(tool.state?.attrs||{})}));
 const [metaError,setMetaError]=useState(''),[metaSaving,setMetaSaving]=useState(false);
 const dirty=useRef(false),revision=useRef(tool.revision);
 useEffect(()=>{
  if(revision.current!==tool.revision){
   revision.current=tool.revision;
   if(!dirty.current)setMeta({lit:tool.state?.lit!==false,
    attrs:structuredClone(tool.state?.attrs||{})});
  }
 },[tool.revision,tool.state]);
 const changeMeta=updater=>{dirty.current=true;setMeta(updater)};
 const serverLit=tool.state?.lit!==false,serverAttrs=tool.state?.attrs||{};
 useEffect(()=>{
  if(!dirty.current)return;
  const litChanged=meta.lit!==serverLit,
   attrsChanged=isDM&&JSON.stringify(meta.attrs)!==JSON.stringify(serverAttrs);
  if(!litChanged&&!attrsChanged){dirty.current=false;return}
  const timer=setTimeout(()=>{
   setMetaSaving(true);setMetaError('');
   void collab.saveDetails(litChanged?meta.lit:null,attrsChanged?meta.attrs:null)
    .then(()=>{dirty.current=false})
    .catch(e=>setMetaError(e.message||String(e)))
    .finally(()=>setMetaSaving(false));
  },300);
  return()=>clearTimeout(timer);
 },[meta,tool.revision,isDM]);
 return <FloatingWindow kind="inventory" onClose={onClose}>
  <section className="modal campaign-tool-sheet" role="dialog" aria-label={tool.name+' tool sheet'}>
   <div className="heading"><h2>{tool.icon} {tool.name}</h2>
    <button type="button" className="secondary" onClick={onClose} aria-label="Close tool sheet">×</button>
   </div>
   {tool.kind==='torch'&&<div className="campaign-tool-details">
    <div>Bright: <b>{config.bright} ft</b> · Dim: <b>{config.dim} ft</b></div>
    <label className="campaign-tool-switch"><input type="checkbox" checked={meta.lit}
     disabled={!canEdit} onChange={e=>changeMeta(prev=>({...prev,lit:e.target.checked}))}/>
     Emitting light</label>
   </div>}
   {tool.kind==='mount'&&<div className="campaign-tool-details">
    <h3>Attributes</h3>
    <div className="campaign-tool-sheet-stats">
     {Object.entries(meta.attrs||config.attributes||{}).map(([key,value])=><label key={key}>
      {key}<input type="number" step="any" min="-10000" max="10000" value={value}
       disabled={!isDM} onChange={e=>changeMeta(prev=>({...prev,
        attrs:{...prev.attrs,[key]:Number(e.target.value)}}))}/>
     </label>)}
    </div>
   </div>}
   {hasInventory&&<div className="campaign-tool-sheet-inventory">
    <h3>Inventory</h3>
    {canEdit?<InventoryPanel field={inventory} value={collab.rows}
      onChange={collab.changeItems} collaboration={{...collab,userId,isDM}}/>:
     <p className="muted">This tool is not assigned to you.</p>}
   </div>}
   {(collab.error||metaError)&&<p className="error small" role="alert">{collab.error||metaError}</p>}
   <div className="actions">
    <span className="muted tiny" role="status">
     {metaSaving||collab.pending?'Saving…':'Changes save automatically · Items in use are greyed out'}
    </span>
    <button type="button" className="secondary" onClick={onClose}>Close</button>
   </div>
  </section>
 </FloatingWindow>;
}
