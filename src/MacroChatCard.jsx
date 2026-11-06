import React from 'react';
import RollMathTooltip from './RollMathTooltip.jsx';

/** Roll20-style condensed, multi-row chat card. Values come from a server execution. */
export default function MacroChatCard({message,preview=false}){
 const payload=message?.result||{},rows=Array.isArray(payload.rows)?payload.rows:[];
 const title=String(payload.title||message?.body||'Macro'),subtitle=String(payload.subtitle||'');
 return <article className={'macro-chat-card'+(preview?' macro-chat-preview':'')}>
  <header className="macro-chat-header">
   <strong>{title}</strong>
   {subtitle&&<span>{subtitle}</span>}
  </header>
  <div className="macro-chat-rows">
   {rows.map((row,i)=><div className="macro-chat-row" key={row.id||i}>
    <span className="macro-chat-row-label">{row.label}</span>
    <div className="macro-chat-values">
     {(Array.isArray(row.cells)?row.cells:[]).map((cell,j)=>
      <span key={cell.id||j} className={'macro-chat-cell'+(cell.kind==='text'?' text':'')}>
       {cell.kind==='roll'?<>
        {cell.label&&<span className="macro-chat-cell-label">{cell.label}</span>}
        {preview?<span className="macro-chat-demo">—</span>:
         <RollMathTooltip data={cell.roll} size="small"/>}
       </>:<>
        {cell.label&&<span className="macro-chat-cell-label">{cell.label}</span>}
        <span>{cell.text}</span>
       </>}
      </span>)}
    </div>
   </div>)}
  </div>
 </article>;
}
