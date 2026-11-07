import {rollDragProps} from './HotbarRollActions.js';
import React,{useEffect,useState} from 'react';
import {initiativeFields,availableCombatTokens,combatEntryForUser,MAX_COMBATANTS} from './CombatInitiative.js';

/** DM-only encounter management. The server validates tokens, attribute and
 * every action; this form never sends a pre-rolled initiative score for rolls.
 */
export default function CombatSetupPanel({map,combat,tokens=[],template,privateEntries=[],
 onBegin,onAdd,onCommand,onRollNpc,onRollEntry,onOpenTurnOrder,busy=false}){
 const fields=initiativeFields(template);
 const [field,setField]=useState('');
 const [mode,setMode]=useState('modifier');
 const [picked,setPicked]=useState(null);
 const [manual,setManual]=useState({});
 const [confirmEnd,setConfirmEnd]=useState(false);
 const active=combat?.active===true;
 const [mapId,setMapId]=useState(map?.id||'');
 useEffect(()=>{
  if((map?.id||'')!==mapId){
   setPicked(null);setManual({});setMapId(map?.id||'');setConfirmEnd(false);
  }
 },[map?.id,mapId]);
 const fieldId=fields.some(x=>x.id===field)?field:fields[0]?.id||'';
 // When the DM changes maps, a previous map's cached roster must never
 // become selectable in a newly created encounter.
 const mapTokens=tokens.filter(token=>token?.map_id===map?.id);
 const participants=active?availableCombatTokens(mapTokens,{
  entries:combat.entries.map(e=>combatEntryForUser(e,privateEntries,mapTokens,true))
 }):mapTokens;
 const choices=picked??participants.filter(t=>t.visible!==false).map(t=>t.id);
 const selected=choices.filter(id=>participants.some(t=>t.id===id));
 const ready=!!(map?.id&&fieldId&&selected.length>0&&selected.length<=MAX_COMBATANTS&&!busy);
 return <div className="combat-setup side-form">
  <p className="muted tiny">Initiative is attached to individual map tokens. Each token rolls separately even when multiple NPCs share a template.</p>
  {!active?<div className="combat-setup-group">
   <label>Initiative attribute
    <select aria-label="Initiative attribute" value={fieldId}
     onChange={e=>setField(e.target.value)}>
     {!fields.length&&<option value="">Create a Number or Attribute sheet field first</option>}
     {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
    </select>
   </label>
   <label>Attribute contribution
    <select aria-label="Initiative calculation" value={mode}
     onChange={e=>setMode(e.target.value)}>
     <option value="modifier">Modifier (1d20 + modifier)</option>
     <option value="value">Raw value (1d20 + field)</option>
    </select>
   </label>
   <p className="muted tiny">Modifier uses the campaign's configured score base and step, usually 10 and 2. The dice result comes from the server.</p>
   <h4>Combatants on this map</h4>
   {participants.length===0?<p className="muted small">Place character or NPC tokens on this map before beginning combat.</p>:
    <div className="combat-pick-list">{participants.map(token=>
     <label key={token.id} className="combat-pick-token">
      <input type="checkbox" checked={selected.includes(token.id)}
       onChange={e=>setPicked(previous=>{
        const list=previous??choices;
        return e.target.checked?[...list,token.id]:list.filter(id=>id!==token.id);
       })}/>
      <span>{token.name||'Unnamed token'}</span>
      <small>{token.character_id?'Character':'NPC'}{token.visible===false?' · hidden':''}</small>
     </label>)}</div>}
   <div className="combat-pick-actions">
    <button className="secondary" type="button" disabled={!participants.length}
     onClick={()=>setPicked(participants.map(x=>x.id))}>All</button>
    <button className="secondary" type="button" disabled={!participants.length}
     onClick={()=>setPicked([])}>None</button>
   </div>
   <button type="button" disabled={!ready} onClick={()=>onBegin(selected,fieldId,mode)}>
    ⚔ Begin Combat ({selected.length})
   </button>
  </div>:<>
   <div className="combat-current-summary">
    <strong>Combat underway · Round {combat.round}</strong>
    <button type="button" className="secondary" onClick={onOpenTurnOrder}>
     Open Turn Order</button>
   </div>
   <p className="muted tiny">Rolling uses the saved {fields.find(x=>x.id===combat.fieldId)?.label||'initiative'} attribute. Only the DM may edit or advance turns.</p>
   <div className="combat-setup-group">
    <button type="button" className="secondary" disabled={busy}
     {...rollDragProps({kind:'initiative-npcs',label:'Roll NPC initiative'},busy)}
     onClick={onRollNpc}>
     Roll all unrolled NPCs
    </button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>onCommand('sort')}>
     ↻ Re-sort highest to lowest
    </button>
   </div>
   <h4>Scores &amp; participants</h4>
   <div className="combat-editor-rows">{combat.entries.map(entry=>{
    const e=combatEntryForUser(entry,privateEntries,tokens,true);
    return <div className="combat-editor-entry" key={e.id}>
     <div className="combat-editor-entry-head">
      <span>{e.name}</span><strong>{e.score===null?'—':e.score}</strong>
     </div>
     <div className="combat-editor-entry-actions">
      {e.score===null&&<button type="button" className="secondary" disabled={busy}
       {...rollDragProps({kind:'initiative',entryId:e.id,label:e.name+' initiative'},busy)}
       onClick={()=>onRollEntry(e.id)}>🎲 Roll</button>}
      <input type="number" min="-999" max="1999" aria-label={'Override initiative for '+e.name}
       placeholder="Score" value={manual[e.id]??''}
       onChange={ev=>setManual(old=>({...old,[e.id]:ev.target.value}))}/>
      <button type="button" className="secondary" title="Set initiative score"
       disabled={busy||manual[e.id]===undefined||manual[e.id]===''||
        !Number.isInteger(Number(manual[e.id]))||Number(manual[e.id])< -999||
        Number(manual[e.id])>1999}
       onClick={()=>{onCommand('score',e.id,Number(manual[e.id]));setManual(old=>({...old,[e.id]:''}))}}>Set</button>
      <button type="button" className="secondary" disabled={busy}
       title={'Remove '+e.name+' from combat'} onClick={()=>onCommand('remove',e.id)}>×</button>
     </div>
    </div>;
   })}</div>
   <h4>Add reinforcements</h4>
   {participants.length===0?<p className="muted tiny">All available tokens have been included.</p>:
    <div className="combat-pick-list">{participants.map(t=>
     <label key={t.id} className="combat-pick-token">
      <input type="checkbox" checked={selected.includes(t.id)}
       onChange={e=>setPicked(old=>{
        const list=old??choices;
        return e.target.checked?[...list,t.id]:list.filter(id=>id!==t.id);
       })}/>
      <span>{t.name}</span>
      <small>{t.character_id?'Character':'NPC'}</small>
     </label>)}</div>}
   {participants.length>0&&<button type="button" className="secondary"
    disabled={busy||!selected.length||combat.entries.length+selected.length>MAX_COMBATANTS}
    onClick={()=>{onAdd(selected);setPicked([])}}>Add {selected.length} to combat</button>}
   <div className="combat-danger">
    {confirmEnd?<div className="combat-confirm-end">
     <p className="muted tiny">End combat for everyone on this map?</p>
     <button type="button" className="secondary" onClick={()=>setConfirmEnd(false)}>Cancel</button>
     <button type="button" onClick={()=>{setConfirmEnd(false);onCommand('end')}} disabled={busy}>
      Confirm End Combat</button>
    </div>:<button type="button" className="secondary"
     onClick={()=>setConfirmEnd(true)}>End Combat</button>}
   </div>
  </>}
 </div>;
}
