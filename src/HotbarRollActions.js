import {abilityModifier,attributeSaveProficiency,derivedProficiencies,
 enrichSheetValues} from './SheetDerived.js';
import {num} from './SheetMath.js';

// Never serialize character values, private sheets or spell bodies in drag data.
export const ROLL_HOTBAR_MIME='application/x-forge-roll';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const SOURCES=new Set(['character','npc_token','npc_template']);
const SPELL_MODES=new Set(['cast','attack','damage','healing']);
const sourceValid=a=>SOURCES.has(a?.sourceType)&&UUID.test(String(a?.sourceId||''));
const idsValid=(a,...keys)=>keys.every(key=>ID.test(String(a?.[key]||'')));

export function rollHotbarSlot(raw){
 const a=raw||{};
 const label=String(a.label||'Roll').trim().slice(0,40)||'Roll';
 let command='';
 if(a.kind==='weapon'&&sourceValid(a)&&idsValid(a,'fieldId','weaponId'))
  command='/weapon '+a.sourceType+' '+a.sourceId+' '+a.fieldId+' '+a.weaponId;
 else if(a.kind==='sheet'&&sourceValid(a)&&idsValid(a,'fieldId'))
  command='/sheetroll '+a.sourceType+' '+a.sourceId+' '+a.fieldId;
 else if(a.kind==='collection'&&sourceValid(a)&&idsValid(a,'fieldId','entryId','childId'))
  command='/collectionroll '+a.sourceType+' '+a.sourceId+' '+a.fieldId+' '+a.entryId+' '+a.childId;
 else if(a.kind==='save'&&sourceValid(a)&&idsValid(a,'fieldId'))
  command='/saveroll '+a.sourceType+' '+a.sourceId+' '+a.fieldId;
 else if(a.kind==='proficiency'&&sourceValid(a)&&idsValid(a,'fieldId','entryId'))
  command='/proficiencyroll '+a.sourceType+' '+a.sourceId+' '+a.fieldId+' '+a.entryId;
 else if(a.kind==='spell'&&sourceValid(a)&&idsValid(a,'fieldId','entryId')&&SPELL_MODES.has(a.mode))
  command='/spell '+a.sourceType+' '+a.sourceId+' '+a.fieldId+' '+a.entryId+' '+a.mode;
 else if(a.kind==='initiative'&&UUID.test(String(a.entryId||'')))
  command='/initiative '+a.entryId;
 else if(a.kind==='initiative-npcs')
  command='/initiative-npcs';
 else if(a.kind==='dice'&&typeof a.formula==='string'&&a.formula.trim()&&
  a.formula.length<=235&&!/[\r\n]/.test(a.formula))
  command='/roll '+a.formula.trim();
 if(!command||command.length>300)throw Error('This roll cannot be added to the hotbar.');
 return {label,command};
}

/** Every roll button uses this same drag protocol. Click behaviour is unchanged. */
export function rollDragProps(action,disabled=false){
 if(!action||disabled)return {draggable:false};
 return {draggable:true,onDragStart:event=>{
  try{
   const slot=rollHotbarSlot(action);
   event.dataTransfer.setData(ROLL_HOTBAR_MIME,JSON.stringify({
    ...action,label:slot.label
   }));
   event.dataTransfer.effectAllowed='copy';
  }catch{
   event.preventDefault();
  }
 }};
}
const SOURCE='(character|npc_token|npc_template)';
const KEY='([A-Za-z0-9_-]{1,100})';
const UID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
function extract(command,kind,pattern,keys){
 const match=String(command||'').match(pattern);
 return match?Object.fromEntries([['kind',kind],...keys.map((key,i)=>[key,match[i+1]])]):null;
}
export function parseRollHotbarCommand(command){
 const parsed=
  extract(command,'weapon',new RegExp('^/weapon\\s+'+SOURCE+'\\s+'+UID+'\\s+'+KEY+'\\s+'+KEY+'$','i'),
   ['sourceType','sourceId','fieldId','weaponId'])||
  extract(command,'sheet',new RegExp('^/sheetroll\\s+'+SOURCE+'\\s+'+UID+'\\s+'+KEY+'$','i'),
   ['sourceType','sourceId','fieldId'])||
  extract(command,'collection',new RegExp('^/collectionroll\\s+'+SOURCE+'\\s+'+UID+'\\s+'+KEY+'\\s+'+KEY+'\\s+'+KEY+'$','i'),
   ['sourceType','sourceId','fieldId','entryId','childId'])||
  extract(command,'save',new RegExp('^/saveroll\\s+'+SOURCE+'\\s+'+UID+'\\s+'+KEY+'$','i'),
   ['sourceType','sourceId','fieldId'])||
  extract(command,'proficiency',new RegExp('^/proficiencyroll\\s+'+SOURCE+'\\s+'+UID+'\\s+'+KEY+'\\s+'+KEY+'$','i'),
   ['sourceType','sourceId','fieldId','entryId'])||
  extract(command,'spell',new RegExp('^/spell\\s+'+SOURCE+'\\s+'+UID+'\\s+'+KEY+'\\s+'+KEY+'\\s+(cast|attack|damage|healing)$','i'),
   ['sourceType','sourceId','fieldId','entryId','mode'])||
  extract(command,'initiative',new RegExp('^/initiative\\s+'+UID+'$','i'),['entryId'])||
  (String(command).toLowerCase()==='/initiative-npcs'?{kind:'initiative-npcs'}:null);
 return parsed?{...parsed,sourceType:parsed.sourceType?.toLowerCase(),mode:parsed.mode?.toLowerCase()}:null;
}
export const isRollHotbarCommand=command=>!!parseRollHotbarCommand(command);

