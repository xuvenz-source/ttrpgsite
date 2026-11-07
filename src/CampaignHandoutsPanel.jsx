import React,{useState} from 'react';
import {folderHandouts} from './CampaignHandouts.js';

/** Compact Units / Handouts panel: separate DM drafts from the shared library. */
export default function CampaignHandoutsPanel({library,isDM,onOpenHandout,onPreparePin,onError}){
 const [creating,setCreating]=useState(false);
 const [draft,setDraft]=useState({title:'',body:'',folderId:'',revealed:false});
 const [busy,setBusy]=useState(false);
 const [dragged,setDragged]=useState(null);
 const [expanded,setExpanded]=useState({});
 const folders=library.folders||[],notes=library.handouts||[];
 const emitError=e=>onError?.(e?.message||String(e));
 const run=async job=>{
  if(busy)return;
  setBusy(true);
  try{await job()}catch(e){emitError(e)}finally{setBusy(false)}
 };
 async function create(e){
  e.preventDefault();
  if(!draft.title.trim())return;
  await run(async()=>{
   await library.createHandout(draft);
   setDraft({title:'',body:'',folderId:'',revealed:false});
   setCreating(false);
  });
 }
 function newFolder(){
  const name=window.prompt('Folder name:')?.trim();
  if(!name)return;
  void run(()=>library.createFolder(name));
 }
 function moveToFolder(event,folderId){
  if(!isDM||!dragged)return;
  event.preventDefault();event.stopPropagation();
  const note=notes.find(h=>h.id===dragged);
  setDragged(null);
  if(note&&note.folder_id!==folderId)
   void run(()=>library.updateHandout(note,{folder_id:folderId}));
 }
 function group(name,folderId,folder){
  const items=folderHandouts(notes,folderId);
  if(!isDM&&!items.length)return null;
  const key=folderId||'unfiled',open=expanded[key]===true;
  return <section key={key} className="campaign-handout-folder"
   onDragOver={e=>{if(isDM&&dragged)e.preventDefault()}}
   onDrop={e=>moveToFolder(e,folderId)}>
   <div className="campaign-handout-folder-heading">
    <button type="button" className="campaign-handout-folder-toggle"
     aria-expanded={open} onClick={()=>setExpanded(prev=>({...prev,[key]:!open}))}>
     <span aria-hidden="true">{open?'▾':'▸'}</span>
     <strong>{name}</strong><span className="unit-count">{items.length}</span>
    </button>
    {isDM&&folder&&<>
     <button type="button" className="secondary" title={'Rename '+name}
      aria-label={'Rename '+name} disabled={busy} onClick={()=>{
       const value=window.prompt('Rename folder:',folder.name)?.trim();
       if(value&&value!==folder.name)void run(()=>library.renameFolder(folder,value));
      }}>✎</button>
     <button type="button" className="secondary" title={'Delete '+name}
      aria-label={'Delete '+name} disabled={busy} onClick={()=>{
       if(window.confirm('Delete folder? Handouts will move to Unfiled.'))
        void run(()=>library.deleteFolder(folder));
      }}>×</button>
    </>}
   </div>
   {open&&<div className="campaign-handout-folder-items">
    {!items.length&&<span className="muted tiny">Empty folder</span>}
    {items.map(note=><div className="campaign-handout-row" key={note.id}
     draggable={isDM} onDragStart={e=>{
      if(!isDM){e.preventDefault();return}
      setDragged(note.id);
      e.dataTransfer.setData('text/plain',note.id);
      e.dataTransfer.effectAllowed='move';
     }} onDragEnd={()=>setDragged(null)}>
     <button type="button" className="campaign-handout-title" onClick={()=>onOpenHandout(note.id)}>
      <span aria-hidden="true">📜</span><span>{note.title}</span>
      {isDM&&<small>{note.revealed?'Revealed':'Hidden'}{note.collected?' · Collected':''}</small>}
     </button>
     {isDM&&<>
      <button type="button" className="secondary" disabled={busy}
       title={note.revealed?'Hide from party library':'Reveal to party library'}
       aria-label={(note.revealed?'Hide ':'Reveal ')+note.title}
       onClick={()=>void run(()=>library.updateHandout(note,{revealed:!note.revealed}))}>
       {note.revealed?'◉':'◌'}</button>
      <button type="button" className="secondary" title={'Place '+note.title+' pin'}
       aria-label={'Place '+note.title+' on map'}
       onClick={()=>onPreparePin(note.id)}>⌖</button>
     </>}
    </div>)}
   </div>}
  </section>;
 }
 return <div className="campaign-handouts-pane">
  {library.error&&<p className="error tiny" role="alert">
   Handouts unavailable: {library.error}</p>}
  {isDM&&<div className="campaign-handouts-actions">
   <button type="button" className="secondary" onClick={()=>setCreating(v=>!v)}>+ Handout</button>
   <button type="button" className="secondary" disabled={busy} onClick={newFolder}>+ Folder</button>
  </div>}
  {isDM&&creating&&<form className="side-form campaign-handout-create" onSubmit={create}>
   <label>Title<input required maxLength={120} value={draft.title}
    onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
   <label>Note<textarea required rows={5} maxLength={20000} value={draft.body}
    onChange={e=>setDraft(d=>({...d,body:e.target.value}))}/></label>
   <label>Folder<select value={draft.folderId}
    onChange={e=>setDraft(d=>({...d,folderId:e.target.value}))}>
    <option value="">Unfiled</option>
    {folders.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}
   </select></label>
   <label className="campaign-handout-check"><input type="checkbox" checked={draft.revealed}
    onChange={e=>setDraft(d=>({...d,revealed:e.target.checked}))}/>
    Reveal to party</label>
   <div className="campaign-handouts-actions">
    <button type="submit" disabled={busy||!draft.title.trim()}>Save handout</button>
    <button type="button" className="secondary" onClick={()=>setCreating(false)}>Cancel</button>
   </div>
  </form>}
  <div className="campaign-handout-list">
   {group('Unfiled',null,null)}
   {folders.map(f=>group(f.name,f.id,f))}
   {!isDM&&notes.length===0&&<p className="muted small">No handouts collected yet.</p>}
  </div>
 </div>;
}
