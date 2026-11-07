import {numberFields,num} from './SheetMath.js';

/** All shared entry IDs are encounter-scoped, not character-template IDs. */
export const MAX_COMBATANTS=60;
export const INITIATIVE_MODES=['modifier','value'];
export function initiativeFields(template){
 return numberFields(template).filter(field=>String(field.id||'').length<=100);
}
export function normalizeCombat(raw){
 if(!raw||typeof raw!=='object')return null;
 const entries=Array.isArray(raw.participants)?raw.participants
  .filter(e=>e&&typeof e.id==='string').slice(0,MAX_COMBATANTS).map(e=>({
   id:e.id,tokenId:typeof e.token_id==='string'?e.token_id:null,
   name:String(e.name||'Unknown combatant').slice(0,80),
   score:Number.isFinite(Number(e.score))&&e.score!==null?Number(e.score):null,
   kind:e.kind==='npc'?'npc':'character',
   rolled:e.score!==null&&e.score!==undefined
  })):[];
 return {mapId:raw.map_id||'',campaignId:raw.campaign_id||'',
  active:raw.active===true,
  round:Math.max(0,Math.floor(num(raw.round,0))),
  currentEntryId:raw.current_entry_id||null,
  fieldId:raw.initiative_field||'',
  fieldMode:raw.initiative_mode==='value'?'value':'modifier',
  revision:Math.max(0,Math.floor(num(raw.revision,0))),
  entries};
}
export function currentCombatant(combat){
 return combat?.entries?.find(x=>x.id===combat.currentEntryId)||null;
}
export function combatLabel(token,canReveal=false){
 if(!token)return 'Unknown combatant';
 return token.visible===false&&!canReveal?'Unknown combatant':String(token.name||'Combatant').slice(0,80);
}
export function combatEntryForUser(entry,privateEntries=[],tokens=[],isDM=false){
 if(!isDM)return entry;
 const privateEntry=privateEntries.find(e=>e.entry_id===entry.id);
 const token=tokens.find(t=>t.id===privateEntry?.token_id);
 return token?{...entry,name:combatLabel(token,true),tokenId:token.id}:entry;
}
export function availableCombatTokens(tokens,combat){
 const existing=new Set((combat?.entries||[]).map(e=>e.tokenId).filter(Boolean));
 return (tokens||[]).filter(t=>t&&typeof t.id==='string'&&!existing.has(t.id));
}
export function canRollCombatEntry(entry,tokens,userId,isDM){
 if(!entry||entry.rolled)return false;
 return isDM||!!(entry.tokenId&&tokens.some(t=>
  t.id===entry.tokenId&&t.visible!==false&&t.owner_id===userId));
}
export function sortedCombatEntries(entries){
 return [...(entries||[])].sort((a,b)=>{
  if(a.score===null||a.score===undefined)return b.score===null||b.score===undefined?0:1;
  if(b.score===null||b.score===undefined)return -1;
  return b.score-a.score;
 });
}
