import React,{useEffect,useRef,useState} from 'react';
import {PIN_ICONS,normalizePinPosition,pinVisibleTo} from './CampaignHandouts.js';

/** Renders plain text and HTTPS Markdown images without interpreting handout HTML. */
function PinHandoutBody({body}){
 const source=String(body||'');
 const image=/!\[([^\]\n]{0,120})\]\((https:\/\/[^\s)]+)\)/g;
 const nodes=[];let offset=0;let match;
 while((match=image.exec(source))!==null){
  if(match.index>offset)nodes.push(<span key={'text'+offset}>{source.slice(offset,match.index)}</span>);
  nodes.push(<img key={'image'+match.index} src={match[2]} alt={match[1]}
   loading="lazy" referrerPolicy="no-referrer"/>);
  offset=image.lastIndex;
 }
 if(offset<source.length)nodes.push(<span key={'text'+offset}>{source.slice(offset)}</span>);
 return <div className="map-handout-bubble-body">{nodes.length?nodes:'No text'}</div>;
}
/** Map pins are separate from DM lighting geometry. Players receive only RLS-allowed pins. */
export default function MapPinLayer({map,scale,pins=[],isDM,editor,active=true,
 onCreate,onMove,onOpen,onRead,onCollect,onDelete,onSelect}){
 const [preview,setPreview]=useState({});
 const drag=useRef(null),skipClick=useRef(null),request=useRef(0);
 const [opened,setOpened]=useState(null),[note,setNote]=useState(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const selectedPin=pins.find(pin=>pin.id===opened&&pinVisibleTo(pin,isDM));
 useEffect(()=>{
  if(opened&&!selectedPin){setOpened(null);setNote(null);++request.current}
 },[opened,selectedPin]);
 const awaitingServer=useRef(new Map());
 // Keep the released location painted until the database refresh confirms it.
 // Removing the preview on pointerup made pins visibly snap back and jump.
 useEffect(()=>{
  setPreview(old=>{
   let changed=false;const next={...old};
   for(const [id,point] of awaitingServer.current){
    const saved=pins.find(pin=>pin.id===id);
    if(!saved||Math.abs(Number(saved.x)-point.x)<.011&&
       Math.abs(Number(saved.y)-point.y)<.011){
     awaitingServer.current.delete(id);
     if(id in next){delete next[id];changed=true}
    }
   }
   return changed?next:old;
  });
 },[pins]);
 useEffect(()=>{
  awaitingServer.current.clear();setPreview({});setOpened(null);setNote(null);++request.current;
 },[map?.id]);
 useEffect(()=>{
  if(!opened)return;
  const key=event=>{
   if(event.key==='Escape'){setOpened(null);setNote(null)}
  };
  document.addEventListener('keydown',key);
  return()=>document.removeEventListener('keydown',key);
 },[opened]);
 async function show(pin){
  onSelect?.(pin);
  if(opened===pin.id){setOpened(null);setNote(null);return}
  const serial=++request.current;
  setOpened(pin.id);setNote(null);setError('');
  try{
   const value=await onRead?.(pin);
   if(request.current!==serial)return;
   if(!value)throw Error('This handout is no longer available.');
   setNote(value);
  }catch(e){if(request.current===serial)setError(e?.message||String(e))}
 }
 async function action(job){
  if(busy)return;
  setBusy(true);setError('');
  try{await job()}catch(e){setError(e?.message||String(e))}
  finally{setBusy(false)}
 }
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
  const at=preview[pin.id]||pin;
  const d={id:pin.id,pointerId:event.pointerId,
   x:Number(at.x),y:Number(at.y),
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
  // Release coordinates are authoritative even if React has not painted the
  // most recent pointer-move preview yet.
  const next=cancel?{x:d.x,y:d.y}:normalizePinPosition(
   d.x+(event.clientX-d.startX)/cell,
   d.y+(event.clientY-d.startY)/cell,map);
  try{event.currentTarget.releasePointerCapture(event.pointerId)}catch{}
  if(!cancel&&(Math.abs(next.x-d.x)>.01||Math.abs(next.y-d.y)>.01)){
   skipClick.current=pin.id;
   awaitingServer.current.set(d.id,next);
   setPreview(prev=>({...prev,[d.id]:next}));
   // Database failure removes the local optimistic position, allowing retry.
   Promise.resolve().then(()=>onMove?.(pin,{x:next.x,y:next.y}))
    .catch(()=>{
     awaitingServer.current.delete(d.id);
     setPreview(prev=>{const copy={...prev};delete copy[d.id];return copy});
    });
  }else{
   setPreview(prev=>{const copy={...prev};delete copy[d.id];return copy});
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
    className={'map-handout-pin'+(opened===pin.id||editor?.selectedPinId===pin.id?' is-selected':'')+(!pin.visible?' is-hidden':'')+
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
     if(!drag.current)void show(pin)
    }}>
    <span aria-hidden="true">{pin.kind==='trap'?<svg
     viewBox="0 0 32 32" width="25" height="25" fill="none"
     stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"
     strokeLinecap="round">
     <path d="M7 13C5 7 10 4 16 4s11 3 9 9M7 19C5 25 10 28 16 28s11-3 9-9"/>
     <path d="m7 13 3-5 3 5 3-5 3 5 3-5 3 5M7 19l3 5 3-5 3 5 3-5 3 5"/>
     <circle cx="16" cy="16" r="3"/>
    </svg>:PIN_ICONS[pin.kind]||'📜'}</span>
    {isDM&&!pin.visible&&<span className="map-handout-hidden-dot" aria-hidden="true">◌</span>}
   </button>;
  })}
  {selectedPin&&<section className="map-handout-bubble" role="dialog"
   aria-label="Map handout preview"
   style={{
    left:Math.max(8,Math.min(Number(selectedPin.x)*cell+24,map.width*scale-330)),
    top:Math.max(8,Math.min(Number(selectedPin.y)*cell+24,map.height*scale-220))
   }} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
   <div className="map-handout-bubble-heading">
    <strong>{note?.title||'Handout'}</strong>
    <button type="button" className="secondary" aria-label="Close pin preview"
     onClick={()=>{setOpened(null);setNote(null)}}>×</button>
   </div>
   {error?<p role="alert" className="error small">{error}</p>:
    note?<PinHandoutBody body={note.body}/>:<p className="muted small">Loading handout…</p>}
   <div className="map-handout-bubble-actions">
    {isDM&&<>
     <button type="button" className="secondary" disabled={busy||!note}
      onClick={()=>onOpen?.(selectedPin)}>Edit handout</button>
     <button type="button" className="secondary map-handout-delete"
      disabled={busy} onClick={()=>{if(window.confirm('Remove this pin from the map?'))
       void action(async()=>{await onDelete?.(selectedPin);setOpened(null);setNote(null)})}}>
      Delete pin</button>
    </>}
    {!isDM&&selectedPin.collectable&&note&&!note.revealed&&
     <button type="button" disabled={busy} onClick={()=>void action(async()=>{
      await onCollect?.(selectedPin);setOpened(null);setNote(null);
     })}>Pick up · Save to Handouts</button>}
   </div>
  </section>}
 </div>;
}
