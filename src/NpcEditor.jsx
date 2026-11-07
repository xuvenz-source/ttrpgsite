import {rollDragProps} from './HotbarRollActions.js';
import React,{useEffect,useMemo,useState} from 'react';
import useSheetAutosave from './useSheetAutosave.js';
import FloatingWindow from './FloatingWindow.jsx';
import Artwork from './Artwork.jsx';
import PersonalTokenLibrary from './PersonalTokenLibrary.jsx';
import ResourceField from './ResourceField.jsx';
import AttributeField from './AttributeField.jsx';
import {SheetListField} from './TemplateOptionLists.jsx';
import {enrichSheetValues,PERSONAL_RESOURCE_KEY,PERSONAL_RESOURCE_TAB} from './SheetDerived.js';
import {ProgressionPanel,ProficienciesPanel} from './SheetProgression.jsx';
import PersonalResources from './PersonalResources.jsx';
import {MagicDashboard} from './SheetMagic.jsx';
 import {EquipmentManager} from './SheetEquipment.jsx';
import {RepeatingCollection} from './RepeatingCollection.jsx';
import SharedInventoryPanel from './SharedInventoryPanel.jsx';

export default function NpcEditor({
 db,campaignId,userId,record,template,onSave,onSaveAsTemplate,onClose,onRoll,
 onCastSpell,onAddSpellToHotbar,onEquipmentAttack,focusSignal=0,onPopOut
}){
 const [draft,setDraft]=useState(()=>({
  name:record.data.name,
  values:enrichSheetValues(template,structuredClone(record.kind==='template'?
    record.data.field_values||{}:record.data.npc_values||{})),
  portraitPath:record.kind==='template'?record.data.portrait_path||null:null,
  tokenPath:record.kind==='template'?record.data.token_path||null:record.data.image_path||null,
  barsPublic:!!record.data.npc_bars_public
 }));
 const initial=useMemo(()=>structuredClone(draft),[record.kind,record.data.id]);
 const {status,error:autoError,flush,hasPending}=useSheetAutosave({
  value:draft,initialValue:initial,onSave:async next=>{
   if(!next.name.trim())throw Error('NPC name is required.');
   await onSave(next);
  }
 });
 const[t,setT]=useState(template?.tabs?.[0]?.id||'main'),[studio,setStudio]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const rollSource={sourceType:record.kind==='token'?'npc_token':'npc_template',sourceId:record.data.id};
 const current=template?.tabs?.find(x=>x.id===t)||template?.tabs?.[0];const title=record.kind==='template'?'Bestiary template':'NPC token sheet';
 function setField(id,v){setDraft(d=>({...d,name:id==='character_name'?String(v):d.name,
   values:enrichSheetValues(template,{...d.values,[id]:v})}))}
 async function castFromEditor(details){
  await flush();
  if(!onCastSpell)throw Error('Spell casting is unavailable from this sheet.');
  return onCastSpell(details);
 }
 async function attackFromEditor(details){
  await flush();
  if(!onEquipmentAttack)throw Error('Weapon attacks are unavailable.');
  return onEquipmentAttack(details);
 }
 async function addFromEditor(details){
  await flush();
  if(!onAddSpellToHotbar)throw Error('The hotbar is unavailable.');
  return onAddSpellToHotbar(details);
 }
 async function restoreBestiaryDefaults(){
  if(record.kind!=='token'||!record.data.npc_template_id)return;
  if(!confirm('Replace this token\'s stats with the current Bestiary defaults? Other tokens will not change.'))return;
  setError('');setNotice('');
  try{
   const {data,error:lookupError}=await db.from('npc_templates')
    .select('field_values').eq('id',record.data.npc_template_id)
    .eq('campaign_id',campaignId).maybeSingle();
   if(lookupError)throw lookupError;
   if(!data)throw Error('The original Bestiary sheet is no longer available.');
   setDraft(old=>({...old,values:enrichSheetValues(template,
    structuredClone(data.field_values||{}))}));
   setNotice('Current Bestiary values loaded. Changes save automatically.');
  }catch(e){setError(e?.message||String(e))}
 }
 async function saveToBestiary(){setSaving(true);setNotice('');setError('');
  try{await flush();await onSaveAsTemplate(draft);setNotice('Saved a reusable copy in your Bestiary.')}
  catch(e){setError(e?.message||String(e))}finally{setSaving(false)}
 }
 async function close(){
  try{await flush();onClose()}
  catch{/* Do not discard unsaved sheet changes on a failed save. */}
 }
 const doRoll=(field)=>{
  const formula=(field.formula||'1d20').replace(/@\{([a-z0-9_-]+)\}/gi,(raw,key)=>{
   const val=draft.values[key];return val!==undefined&&String(val).match(/^-?\d+$/)?String(val):'0'
  });
  onRoll(formula,field.label);
 };
 return <>
 <FloatingWindow kind="npc" focusSignal={focusSignal} onClose={close}>
 <section className="modal npc-modal" role="dialog" aria-label="Edit NPC sheet">
 <div className="heading"><div><h2>{title}</h2><p className="muted small">{record.kind==='token'?'Changes apply only to this placed token.':'Changes become the default for newly placed copies.'}</p></div><div className="npc-window-actions">
   {onPopOut&&<button type="button" className="secondary" onClick={()=>{
    if(hasPending||status==='Saving…'||status==='Save failed'){
     setNotice('Changes must finish saving before opening the sheet in another window.');
     return;
    }
    onPopOut();
   }} title="Open this NPC sheet in a separate browser window">↗ Pop out</button>}
   <button type="button" className="secondary" onClick={close}>✕</button>
  </div></div>
 <div className="npc-editor-top">
 <Artwork db={db} path={draft.tokenPath||draft.portraitPath} alt={draft.name} className="npc-editor-portrait"/>
 <label>NPC name<input maxLength={100} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value,values:{...d.values,character_name:e.target.value}}))}/></label>
 <button className="secondary" onClick={()=>setStudio(true)}>🎨 {draft.tokenPath?'Change token art':'Create token art'}</button>
 </div>
 <label className="npc-monitor-public-toggle">
  <input type="checkbox" checked={draft.barsPublic}
    onChange={e=>setDraft(d=>({...d,barsPublic:e.target.checked}))}/>
  Show this NPC's resource bars and globes to all players (overrides campaign default)
 </label>
 <div className="tabs">{template?.tabs?.map(tab=><button key={tab.id} onClick={()=>setT(tab.id)} className={t===tab.id?'selected':''}>{tab.name}</button>)}
 <button type="button" className={t===PERSONAL_RESOURCE_TAB?'selected':''}
  onClick={()=>setT(PERSONAL_RESOURCE_TAB)}>Resources</button></div>
 <div className="npc-fields fields">
 {t===PERSONAL_RESOURCE_TAB?<div className="field span3">
  <PersonalResources value={draft.values[PERSONAL_RESOURCE_KEY]||[]}
   onChange={v=>setField(PERSONAL_RESOURCE_KEY,v)}/></div>:
 (current?.fields||[]).map(f=><div className={'field span'+(f.span||1)+(f.type==='inventory'&&f.inventoryPreset==='grid'?' inventory-grid-field':'')} key={f.id}><label>{f.label}</label>
 {f.type==='roll'?<button type="button" onClick={()=>doRoll(f)}
 {...rollDragProps({kind:'sheet',...rollSource,fieldId:f.id,label:f.label})} className="rollbtn">🎲 {f.label} <small>{f.formula||'1d20'}</small></button>:
 f.type==='inventory'?<SharedInventoryPanel db={db} campaignId={campaignId}
  userId={userId} isDM sourceType={record.kind==='template'?'npc_template':'npc_token'}
  sourceId={record.data.id} field={f} template={template}
  sheetValues={draft.values}/>:
 f.type==='attribute'?<AttributeField rollSource={rollSource} field={f} template={template}
  value={draft.values[f.id]} values={draft.values}
  onChange={v=>setField(f.id,v)}
  onProficiencyChange={v=>setField(f.id+'__save_prof',v)}
  onRoll={(formula,label)=>onRoll(formula,label)}/>:
 f.type==='list'?<SheetListField field={f} template={template}
  value={draft.values[f.id]} onChange={v=>setField(f.id,v)}/>:
 f.type==='resource'?<ResourceField value={draft.values[f.id]} onChange={v=>setField(f.id,v)}/>:
 f.type==='magic_dashboard'?<MagicDashboard field={f} value={draft.values[f.id]||{}}
   sheetValues={draft.values} onChange={v=>setField(f.id,v)}/>:
 f.type==='equipment'?<EquipmentManager rollSource={rollSource} field={f} template={template}
   value={draft.values[f.id]||{}} sheetValues={draft.values}
   onChange={v=>setField(f.id,v)} onAttack={attackFromEditor}/>:
 f.type==='progression'?<ProgressionPanel field={f} value={draft.values[f.id]||{}}
   sheetValues={draft.values} onChange={v=>setField(f.id,v)}/>:
 f.type==='proficiencies'?<ProficienciesPanel rollSource={rollSource} field={f} value={draft.values[f.id]||{}}
   sheetValues={draft.values} template={template} onChange={v=>setField(f.id,v)}
   onRoll={(formula,label)=>onRoll(formula,label)}/>:
 f.type==='collection'?<RepeatingCollection rollSource={rollSource} field={f} value={draft.values[f.id]||[]}
   sheetValues={draft.values} onChange={v=>setField(f.id,v)}
   sourceType={record.kind==='token'?'npc_token':'npc_template'} sourceId={record.data.id}
   onCastSpell={castFromEditor} onAddSpellToHotbar={addFromEditor}
   onRoll={(formula,label)=>onRoll(formula,label)}/>:
 f.type==='checkbox'?<input type="checkbox" checked={!!draft.values[f.id]} onChange={e=>setField(f.id,e.target.checked)}/>:
 f.type==='textarea'?<textarea value={draft.values[f.id]??''} onChange={e=>setField(f.id,e.target.value)}/>:
 <input type={f.type==='number'?'number':'text'} value={draft.values[f.id]??''} onChange={e=>setField(f.id,e.target.value)}/>}
 </div>)}
 </div>
 {(error||autoError)&&<p className="error" role="alert">{error||autoError}</p>}
 {notice&&<p className="good">{notice}</p>}
 <div className="actions">
 {record.kind==='token'&&record.data.npc_template_id&&
  <button type="button" className="secondary" disabled={saving}
   onClick={()=>void restoreBestiaryDefaults()}>Restore Bestiary defaults</button>}
 {record.kind==='token'&&<button className="secondary" onClick={saveToBestiary}
    disabled={saving}>Save copy to Bestiary</button>}
   <span className="muted tiny" role="status">{status}</span>
   <button className="secondary" onClick={()=>void close()}>Close</button></div>
 </section>
 </FloatingWindow>
 {studio&&<PersonalTokenLibrary db={db} campaignId={campaignId} userId={userId}
  mode="npcs" defaultName={draft.name} currentTokenPath={draft.tokenPath} currentPortraitPath={draft.portraitPath}
  onClose={()=>setStudio(false)} onApply={assets=>{setDraft(d=>({...d,portraitPath:assets.portraitPath,tokenPath:assets.tokenPath}))}}/>}
 </>;
}