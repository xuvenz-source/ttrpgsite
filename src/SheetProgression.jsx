import {rollDragProps} from './HotbarRollActions.js';
import React from 'react';
import {uid,num,safeList,numberFields} from './SheetMath.js';
import {makeProgressionField,makeProficienciesField,derivedProgression,
 derivedProficiencies,numericFieldsWithDerived} from './SheetDerived.js';

const scoreModes=[{id:'score',label:'Attribute score (convert to modifier)'},
 {id:'modifier',label:'Numeric modifier (use directly)'}];
const rankOptions=[{value:0,label:'None'},{value:0.5,label:'Half'},
 {value:1,label:'Proficient'},{value:2,label:'Expert'}];
const safeInt=(n,max=100)=>Math.max(0,Math.min(max,Math.floor(num(n,0))));
function AttributeSelect({label,fields,value,onChange}){
 return <label>{label}<select value={value||''} onChange={e=>onChange(e.target.value)}>
  <option value="">No attribute linked</option>
  {fields.map(f=><option key={f.id} value={f.id}>{f.label} ({f.id})</option>)}
 </select></label>;
}
export function ProgressionDesigner({field,template,onChange}){
 const update=patch=>onChange({...field,...patch});
 const classes=safeList(field.classes,24),tiers=safeList(field.proficiencyTiers,30);
 const attrs=numberFields(template);
 const changeClass=(id,patch)=>update({classes:classes.map(c=>c.id===id?{...c,...patch}:c)});
 return <div className="sheet-module-designer">
  <p className="muted small">Name each class, profession or advancement path. Players set
   their levels; total level, proficiency and casting DCs are calculated automatically.</p>
  <div className="sheet-module-editor-bar"><strong>Paths / class levels</strong>
   <button type="button" className="secondary" disabled={classes.length>=24}
    onClick={()=>update({classes:[...classes,{
     id:uid('class_'),label:'New class',castingField:'',castingMode:'score'
    }]})}>+ Path</button>
  </div>
  <div className="progression-class-designer">
   {classes.map(c=><div className="progression-class-design-row" key={c.id}>
    <label>Name<input value={c.label||''} maxLength={40}
     onChange={e=>changeClass(c.id,{label:e.target.value})}/></label>
    <AttributeSelect label="Casting attribute" fields={attrs}
     value={c.castingField} onChange={castingField=>changeClass(c.id,{castingField})}/>
    <label>Attribute representation
     <select value={c.castingMode||'score'} onChange={e=>changeClass(c.id,{castingMode:e.target.value})}>
      {scoreModes.map(mode=><option key={mode.id} value={mode.id}>{mode.label}</option>)}
     </select>
    </label>
    <button type="button" className="secondary" title={'Remove '+c.label}
     onClick={()=>update({classes:classes.filter(x=>x.id!==c.id)})}>×</button>
   </div>)}
  </div>
  <details><summary>Proficiency bonus by total level</summary>
   <p className="muted tiny">The bonus uses the last matching level threshold. Add or remove
    milestones to fit your system; example values are only a starting preset.</p>
   <div className="sheet-module-editor-bar"><strong>Milestones</strong>
    <button type="button" className="secondary" disabled={tiers.length>=30}
     onClick={()=>update({proficiencyTiers:[...tiers,{
      id:uid('tier_'),level:Math.max(1,tiers.length*4+1),bonus:0
     }]})}>+ Threshold</button>
   </div>
   <div className="progression-milestones">{tiers.map(t=>
    <div className="progression-milestone" key={t.id}>
     <label>From total level<input type="number" min="1" max="1000"
      value={t.level??1} onChange={e=>update({proficiencyTiers:tiers.map(x=>
       x.id===t.id?{...x,level:Math.max(1,safeInt(e.target.value,1000))}:x)})}/></label>
     <label>Proficiency bonus<input type="number" min="0" max="100"
      value={t.bonus??0} onChange={e=>update({proficiencyTiers:tiers.map(x=>
       x.id===t.id?{...x,bonus:safeInt(e.target.value,100)}:x)})}/></label>
     <button type="button" className="secondary" aria-label="Remove threshold"
      onClick={()=>update({proficiencyTiers:tiers.filter(x=>x.id!==t.id)})}>×</button>
    </div>)}</div>
  </details>
  <details><summary>Saving DCs, attribute maths and roll references</summary>
   <div className="sheet-module-editor-settings">
    <label>Spell save DC base<input type="number" value={field.dcBase??8}
     onChange={e=>update({dcBase:num(e.target.value,8)})}/></label>
    <label>Attribute score baseline<input type="number" value={field.scoreBase??10}
     onChange={e=>update({scoreBase:num(e.target.value,10)})}/></label>
    <label>Points per modifier<input type="number" min="1" max="100"
     value={field.scoreStep??2}
     onChange={e=>update({scoreStep:Math.max(1,safeInt(e.target.value,100))})}/></label>
    <label>Level label<input value={field.levelLabel||'Total level'}
     onChange={e=>update({levelLabel:e.target.value})}/></label>
    {[
     ['outputLevel','Level reference','level'],
     ['outputProficiency','Proficiency reference','proficiency_bonus'],
     ['outputSaveDC','Active save DC reference','spell_save_dc'],
     ['outputSpellAttack','Active spell attack reference','spell_attack_bonus']
    ].map(([key,label,defaultId])=><label key={key}>{label}
     <input maxLength={80} value={field[key]??defaultId}
      onChange={e=>update({[key]:e.target.value})}/></label>)}
   </div>
   <p className="muted tiny">Example: DC = configured base + proficiency bonus + linked
    casting modifier. Score mode calculates floor((score − baseline) / points per modifier).
    Choose an active casting path on the character sheet. Calculated references
    are saved alongside other sheet values so macros and rolls can use them.</p>
  </details>
 </div>;
}
export function ProgressionPanel({field,value,onChange,sheetValues={}}){
 const data=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const levels=data.levels&&typeof data.levels==='object'?data.levels:{};
 const classes=safeList(field.classes,24);
 const derived=derivedProgression(field,data,sheetValues);
 const change=(patch)=>onChange({...data,...patch});
 return <div className="progression-panel">
  <div className="progression-totals">
   <div><span>{field.levelLabel||'Total level'}</span><strong>{derived.total}</strong></div>
   <div><span>Proficiency</span><strong>{derived.proficiency>=0?'+':''}{derived.proficiency}</strong></div>
   <div><span>Active spell DC</span><strong>{derived.outputs[field.outputSaveDC||'spell_save_dc']??'—'}</strong></div>
   <div><span>Spell attack</span><strong>{derived.outputs[field.outputSpellAttack||'spell_attack_bonus']??'—'}</strong></div>
  </div>
  {classes.length===0?<p className="muted small">The DM has not defined any advancement paths yet.</p>:
   <div className="progression-class-grid">
    {classes.map(c=><label key={c.id} className="progression-class-level">
     <span>{c.label}</span>
     <input type="number" min="0" max="100" aria-label={c.label+' level'}
      value={levels[c.id]??0} onChange={e=>change({
       levels:{...levels,[c.id]:safeInt(e.target.value,100)}
      })}/>
    </label>)}
   </div>}
  {classes.some(c=>c.castingField)&&<div className="progression-casting">
   <label>Active casting path
    <select value={derived.selectedId} onChange={e=>change({castingSource:e.target.value})}>
     {classes.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}
    </select>
   </label>
   <div className="progression-casting-stats">
    {classes.filter(c=>c.castingField).map(c=>
     <span key={c.id} title={'Casting attribute: '+c.castingField}>
      <b>{c.label}</b> · mod {derived.perClass[c.id]?.modifier>=0?'+':''}
      {derived.perClass[c.id]?.modifier} · DC {derived.perClass[c.id]?.saveDC}
     </span>)}
   </div>
  </div>}
  <p className="muted tiny">Change class levels or linked attributes to update bonuses and
   spell DCs. These results can be used in other fields and roll macros.</p>
 </div>;
}
export function ProficienciesDesigner({field,template,onChange}){
 const attrs=numberFields(template),entries=safeList(field.entries,80);
 const progressions=safeList(template?.tabs).flatMap(t=>safeList(t.fields))
  .filter(f=>f.type==='progression');
 const selectedProgression=progressions.find(f=>f.id===field.progressionField)||progressions[0];
 const paths=safeList(selectedProgression?.classes,24);
 const update=patch=>onChange({...field,...patch});
 const edit=(id,patch)=>update({entries:entries.map(e=>e.id===id?{...e,...patch}:e)});
 return <div className="sheet-module-designer">
  <p className="muted small">DM-defined skills, saves, tools and other proficiencies.
   Players select their proficiency level; bonuses follow their configured level
   and attribute automatically.</p>
  <label>Advancement module
   <select value={field.progressionField||''}
    onChange={e=>update({progressionField:e.target.value})}>
    <option value="">Use first available progression module</option>
    {progressions.map(f=><option value={f.id} key={f.id}>{f.label}</option>)}
   </select>
  </label>
  <div className="sheet-module-editor-bar"><strong>Proficiency entries</strong>
   <button type="button" className="secondary" disabled={entries.length>=80}
    onClick={()=>update({entries:[...entries,{
     id:uid('skill_'),label:'New proficiency',group:'Skills',
     abilityField:'',abilityMode:'score'
    }]})}>+ Entry</button>
  </div>
  <div className="proficiency-designer-list">
   {entries.map(e=><div className="proficiency-designer-row" key={e.id}>
    <label>Label<input value={e.label||''} maxLength={45}
     onChange={ev=>edit(e.id,{label:ev.target.value})}/></label>
    <label>Group<input value={e.group||''} maxLength={36}
     onChange={ev=>edit(e.id,{group:ev.target.value})}/></label>
    <AttributeSelect label="Attribute" fields={attrs} value={e.abilityField}
     onChange={abilityField=>edit(e.id,{abilityField})}/>
    <label>Value type<select value={e.abilityMode||'score'}
     onChange={ev=>edit(e.id,{abilityMode:ev.target.value})}>
     {scoreModes.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
    </select></label>
    <button type="button" className="secondary" title={'Remove '+e.label}
     onClick={()=>update({entries:entries.filter(x=>x.id!==e.id)})}>×</button>
    {paths.length>0&&<div className="proficiency-auto-paths">
     <small>Automatically proficient when trained in:</small>
     {paths.map(path=><label key={path.id} className="sheet-module-inline-check">
      <input type="checkbox" checked={safeList(e.autoPaths,24).includes(path.id)}
       onChange={event=>{
        const current=safeList(e.autoPaths,24);
        edit(e.id,{autoPaths:event.target.checked?
         [...new Set([...current,path.id])]:current.filter(id=>id!==path.id)});
       }}/>
      {path.label}
     </label>)}
    </div>}
   </div>)}
  </div>
  <p className="muted tiny">Players may select None, Half, Proficient or Expert per
   entry. Bonuses are calculated from the selected casting/ability modifier and
   the DM's level-based proficiency table. Every entry has a dice-roll button.</p>
 </div>;
}
export function ProficienciesPanel({field,value,onChange,sheetValues={},template,onRoll,rollSource=null}){
 const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const ranks=v.ranks&&typeof v.ranks==='object'?v.ranks:{};
 const result=derivedProficiencies(field,v,sheetValues,template);
 const grouped=Object.groupBy?
  Object.groupBy(result.entries,e=>e.group||'Other'):
  result.entries.reduce((out,e)=>{(out[e.group||'Other']??=[]).push(e);return out},Object.create(null));
 function editRank(id,rank){onChange({...v,ranks:{...ranks,[id]:rank}})}
 return <div className="proficiencies-panel">
  <div className="proficiencies-heading">
   <strong>Proficiency bonus {result.proficiency>=0?'+':''}{result.proficiency}</strong>
   <small className="muted">Rolls use the current calculated bonus</small>
  </div>
  {Object.entries(grouped).map(([group,items])=><div className="proficiencies-group" key={group}>
   <div className="proficiencies-group-label">{group}</div>
   {items.map(e=><div className="proficiency-entry" key={e.id}>
    <span className="proficiency-name">{e.label}</span>
    <select aria-label={e.label+' proficiency rank'} value={e.selectedRank}
     onChange={event=>editRank(e.id,Number(event.target.value))}>
     {rankOptions.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
    <output title={'Attribute '+e.attribute+' + proficiency '+result.proficiency+' × '+e.rank+
     (e.autoRank?' (automatically proficient from class level)':'')}>
     {e.bonus>=0?'+':''}{e.bonus}{e.autoRank?'*':''}</output>
    <button type="button" className="secondary" disabled={!onRoll}
     {...rollDragProps(rollSource?{kind:'proficiency',...rollSource,
      fieldId:field.id,entryId:e.id,label:e.label+' check'}:null,!onRoll)}
     onClick={()=>onRoll('1d20'+(e.bonus>=0?'+':'')+e.bonus,e.label+' check')}>🎲</button>
   </div>)}
  </div>)}
  {result.entries.some(e=>e.autoRank>0)&&<small className="muted">
   * Automatically granted by a class or advancement path.
  </small>}
 </div>;
}
