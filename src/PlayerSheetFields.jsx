import React,{useEffect,useRef,useState} from 'react';
import {enrichSheetValues,PERSONAL_RESOURCE_KEY,PERSONAL_RESOURCE_TAB} from './SheetDerived.js';
import PersonalResources from './PersonalResources.jsx';
import SharedInventoryPanel from './SharedInventoryPanel.jsx';
import {MagicDashboard} from './SheetMagic.jsx';
import {EquipmentManager} from './SheetEquipment.jsx';
import {ProgressionPanel,ProficienciesPanel} from './SheetProgression.jsx';
import {RepeatingCollection} from './RepeatingCollection.jsx';
import AttributeField from './AttributeField.jsx';
import {SheetListField} from './TemplateOptionLists.jsx';
import ResourceField from './ResourceField.jsx';
import {D} from './TabletopSheetDefaults.js';

/** Immediate local sheet edits never wait for the battlemap, roster or network.
 * Flushes pending values before casts, rolls, attacks, pop-outs and sheet exit.
 */
export default function PlayerSheetFields({db,campaignId,userId,isDM,character,template,tabId,
 onBatchChange,onRoll,onCastSpell,onEquipmentAttack,onAddSpellToHotbar,registerFlusher}){
 const characterId=character?.id;
 const [values,setValues]=useState(()=>character?.field_values||{});
 const pending=useRef(new Map()),unconfirmed=useRef(new Map());
 const timer=useRef(null),sendRef=useRef(onBatchChange),flushRef=useRef(null);
 sendRef.current=onBatchChange;
 function flush(){
  if(timer.current!==null){clearTimeout(timer.current);timer.current=null}
  if(!pending.current.size||!characterId)return;
  const patch=Object.fromEntries(pending.current);
  pending.current.clear();
  sendRef.current(characterId,patch);
 }
 flushRef.current=flush;
 useEffect(()=>{
  if(!registerFlusher)return;
  const run=()=>flushRef.current?.();
  registerFlusher(run);
  return()=>{run();registerFlusher(null)};
 },[registerFlusher,characterId]);
 useEffect(()=>{
  const incoming=character?.field_values||{};
  for(const [key,value] of unconfirmed.current){
   if(JSON.stringify(incoming[key])===JSON.stringify(value))
    unconfirmed.current.delete(key);
  }
  setValues(current=>{
   const next=enrichSheetValues(template,{
    ...incoming,...Object.fromEntries(unconfirmed.current)
   });
   return JSON.stringify(next)===JSON.stringify(current)?current:next;
  });
 },[character?.field_values,template]);
 function update(id,value){
  pending.current.set(id,value);
  unconfirmed.current.set(id,value);
  setValues(previous=>enrichSheetValues(template,{...previous,[id]:value}));
  if(timer.current!==null)clearTimeout(timer.current);
  timer.current=setTimeout(()=>flushRef.current?.(),140);
 }
 const rollSafe=(...args)=>{flush();return onRoll?.(...args)};
 const attackSafe=(...args)=>{flush();return onEquipmentAttack?.(...args)};
 const castSafe=(...args)=>{flush();return onCastSpell?.(...args)};
 const addSafe=(...args)=>{flush();return onAddSpellToHotbar?.(...args)};
 return <>
{tabId===PERSONAL_RESOURCE_TAB?
 <div className="fields"><div className="field span3">
  <PersonalResources value={values?.[PERSONAL_RESOURCE_KEY]||[]}
   onChange={v=>update(PERSONAL_RESOURCE_KEY,v)}/>
 </div></div>:
 <div className="fields">{(template.tabs.find(t=>t.id===tabId)||template.tabs[0])?.fields.map(f=><div className={'field span'+(f.span||1)+(f.type==='inventory'&&f.inventoryPreset==='grid'?' inventory-grid-field':'')} key={f.id}><label>{f.label}</label>{f.type==='roll'?<button className="rollbtn" onClick={()=>rollSafe(f.formula||'1d20',f.label)}>🎲 {f.label} <small>{f.formula}</small></button>:f.type==='inventory'?<SharedInventoryPanel db={db} campaignId={campaignId}
       userId={userId} isDM={isDM} sourceType="character" sourceId={characterId}
       field={f} template={template} sheetValues={values}/>:
 f.type==='magic_dashboard'?<MagicDashboard field={f}
  value={values?.[f.id]||{}}
  sheetValues={values||{}}
  onChange={v=>update(f.id,v)}/>:
 f.type==='equipment'?<EquipmentManager field={f} template={template}
  value={values?.[f.id]||{}} sheetValues={values||{}}
  onChange={v=>update(f.id,v)}
  onAttack={({fieldId,weaponId})=>attackSafe({
   sourceType:'character',sourceId:characterId,fieldId,weaponId
  })}/>:
 f.type==='progression'?<ProgressionPanel field={f}
  value={values?.[f.id]||{}} sheetValues={values||{}}
  onChange={v=>update(f.id,v)}/>:
 f.type==='proficiencies'?<ProficienciesPanel field={f}
  value={values?.[f.id]||{}} sheetValues={values||{}}
  template={template} onChange={v=>update(f.id,v)}
  onRoll={(formula,label)=>rollSafe(formula,label)}/>:
 f.type==='collection'?<RepeatingCollection field={f}
 value={values?.[f.id]||[]} sheetValues={values||{}}
 sourceType="character" sourceId={characterId}
 onChange={v=>update(f.id,v)} onRoll={(formula,label)=>rollSafe(formula,label)}
 onCastSpell={({collectionId,entryId,mode})=>castSafe({
  sourceType:'character',sourceId:characterId,collectionId,entryId,mode
 })}
 onAddSpellToHotbar={addSafe}/>:
 f.type==='attribute'?<AttributeField field={f}
  value={values?.[f.id]} values={values||{}}
  template={template} onChange={v=>update(f.id,v)}
  onProficiencyChange={v=>update(f.id+'__save_prof',v)}
  onRoll={(formula,label)=>rollSafe(formula,label)}/>:
 f.type==='list'?<SheetListField field={f} template={template}
  value={values?.[f.id]} onChange={v=>update(f.id,v)}/>:
 f.type==='resource'?<ResourceField value={values?.[f.id]} onChange={v=>update(f.id,v)}/>:f.type==='checkbox'?<input type="checkbox" checked={!!values?.[f.id]} onChange={e=>update(f.id,e.target.checked)}/>:f.type==='textarea'?<textarea value={values?.[f.id]??''} onChange={e=>update(f.id,e.target.value)}/>:<input type={f.type==='number'?'number':'text'} value={values?.[f.id]??D(f)} onChange={e=>update(f.id,e.target.value)} />}</div>)}</div>}
 </>;
}
