import {uid,num,safeList,numberFields} from './SheetMath.js';

/** DM-defined, class-neutral advancement; no fixed class list or casting rules. */
export const DEFAULT_PROFICIENCY_TIERS=[
 {id:'p1',level:1,bonus:2},{id:'p5',level:5,bonus:3},
 {id:'p9',level:9,bonus:4},{id:'p13',level:13,bonus:5},
 {id:'p17',level:17,bonus:6}
];
export const PERSONAL_RESOURCE_KEY='__personal_resources';
export const PERSONAL_RESOURCE_TAB='__personal_resource_tab';

export function makeProgressionField(){
 return {
  id:uid('progress_'),label:'Advancement & class levels',type:'progression',span:3,
  classes:[
   {id:uid('class_'),label:'Path A',castingField:'',castingMode:'score'},
   {id:uid('class_'),label:'Path B',castingField:'',castingMode:'score'}
  ],
  proficiencyTiers:structuredClone(DEFAULT_PROFICIENCY_TIERS),
  outputLevel:'level',outputProficiency:'proficiency_bonus',
  outputSaveDC:'spell_save_dc',outputSpellAttack:'spell_attack_bonus',
  dcBase:8,scoreBase:10,scoreStep:2,
  levelLabel:'Total level'
 };
}
export function makeProficienciesField(){
 return {
  id:uid('prof_'),label:'Skills & proficiencies',type:'proficiencies',span:3,
  progressionField:'',
  entries:[
   {id:uid('skill_'),label:'Perception',group:'Skills',abilityField:'',abilityMode:'score'},
   {id:uid('skill_'),label:'Dexterity save',group:'Saving throws',abilityField:'',abilityMode:'score'}
  ],
  ranks:[{id:'0',label:'Not proficient',multiplier:0},
   {id:'1',label:'Proficient',multiplier:1},
   {id:'2',label:'Expert',multiplier:2}]
 };
}
export const isDerivedKey=id=>/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(String(id||''))&&
 !['constructor','prototype','__proto__'].includes(String(id));
export function abilityModifier(raw,mode='score',base=10,step=2){
 const value=num(raw,mode==='score'?num(base,10):0);
 return mode==='score'?Math.floor((value-num(base,10))/Math.max(1,num(step,2))):value;
}
export function proficiencyForLevel(tiers,level){
 const ordered=safeList(tiers,30).map(t=>({
  level:Math.max(1,Math.floor(num(t.level,1))),
  bonus:num(t.bonus,0)
 })).sort((a,b)=>a.level-b.level);
 let selected=0;
 for(const tier of ordered)if(level>=tier.level)selected=tier.bonus;
 return level>0?selected:0;
}
function validOutput(fallback,configured){
 return isDerivedKey(configured)?configured:fallback;
}
export function derivedProgression(field,value,values){
 const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const levels=v.levels&&typeof v.levels==='object'&&!Array.isArray(v.levels)?v.levels:{};
 const classes=safeList(field.classes,24).filter(Boolean);
 const total=classes.reduce((acc,c)=>acc+Math.max(0,Math.min(100,Math.floor(num(levels[c.id],0)))),0);
 const prof=proficiencyForLevel(field.proficiencyTiers,total);
 const scoreBase=num(field.scoreBase,10),scoreStep=Math.max(1,num(field.scoreStep,2));
 const perClass={};
 for(const cl of classes){
  const modifier=cl.castingField?abilityModifier(values[cl.castingField],cl.castingMode,scoreBase,scoreStep):0;
  perClass[cl.id]={
   modifier,saveDC:num(field.dcBase,8)+prof+modifier,
   spellAttack:prof+modifier,level:Math.max(0,Math.floor(num(levels[cl.id],0)))
  };
 }
 const selected=classes.find(c=>c.id===v.castingSource)||
  classes.find(c=>num(levels[c.id])>0)||classes[0];
 const selectedData=perClass[selected?.id]||{modifier:0,saveDC:num(field.dcBase,8)+prof,spellAttack:prof};
 const outputs={
  [validOutput('level',field.outputLevel)]:total,
  [validOutput('proficiency_bonus',field.outputProficiency)]:prof,
  [validOutput('spell_save_dc',field.outputSaveDC)]:selectedData.saveDC,
  [validOutput('spell_attack_bonus',field.outputSpellAttack)]:selectedData.spellAttack
 };
 for(const cl of classes){
  const dcKey=field.id+'__'+cl.id+'_save_dc';
  const attackKey=field.id+'__'+cl.id+'_spell_attack';
  if(isDerivedKey(dcKey))outputs[dcKey]=perClass[cl.id].saveDC;
  if(isDerivedKey(attackKey))outputs[attackKey]=perClass[cl.id].spellAttack;
 }
 return {total,proficiency:prof,perClass,selectedId:selected?.id||'',outputs};
}
export function derivedProficiencies(field,value,values,template){
 const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const ranks=v.ranks&&typeof v.ranks==='object'&&!Array.isArray(v.ranks)?v.ranks:{};
 const progression=safeList(template?.tabs).flatMap(tab=>safeList(tab.fields))
  .filter(f=>f?.type==='progression');
 const source=progression.find(f=>f.id===field.progressionField)||progression[0];
 const prof=source?
  num(values[validOutput('proficiency_bonus',source.outputProficiency)]):
  num(values.proficiency_bonus);
 const levelBase=source?num(source.scoreBase,10):10;
 const levelStep=source?num(source.scoreStep,2):2;
 const outputs={};
 const entries=safeList(field.entries,80).map(item=>{
  const attribute=item.abilityField?
   abilityModifier(values[item.abilityField],item.abilityMode,levelBase,levelStep):0;
  const chosen=num(ranks[item.id],0);
  const selectedRank=[0,.5,1,2].includes(chosen)?chosen:0;
  const levels=values[source?.id]?.levels||{};
  const automatic=safeList(item.autoPaths,24).some(id=>num(levels[id])>0)?1:0;
  const multiplier=Math.max(selectedRank,automatic);
  const total=attribute+Math.floor(prof*multiplier);
  const key=field.id+'__'+item.id+'_bonus';
  if(isDerivedKey(key))outputs[key]=total;
  return {...item,attribute,rank:multiplier,selectedRank,autoRank:automatic,bonus:total};
 });
 return {proficiency:prof,entries,outputs};
}
/** Deterministic computed stat materialization for server dice/macros.
 * Recalculated whenever a player/DM edits any sheet value, before save.
 * Leaves all unrelated values and personal resource records untouched.
 */
