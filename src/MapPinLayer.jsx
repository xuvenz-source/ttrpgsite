import React,{useRef,useState} from 'react';
import {PIN_ICONS,normalizePinPosition,pinVisibleTo} from './CampaignHandouts.js';

/** Map pins are separate from DM lighting geometry. Players receive only RLS-allowed pins. */
export default function MapPinLayer({map,scale,pins=[],isDM,editor,active=true,
 onCreate,onMove,onOpen}){
 const [preview,setPreview]=useState({});
 const drag=useRef(null),skipClick=useRef(null);
 const cell=Math.max(1,Number(map?.grid_size)*scale);
 const placing=isDM&&editor?.enabled&&editor?.layer==='light'&&
  editor?.tool==='pin'&&!!editor?.pinHandoutId;
 if(!map)return null;
 function point(event){
  const root=event.currentTarget.getBoundingClientRect();
  return normalizePinPosition((event.clientX-root.left)/cell,
   (event.clientY-root.top)/cell,map);
 }
 function start(event,pin){
  event.stopPropagation();
  if(event.button!==0||!isDM||!active||!editor?.enabled||editor?.tool!=='select')return;
  const d={id:pin.id,pointerId:event.pointerId,
   x:Number(pin.x),y:Number(pin.y),
   startX:event.clientX,startY:event.clientY};
  drag.current=d;
  try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}
 }
 function move(event,pin){
  const d=drag.current;
  if(!d||d.id!==pin.id||d.pointerId!==event.pointerId)return;
  const next=normalizePinPosition(d.x+(event.clientX-d.startX)/cell,
   d.y+(event.clientY-d.startY)/cell,map);
  setPreview(prev=>({...prev,[pin.id]:next}));
 }
 function finish(event,pin,cancel=false){
  const d=drag.current;
  if(!d||d.id!==pin.id||d.pointerId!==event.pointerId)return;
  drag.current=null;
  const next=preview[d.id]||{x:d.x,y:d.y};
  setPreview(prev=>{const copy={...prev};delete copy[d.id];return copy});
  try{event.currentTarget.releasePointerCapture(event.pointerId)}catch{}
  if(!cancel&&(Math.abs(next.x-d.x)>.01||Math.abs(next.y-d.y)>.01)){
   skipClick.current=pin.id;
   onMove?.(pin,{x:next.x,y:next.y});
  }
 }
 return <div className={"map-handout-pins"+(placing?" is-placing":isDM&&editor?.enabled?" is-editing":"")}>
  {placing&&<button type="button" className="map-handout-placement"
   aria-label="Click map to place handout pin" title="Place handout pin"
   onPointerDown={event=>{
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    const p=point(event);
    onCreate?.(editor.pinHandoutId,p);
   }}/>}
  {pins.filter(pin=>pinVisibleTo(pin,isDM)).map(pin=>{
   const at=preview[pin.id]||pin;
   return <button key={pin.id} type="button"
    className={'map-handout-pin'+(!pin.visible?' is-hidden':'')+
     (isDM&&editor?.enabled&&editor.tool==='select'?' is-movable':'')}
    style={{left:Number(at.x)*cell,top:Number(at.y)*cell}}
    title={(pin.visible?'Open ':'Hidden · ')+(PIN_ICONS[pin.kind]||'📜')+' handout pin'}
    aria-label={'Open '+(pin.visible?'':'hidden ')+pin.kind+' handout pin'}
    onPointerDown={e=>start(e,pin)}
    onPointerMove={e=>move(e,pin)}
    onPointerUp={e=>finish(e,pin)}
    onPointerCancel={e=>finish(e,pin,true)}
    onClick={e=>{
     e.stopPropagation();
     if(skipClick.current===pin.id){skipClick.current=null;return}
     if(!drag.current)onOpen?.(pin)
    }}>
    <span aria-hidden="true">{PIN_ICONS[pin.kind]||'📜'}</span>
    {isDM&&!pin.visible&&<span className="map-handout-hidden-dot" aria-hidden="true">◌</span>}
   </button>;
  })}
 </div>;
}
