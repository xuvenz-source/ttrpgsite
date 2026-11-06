import React,{useEffect,useMemo,useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import Artwork from './Artwork.jsx';
import PersonalTokenLibrary from './PersonalTokenLibrary.jsx';
import ResourceField from './ResourceField.jsx';
import {enrichSheetValues,PERSONAL_RESOURCE_KEY,PERSONAL_RESOURCE_TAB} from './SheetDerived.js';
import {ProgressionPanel,ProficienciesPanel} from './SheetProgression.jsx';
import PersonalResources from './PersonalResources.jsx';
import {MagicDashboard} from './SheetMagic.jsx';
 import {EquipmentManager} from './SheetEquipment.jsx';
import {RepeatingCollection} from './RepeatingCollection.jsx';
import InventoryPanel from './InventoryPanel.jsx';

/** A DM can edit a player's persistent sheet, never just the token's temporary stats. */
export default function CharacterEditor({
 db,campaignId,viewerId,record,template,onSaved,onClose,onRoll,
 onCastSpell,onAddSpellToHotbar,onEquipmentAttack
}){
 const initial=useMemo(()=>({
  name:record.name,
  field_values:enrichSheetValues(template,structuredClone(record.field_values||{})),
  portrait_path:record.portrait_path||null,
  token_path:record.token_path||null
 }),[record.id]);
 const [draft,setDraft]=useState(initial);
 const [baseline,setBaseline]=useState(initial);
 const [version,setVersion]=useState(record.updated_at);
 const [activeTab,setActiveTab]=useState(template?.tabs?.[0]?.id||'main');
 const [saving,setSaving]=useState(false),[studio,setStudio]=useState(false),[error,setError]=useState('');
 const changed=JSON.stringify(draft)!==JSON.stringify(baseline);
 const tab=template?.tabs?.find(t=>t.id===activeTab)||template?.tabs?.[0];

 function editField(id,value){
  setDraft(prev=>({
   ...prev,
   name:id==='character_name'?String(value||'New Character'):prev.name,
   field_values:enrichSheetValues(template,{...prev.field_values,[id]:value})
  }));
 }
 function close(){
  if(changed&&!confirm('Discard unsaved character sheet changes?'))return;
  onClose();
 }
 async function save(keepOpen=false){
  if(!draft.name.trim()||saving)throw Error('Cannot save an empty name or while another save is in progress.');
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
    .eq('updated_at',version)
    .select('*')
    .maybeSingle();
   if(dbError)throw dbError;
   if(!data)throw Error('This character was changed elsewhere while you were editing. Close and reopen its sheet to get the latest version; nothing was overwritten.');
   onSaved(data);
   setVersion(data.updated_at);
   setBaseline({
    name:data.name,field_values:structuredClone(data.field_values||{}),
    portrait_path:data.portrait_path||null,token_path:data.token_path||null
   });
   if(!keepOpen)onClose();
   return data;
  }catch(e){
   setError(e?.message||String(e));
   if(keepOpen)throw e;
   return null;
  }finally{setSaving(false)}
 }
 async function castFromEditor(details){
  if(changed)await save(true);
  if(!onCastSpell)throw Error('Spell casting is not available.');
  return onCastSpell(details);
 }
 async function attackFromEditor(details){
  if(changed)await save(true);
  if(!onEquipmentAttack)throw Error('Weapon attacks are unavailable.');
  return onEquipmentAttack(details);
 }
 async function addFromEditor(details){
  if(changed)await save(true);
  if(!onAddSpellToHotbar)throw Error('Hotbar is not available.');
  return onAddSpellToHotbar(details);
 }
 function doRoll(field){
  // Use the values visible in the DM editor, including unsaved numeric edits.
  const expression=(field.formula||'1d20').replace(/@\{([a-z0-9_-]+)\}/gi,(_,id)=>{
   const val=draft.field_values?.[id];
   return val!==undefined&&/^-?\d+$/.test(String(val))?String(val):'0';
  });
  onRoll(expression,field.label);
 }
 return <>
 <FloatingWindow kind="sheet" onClose={close}>
  <section className="modal npc-modal character-modal" role="dialog" aria-label="Edit player character sheet">
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
    <button type="button" className={activeTab===PERSONAL_RESOURCE_TAB?'selected':''}
     onClick={()=>setActiveTab(PERSONAL_RESOURCE_TAB)}>Resources</button>
   </div>
   <div className="npc-fields fields">
    {activeTab===PERSONAL_RESOURCE_TAB?
     <div className="field span3"><PersonalResources
      value={draft.field_values[PERSONAL_RESOURCE_KEY]||[]}
      onChange={v=>editField(PERSONAL_RESOURCE_KEY,v)}/></div>:
     (tab?.fields||[]).map(f=><div className={'field span'+(f.span||1)} key={f.id}>
     <label>{f.label}</label>
     {f.type==='roll'?<button type="button" className="rollbtn" onClick={()=>doRoll(f)}>
        🎲 {f.label}<small>{f.formula||'1d20'}</small></button>:
      f.type==='inventory'?<InventoryPanel field={f} value={draft.field_values[f.id]||[]}
        template={template} sheetValues={draft.field_values}
        onChange={v=>editField(f.id,v)}/>:
      f.type==='resource'?<ResourceField value={draft.field_values[f.id]} onChange={v=>editField(f.id,v)}/>:
      f.type==='magic_dashboard'?<MagicDashboard field={f} value={draft.field_values[f.id]||{}}
       sheetValues={draft.field_values} onChange={v=>editField(f.id,v)}/>:
      f.type==='equipment'?<EquipmentManager field={f} template={template}
       value={draft.field_values[f.id]||{}} sheetValues={draft.field_values}
       onChange={v=>editField(f.id,v)} onAttack={attackFromEditor}/>:
      f.type==='progression'?<ProgressionPanel field={f}
       value={draft.field_values[f.id]||{}} sheetValues={draft.field_values}
       onChange={v=>editField(f.id,v)}/>:
      f.type==='proficiencies'?<ProficienciesPanel field={f} template={template}
       value={draft.field_values[f.id]||{}} sheetValues={draft.field_values}
       onChange={v=>editField(f.id,v)} onRoll={(formula,label)=>onRoll(formula,label)}/>:
      f.type==='collection'?<RepeatingCollection field={f} value={draft.field_values[f.id]||[]}
       sheetValues={draft.field_values} onChange={v=>editField(f.id,v)}
       sourceType="character" sourceId={record.id}
       onCastSpell={castFromEditor} onAddSpellToHotbar={addFromEditor}
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
    <button type="button" onClick={()=>save(false)} disabled={saving||!draft.name.trim()}>
     {saving?'Saving…':'Save player character'}
    </button>
   </div>
  </section>
 </FloatingWindow>
  {studio&&<PersonalTokenLibrary db={db} campaignId={campaignId} userId={viewerId}
    mode="players" defaultName={draft.name} currentTokenPath={draft.token_path} currentPortraitPath={draft.portrait_path}
    onClose={()=>setStudio(false)}
    onApply={assets=>setDraft(d=>({...d,portrait_path:assets.portraitPath,token_path:assets.tokenPath}))}/>}
 </>;
}