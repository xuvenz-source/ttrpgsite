import React from 'react';

/** One compact, server-rolled chat card. Display switches are saved per spell. */
function RolledValue({name,data}){
 if(!data||typeof data!=='object')return null;
 const groups=Array.isArray(data.rolls)?data.rolls:[];
 return <div className="spell-chat-roll" aria-label={name+' roll'}>
  <span className="spell-chat-roll-label">{name}</span>
  <strong className="spell-chat-roll-total">{data.total??'—'}</strong>
  <details className="spell-chat-roll-details">
   <summary>{data.expression||'Dice details'}</summary>
   <span>{groups.map((group,i)=><span key={i}>
    {i>0?' + ':''}{group.sign===-1?'−':''}
    {group.count}d{group.sides}: [{(group.dice||[]).join(', ')}]
   </span>)}
   {data.modifier?' · modifier '+data.modifier:''}</span>
  </details>
 </div>;
}
export default function SpellChatCard({message}){
 const result=message?.result||{},info=result.meta||{},parts=result.sections||{};
 const flags=[info.concentration?'Concentration':null,info.ritual?'Ritual':null].filter(Boolean);
 return <article className="spell-chat-card" aria-label={'Spell: '+(message.body||'Spell')}>
  <div className="spell-chat-title"><span className="spell-chat-star">✦</span>
   <strong>{info.name||message.body||'Spell'}</strong>
   {info.level&&<span className="spell-chat-level">{info.level}</span>}
  </div>
  {(info.school||info.castingTime||info.range)&&<div className="spell-chat-meta">
   {[info.school,info.castingTime,info.range].filter(Boolean).join(' · ')}
  </div>}
  {flags.length>0&&<div className="spell-chat-flags">{flags.join(' · ')}</div>}
  {(parts.attack||parts.damage||parts.healing)&&<div className="spell-chat-rolls">
   <RolledValue name="Attack" data={parts.attack}/>
   <RolledValue name="Damage" data={parts.damage}/>
   <RolledValue name="Healing" data={parts.healing}/>
  </div>}
  {parts.save&&<div className="spell-chat-save">
   <strong>Save:</strong> <strong>{parts.save.stat} DC {parts.save.dc}</strong>
   {parts.save.success&&<span> · On success: {parts.save.success}</span>}
  </div>}
  {parts.description&&<div className="spell-chat-description">{parts.description}</div>}
  {parts.higherLevels&&<details className="spell-chat-text-detail">
   <summary>At higher levels</summary><p>{parts.higherLevels}</p>
  </details>}
  {parts.effects&&<div className="spell-chat-effects"><strong>Effects:</strong> {parts.effects}</div>}
  {Object.keys(parts).length===0&&<span className="muted tiny">Cast spell (no roll details enabled or configured).</span>}
  {info.components&&<div className="spell-chat-components">Components: {info.components}</div>}
 </article>;
}