function numericValue(raw){
 if(raw&&typeof raw==='object'&&!Array.isArray(raw))raw=raw.current;
 const value=String(raw??'').trim();
 return /^-?\d+(\.\d+)?$/.test(value)?value:'0';
}
export function resolveSheetRollExpression(formula,row={},sheet={}){
 return String(formula||'1d20').replace(/@\{([A-Za-z0-9_.-]+)\}/g,(_,key)=>{
  const rowKey=key.startsWith('row.')?key.slice(4):key;
  if(Object.prototype.hasOwnProperty.call(row,rowKey))return numericValue(row[rowKey]);
  return numericValue(sheet?.[key]);
 });
}
/** Recompute shortcuts against the latest authorized sheet, not drag-time values. */
export function resolveSheetHotbarRoll(action,template,rawValues={}){
 if(!['sheet','collection','save','proficiency'].includes(action?.kind))
  throw Error('Unsupported sheet roll action.');
 const field=(template?.tabs||[]).flatMap(tab=>tab.fields||[])
  .find(f=>f.id===action.fieldId);
 if(!field)throw Error('This roll has been removed from the sheet.');
 const values=enrichSheetValues(template,rawValues);
 if(action.kind==='sheet'&&field.type==='roll')
  return {formula:resolveSheetRollExpression(field.formula||'1d20',{},values),
   label:String(field.label||'Roll')};
 if(action.kind==='save'&&field.type==='attribute'){
  const base=num(template?.modifierRules?.base,10),step=Math.max(1,num(template?.modifierRules?.step,2));
  const modifier=abilityModifier(values[field.id],'score',base,step);
  const bonus=modifier+(values[field.id+'__save_prof']?
   attributeSaveProficiency(field,values,template):0);
  return {formula:'1d20'+(bonus>=0?'+':'')+bonus,label:(field.label||'Attribute')+' saving throw'};
 }
 if(action.kind==='proficiency'&&field.type==='proficiencies'){
  const entry=derivedProficiencies(field,values[field.id],values,template)
   .entries.find(x=>x.id===action.entryId);
  if(!entry)throw Error('This proficiency roll no longer exists.');
  return {formula:'1d20'+(entry.bonus>=0?'+':'')+entry.bonus,label:entry.label+' check'};
 }
 if(action.kind==='collection'&&field.type==='collection'){
  const row=(Array.isArray(values[field.id])?values[field.id]:[])
   .find(x=>x.id===action.entryId);
  const child=(field.fields||[]).find(x=>x.id===action.childId&&x.type==='roll');
  if(!row||!child)throw Error('This collection roll no longer exists.');
  if(field.spellbook&&['cast_spell','damage_roll','heal_roll','spell_attack'].includes(child.id))
   throw Error('Use the spell shortcut for this action.');
  return {formula:resolveSheetRollExpression(child.formula,row.values||{},values),
   label:String(row.values?.[field.titleField]||field.entryLabel||field.label)+' — '+(child.label||'Roll')};
 }
 throw Error('This shortcut no longer matches a roll button.');
}
