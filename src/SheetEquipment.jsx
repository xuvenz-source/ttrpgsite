import React from 'react';
import {uid,num,safeList,clampNumber,numberFields} from './SheetMath.js';
import {numericFieldsWithDerived,abilityModifier} from './SheetDerived.js';
import {optionLists,optionListById,listItems} from './TemplateOptionLists.jsx';

const DEFAULT_CATEGORIES=[
 {id:'light',label:'Light',role:'base',bonus:'full',cap:0},
 {id:'medium',label:'Medium',role:'base',bonus:'cap',cap:2},
 {id:'heavy',label:'Heavy',role:'base',bonus:'none',cap:0},
 {id:'shield',label:'Shield',role:'add',bonus:'none',cap:0},
 {id:'other',label:'Other bonus',role:'add',bonus:'none',cap:0}
];
export function makeEquipmentField(){
 return {id:uid('equipment_'),label:'Equipment & defence',type:'equipment',span:3,
  categories:structuredClone(DEFAULT_CATEGORIES),
  armorModifierField:'',unarmoredBase:10,unarmoredRule:'full',unarmoredCap:0,
  proficiencyField:'',defaultAttackField:'',weaponModifierListId:'',
  armorModifierMode:'score',defaultAttackMode:'score',
  scoreBase:10,scoreStep:2,
  allowWeapons:true,allowArmor:true};
}
export function makeEquipmentTab(){
 return {id:uid('equiptab_'),name:'Equipment',fields:[makeEquipmentField()]};
}
const bonusModes=[
 {id:'full',label:'Full linked modifier'},
 {id:'cap',label:'Limited positive modifier'},
 {id:'none',label:'No linked modifier'}
];
const valueObject=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
export function EquipmentDesigner({field,template,onChange}){
 const attrs=numericFieldsWithDerived(template),categories=safeList(field.categories,16);
 const lists=optionLists(template);
 const update=patch=>onChange({...field,...patch});
 const selectAttr=(name,label)=><label>{label}
  <select value={field[name]||''} onChange={e=>update({[name]:e.target.value})}>
   <option value="">None (0 bonus)</option>
   {attrs.map(f=><option key={f.id} value={f.id}>{f.label} ({f.id})</option>)}
  </select>
 </label>;
 return <div className="sheet-module-designer">
  <p className="muted small">Configure defence maths for your campaign, without assuming
   rules from any particular game system. Link numeric sheet fields to attribute
   and proficiency bonuses, then define your own armour categories.</p>
  <div className="sheet-module-switches">
   {[['allowArmor','Defence & armour'],['allowWeapons','Weapons']].map(([key,label])=>
    <label className="sheet-module-inline-check" key={key}>
     <input type="checkbox" checked={field[key]!==false}
      onChange={e=>update({[key]:e.target.checked})}/>{label}
    </label>)}
  </div>
  <div className="sheet-module-editor-settings">
   {selectAttr('armorModifierField','Armour modifier field')}
   {selectAttr('proficiencyField','Proficiency modifier for attacks')}
   {selectAttr('defaultAttackField','Default attack modifier field')}
   <label>Armour attribute input
    <select value={field.armorModifierMode||'modifier'}
     onChange={e=>update({armorModifierMode:e.target.value})}>
     <option value="score">Attribute score (calculate modifier)</option>
     <option value="modifier">Numeric modifier (already calculated)</option>
    </select></label>
   <label>Default weapon attribute input
    <select value={field.defaultAttackMode||'modifier'}
     onChange={e=>update({defaultAttackMode:e.target.value})}>
     <option value="score">Attribute score (calculate modifier)</option>
     <option value="modifier">Numeric modifier (already calculated)</option>
    </select></label>
   <label>Attribute score baseline
    <input type="number" value={field.scoreBase??10}
     onChange={e=>update({scoreBase:num(e.target.value,10)})}/></label>
   <label>Score points per modifier
    <input type="number" min="1" max="100" value={field.scoreStep??2}
     onChange={e=>update({scoreStep:Math.max(1,clampNumber(e.target.value,1,100))})}/></label>
   <label>Unarmoured base score<input type="number" value={field.unarmoredBase??10}
    onChange={e=>update({unarmoredBase:num(e.target.value)})}/></label>
   <label>Unarmoured attribute rule<select value={field.unarmoredRule||'full'}
    onChange={e=>update({unarmoredRule:e.target.value})}>
    {bonusModes.map(mode=><option key={mode.id} value={mode.id}>{mode.label}</option>)}
   </select></label>
   {field.unarmoredRule==='cap'&&<label>Unarmoured positive cap
    <input type="number" value={field.unarmoredCap??0} min="0" max="100"
     onChange={e=>update({unarmoredCap:clampNumber(e.target.value,0,100)})}/></label>}
  </div>
  <div className="equipment-list-setting">
   <label>Weapon modifier dropdown list
    <select value={field.weaponModifierListId||''}
     onChange={e=>update({weaponModifierListId:e.target.value})}>
     <option value="">All numeric fields (legacy selector)</option>
     {lists.map(list=><option key={list.id} value={list.id}>{list.name}</option>)}
    </select>
   </label>
   <p className="muted tiny">Create reusable lists in the Sheet Designer, then choose one
    here. Players will see only the modifier options you define.</p>
  </div>
  <div className="sheet-module-editor-bar"><strong>Armour / equipment categories</strong>
   <button type="button" className="secondary" disabled={categories.length>=16}
    onClick={()=>update({categories:[...categories,{
     id:uid('armor_'),label:'Custom type',role:'add',bonus:'none',cap:0
    }]})}>+ Category</button>
  </div>
  <div className="sheet-module-editor-rows">
   {categories.map(category=><div className="sheet-module-editor-row" key={category.id}>
    <input aria-label="Armour type name" maxLength={35} value={category.label}
     onChange={e=>update({categories:categories.map(t=>t.id===category.id?
      {...t,label:e.target.value}:t)})}/>
    <select aria-label="Armour contribution" value={category.role||'base'}
     onChange={e=>update({categories:categories.map(t=>t.id===category.id?
      {...t,role:e.target.value}:t)})}>
     <option value="base">Base score (highest worn)</option>
     <option value="add">Additive bonus</option>
    </select>
    <select aria-label="Armour attribute modifier rule" value={category.bonus||'none'}
     onChange={e=>update({categories:categories.map(t=>t.id===category.id?
      {...t,bonus:e.target.value}:t)})}>
     {bonusModes.map(mode=><option key={mode.id} value={mode.id}>{mode.label}</option>)}
    </select>
    {category.bonus==='cap'&&<input type="number" min="0" max="100"
     value={category.cap??0} aria-label="Maximum positive modifier"
     onChange={e=>update({categories:categories.map(t=>t.id===category.id?
      {...t,cap:clampNumber(e.target.value,0,100)}:t)})}/>}
    <button type="button" className="secondary"
     title={'Remove '+category.label}
     onClick={()=>update({categories:categories.filter(t=>t.id!==category.id)})}>×</button>
   </div>)}
  </div>
  <p className="muted tiny">Base-score armour takes the highest equipped base plus the
   configured modifier. Additive items (shields, accessories, effects) stack.
   Limited bonuses cap only positive attributes. All category rules are editable by the DM.</p>
 </div>;
}
function modifier(mode,cap,attribute){
 if(mode==='none')return 0;
 if(mode==='cap')return Math.min(attribute,Math.max(0,num(cap)));
 return attribute;
}
export function calculateArmor(field,value,sheetValues={}){
 const data=valueObject(value),categories=safeList(field.categories,16),
  armorAttribute=field.armorModifierField?
   abilityModifier(sheetValues[field.armorModifierField],
    field.armorModifierMode||'modifier',field.scoreBase,field.scoreStep):0;
 const wearing=safeList(data.armor,100).filter(row=>row.worn!==false);
 const withScores=wearing.map(item=>{
  const rule=categories.find(category=>category.id===item.categoryId)||
   {label:'Unconfigured',role:'add',bonus:'none',cap:0};
  const score=num(item.base)+num(item.magic)+modifier(rule.bonus,rule.cap,armorAttribute);
  return {item,rule,score};
 });
 const bases=withScores.filter(x=>x.rule.role==='base');
 const top=bases.sort((a,b)=>b.score-a.score)[0]||null;
 const base=top?top.score:
  num(field.unarmoredBase,10)+modifier(field.unarmoredRule||'full',
   field.unarmoredCap,armorAttribute);
 const additives=withScores.filter(x=>x.rule.role!=='base');
 const extra=additives.reduce((v,x)=>v+x.score,0);
 const misc=num(data.otherBonus);
 return {total:base+extra+misc,base,extra,misc,top,ignored:bases.filter(x=>x!==top)};
}
const newArmor=field=>({
 id:uid('piece_'),name:'Armour',worn:true,
 categoryId:field.categories?.[0]?.id||'',base:10,magic:0
});
const newWeapon=()=>({
 id:uid('weapon_'),name:'New weapon',kind:'melee',proficient:true,statField:'',
 statMode:'',magic:0,attackBonus:0,damageDice:'1d8',damageBonus:0,useStatForDamage:true,
 damageType:'',critDice:'1d8',critOn:20
});
function Input({value,onChange,type='text',label,...rest}){
 return <input type={type} aria-label={label} value={value??''}
  onChange={e=>onChange(type==='number'?num(e.target.value):e.target.value)} {...rest}/>;
}
export function EquipmentManager({field,value,onChange,sheetValues={},template,onAttack}){
 const [attacking,setAttacking]=React.useState('');
 const [attackError,setAttackError]=React.useState('');
 const [settingsWeaponId,setSettingsWeaponId]=React.useState('');
 const data=valueObject(value),categories=safeList(field.categories,16),
  armor=safeList(data.armor,100),weapons=safeList(data.weapons,100),
  stats=numericFieldsWithDerived(template);
 const modifierList=optionListById(template,field.weaponModifierListId);
 const modifierEntries=listItems(modifierList);
 const settingsWeapon=weapons.find(w=>w.id===settingsWeaponId);
 const def=calculateArmor(field,data,sheetValues);
 const update=(key,rows)=>onChange({...data,[key]:rows});
 const changeItem=(key,id,patch)=>update(key,safeList(data[key],100).map(row=>
  row.id===id?{...row,...patch}:row));
 function chooseModifier(weapon,id){
  const option=modifierEntries.find(item=>item.id===id);
  changeItem('weapons',weapon.id,{
   modifierId:id,statField:option?.statField||'',
   statMode:option?.statField?(option.statMode||'score'):''
  });
 }
 async function rollWeapon(weapon){
  if(attacking||!onAttack)return;
  setAttacking(weapon.id);setAttackError('');
  try{await onAttack({fieldId:field.id,weaponId:weapon.id})}
  catch(error){setAttackError(error?.message||String(error))}
  finally{setAttacking('')}
 }
 return <div className="equipment-manager">
  {field.allowArmor!==false&&<section className="equipment-section">
   <div className="equipment-heading">
    <strong>Defence / Armour</strong>
    <output className="equipment-total" aria-label="Total defence">Total: {def.total}</output>
   </div>
   <p className="muted tiny">Base {def.base} + stacked equipment {def.extra}
    {def.misc?' + other '+def.misc:''} = {def.total}.
    {def.top?' Base from '+def.top.item.name+'.':' Unarmoured rule used.'}
    {def.ignored.length?' Only the highest base armour applies.':''}
   </p>
   <div className="equipment-table-wrap"><table className="equipment-table">
    <thead><tr><th>Worn</th><th>Equipment</th><th>Type</th>
     <th>Base</th><th>Magic</th><th/></tr></thead>
    <tbody>{armor.map(item=><tr key={item.id}>
     <td><input type="checkbox" aria-label={'Worn '+item.name}
      checked={item.worn!==false}
      onChange={e=>changeItem('armor',item.id,{worn:e.target.checked})}/></td>
     <td><Input label="Equipment name" value={item.name}
      onChange={name=>changeItem('armor',item.id,{name})}/></td>
     <td><select value={item.categoryId||''} aria-label="Equipment category"
      onChange={e=>changeItem('armor',item.id,{categoryId:e.target.value})}>
      {categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
     </select></td>
     <td><Input type="number" label="Base score" value={item.base}
      onChange={base=>changeItem('armor',item.id,{base})}/></td>
     <td><Input type="number" label="Magic bonus" value={item.magic}
      onChange={magic=>changeItem('armor',item.id,{magic})}/></td>
     <td><button type="button" className="secondary" aria-label={'Remove '+item.name}
      onClick={()=>update('armor',armor.filter(x=>x.id!==item.id))}>×</button></td>
    </tr>)}</tbody>
   </table></div>
   <div className="equipment-footer">
    <button type="button" className="secondary" disabled={armor.length>=60}
     onClick={()=>update('armor',[...armor,newArmor(field)])}>+ Armour / item</button>
    <label>Miscellaneous bonus<Input type="number" label="Miscellaneous defence"
     value={data.otherBonus??0}
     onChange={otherBonus=>onChange({...data,otherBonus})}/></label>
   </div>
  </section>}
  {field.allowWeapons!==false&&<section className="equipment-section">
   <div className="equipment-heading"><strong>Weapons</strong>
    <button type="button" className="secondary" disabled={weapons.length>=60}
     onClick={()=>update('weapons',[...weapons,newWeapon()])}>+ Weapon</button>
   </div>
   <div className="equipment-table-wrap"><table className="equipment-table equipment-weapon-table">
    <thead><tr><th>Prof</th><th>Weapon</th><th>Modifier</th>
     <th>Damage dice</th><th>Type</th><th>Roll / settings</th></tr></thead>
    <tbody>{weapons.map(w=><tr key={w.id}>
     <td><input type="checkbox" aria-label={'Weapon proficiency: '+w.name}
      checked={!!w.proficient}
      onChange={e=>changeItem('weapons',w.id,{proficient:e.target.checked})}/></td>
     <td><Input label="Weapon name" value={w.name}
      onChange={name=>changeItem('weapons',w.id,{name})}/></td>
     <td>{modifierList?<select aria-label={'Modifier for '+w.name}
      value={w.modifierId||(w.statField?'__existing__':'')}
      onChange={e=>chooseModifier(w,e.target.value)}>
       <option value="">Default modifier</option>
       {!w.modifierId&&w.statField&&<option value="__existing__" disabled>
        Existing: {stats.find(stat=>stat.id===w.statField)?.label||w.statField}
       </option>}
       {modifierEntries.map(option=><option value={option.id} key={option.id}>{option.label}</option>)}
       {w.modifierId&&!modifierEntries.some(item=>item.id===w.modifierId)&&
        <option value={w.modifierId}>Previous selection (unchanged)</option>}
      </select>:<select aria-label={'Modifier for '+w.name}
       value={w.statField||''}
       onChange={e=>changeItem('weapons',w.id,{statField:e.target.value})}>
       <option value="">Default modifier</option>
       {stats.map(stat=><option key={stat.id} value={stat.id}>{stat.label}</option>)}
      </select>}</td>
     <td><Input label="Damage dice" value={w.damageDice}
      onChange={damageDice=>changeItem('weapons',w.id,{damageDice})}/></td>
     <td><Input label="Damage type" value={w.damageType}
      onChange={damageType=>changeItem('weapons',w.id,{damageType})}/></td>
     <td><div className="equipment-weapon-actions">
      <button type="button" className="secondary equipment-attack-button"
       disabled={!!attacking||!onAttack}
       title="Roll two attacks, damage and critical dice in one chat card"
       onClick={()=>rollWeapon(w)}>
       {attacking===w.id?'Rolling…':'🎲 Attack'}
      </button>
      <button type="button" className="secondary equipment-settings-button"
       aria-label={'Settings for '+w.name} title="Attack and damage settings"
       onClick={()=>setSettingsWeaponId(w.id)}>⚙</button>
      <button type="button" className="secondary" aria-label={'Remove '+w.name}
       onClick={()=>{if(settingsWeaponId===w.id)setSettingsWeaponId('');
        update('weapons',weapons.filter(x=>x.id!==w.id))}}>×</button>
     </div></td>
    </tr>)}</tbody>
   </table></div>
   {settingsWeapon&&<div className="equipment-settings-backdrop"
    onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsWeaponId('')}}>
    <section className="equipment-settings-dialog" role="dialog" aria-modal="true"
     aria-label={'Settings for '+settingsWeapon.name}>
     <div className="equipment-settings-heading">
      <strong>{settingsWeapon.name} · Settings</strong>
      <button type="button" className="secondary" onClick={()=>setSettingsWeaponId('')}
       aria-label="Close weapon settings">✕</button>
     </div>
     <p className="muted tiny">Extra attack and damage bonuses are stored with this weapon.</p>
     <div className="equipment-settings-grid">
      <label>Magic bonus
       <Input type="number" label="Magic bonus" value={settingsWeapon.magic}
        onChange={magic=>changeItem('weapons',settingsWeapon.id,{magic})}/>
      </label>
      <label>Additional to hit +
       <Input type="number" label="Additional to hit" value={settingsWeapon.attackBonus}
        onChange={attackBonus=>changeItem('weapons',settingsWeapon.id,{attackBonus})}/>
      </label>
      <label>Additional damage +
       <Input type="number" label="Additional damage" value={settingsWeapon.damageBonus}
        onChange={damageBonus=>changeItem('weapons',settingsWeapon.id,{damageBonus})}/>
      </label>
      <label>Weapon type
       <select value={settingsWeapon.kind||'melee'}
        onChange={e=>changeItem('weapons',settingsWeapon.id,{kind:e.target.value})}>
        <option value="melee">Melee</option><option value="ranged">Ranged</option>
        <option value="other">Other</option>
       </select>
      </label>
      <label>Critical dice
       <Input label="Critical damage dice" value={settingsWeapon.critDice}
        onChange={critDice=>changeItem('weapons',settingsWeapon.id,{critDice})}/>
      </label>
      <label>Critical on
       <Input label="Critical threshold" type="number" min="1" max="20"
        value={settingsWeapon.critOn}
        onChange={critOn=>changeItem('weapons',settingsWeapon.id,{critOn})}/>
      </label>
      {!modifierList&&<label>Interpret selected modifier as
       <select value={settingsWeapon.statMode||''}
        onChange={e=>changeItem('weapons',settingsWeapon.id,{statMode:e.target.value})}>
        <option value="">Use equipment default</option>
        <option value="score">Attribute score → modifier</option>
        <option value="modifier">Already a modifier</option>
       </select>
      </label>}
     </div>
     <label className="equipment-settings-check">
      <input type="checkbox" checked={settingsWeapon.useStatForDamage!==false}
       onChange={e=>changeItem('weapons',settingsWeapon.id,{useStatForDamage:e.target.checked})}/>
      Add selected attribute modifier to damage
     </label>
     <div className="actions"><button type="button" onClick={()=>setSettingsWeaponId('')}>
      Done</button></div>
    </section>
   </div>}
   {attackError&&<p className="error small" role="alert">{attackError}</p>}
   {weapons.length===0&&<p className="muted tiny">Add a weapon to configure attack and damage rolls.</p>}
   <p className="muted tiny">Attack rolls two d20 results side by side, plus damage,
    in one compact chat card. Critical damage appears when either d20
    reaches the configured critical threshold.</p>
  </section>}
 </div>;
}
