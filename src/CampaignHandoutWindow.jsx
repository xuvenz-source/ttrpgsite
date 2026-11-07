import React,{useEffect,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import {PIN_ICONS} from './CampaignHandouts.js';
import HandoutBody from './HandoutBody.jsx';

export default function CampaignHandoutWindow({note,pin=null,isDM,folders=[],
 onClose,onSave,onDelete,onUpdatePin,onDeletePin,onCollect}){
 const [draft,setDraft]=useState({
  title:note.title||'',body:note.body||'',
  folder_id:note.folder_id||null,revealed:!!note.revealed
 });
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  setDraft({title:note.title||'',body:note.body||'',
   folder_id:note.folder_id||null,revealed:!!note.revealed});
  setError('');
 },[note.id,note.title,note.body,note.folder_id,note.revealed]);
 const action=async job=>{
  if(busy)return;setBusy(true);setError('');
  try{await job()}catch(e){setError(e?.message||String(e))}
  finally{setBusy(false)}
 };
 const changed=JSON.stringify(draft)!==JSON.stringify({
  title:note.title||'',body:note.body||'',folder_id:note.folder_id||null,
  revealed:!!note.revealed
 });
 const close=()=>{if(isDM&&changed&&!window.confirm('Discard unsaved handout edits?'))return;onClose()};
 return <FloatingWindow kind="handout" onClose={close}>
  <section className="modal campaign-handout-window" role="dialog" aria-label={note.title}>
   <div className="heading"><h2>📜 {note.title}</h2>
    <button type="button" className="secondary" aria-label="Close handout" onClick={close}>×</button>
   </div>
   {isDM?<div className="campaign-handout-edit">
    <label>Title<input value={draft.title} maxLength={120}
     onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
    <label>Handout<textarea value={draft.body} rows={9} maxLength={20000}
     onChange={e=>setDraft(d=>({...d,body:e.target.value}))}/></label>
    <label>Folder<select value={draft.folder_id||''}
     onChange={e=>setDraft(d=>({...d,folder_id:e.target.value||null}))}>
     <option value="">Unfiled</option>
     {folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
    </select></label>
    <label className="campaign-handout-check"><input type="checkbox" checked={draft.revealed}
     onChange={e=>setDraft(d=>({...d,revealed:e.target.checked}))}/>
     Revealed in party Handouts</label>
   </div>:<article className="campaign-handout-read">
    <HandoutBody body={note.body}/></article>}
   {pin&&<div className="campaign-handout-pin-controls">
    {isDM?<><strong>Map pin</strong>
     <label className="campaign-handout-check"><input type="checkbox"
      checked={pin.visible} disabled={busy}
      onChange={e=>void action(()=>onUpdatePin(pin,{visible:e.target.checked}))}/>
      Visible on map</label>
     <label className="campaign-handout-check"><input type="checkbox"
      checked={pin.collectable} disabled={busy}
      onChange={e=>void action(()=>onUpdatePin(pin,{collectable:e.target.checked}))}/>
      Players can pick up</label>
     <label>Pin icon<select value={pin.kind} disabled={busy}
      onChange={e=>void action(()=>onUpdatePin(pin,{kind:e.target.value}))}>
      {Object.entries(PIN_ICONS).map(([id,icon])=>
       <option key={id} value={id}>{icon} {id==='trap'?'Bear trap':id.charAt(0).toUpperCase()+id.slice(1)}</option>)}
     </select></label>
     <button type="button" className="secondary" disabled={busy}
      onClick={()=>{if(window.confirm('Remove this pin from the map?'))
       void action(async()=>{await onDeletePin(pin);onClose()})}}>Remove pin</button>
    </>:<>{pin.collectable&&!note.revealed&&
     <button type="button" disabled={busy} onClick={()=>void action(async()=>{
      await onCollect(pin);onClose();
     })}>Pick up · Save to Handouts</button>}
     {note.revealed&&<span className="muted small">Saved in Handouts</span>}
    </>}
   </div>}
   {error&&<p className="error small" role="alert">{error}</p>}
   <div className="actions">
    {isDM&&<>
     <button type="button" className="secondary campaign-handout-delete"
      disabled={busy} onClick={()=>{
       if(window.confirm('Delete this handout and its map pins?'))
        void action(async()=>{await onDelete(note);onClose()});
      }}>Delete handout</button>
     <button type="button" disabled={busy||!changed||!draft.title.trim()}
      onClick={()=>void action(()=>onSave(note,{...draft,title:draft.title.trim()}))}>
      {busy?'Saving…':'Save changes'}</button>
    </>}
    <button type="button" className="secondary" onClick={close}>Close</button>
   </div>
  </section>
 </FloatingWindow>;
}
