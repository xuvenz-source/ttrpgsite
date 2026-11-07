import React,{useEffect,useRef,useState} from 'react';

let topWindowLayer=700;
let npcWindowIndex=0;
const CONFIG={
 sheet:{width:840,height:660},
 npc:{width:735,height:600},
 library:{width:840,height:575},
 studio:{width:820,height:660},
 quick:{width:365,height:355},
 inventory:{width:430,height:520},
 account:{width:445,height:565},
 status:{width:650,height:610},
 mapsetting:{width:365,height:560}
};
function initialPosition(kind){
 const preset=CONFIG[kind]||CONFIG.sheet;
 const width=typeof window!=='undefined'?window.innerWidth:1200;
 const height=typeof window!=='undefined'?window.innerHeight:800;
 const x=Math.max(8,Math.round((width-Math.min(width-24,preset.width))/2));
 const y=Math.max(8,Math.round(Math.min(74,(height-preset.height)/3)));
 // Keep the token library and studio visibly distinct from an open character
 // sheet at first appearance. All remain draggable and click-to-front.
 const delta=kind==='npc'?(++npcWindowIndex%7-3)*55:
  kind==='library'?-Math.min(225,width*.16):
  kind==='studio'?Math.min(165,width*.12):
  kind==='mapsetting'?-Math.min(260,width*.20):0;
 return {x:Math.max(8,Math.min(width-90,Math.round(x+delta))),y};
}
/** A mouse-draggable, resizable window that doesn't dim or block the tabletop.
 * Dragging is limited to the existing .heading title bar. Inputs remain
 * selectable. Each open window can be raised independently.
 */
export default function FloatingWindow({children,kind='sheet',className='',onClose,focusSignal=0}){
 const box=useRef(null),dragging=useRef(null);
 const [position,setPosition]=useState(()=>initialPosition(kind));
 const [layer,setLayer]=useState(()=>++topWindowLayer);
 useEffect(()=>{if(focusSignal>0)setLayer(++topWindowLayer)},[focusSignal]);
 useEffect(()=>{
  function onResize(){
   setPosition(p=>{
    if(!box.current)return p;
    const rect=box.current.getBoundingClientRect();
    return {x:Math.max(0,Math.min(p.x,window.innerWidth-48)),
            y:Math.max(0,Math.min(p.y,window.innerHeight-42))};
   });
  }
  window.addEventListener('resize',onResize);
  return()=>window.removeEventListener('resize',onResize);
 },[]);
 function start(e){
  if(e.button!==0)return;
  setLayer(++topWindowLayer);
  if(!(e.target instanceof Element))return;
  if(!e.target.closest('.heading'))return;
  if(e.target.closest('button,input,textarea,select,a,[contenteditable="true"]'))return;
  const rect=box.current?.getBoundingClientRect();
  if(!rect)return;
  dragging.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,
   x:rect.left,y:rect.top};
  e.currentTarget.setPointerCapture(e.pointerId);
  e.preventDefault();
 }
 function move(e){
  if(!dragging.current||dragging.current.id!==e.pointerId)return;
  const start=dragging.current;
  const dx=e.clientX-start.startX,dy=e.clientY-start.startY;
  const width=box.current?.getBoundingClientRect().width||300;
  setPosition({
   x:Math.max(-width+66,Math.min(window.innerWidth-66,start.x+dx)),
   y:Math.max(0,Math.min(window.innerHeight-46,start.y+dy))
  });
 }
 function stop(e){
  if(dragging.current?.id!==e.pointerId)return;
  dragging.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))
   e.currentTarget.releasePointerCapture(e.pointerId);
 }
 return <div ref={box} className={'floating-window floating-'+kind+' '+className}
  style={{left:position.x,top:position.y,zIndex:layer}}
  onPointerDownCapture={start} onPointerMove={move}
  onPointerUp={stop} onPointerCancel={stop}
  onKeyDown={e=>{if(e.key==='Escape'&&onClose&&!e.defaultPrevented){
   const el=e.target;
   if(el?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
   e.stopPropagation();onClose();
  }}}>
  {children}
 </div>;
}
