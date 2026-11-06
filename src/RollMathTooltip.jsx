import React,{useState} from 'react';
import {createPortal} from 'react-dom';

/** Small, keyboard-accessible dice breakdown shown by hovering/focusing on a result. */
export function rollMathText(data){
 if(!data||typeof data!=='object')return '';
 const expression=String(data.expression||'Dice roll');
 const groups=Array.isArray(data.rolls)?data.rolls:[];
 let pieces;
 if(groups.length){
  pieces=groups.map(g=>{
   const dice=Array.isArray(g.dice)?g.dice:[];
   return (g.sign===-1?'−':'')+g.count+'d'+g.sides+' ['+dice.join(', ')+']';
  }).join(' + ');
 }else{
  const dice=Array.isArray(data.dice)?data.dice:[];
  pieces=dice.length?'['+dice.join(', ')+']':'No individual dice';
  if(data.kept!==null&&data.kept!==undefined)pieces+=' → kept '+data.kept;
 }
 const mod=Number(data.modifier);
 if(Number.isFinite(mod)&&mod!==0)pieces+=' '+(mod>0?'+':'−')+' '+Math.abs(mod);
 const result=expression+'\n'+pieces+' = '+String(data.total??'—');
 return data.critOn!=null&&data.natural!=null?
  result+'\nNatural d20: '+data.natural+'; critical on '+data.critOn+'+':result;
}
export default function RollMathTooltip({data,className='',size='normal'}){
 const [anchor,setAnchor]=useState(null);
 if(!data||typeof data!=='object')return <span className={className}>—</span>;
 const expression=String(data.expression||'');
 const groups=Array.isArray(data.rolls)?data.rolls:[];
 const dice=Array.isArray(data.dice)?data.dice:[];
 const mod=Number(data.modifier);
 const details=rollMathText(data);
 function show(e){
  const rect=e.currentTarget.getBoundingClientRect();
  const left=Math.max(8,Math.min(window.innerWidth-268,rect.right-260));
  const openingAbove=rect.top>220;
  setAnchor({left:Math.max(8,left),
   ...(openingAbove?{bottom:window.innerHeight-rect.top+7}:{top:rect.bottom+7})});
 }
 return <>
  <span className={'roll-math-trigger '+className} tabIndex={0}
   aria-label={details}
   onPointerEnter={show} onPointerLeave={()=>setAnchor(null)}
   onFocus={show} onBlur={()=>setAnchor(null)}>
   <strong className={'roll-math-result '+(size==='small'?'compact':'')}>{data.total??'—'}</strong>
  </span>
  {anchor&&createPortal(
   <span className="roll-math-tooltip" role="tooltip" style={anchor}>
    <span className="roll-math-expression">{expression||'Dice roll'}</span>
    {groups.length>0?groups.map((g,i)=><span className="roll-math-line" key={i}>
     {g.sign===-1?'−':'+'} {g.count}d{g.sides}
     <b>[{Array.isArray(g.dice)?g.dice.join(', '):''}]</b>
    </span>):dice.length>0?<span className="roll-math-line">Dice <b>[{dice.join(', ')}]</b></span>:null}
    {data.kept!==null&&data.kept!==undefined&&
     <span className="roll-math-line">Kept <b>{data.kept}</b></span>}
    {Number.isFinite(mod)&&mod!==0&&<span className="roll-math-line">
     Modifier <b>{mod>0?'+':''}{mod}</b>
    </span>}
    {data.natural!=null&&data.critOn!=null&&<span className="roll-math-line">
     Natural d20 <b>{data.natural}</b> · Crit on <b>{data.critOn}+</b>
    </span>}
    <span className="roll-math-final">Total <strong>{data.total??'—'}</strong></span>
   </span>,document.body)}
 </>;
}
