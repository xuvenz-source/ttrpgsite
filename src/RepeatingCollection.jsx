import React,{useEffect,useMemo,useState} from 'react';

const uid=()=>crypto.randomUUID().slice(0,8);
const newId=()=>crypto.randomUUID();
const safeColumns=n=>Math.max(1,Math.min(12,Number(n)||3));
const asList=raw=>String(raw||'').split(',').map(s=>s.trim()).filter(Boolean);
const asOptions=raw=>asList(raw);
const fieldTypes=[
 ['text','Short text'],['number','Number'],['select','Dropdown'],
 ['checkbox','Checkbox'],['textarea','Long text'],
 ['roll','Dice/action button'],['info','Information button'],['static','Instruction text']
];
const sectionFor=field=>field.section||'main';
const validFields=field=>Array.isArray(field?.fields)?field.fields:[];
const validSections=field=>Array.isArray(field?.sections)?field.sections:[];
const validGroups=field=>Array.isArray(field?.groups)?field.groups:[];
const newChild=(type='text')=>({
 id:'sub_'+uid(),label:type==='roll'?'Roll':type==='info'?'Show info':'New '+type,
 type,section:'main',width:type==='textarea'?6:type==='checkbox'?2:3,
 ...(type==='select'?{options:'Option 1, Option 2'}:{}),
 ...(type==='roll'?{formula:'1d20'}:{}),
 ...(type==='info'?{targetSection:'description'}:{})
});
export function makeBlankCollection(){
 return {id:'field_'+uid(),label:'Repeating section',type:'collection',span:3,
  entryLabel:'Entry',titleField:'name',groupLabel:'Category',groups:[],
  sections:[{id:'details',label:'Details'}],
  fields:[
   {id:'name',label:'Name',type:'text',section:'main',width:6},
   {id:'notes',label:'Notes',type:'textarea',section:'details',width:12}
  ]};
}
export function makeSpellbookField(){
 return {
  id:'field_'+uid(),label:'Spellbook',type:'collection',span:3,
  entryLabel:'Spell',titleField:'spell_name',groupLabel:'Spell level',
  groups:['Cantrips',...Array.from({length:9},(_,i)=>'Level '+(i+1))],
  sections:[
   {id:'description',label:'Description'},{id:'attack',label:'Attack'},
   {id:'save',label:'Save'},{id:'healing',label:'Healing'},
   {id:'damage',label:'Damage'},{id:'effects',label:'Effects'}
  ],
  fields:[
   {id:'spell_name',label:'Spell name',type:'text',section:'main',width:4},
   {id:'school',label:'School',type:'select',options:'Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation',section:'main',width:2},
   {id:'casting_time',label:'Cast time',type:'text',section:'main',width:2},
   {id:'concentration',label:'Concentration',type:'checkbox',section:'main',width:2},
   {id:'ritual',label:'Ritual',type:'checkbox',section:'main',width:2},
   {id:'target',label:'Target / Area of effect',type:'text',section:'main',width:4},
   {id:'range',label:'Range',type:'text',section:'main',width:2},
   {id:'duration',label:'Duration',type:'text',section:'main',width:2},
   {id:'components',label:'Components',type:'text',section:'main',width:2},
   {id:'prepared',label:'Prepared',type:'checkbox',section:'main',width:2},
   {id:'spell_info',label:'Spell Info',type:'info',targetSection:'description',section:'main',width:3},
   {id:'cast_spell',label:'Cast Spell',type:'roll',formula:'1d20+@{attack_bonus}',section:'main',width:3},
   {id:'description',label:'Description / flavour',type:'textarea',section:'description',width:6},
   {id:'higher_levels',label:'Higher spell-slot effect',type:'textarea',section:'description',width:6},
   {id:'attack_bonus',label:'Attack bonus',type:'number',section:'attack',width:3},
   {id:'spell_attack',label:'Attack roll',type:'roll',formula:'1d20+@{attack_bonus}',section:'attack',width:3},
   {id:'saving_stat',label:'Saving stat',type:'select',options:'STR, DEX, CON, INT, WIS, CHA',section:'save',width:3},
   {id:'save_dc',label:'Save DC',type:'number',section:'save',width:3},
   {id:'successful_save',label:'On successful save',type:'text',section:'save',width:6},
   {id:'healing_amount',label:'Healing dice',type:'text',section:'healing',width:6},
   {id:'heal_roll',label:'Roll healing',type:'roll',formula:'1d8',section:'healing',width:3},
   {id:'damage_dice',label:'Damage dice',type:'text',section:'damage',width:6},
   {id:'damage_roll',label:'Roll damage',type:'roll',formula:'2d6',section:'damage',width:3},
   {id:'effects',label:'Other effects',type:'textarea',section:'effects',width:12}
  ]
 };
}
function numericValue(raw){
 if(raw&&typeof raw==='object'&&!Array.isArray(raw))raw=raw.current;
 const value=String(raw??'').trim();
 return /^-?\d+(\.\d+)?$/.test(value)?value:'0';
}
function resolveExpression(formula,row,sheet){
 return String(formula||'1d20').replace(/@\{([A-Za-z0-9_.-]+)\}/g,(_,key)=>{
  const fromRow=key.startsWith('row.')?key.slice(4):key;
  if(Object.prototype.hasOwnProperty.call(row,fromRow))return numericValue(row[fromRow]);
  return numericValue(sheet?.[key]);
 });
}
function defaultFor(type){
 if(type==='checkbox')return false;
 if(type==='number')return '';
 return '';
}
function fieldControl(field,value,onValue,onRoll,onInfo,readOnly=false){
 const type=field.type;
 if(type==='static')return <span className="collection-static">{field.text||field.label}</span>;
 if(type==='roll')return <button type="button" className="secondary collection-action"
  disabled={readOnly} onClick={()=>onRoll(field)}
  title={field.formula||'1d20'}>🎲 {field.label||'Roll'}</button>;
 if(type==='info')return <button type="button" className="secondary collection-action"
  onClick={()=>onInfo(field.targetSection)}>▤ {field.label||'Information'}</button>;
 if(type==='checkbox')return <label className="collection-checkbox">
  <input type="checkbox" checked={!!value} disabled={readOnly} onChange={e=>onValue(e.target.checked)}/>
  <span>{field.label}</span>
 </label>;
 if(type==='textarea')return <label className="collection-field-label">
  <span>{field.label}</span>
  <textarea rows={3} disabled={readOnly} value={value??''}
    onChange={e=>onValue(e.target.value)}/>
 </label>;
 if(type==='select')return <label className="collection-field-label">
  <span>{field.label}</span>
  <select disabled={readOnly} value={String(value??'')} onChange={e=>onValue(e.target.value)}>
   <option value="">Choose…</option>
   {asOptions(field.options).map(option=><option key={option} value={option}>{option}</option>)}
  </select>
 </label>;
 return <label className="collection-field-label">
  <span>{field.label}</span>
  <input type={type==='number'?'number':'text'} disabled={readOnly}
   value={value??''} onChange={e=>onValue(e.target.value)}/>
 </label>;
}