export function enrichSheetValues(template,raw){
 const next={...(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{})};
 const fields=safeList(template?.tabs).flatMap(tab=>safeList(tab.fields,150));
 for(const field of fields.filter(f=>f.type==='progression'))
  Object.assign(next,derivedProgression(field,next[field.id],next).outputs);
 for(const field of fields.filter(f=>f.type==='proficiencies'))
  Object.assign(next,derivedProficiencies(field,next[field.id],next,template).outputs);
 // Only attributes explicitly configured by the DM as raw scores
 // get an automatically materialized _mod numeric field for macros.
 const scoreAttrs=new Map();
 for(const f of fields){
  if(f.type==='progression'){
   for(const c of safeList(f.classes,24)){
    if(c.castingMode==='score'&&c.castingField)
     scoreAttrs.set(c.castingField,{base:f.scoreBase,step:f.scoreStep});
   }
  }else if(f.type==='proficiencies'){
   for(const e of safeList(f.entries,80)){
    if(e.abilityMode==='score'&&e.abilityField&&!scoreAttrs.has(e.abilityField))
     scoreAttrs.set(e.abilityField,{base:10,step:2});
   }
  }else if(f.type==='equipment'){
   if(f.armorModifierMode==='score'&&f.armorModifierField&&!scoreAttrs.has(f.armorModifierField))
    scoreAttrs.set(f.armorModifierField,{base:f.scoreBase,step:f.scoreStep});
   if(f.defaultAttackMode==='score'&&f.defaultAttackField&&!scoreAttrs.has(f.defaultAttackField))
    scoreAttrs.set(f.defaultAttackField,{base:f.scoreBase,step:f.scoreStep});
  }
 }
 for(const [id,settings] of scoreAttrs){
  const key=id+'_mod';
  if(isDerivedKey(key))
   next[key]=abilityModifier(next[id],'score',settings.base,settings.step);
 }
 return next;
}
export function numericFieldsWithDerived(template){
 const entries=numberFields(template);
 const fields=safeList(template?.tabs).flatMap(tab=>safeList(tab.fields));
 const scoreFields=new Set();
 for(const f of fields){
  if(f.type==='progression'){
   for(const cl of safeList(f.classes,24))
    if(cl.castingMode==='score'&&cl.castingField)scoreFields.add(cl.castingField);
   entries.push(
    {id:validOutput('level',f.outputLevel),label:'Total level'},
    {id:validOutput('proficiency_bonus',f.outputProficiency),label:'Proficiency bonus'},
    {id:validOutput('spell_save_dc',f.outputSaveDC),label:'Selected spell save DC'},
    {id:validOutput('spell_attack_bonus',f.outputSpellAttack),label:'Selected spell attack bonus'});
   for(const cl of safeList(f.classes,24)){
    const dc=f.id+'__'+cl.id+'_save_dc';
    if(isDerivedKey(dc))entries.push({id:dc,label:cl.label+' save DC'});
   }
  }else if(f.type==='proficiencies'){
   for(const e of safeList(f.entries,80)){
    if(e.abilityMode==='score'&&e.abilityField)scoreFields.add(e.abilityField);
    const id=f.id+'__'+e.id+'_bonus';
    if(isDerivedKey(id))entries.push({id,label:e.label+' bonus'});
   }
  }else if(f.type==='equipment'){
   if(f.armorModifierMode==='score'&&f.armorModifierField)
    scoreFields.add(f.armorModifierField);
   if(f.defaultAttackMode==='score'&&f.defaultAttackField)
    scoreFields.add(f.defaultAttackField);
  }
 }
 for(const id of scoreFields)if(isDerivedKey(id+'_mod')){
  const source=entries.find(e=>e.id===id);
  entries.push({id:id+'_mod',label:(source?.label||id)+' modifier'});
 }
 return Array.from(new Map(entries.map(e=>[e.id,e])).values());
}
