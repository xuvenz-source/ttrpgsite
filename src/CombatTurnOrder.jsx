import React,{useState} from 'react';
import FloatingWindow from './FloatingWindow.jsx';
import {currentCombatant,canRollCombatEntry,combatEntryForUser} from './CombatInitiative.js';

export default function CombatTurnOrder({combat,privateEntries=[],tokens=[],user,isDM,
 onClose,onNext,onPrevious,onSort,onOpenSettings,onRollEntry,onRollNpc,onLocate,busy=false}){
 const [minimized,setMinimized]=useState(false);
 if(!combat?.active)return null;
 const current=currentCombatant(combat);
 const activeDisplay=current?combatEntryForUser(current,privateEntries,tokens,isDM):null;
 const allScored=combat.entries.every(e=>e.score!==null);
 return <FloatingWindow kind="combat" className={minimized?'is-combat-minimized':''}
  onClose={onClose}>
  <section className="panel combat-turn-order" aria-label="Shared Turn Order" role="region">
   <div className="heading combat-window-header">
    <h2>Turn Order</h2>
    <div className="combat-window-buttons">
     <button className="secondary" type="button"
      title={minimized?'Expand Turn Order':'Minimize Turn Order'}
      aria-label={minimized?'Expand Turn Order':'Minimize Turn Order'}
      onClick={()=>setMinimized(v=>!v)}>{minimized?'▢':'—'}</button>
     <button className="secondary" type="button" title="Close Turn Order for me"
      aria-label="Close Turn Order" onClick={onClose}>×</button>
    </div>
   </div>
   {!minimized&&<>
    <div className="combat-window-meta">
     <span>Round <strong>{combat.round}</strong> · {combat.entries.length} combatants</span>
     <div className="combat-window-controls">
      {isDM&&<button className="secondary" type="button" disabled={busy}
       title="Re-sort by initiative (highest first)" aria-label="Re-sort initiative"
       onClick={onSort}>↻</button>}
      {isDM&&<button className="secondary" type="button" disabled={busy}
       title="Combat settings" aria-label="Combat settings"
       onClick={onOpenSettings}>⚙</button>}
     </div>
    </div>
    <div className="combat-turn-entries" role="list" aria-label="Initiative order">
     {!combat.entries.length&&<div className="combat-empty-roster">No combatants yet. The DM can add units from Combat settings.</div>}
     {combat.entries.map((entry,index)=>{
      const e=combatEntryForUser(entry,privateEntries,tokens,isDM);
      const focused=e.id===combat.currentEntryId;
      const canRoll=canRollCombatEntry(entry,tokens,user,isDM);
      return <div className={'combat-turn-entry'+(focused?' is-active-turn':'')}
       key={e.id} role="listitem">
       <div className="combat-turn-number">{index+1}</div>
       <div className="combat-turn-avatar" aria-hidden="true">
        {e.kind==='unknown'?'?':e.kind==='npc'?'♟':'♞'}
       </div>
       <div className="combat-turn-identity">
        <strong title={e.name}>{e.name}</strong>
        <small>{focused?'Current turn':e.score===null?'Awaiting initiative':e.kind==='unknown'?'Unidentified':e.kind==='npc'?'NPC':'Player character'}</small>
       </div>
       <div className="combat-turn-score">{e.score===null?'—':e.score}</div>
       {canRoll&&<button type="button" className="secondary combat-entry-roll"
        disabled={busy} title={'Roll initiative for '+e.name}
        onClick={()=>onRollEntry(e.id)}>🎲</button>}
       {e.tokenId&&<button type="button" className="secondary combat-entry-find"
        title={'Find '+e.name+' on map'} aria-label={'Find '+e.name+' on map'}
        onClick={()=>onLocate(e.tokenId)}>◎</button>}
      </div>;
     })}
    </div>
    {!allScored&&<p className="combat-waiting muted tiny">
     Waiting for {combat.entries.filter(e=>e.score===null).length} initiative roll(s).
    </p>}
    {isDM&&combat.entries.some(e=>e.score===null)&&
     <button type="button" className="secondary combat-roll-npcs"
      onClick={onRollNpc} disabled={busy}>🎲 Roll unrolled NPCs</button>}
    <div className="combat-turn-footer">
     <button type="button" className="secondary" title="Previous combatant"
      aria-label="Previous combatant" disabled={!isDM||busy||!allScored||!combat.entries.length}
      onClick={onPrevious}>←</button>
     <span title={current?.name||'Waiting for initiative'}>
      {activeDisplay?'Current: '+activeDisplay.name:'Waiting for rolls'}
     </span>
     <button type="button" title="Next combatant" aria-label="Next combatant"
      disabled={!isDM||busy||!allScored||!combat.entries.length}
      onClick={onNext}>→</button>
    </div>
   </>}
  </section>
 </FloatingWindow>;
}