/**
 * A configurable, repeatable collection of nested sheet controls. Entry data
 * lives inside one ordinary field_values key, so existing campaign data persists.
 */
export function RepeatingCollection({field,value,onChange,onRoll,sheetValues,readOnly=false}){
 const entries=Array.isArray(value)?value:[];
 const groups=validGroups(field),sections=validSections(field);
 const [group,setGroup]=useState(groups[0]||'all');
 const [expanded,setExpanded]=useState({});
 const [visibleSections,setVisibleSections]=useState({});
 useEffect(()=>{setGroup(groups[0]||'all')},[field.id]);
 const selected=groups.includes(group)?group:'all';
 const filtered=entries.filter(entry=>selected==='all'||(entry.group||groups[0])===selected);
 const fields=validFields(field);
 const summary=fields.filter(f=>sectionFor(f)==='main');
 function updateEntry(id,patch){
  onChange(entries.map(row=>row.id===id?{...row,...patch}:row));
 }
 function updateCell(row,child,val){
  updateEntry(row.id,{values:{...(row.values||{}),[child.id]:val}});
 }
 function addEntry(){
  const id=newId(),defaults=Object.fromEntries(fields.map(f=>[f.id,defaultFor(f.type)]));
  const entry={id,group:selected==='all'?(groups[0]||'') : selected,values:defaults};
  onChange([...entries,entry]);
  setExpanded(old=>({...old,[id]:true}));
 }
 function removeEntry(id){
  if(!confirm('Delete this '+(field.entryLabel||'entry')+'? This removes its saved values.'))return;
  onChange(entries.filter(row=>row.id!==id));
 }
 function duplicateEntry(row){
  const index=entries.indexOf(row),copy={...row,id:newId(),values:{...(row.values||{})}};
  const next=[...entries];next.splice(index+1,0,copy);onChange(next);
  setExpanded(old=>({...old,[copy.id]:true}));
 }
 function moveEntry(row,direction){
  const from=entries.indexOf(row),to=from+direction;if(from<0||to<0||to>=entries.length)return;
  const next=[...entries];[next[from],next[to]]=[next[to],next[from]];onChange(next);
 }
 function toggleSection(row,sectionId){
  setExpanded(old=>({...old,[row.id]:true}));
  setVisibleSections(old=>{
   const mine=new Set(old[row.id]||[]);
   if(mine.has(sectionId))mine.delete(sectionId);else mine.add(sectionId);
   return {...old,[row.id]:[...mine]};
  });
 }
 function doRoll(child,row){
  if(!onRoll)return;
  const formula=resolveExpression(child.formula,row.values||{},sheetValues);
  onRoll(formula,(row.values?.[field.titleField]||field.entryLabel||field.label)+' — '+(child.label||'Roll'));
 }
 const hasContent=entries.length>0;
 return <div className="collection">
  <div className="collection-toolbar">
  {groups.length>0&&<div className="collection-group-tabs" role="group" aria-label={(field.label||'Collection')+' groups'}>
   {groups.map(label=><button key={label} type="button"
    className={selected===label?'selected':''}
    onClick={()=>setGroup(label)}>
    {label}<small>{entries.filter(e=>(e.group||groups[0])===label).length}</small>
   </button>)}
   <button type="button" className={selected==='all'?'selected':''}
    onClick={()=>setGroup('all')}>Show All</button>
  </div>}
  <div className="collection-heading">
   <span className="muted small">{entries.length} {field.entryLabel||'entry'}{entries.length===1?'':'s'}</span>
   {!readOnly&&<button type="button" className="secondary" onClick={addEntry}>+ Add {field.entryLabel||'entry'}</button>}
  </div>
  </div>
  {!hasContent&&<div className="collection-empty">
   No {String(field.entryLabel||'entries').toLowerCase()} yet. Use <strong>+ Add {field.entryLabel||'entry'}</strong> to create one.
  </div>}
  {hasContent&&filtered.length===0&&<p className="muted small">No entries in this group.</p>}
  {filtered.map((entry)=>{
   const opened=!!expanded[entry.id],active=new Set(visibleSections[entry.id]||[]);
   return <article className="collection-entry" key={entry.id}>
    <div className="collection-entry-heading">
     <button type="button" className="collection-entry-title"
      onClick={()=>setExpanded(old=>({...old,[entry.id]:!opened}))}
      aria-expanded={opened}>
      <span>{opened?'▾':'▸'} {entry.values?.[field.titleField]||'Untitled '+(field.entryLabel||'entry')}</span>
      {!opened&&<small className="muted">{entry.group||''}</small>}
     </button>
     {groups.length>0&&opened&&<label className="collection-group-select">
      <span>{field.groupLabel||'Group'}</span>
      <select value={entry.group||groups[0]} disabled={readOnly}
       onChange={e=>updateEntry(entry.id,{group:e.target.value})}>
       {groups.map(g=><option value={g} key={g}>{g}</option>)}
      </select>
     </label>}
     {!readOnly&&<div className="collection-entry-actions">
      <button type="button" title="Move up" onClick={()=>moveEntry(entry,-1)} disabled={entries.indexOf(entry)===0}>↑</button>
      <button type="button" title="Move down" onClick={()=>moveEntry(entry,1)} disabled={entries.indexOf(entry)===entries.length-1}>↓</button>
      <button type="button" title="Duplicate entry" onClick={()=>duplicateEntry(entry)}>⧉</button>
      <button type="button" title="Delete entry" onClick={()=>removeEntry(entry.id)}>×</button>
     </div>}
    </div>
    {opened&&<div className="collection-field-grid">
     {summary.map(child=><div className="collection-cell" key={child.id}
      style={{'--collection-span':safeColumns(child.width)}}>
      {fieldControl(child,entry.values?.[child.id],val=>updateCell(entry,child,val),
       ()=>doRoll(child,entry),section=>toggleSection(entry,section),readOnly)}
     </div>)}
    </div>}
    {opened&&sections.length>0&&<div className="collection-section-tabs" aria-label="Entry detail panels">
     {sections.map(section=><button type="button" key={section.id}
      className={active.has(section.id)?'selected':''}
      onClick={()=>toggleSection(entry,section.id)}>
      {section.label}
     </button>)}
    </div>}
    {opened&&sections.filter(section=>active.has(section.id)).map(section=>
     <section className="collection-detail-section" key={section.id}>
      <h4>{section.label}</h4>
      <div className="collection-field-grid">
       {fields.filter(child=>sectionFor(child)===section.id).map(child=>
        <div className="collection-cell" key={child.id}
         style={{'--collection-span':safeColumns(child.width)}}>
         {fieldControl(child,entry.values?.[child.id],val=>updateCell(entry,child,val),
          ()=>doRoll(child,entry),id=>toggleSection(entry,id),readOnly)}
        </div>)}
      </div>
     </section>)}
   </article>;
  })}
 </div>;
}

