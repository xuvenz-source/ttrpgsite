import React,{useEffect,useRef,useState} from 'react';
import {createDebouncedSerialWriter} from './QueuedWrites.js';
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
 const initialMeta=()=>({lit:tool.state?.lit!==false,
  attrs:structuredClone(tool.state?.attrs||{})});
 const [meta,setMeta]=useState(initialMeta);
 const [metaError,setMetaError]=useState('');
 const [metaStatus,setMetaStatus]=useState('Saved');
 const dirty=useRef(false),revision=useRef(tool.revision);
 const currentMeta=useRef(meta),savedMeta=useRef(meta),collabRef=useRef(collab);
 const writer=useRef(null);
 currentMeta.current=meta;collabRef.current=collab;
 // The writer serializes metadata snapshots, so a late older reply cannot
 // overwrite a newer light/attribute edit or incorrectly report Saved.
 if(!writer.current){
  writer.current=createDebouncedSerialWriter(async next=>{
   const before=savedMeta.current;
   const litChanged=next.lit!==before.lit;
   const attrsChanged=isDM&&JSON.stringify(next.attrs)!==JSON.stringify(before.attrs);
   if(litChanged||attrsChanged)
    await collabRef.current.saveDetails(litChanged?next.lit:null,attrsChanged?next.attrs:null);
   savedMeta.current=structuredClone(next);
  },{
   delay:300,
   onSaved:job=>{
    if(JSON.stringify(currentMeta.current)===JSON.stringify(job.value)){
     dirty.current=false;setMetaStatus('Saved');setMetaError('');
    }
   },
   onError:error=>{
    setMetaError(error?.message||String(error));setMetaStatus('Save failed');
   }
  });
 }
 useEffect(()=>{
  if(revision.current!==tool.revision){
   revision.current=tool.revision;
   // External tool updates (including inventory moves) must not replace a
   // locally edited draft waiting for an authoritative write.
   if(!dirty.current){
    const updated=initialMeta();
    savedMeta.current=updated;currentMeta.current=updated;
    setMeta(updated);
   }
  }
 },[tool.revision,tool.state]);
 const changeMeta=update=>{
  const next=update(currentMeta.current);
  currentMeta.current=next;dirty.current=true;setMeta(next);
  setMetaStatus('Saving…');setMetaError('');
  writer.current.schedule(structuredClone(next),{issueId:tool.id});
 };
 async function close(){
  try{
   // Retry an erroring metadata snapshot instead of discarding unsaved state.
   if(dirty.current&&!writer.current.pending)
    writer.current.schedule(structuredClone(currentMeta.current),{issueId:tool.id});
   await writer.current.flush();
   onClose();
  }catch(e){setMetaError(e?.message||String(e));setMetaStatus('Save failed')}
 }
 return <FloatingWindow kind="inventory" onClose={()=>void close()}>
  <section className="modal campaign-tool-sheet" role="dialog" aria-label={tool.name+' tool sheet'}>
   <div className="heading"><h2>{tool.icon} {tool.name}</h2>
    <button type="button" className="secondary" onClick={()=>void close()} aria-label="Close tool sheet">×</button>
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
     {metaStatus==='Saving…'||collab.pending?'Saving…':metaStatus==='Save failed'?'Save failed — retry before closing':'Changes save automatically · Items in use are greyed out'}
    </span>
    <button type="button" className="secondary" onClick={()=>void close()}>Close</button>
   </div>
  </section>
 </FloatingWindow>;
}
