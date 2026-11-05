import React,{useEffect,useMemo,useState} from 'react';
import Artwork from './Artwork.jsx';
import PersonalTokenLibrary from './PersonalTokenLibrary.jsx';
import ResourceField from './ResourceField.jsx';
import {RepeatingCollection} from './RepeatingCollection.jsx';

function InventoryEditor({field,value,onChange}){
 const columns=field.columns?.length?field.columns:['Item','Qty','Notes'];
 const rows=Array.isArray(value)?value:[];
 return <div className="inventory">
  <div className="invrow">{columns.map(column=><b key={column}>{column}</b>)}</div>
  {rows.map((row,index)=><div className="invrow" key={index}>
   {columns.map(column=><input key={column} aria-label={column} value={row?.[column]??''}
    onChange={e=>onChange(rows.map((r,i)=>i===index?{...r,[column]:e.target.value}:r))}/>)}
   <button type="button" className="secondary" title="Remove item"
    onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>×</button>
  </div>)}
  <button type="button" className="secondary" onClick={()=>onChange([...rows,{}])}>+ Item</button>
 </div>;
}

/** A DM can edit a player's persistent sheet, never just the token's temporary stats. */
export default function CharacterEditor({db,campaignId,viewerId,record,template,onSaved,onClose,onRoll}){
 const initial=useMemo(()=>({
  name:record.name,
  field_values:structuredClone(record.field_values||{}),
  portrait_path:record.portrait_path||null,
  token_path:record.token_path||null
 }),[record.id]);
 const [draft,setDraft]=useState(initial);
 const [activeTab,setActiveTab]=useState(template?.tabs?.[0]?.id||'main');
 const [saving,setSaving]=useState(false),[studio,setStudio]=useState(false),[error,setError]=useState('');
 const changed=JSON.stringify(draft)!==JSON.stringify(initial);
 const tab=template?.tabs?.find(t=>t.id===activeTab)||template?.tabs?.[0];

 function editField(id,value){
  setDraft(prev=>({
   ...prev,
   name:id==='character_name'?String(value||'New Character'):prev.name,
   field_values:{...prev.field_values,[id]:value}
  }));
 }
 function close(){
  if(changed&&!confirm('Discard unsaved character sheet changes?'))return;
  onClose();
 }
 async function save(){
  if(!draft.name.trim()||saving)return;
  setSaving(true);setError('');
  try{
   const {data,error:dbError}=await db.from('characters')
    .update({
     name:draft.name.trim(),
     field_values:draft.field_values,
     portrait_path:draft.portrait_path,
     token_path:draft.token_path
    })
    .eq('id',record.id)
    .eq('campaign_id',campaignId)
    .eq('updated_at',record.updated_at)
    .select('*')
    .maybeSingle();
   if(dbError)throw dbError;
   if(!data)throw Error('This character was changed elsewhere while you were editing. Close and reopen its sheet to get the latest version; nothing was overwritten.');
   onSaved(data);
   onClose();
  }catch(e){setError(e?.message||String(e))}
  finally{setSaving(false)}
 }
 function doRoll(field){
  // Use the values visible in the DM editor, including unsaved numeric edits.
  const expression=(field.formula||'1d20').replace(/@\{([a-z0-9_-]+)\}/gi,(_,id)=>{
   const val=draft.field_values?.[id];
   return val!==undefined&&/^-?\d+$/.test(String(val))?String(val):'0';
  });
  onRoll(expression,field.label);
 }
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}>
  <section className="modal npc-modal character-modal" role="dialog" aria-modal="true" aria-label="Edit player character sheet">
   <div className="heading"><div>
    <h2>Player character sheet</h2>
    <p className="muted small">DM editor · Edits are saved to this player's permanent campaign character.</p>
   </div><button type="button" className="secondary" aria-label="Close character sheet" onClick={close}>✕</button></div>
   <div className="npc-editor-top">
    <Artwork db={db} path={draft.portrait_path||draft.token_path} alt={draft.name} className="npc-editor-portrait"/>
    <label>Character name
     <input maxLength={100} value={draft.name} onChange={e=>setDraft(d=>({
       ...d,name:e.target.value,field_values:{...d.field_values,character_name:e.target.value}
     }))}/>
    </label>
    <button className="secondary" type="button" onClick={()=>setStudio(true)}>🎨 Change portrait/token</button>
   </div>
   <div className="tabs">
    {(template?.tabs||[]).map(t=><button type="button" key={t.id}
      className={t.id===activeTab?'selected':''} onClick={()=>setActiveTab(t.id)}>{t.name}</button>)}
   </div>
   <div className="npc-fields fields">
    {(tab?.fields||[]).map(f=><div className={'field span'+(f.span||1)} key={f.id}>
     <label>{f.label}</label>
     {f.type==='roll'?<button type="button" className="rollbtn" onClick={()=>doRoll(f)}>
        🎲 {f.label}<small>{f.formula||'1d20'}</small></button>:
      f.type==='inventory'?<InventoryEditor field={f} value={draft.field_values[f.id]||[]}
        onChange={v=>editField(f.id,v)}/>:
      f.type==='resource'?<ResourceField value={draft.field_values[f.id]} onChange={v=>editField(f.id,v)}/>:
      f.type==='collection'?<RepeatingCollection field={f} value={draft.field_values[f.id]||[]}
       sheetValues={draft.field_values} onChange={v=>editField(f.id,v)}
       onRoll={(formula,label)=>onRoll(formula,label)}/>:
      f.type==='checkbox'?<input type="checkbox" checked={!!draft.field_values[f.id]}
        onChange={e=>editField(f.id,e.target.checked)}/>:
      f.type==='textarea'?<textarea value={draft.field_values[f.id]??''}
        onChange={e=>editField(f.id,e.target.value)}/>:
      <input type={f.type==='number'?'number':'text'}
       value={draft.field_values[f.id]??(f.type==='number'?0:'')}
       onChange={e=>editField(f.id,e.target.value)}/>}
    </div>)}
   </div>
   {error&&<p className="error alert" role="alert">{error}</p>}
   <div className="actions">
    {changed&&<span className="muted small">Unsaved edits</span>}
    <button className="secondary" type="button" onClick={close}>Cancel</button>
    <button type="button" onClick={save} disabled={saving||!draft.name.trim()}>
     {saving?'Saving…':'Save player character'}
    </button>
   </div>
  </section>
  {studio&&<PersonalTokenLibrary db={db} campaignId={campaignId} userId={viewerId}
    mode="players" defaultName={draft.name} currentTokenPath={draft.token_path} currentPortraitPath={draft.portrait_path}
    onClose={()=>setStudio(false)}
    onApply={assets=>setDraft(d=>({...d,portrait_path:assets.portraitPath,token_path:assets.tokenPath}))}/>}
 </div>;
}