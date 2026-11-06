import React from 'react';
import MacroChatCard from './MacroChatCard.jsx';

/** Spells use the same compact row and roll styling as weapons and macros. */
export default function SpellChatCard({message}){
 const result=message?.result||{},info=result.meta||{},parts=result.sections||{};
 const flags=[info.concentration?'Concentration':null,info.ritual?'Ritual':null].filter(Boolean);
 const rows=[];
 for(const [key,label] of [['attack','Attack'],['damage','Damage'],['healing','Healing']]){
  const value=parts[key];
  if(value&&typeof value==='object')
   rows.push({id:key,label,cells:[{id:key,kind:'roll',roll:value}]});
 }
 if(parts.save){
  const text=[parts.save.stat,parts.save.dc!=null?'DC '+parts.save.dc:null,
   parts.save.success?'On success: '+parts.save.success:null].filter(Boolean).join(' · ');
  rows.push({id:'save',label:'Saving throw',cells:[{kind:'text',text}]});
 }
 const subtitle=[info.level,info.school,info.castingTime,info.range].filter(Boolean).join(' · ');
 const detailsPresent=!!(flags.length||info.components||parts.description||
  parts.higherLevels||parts.effects);
 return <MacroChatCard className="spell-roll-card"
  message={{body:message?.body||'Spell',result:{
   title:info.name||message?.body||'Spell',subtitle,rows
  }}}>
  {detailsPresent&&<details className="spell-roll-details">
   <summary>Spell details{flags.length?' · '+flags.join(' · '):''}</summary>
   <div className="spell-roll-extra">
    {info.components&&<p><strong>Components:</strong> {info.components}</p>}
    {parts.description&&<p className="spell-roll-description">{parts.description}</p>}
    {parts.higherLevels&&<p><strong>At higher levels:</strong> {parts.higherLevels}</p>}
    {parts.effects&&<p><strong>Effects:</strong> {parts.effects}</p>}
   </div>
  </details>}
  {rows.length===0&&<p className="spell-roll-empty">No dice or saving throw enabled.</p>}
 </MacroChatCard>;
}
