import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{createClient}from'@supabase/supabase-js';
import './style.css';
import './map-environment.css';
import './combat.css';
import PersonalTokenLibrary from './PersonalTokenLibrary.jsx';
import {TemplateListsDesigner,SheetListField,optionLists} from './TemplateOptionLists.jsx';
import {makeProgressionField,makeProficienciesField,enrichSheetValues,
 PERSONAL_RESOURCE_TAB,PERSONAL_RESOURCE_KEY,validateModifierRules,modifierReferenceId,
 numericFieldsWithDerived} from './SheetDerived.js';
import {ProgressionDesigner,ProgressionPanel,ProficienciesDesigner,ProficienciesPanel} from './SheetProgression.jsx';
import {makeMagicDashboardField,MagicDashboardDesigner,MagicDashboard} from './SheetMagic.jsx';
import {makeEquipmentField,makeEquipmentTab,EquipmentDesigner,EquipmentManager,calculateArmor} from './SheetEquipment.jsx';
import {RepeatingCollection,CollectionDesigner,makeBlankCollection,makeSpellbookField} from './RepeatingCollection.jsx';
import InventoryRulesDesigner from './InventoryRulesDesigner.jsx';
import {uid,D} from './TabletopSheetDefaults.js';

export default function Designer({template,tabId,changeTemplate,onLinkResource}){
 const t=template?.tabs.find(x=>x.id===tabId)||template?.tabs[0],drag=useRef(null);
 const [fieldType,setFieldType]=useState('text'),[linking,setLinking]=useState(''),[linkMessage,setLinkMessage]=useState('');
 if(!t)return null;
 const update=(id,key,value)=>changeTemplate(x=>{
  const field=x.tabs.find(y=>y.id===t.id)?.fields.find(y=>y.id===id);
  if(field)field[key]=value;
 });
 async function link(field){
  setLinkMessage('');setLinking(field.id);
  try{const response=await onLinkResource(field);setLinkMessage(response)}
  catch(e){setLinkMessage(e?.message||String(e))}
  finally{setLinking('')}
 }
 function createField(){
  const type=fieldType;
  if(type==='collection'){
   changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push(makeBlankCollection()));
   return;
  }
  if(['magic_dashboard','equipment','progression','proficiencies'].includes(type)){
   changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push(
    type==='equipment'?makeEquipmentField():
    type==='magic_dashboard'?makeMagicDashboardField():
    type==='progression'?makeProgressionField():makeProficienciesField()));
   return;
  }
  changeTemplate(x=>x.tabs.find(y=>y.id===t.id).fields.push({
   id:'field_'+uid().slice(0,8),
   label:type==='resource'?'Hit Points':'New '+type,type,span:type==='resource'?2:1,
   ...(type==='attribute'?{proficiencyField:''}:type==='list'?{listId:''}:{}),
   ...(type==='inventory'?{columns:['Item','Qty','Weight','Notes'],inventoryPreset:'list',gridColumns:8,gridRows:5}:type==='roll'?{formula:'1d20'}:{})
  }));
 }
 return <>
  <div className="modifier-rule-settings">
   <strong>Ability modifier formula</strong>
   <span className="muted tiny">DM-only formula: floor((score − base) / points per +1). D&D uses base 10 and step 2.</span>
   <label>Base score<input type="number" min="0" max="100" step="1"
    value={template.modifierRules?.base??10}
    onChange={e=>changeTemplate(x=>x.modifierRules={...x.modifierRules,base:Number(e.target.value)})}/></label>
   <label>Points per +1<input type="number" min="1" max="20" step="1"
    value={template.modifierRules?.step??2}
    onChange={e=>changeTemplate(x=>x.modifierRules={...x.modifierRules,step:Number(e.target.value)})}/></label>
  </div>
  <TemplateListsDesigner template={template} changeTemplate={changeTemplate}/>
  <InventoryRulesDesigner template={template} changeTemplate={changeTemplate}/>
  <div className="tools">
   <input aria-label="Tab name" value={t.name}
    onChange={e=>changeTemplate(x=>x.tabs.find(y=>y.id===t.id).name=e.target.value)}/>
   <button className="secondary" onClick={()=>{
    if(template.tabs.length<2)return alert('Keep at least one tab');
    if(confirm('Delete tab and its fields?'))changeTemplate(x=>x.tabs=x.tabs.filter(y=>y.id!==t.id));
   }}>Delete tab</button>
   <select aria-label="New field type" value={fieldType} onChange={e=>setFieldType(e.target.value)}>
    <option value="text">Text</option><option value="number">Number</option>
    <option value="attribute">Attribute (score + saving throw)</option>
    <option value="list">List (DM-defined dropdown)</option>
    <option value="resource">Resource (Current / Maximum)</option>
    <option value="collection">Repeating Collection (spellbooks, abilities…)</option>
    <option value="magic_dashboard">Magic resources dashboard</option>
    <option value="equipment">Equipment and armour rules</option>
    <option value="progression">Class levels & automatic progression</option>
    <option value="proficiencies">Skills & proficiencies</option>
    <option value="textarea">Notes</option><option value="checkbox">Checkbox</option>
    <option value="roll">Dice button</option><option value="inventory">Inventory</option>
   </select>
   <button type="button" onClick={createField}>+ Add field</button>
   <button type="button" className="secondary" onClick={()=>changeTemplate(x=>
    x.tabs.find(y=>y.id===t.id).fields.push(makeSpellbookField()))}>+ Spellbook preset</button>
   <button type="button" className="secondary" onClick={()=>changeTemplate(x=>
    x.tabs.find(y=>y.id===t.id).fields.push(makeMagicDashboardField()))}>+ Magic dashboard</button>
   <button type="button" className="secondary" onClick={()=>changeTemplate(x=>
    x.tabs.find(y=>y.id===t.id).fields.push(makeProgressionField()))}>+ Class levels</button>
  </div>
  <p className="muted small">Create ordinary fields, Current/Maximum resources, or repeating collections with nested controls. Choose the Spellbook preset for level tabs, spell entries, detail panels, and roll buttons.</p>
  {linkMessage&&<div className="designer-feedback" role="status">{linkMessage}</div>}
  <div className="designer-grid">{t.fields.map((f,i)=>
   <div className="designfield" key={f.id}
    onDragOver={e=>{if(drag.current?.tabId===t.id){e.preventDefault();e.dataTransfer.dropEffect='move'}}}
    onDrop={e=>{
     if(drag.current?.tabId!==t.id)return;
     e.preventDefault();
     const fromId=drag.current.id;
     drag.current=null;
     changeTemplate(x=>{
      const arr=x.tabs.find(y=>y.id===t.id).fields;
      const from=arr.findIndex(field=>field.id===fromId);
      const to=arr.findIndex(field=>field.id===f.id);
      if(from<0||to<0||from===to)return;
      arr.splice(to,0,arr.splice(from,1)[0]);
     });
    }}>
    <span className="muted designfield-drag-handle" draggable="true"
      title="Drag this handle to reorder the field"
      onDragStart={e=>{
       drag.current={tabId:t.id,id:f.id};
       e.dataTransfer.effectAllowed='move';
       e.dataTransfer.setData('text/plain',f.id);
      }}
      onDragEnd={()=>{drag.current=null}}>⠿ Drag to reorder</span>
    <label>Field label<input value={f.label} onChange={e=>update(f.id,'label',e.target.value)}/></label>
    <label className="sheet-quickcode-field">Quickcode (optional)
     <input value={f.quickcode||''} maxLength={34}
      aria-label={'Quickcode for '+f.label} placeholder="=@AC"
      onChange={e=>update(f.id,'quickcode',e.target.value.trim().toUpperCase())}/>
     <small className="muted tiny">Use in chat or token field IDs. Resources resolve Current;
      equipment resolves calculated armour class.</small>
    </label>
    <div className="tools">
     <label>Width<select value={f.span||1} onChange={e=>update(f.id,'span',Number(e.target.value))}>
      <option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option>
     </select></label>
     <label>Field type<select value={f.type} onChange={e=>{
      const next=e.target.value;
      changeTemplate(tpl=>{
       const field=tpl.tabs.find(tab=>tab.id===t.id).fields.find(item=>item.id===f.id);
       if(!field)return;
       if(['magic_dashboard','equipment','progression','proficiencies'].includes(next)){
        const replacement=next==='magic_dashboard'?makeMagicDashboardField():
          next==='equipment'?makeEquipmentField():
          next==='progression'?makeProgressionField():makeProficienciesField();
        Object.assign(field,replacement,{id:field.id,label:field.label});
       }else field.type=next;
      });
     }}>
      <option value="text">Text</option><option value="number">Number</option>
      <option value="attribute">Attribute (score + saving throw)</option>
      <option value="list">List (DM-defined dropdown)</option>
      <option value="resource">Resource (Current / Maximum)</option>
      <option value="collection">Repeating Collection</option>
      <option value="magic_dashboard">Magic dashboard</option>
      <option value="equipment">Equipment & armour</option>
      <option value="progression">Class levels & progression</option>
      <option value="proficiencies">Skills & proficiencies</option>
      <option value="textarea">Notes</option><option value="checkbox">Checkbox</option>
      <option value="roll">Dice button</option><option value="inventory">Inventory</option>
     </select></label>
     <button className="secondary" onClick={()=>changeTemplate(x=>{
      const tab=x.tabs.find(y=>y.id===t.id);tab.fields=tab.fields.filter(y=>y.id!==f.id);
     })}>Delete</button>
    </div>
    {f.type==='progression'&&<ProgressionDesigner field={f} template={template}
      onChange={next=>changeTemplate(x=>{
       const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);
      })}/>}
    {f.type==='proficiencies'&&<ProficienciesDesigner field={f} template={template}
      onChange={next=>changeTemplate(x=>{
       const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);
      })}/>}
    {f.type==='magic_dashboard'&&<MagicDashboardDesigner field={f} onChange={next=>
      changeTemplate(x=>{const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);})}/>}
    {f.type==='equipment'&&<EquipmentDesigner field={f} template={template}
      onChange={next=>changeTemplate(x=>{
       const target=x.tabs.find(tab=>tab.id===t.id)?.fields.find(v=>v.id===f.id);
       if(target)Object.assign(target,next);
      })}/>}
    {f.type==='collection'&&<CollectionDesigner field={f}
      onChange={next=>changeTemplate(x=>{
       const child=x.tabs.find(y=>y.id===t.id).fields.find(y=>y.id===f.id);
       if(child)Object.assign(child,next);
      })}/>}
    {f.type==='resource'&&<>
     <div className="resource-designer-explainer">Two values in one field: <strong>Current / Maximum</strong>.
      <span>Example: {f.label||'Hit Points'} 15 / 22</span></div>
     <button className="resource-link-button" disabled={linking===f.id} onClick={()=>link(f)}>
      {linking===f.id?'Linking…':'↗ Add / link token resource bar'}
     </button>
    </>}
    {f.type==='attribute'&&<div className="ability-modifier-designer">
     <p className="muted tiny">A numeric ability score with its calculated modifier,
      a saving-throw proficiency checkbox, and a one-click d20 saving throw.
      Proficiency is taken from class progression unless you choose a field below.</p>
     <label>Saving throw proficiency bonus source
      <select value={f.proficiencyField||''}
       onChange={e=>update(f.id,'proficiencyField',e.target.value)}>
       <option value="">Campaign progression / proficiency_bonus</option>
       {numericFieldsWithDerived(template).filter(item=>item.id!==f.id).map(item=>
        <option value={item.id} key={item.id}>{item.label} ({item.id})</option>)}
      </select>
     </label>
     <p className="muted tiny">Calculated references: <code>{f.id+'_mod'}</code> and
      <code>{f.id+'_save_bonus'}</code>.</p>
    </div>}
    {f.type==='list'&&<div className="ability-modifier-designer">
     <label>Predefined list
      <select value={f.listId||''} onChange={e=>update(f.id,'listId',e.target.value)}>
       <option value="">Choose a reusable list</option>
       {optionLists(template).map(list=><option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
     </label>
     <p className="muted tiny">Edit options in Reusable lists above; players only see this
      dropdown on their sheet.</p>
    </div>}
    {f.type==='number'&&<div className="ability-modifier-designer">
      <label className="ability-modifier-enable"><input type="checkbox"
       checked={f.modifierEnabled===true} onChange={e=>update(f.id,'modifierEnabled',e.target.checked)}/>
       Calculate a hidden modifier from this score</label>
      {f.modifierEnabled===true&&<>
       <label>Modifier reference ID
        <input value={f.modifierCode??modifierReferenceId(f)??''}
         maxLength={76} onChange={e=>update(f.id,'modifierCode',e.target.value)}
         placeholder="dexterity"/></label>
       <p className="muted tiny">Use <code>@{'{'+(modifierReferenceId(f)||'dexterity')+'_mod}'}</code> in macros. No extra player field.</p>
      </>}
     </div>}
     {f.type==='roll'&&<label>Dice formula<input value={f.formula||''}
      onChange={e=>update(f.id,'formula',e.target.value)} placeholder="1d20+@{strength}"/></label>}
    {f.type==='inventory'&&<div className="inventory-designer-options">
     <label>Inventory preset<select value={f.inventoryPreset||'list'}
      onChange={e=>update(f.id,'inventoryPreset',e.target.value)}>
      <option value="list">Classic list (Roll20 style)</option>
      <option value="grid">Slot grid (drag items)</option>
     </select></label>
     {f.inventoryPreset==='grid'&&<>
      <label>Grid columns<input type="number" min="2" max="20"
       value={f.gridColumns||8} onChange={e=>update(f.id,'gridColumns',Number(e.target.value))}/></label>
      <label>Grid rows<input type="number" min="2" max="20"
       value={f.gridRows||5} onChange={e=>update(f.id,'gridRows',Number(e.target.value))}/></label>
     </>}
     <label>List columns (comma separated)<input
      value={(f.columns||[]).join(', ')}
      onChange={e=>update(f.id,'columns',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></label>
     <p className="muted tiny">Use Item, Qty, Weight, Notes for carry weight and DM item distribution.
      Switching layouts keeps the same saved items.</p>
    </div>}
   </div>)}
  </div>
 </>;
}

