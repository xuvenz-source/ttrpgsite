import React,{useEffect,useMemo,useRef,useState} from 'react';
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

function Items({field,value,onChange}){
 const columns=field.columns?.length?field.columns:['Item','Qty','Notes'];const rows=Array.isArray(value)?value:[];
 return <div className="inventory">
  <div className="invrow">{columns.map(c=><b key={c}>{c}</b>)}</div>
  {rows.map((row,i)=><div className="invrow" key={i}>{columns.map(c=><input aria-label={c} key={c} value={row?.[c]??''} onChange={e=>onChange(rows.map((r,j)=>j===i?{...r,[c]:e.target.value}:r))}/>)}<button className="secondary" onClick={()=>onChange(rows.filter((_,j)=>j!==i))}>×</button></div>)}
  <button className="secondary" onClick={()=>onChange([...rows,{}])}>+ Item</button>
 </div>;
}
export default function NpcEditor({
 db,campaignId,userId,record,template,onSave,onSaveAsTemplate,onClose,onRoll,
 onCastSpell,onAddSpellToHotbar
}){
 const [draft,setDraft]=useState(()=>({
  name:record.data.name,
  values:enrichSheetValues(template,structuredClone(record.kind==='template'?
    record.data.field_values||{}:record.data.npc_values||{})),
  portraitPath:record.kind==='template'?record.data.portrait_path||null:null,
  tokenPath:record.kind==='template'?record.data.token_path||null:record.data.image_path||null,
  barsPublic:!!record.data.npc_bars_public
 }));
 const savedValues=useRef(JSON.stringify(draft.values));
 const[t,setT]=useState(template?.tabs?.[0]?.id||'main'),[studio,setStudio]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const current=template?.tabs?.find(x=>x.id===t)||template?.tabs?.[0];const title=record.kind==='template'?'Bestiary template':'NPC token sheet';
 function setField(id,v){setDraft(d=>({...d,name:id==='character_name'?String(v):d.name,
   values:enrichSheetValues(template,{...d.values,[id]:v})}))}
 async function save(keepOpen=false){
  if(saving)throw Error('An NPC save is in progress.');
  setSaving(true);setError('');
  try{
   await onSave(draft);
   savedValues.current=JSON.stringify(draft.values);
   if(!keepOpen)onClose();
  }catch(e){
   setError(e?.message||String(e));
   if(keepOpen)throw e;
  }finally{setSaving(false)}
 }
 async function castFromEditor(details){
  if(savedValues.current!==JSON.stringify(draft.values))await save(true);
  if(!onCastSpell)throw Error('Spell casting is unavailable from this sheet.');
  return onCastSpell(details);
 }
 async function addFromEditor(details){
  if(savedValues.current!==JSON.stringify(draft.values))await save(true);
  if(!onAddSpellToHotbar)throw Error('The hotbar is unavailable.');
  return onAddSpellToHotbar(details);
 }
 async function saveToBestiary(){setSaving(true);setNotice('');setError('');
  try{await onSaveAsTemplate(draft);setNotice('Saved a reusable copy in your Bestiary.')}
  catch(e){setError(e?.message||String(e))}finally{setSaving(false)}
 }
 function close(){if(!confirm('Close NPC sheet? Unsaved changes will be lost.'))return;onClose()}
 const doRoll=(field)=>{
  const formula=(field.formula||'1d20').replace(/@\{([a-z0-9_-]+)\}/gi,(raw,key)=>{
   const val=draft.values[key];return val!==undefined&&String(val).match(/^-?\d+$/)?String(val):'0'
  });
  onRoll(formula,field.label);
 };
 return <>
 <FloatingWindow kind="sheet" onClose={close}>
 <section className="modal npc-modal" role="dialog" aria-label="Edit NPC sheet">
 <div className="heading"><div><h2>{title}</h2><p className="muted small">{record.kind==='token'?'Changes apply only to this placed token.':'Changes become the default for newly placed copies.'}</p></div><button className="secondary" onClick={close}>✕</button></div>
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
 (current?.fields||[]).map(f=><div className={'field span'+(f.span||1)} key={f.id}><label>{f.label}</label>
 {f.type==='roll'?<button onClick={()=>doRoll(f)} className="rollbtn">🎲 {f.label} <small>{f.formula||'1d20'}</small></button>:
 f.type==='inventory'?<Items field={f} value={draft.values[f.id]||[]} onChange={v=>setField(f.id,v)}/>:
 f.type==='resource'?<ResourceField value={draft.values[f.id]} onChange={v=>setField(f.id,v)}/>:
 f.type==='magic_dashboard'?<MagicDashboard field={f} value={draft.values[f.id]||{}}
   sheetValues={draft.values} onChange={v=>setField(f.id,v)}/>:
 f.type==='equipment'?<EquipmentManager field={f} template={template}
   value={draft.values[f.id]||{}} sheetValues={draft.values}
   onChange={v=>setField(f.id,v)} onRoll={(formula,label)=>onRoll(formula,label)}/>:
 f.type==='progression'?<ProgressionPanel field={f} value={draft.values[f.id]||{}}
   sheetValues={draft.values} onChange={v=>setField(f.id,v)}/>:
 f.type==='proficiencies'?<ProficienciesPanel field={f} value={draft.values[f.id]||{}}
   sheetValues={draft.values} template={template} onChange={v=>setField(f.id,v)}
   onRoll={(formula,label)=>onRoll(formula,label)}/>:
 f.type==='collection'?<RepeatingCollection field={f} value={draft.values[f.id]||[]}
   sheetValues={draft.values} onChange={v=>setField(f.id,v)}
   sourceType={record.kind==='token'?'npc_token':'npc_template'} sourceId={record.data.id}
   onCastSpell={castFromEditor} onAddSpellToHotbar={addFromEditor}
   onRoll={(formula,label)=>onRoll(formula,label)}/>:
 f.type==='checkbox'?<input type="checkbox" checked={!!draft.values[f.id]} onChange={e=>setField(f.id,e.target.checked)}/>:
 f.type==='textarea'?<textarea value={draft.values[f.id]??''} onChange={e=>setField(f.id,e.target.value)}/>:
 <input type={f.type==='number'?'number':'text'} value={draft.values[f.id]??''} onChange={e=>setField(f.id,e.target.value)}/>}
 </div>)}
 </div>
 {error&&<p className="error">{error}</p>}
 {notice&&<p className="good">{notice}</p>}
 <div className="actions">{record.kind==='token'&&<button className="secondary" onClick={saveToBestiary} disabled={saving}>Save copy to Bestiary</button>}<button className="secondary" onClick={close}>Cancel</button><button onClick={()=>save(false)} disabled={saving||!draft.name.trim()}>{saving?'Saving…':'Save NPC sheet'}</button></div>
 </section>
 </FloatingWindow>
 {studio&&<PersonalTokenLibrary db={db} campaignId={campaignId} userId={userId}
  mode="npcs" defaultName={draft.name} currentTokenPath={draft.tokenPath} currentPortraitPath={draft.portraitPath}
  onClose={()=>setStudio(false)} onApply={assets=>{setDraft(d=>({...d,portraitPath:assets.portraitPath,tokenPath:assets.tokenPath}))}}/>}
 </>;
}