export function CollectionDesigner({field,onChange}){
 const childFields=validFields(field),groups=validGroups(field),sections=validSections(field);
 const [groupText,setGroupText]=useState(groups.join(', '));
 const [addType,setAddType]=useState('text');
 useEffect(()=>setGroupText(validGroups(field).join(', ')),[field.id]);
 function update(patch){onChange({...field,...patch})}
 function updateChild(id,patch){update({fields:childFields.map(f=>f.id===id?{...f,...patch}:f)})}
 function moveChild(index,dir){
  const to=index+dir;if(to<0||to>=childFields.length)return;
  const next=[...childFields];[next[index],next[to]]=[next[to],next[index]];
  update({fields:next});
 }
 function removeChild(id){
  if(field.titleField===id)update({titleField:''});
  update({fields:childFields.filter(f=>f.id!==id),titleField:field.titleField===id?'':field.titleField});
 }
 function addSection(){
  if(sections.length>=12)return;
  update({sections:[...sections,{id:'sec_'+uid(),label:'New section'}]});
 }
 function removeSection(id){
  update({sections:sections.filter(s=>s.id!==id),
   fields:childFields.map(f=>f.section===id?{...f,section:'main'}:f)});
 }
 function saveGroups(){
  const next=[...new Set(asList(groupText))].slice(0,16);
  update({groups:next});
 }
 return <div className="collection-designer" onMouseDown={e=>e.stopPropagation()}>
  <div className="collection-builder-intro">
   <strong>Repeating collection layout</strong>
   <p className="muted small">Build a spellbook, inventory, journal, ability list or any repeating set of controls. Each character keeps their own entries.</p>
  </div>
  <div className="collection-builder-settings">
   <label>One entry is called<input value={field.entryLabel||''} placeholder="Spell"
    onChange={e=>update({entryLabel:e.target.value})}/></label>
   <label>Entry title field<select value={field.titleField||''}
    onChange={e=>update({titleField:e.target.value})}>
    <option value="">Untitled entry</option>
    {childFields.filter(f=>['text','select'].includes(f.type)).map(f=>
     <option value={f.id} key={f.id}>{f.label}</option>)}
   </select></label>
   <label>Category label<input value={field.groupLabel||''} placeholder="Spell level"
    onChange={e=>update({groupLabel:e.target.value})}/></label>
   <label className="collection-long-label">Category tabs (comma separated)
    <textarea rows={2} value={groupText} placeholder="Cantrips, Level 1, Level 2"
     onChange={e=>setGroupText(e.target.value)} onBlur={saveGroups}/>
    <small className="muted">Leave empty for an ungrouped list. Categories become filter tabs.</small>
   </label>
  </div>
  <div className="collection-builder-heading"><strong>Detail panels</strong>
   <button type="button" className="secondary" disabled={sections.length>=12} onClick={addSection}>+ Panel</button>
  </div>
  <div className="collection-builder-sections">
   {sections.length===0&&<p className="muted tiny">Optional collapsible panels appear within each entry.</p>}
   {sections.map(sec=><div className="collection-builder-section" key={sec.id}>
    <input aria-label="Panel name" value={sec.label}
     onChange={e=>update({sections:sections.map(s=>s.id===sec.id?{...s,label:e.target.value}:s)})}/>
    <button type="button" className="secondary" title="Delete panel" onClick={()=>removeSection(sec.id)}>×</button>
   </div>)}
  </div>
  <div className="collection-builder-heading">
   <strong>Fields inside each {field.entryLabel||'entry'}</strong>
   <div className="collection-add-controls">
    <select aria-label="New collection field type" value={addType} onChange={e=>setAddType(e.target.value)}>
     {fieldTypes.map(([value,label])=><option value={value} key={value}>{label}</option>)}
    </select>
    <button type="button" disabled={childFields.length>=50} onClick={()=>
     update({fields:[...childFields,newChild(addType)]})}>+ Field</button>
   </div>
  </div>
  <p className="muted tiny">Position fields with a 12-column layout. Assign them to Always visible or a collapsible panel. Use the arrows to reorder them.</p>
  <div className="collection-builder-list">
   {childFields.map((child,index)=><div className="collection-builder-field" key={child.id}>
    <div className="collection-builder-row">
     <strong>{index+1}. {child.label||'Unnamed'}</strong>
     <div className="collection-builder-row-actions">
      <button type="button" className="secondary" disabled={index===0} onClick={()=>moveChild(index,-1)}>↑</button>
      <button type="button" className="secondary" disabled={index===childFields.length-1} onClick={()=>moveChild(index,1)}>↓</button>
      <button type="button" className="secondary" onClick={()=>removeChild(child.id)}>×</button>
     </div>
    </div>
    <div className="collection-builder-fields">
     <label>Label<input value={child.label||''} onChange={e=>updateChild(child.id,{label:e.target.value})}/></label>
     <label>Type<select value={child.type||'text'} onChange={e=>updateChild(child.id,{type:e.target.value})}>
      {fieldTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select></label>
     <label>Area<select value={sectionFor(child)}
      onChange={e=>updateChild(child.id,{section:e.target.value})}>
      <option value="main">Always visible</option>
      {sections.map(sec=><option value={sec.id} key={sec.id}>{sec.label}</option>)}
     </select></label>
     <label>Width (of 12)<select value={safeColumns(child.width)} onChange={e=>updateChild(child.id,{width:Number(e.target.value)})}>
      {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} / 12</option>)}
     </select></label>
     {child.type==='select'&&<label className="collection-builder-wide">Dropdown choices (comma separated)
      <input value={child.options||''} onChange={e=>updateChild(child.id,{options:e.target.value})}
       placeholder="Always, Prepared, Known"/></label>}
     {child.type==='roll'&&<label className="collection-builder-wide">Dice formula
      <input value={child.formula||''} onChange={e=>updateChild(child.id,{formula:e.target.value})}
       placeholder="1d20+@{attack_bonus}"/></label>}
     {child.type==='info'&&<label className="collection-builder-wide">Open or close panel
      <select value={child.targetSection||''} onChange={e=>updateChild(child.id,{targetSection:e.target.value})}>
       <option value="">Choose panel</option>
       {sections.map(sec=><option key={sec.id} value={sec.id}>{sec.label}</option>)}
      </select></label>}
     {child.type==='static'&&<label className="collection-builder-wide">Instruction text
      <textarea rows={2} value={child.text||''} onChange={e=>updateChild(child.id,{text:e.target.value})}/></label>}
    </div>
   </div>)}
  </div>
  <div className="collection-layout-preview">
   <strong>Layout preview</strong>
   {groups.length>0&&<div className="collection-preview-groups">{groups.slice(0,10).map(g=>
    <span key={g}>{g}</span>)}<span>Show All</span></div>}
   <div className="collection-field-grid collection-demo-grid">
    {childFields.filter(f=>sectionFor(f)==='main').map(f=><div key={f.id}
     className="collection-demo-cell" style={{'--collection-span':safeColumns(f.width)}}>
     {f.label||'Unnamed field'} <small>{f.type}</small>
    </div>)}
   </div>
   {sections.map(sec=><div className="collection-preview-panel" key={sec.id}>
    <strong>{sec.label}</strong>
    <span className="muted tiny">{childFields.filter(f=>sectionFor(f)===sec.id).map(f=>f.label).join(' · ')||'Empty'}</span>
   </div>)}
  </div>
 </div>;
}
