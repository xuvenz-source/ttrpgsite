/** Browser input adapter for a single V2 movement controller.
 * Does not import React, Supabase, or any existing movement engine.
 */
import {worldV2Trace} from './WorldTrace.js';
import {claimWorldPointerDown} from './WorldPointerOwnership.js';
const arrows={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
const editable=target=>!!target&&(target.isContentEditable===true||
 /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName||'')||
 typeof target.closest==='function'&&!!target.closest('[contenteditable="true"],[role="textbox"]'));
export function createInputController({
 target,controller,pointFromEvent,resolveSelection,
 onPointerRelease=()=>false,onPointerStatus=()=>{},
 keyboardTarget=typeof window==='undefined'?target:window,
 blurTarget=typeof window==='undefined'?keyboardTarget:window,
 setTimer=(fn,delay)=>setTimeout(fn,delay),
 clearTimer=handle=>clearTimeout(handle),keyboardIdleMs=90
}={}){
 if(!target?.addEventListener||!target?.removeEventListener||
  !keyboardTarget?.addEventListener||!keyboardTarget?.removeEventListener||
  !blurTarget?.addEventListener||!blurTarget?.removeEventListener||
  !controller||typeof pointFromEvent!=='function'||
  typeof resolveSelection!=='function'||
  typeof onPointerRelease!=='function'||
  typeof onPointerStatus!=='function')throw Error('Invalid V2 input adapter');
 let mounted=false,activePointer=null,keyboardCursor=null,keyboardTimer=null;
 let pointerOffset=null,activePick=null,lastMoveEvent=null;
 // Listen on the owning document in capture phase. React delegates events
 // above the map viewport, so a child portal/editor can stop propagation
 // BEFORE a native viewport capture listener ever sees the pointerdown.
 // A document-capture listener runs first, stays alive across map bounds,
 // and hears pointerup/cancel even if pointer capture was transferred.
 const root=target.ownerDocument?.addEventListener&&
  target.ownerDocument?.removeEventListener?target.ownerDocument:target;
 const withinMap=event=>root===target||
  target.contains?.(event.target)===true||
  (typeof event.composedPath==='function'&&event.composedPath().includes(target));
 const heldArrows=new Set();
 const status=(event,code)=>{
  worldV2Trace.event('input.pointer.status',code);
  onPointerStatus(event,code);
 };
 const clearKeyboardTimer=()=>{
  if(keyboardTimer!==null)clearTimer(keyboardTimer);
  keyboardTimer=null;
 };
 const finishKeyboard=()=>{
  clearKeyboardTimer();
  if(!keyboardCursor)return;
  keyboardCursor=null;heldArrows.clear();
  worldV2Trace.event('input.keyboard.end');
  void controller.endGesture();
 };
 const point=event=>{
  try{return pointFromEvent(event)}catch{return null}
 };
 const release=()=>{
  const id=activePointer;activePointer=null;
  pointerOffset=null;activePick=null;lastMoveEvent=null;
  if(id!==null)try{
   if(target.hasPointerCapture?.(id))target.releasePointerCapture?.(id);
  }catch{}
 };
 const down=event=>{
  if(event.button!==0||event.isPrimary===false||!withinMap(event))return;
  if(activePointer!==null||controller.active){
   status(event,'busy');return;
  }
  const p=point(event);
  if(!p){status(event,'point');return}
  const picked=resolveSelection(event,p);
  if(!picked?.origin){status(event,'selection');return}
  const originPoint=Object.freeze({x:picked.origin.x,y:picked.origin.y});
  if(!controller.beginGesture({...picked,pointer:originPoint,
   mode:picked.mode==='preview'?'preview':
    event.pointerType==='touch'?'touch':'drag'})){
   status(event,'begin');return;
  }
  claimWorldPointerDown(event);
  status(event,'grabbed');
  worldV2Trace.event('input.pointer.start',picked.mode==='preview'?'preview':
   event.pointerType==='touch'?'touch':'drag');
  // Grab offset is fixed at pointer-down. Without it, clicking the middle
  // of a wide token snaps the anchor to the cursor's top-left grid cell.
  pointerOffset={x:originPoint.x-p.x,y:originPoint.y-p.y};
  activePick=picked;
  activePointer=event.pointerId;
  // Capture is a browser convenience, not a lifecycle requirement:
  // document-capture still receives every move/up/cancel.
  try{target.setPointerCapture?.(event.pointerId)}catch{}
  event.preventDefault?.();
 };
 const move=event=>{
  if(activePointer===null||event.pointerId!==activePointer||
   event===lastMoveEvent)return;
  lastMoveEvent=event;
  // R18-39: privacy-safe, opt-in aggregate counters. No raw points, ids,
  // URLs or input event payloads leave this local QA report.
  const complete=worldV2Trace.enabled?
   worldV2Trace.begin('input.pointer.processing'):null;
  const samples=event.getCoalescedEvents?.();
  const points=[];
  for(const sample of Array.isArray(samples)&&samples.length?samples:[event]){
   const p=point(sample);
   if(p)points.push({
    x:p.x+(pointerOffset?.x??0),
    y:p.y+(pointerOffset?.y??0)
   });
  }
  // Count batches without overflowing the bounded timeline. The values
  // describe input shape, not the private geometry or authorized route.
  worldV2Trace.count('input.pointer.move-events');
  worldV2Trace.count('input.pointer.samples',points.length);
  if(points.length>1){
   worldV2Trace.count('input.pointer.batches');
   worldV2Trace.count('input.pointer.batched-samples',points.length);
  }else if(points.length===1)worldV2Trace.count('input.pointer.single-events');
  // One browser event cannot paint its intermediate coalesced positions.
  // Retain all grid turns and hysteresis samples in the controller, but
  // evaluate costly visual prediction only for the last visible pointer.
  // Older adapters/test doubles retain the original sequential API.
  if(points.length>1&&typeof controller.updateGestureSamples==='function')
   controller.updateGestureSamples(points);
  else for(const p of points)controller.updateGesture(p);
  complete?.();
  if(!controller.active)release();
  event.preventDefault?.();
 };
 const up=event=>{
  if(activePointer===null||event.pointerId!==activePointer)return;
  worldV2Trace.event('input.pointer.end');
  const p=point(event);
  let intercepted=false;
  try{intercepted=onPointerRelease(event,activePick,p)===true}catch{}
  if(intercepted){
   release();controller.cancelGesture('tool-handoff');
  }else{
   if(p)controller.updateGesture({
    x:p.x+(pointerOffset?.x??0),
    y:p.y+(pointerOffset?.y??0)
   });
   release();void controller.endGesture();
  }
  event.preventDefault?.();
 };
 const cancel=event=>{
  if(activePointer===null||event?.pointerId!==activePointer)return;
  worldV2Trace.event('input.pointer.cancel');
  release();controller.cancelGesture('pointer-cancel');
 };
 const lost=event=>{
  if(activePointer===null||event.pointerId!==activePointer)return;
  // The document listener continues a gesture after capture migrates.
  if(root!==target)return;
  release();controller.cancelGesture('lost-capture');
  status(event,'lost-capture');
 };
 const nativeDragStart=event=>{
  // Map sprites move through Pointer Events, not the browser HTML5 DnD
  // machinery. Do not interfere with drops arriving from the Units panel.
  if(withinMap(event)&&
   event.target?.closest?.('[data-world-kind][data-world-id]'))
   event.preventDefault?.();
 };
 const blur=()=>{
  if(activePointer!==null)worldV2Trace.event('input.pointer.blur');
  clearKeyboardTimer();heldArrows.clear();keyboardCursor=null;
  if(activePointer!==null)release();
  if(controller.active)controller.cancelGesture('blur');
 };
 const key=event=>{
  if(event.key==='Escape'&&controller.active){
   release();clearKeyboardTimer();heldArrows.clear();keyboardCursor=null;
   controller.cancelGesture('user');event.preventDefault?.();return;
  }
  const delta=arrows[event.key];
  if(!delta||event.defaultPrevented||editable(event.target)||activePointer!==null)return;
  if(!keyboardCursor){
   if(controller.active)return;
   const picked=resolveSelection(event,null,{keyboard:true});
   const origin=picked?.origin;
   if(!origin||!controller.beginGesture({...picked,pointer:origin,
    mode:picked.mode==='preview'?'preview':'keyboard'}))return;
   keyboardCursor={x:origin.x,y:origin.y};
   worldV2Trace.event('input.keyboard.start',picked.mode==='preview'?'preview':'keyboard');
  }
  clearKeyboardTimer();heldArrows.add(event.key);
  keyboardCursor={x:keyboardCursor.x+delta[0],y:keyboardCursor.y+delta[1]};
  if(!controller.updateGesture(keyboardCursor)){
   clearKeyboardTimer();heldArrows.clear();keyboardCursor=null;return;
  }
  event.preventDefault?.();
 };
 const keyup=event=>{
  if(!arrows[event.key]||!keyboardCursor)return;
  heldArrows.delete(event.key);
  if(!heldArrows.size){
   clearKeyboardTimer();
   keyboardTimer=setTimer(()=>{
    keyboardTimer=null;
    if(!heldArrows.size)finishKeyboard();
   },keyboardIdleMs);
  }
  event.preventDefault?.();
 };
 return {
  mount(){
   if(mounted)return;mounted=true;
   // A single scoped capture pipeline; only pointerdown inside the map may
   // begin an authorized gesture. Moves/releases are pointerId-matched.
   root.addEventListener('pointerdown',down,{capture:true,passive:false});
   root.addEventListener('pointermove',move,{capture:true,passive:false});
   root.addEventListener('pointerup',up,{capture:true,passive:false});
   root.addEventListener('pointercancel',cancel,true);
   target.addEventListener('lostpointercapture',lost);
   root.addEventListener('dragstart',nativeDragStart,true);
   keyboardTarget.addEventListener('keydown',key);
   keyboardTarget.addEventListener('keyup',keyup);
   // Board delegates arrows to the app and supplies a no-op keyboard
   // target. Blur must still reach the real window to prevent a stuck drag.
   blurTarget.addEventListener('blur',blur);
  },
  unmount(){
   if(!mounted)return;
   mounted=false;release();clearKeyboardTimer();heldArrows.clear();keyboardCursor=null;
   controller.cancelGesture('unmount');
   root.removeEventListener('pointerdown',down,true);
   root.removeEventListener('pointermove',move,true);
   root.removeEventListener('pointerup',up,true);
   root.removeEventListener('pointercancel',cancel,true);
   target.removeEventListener('lostpointercapture',lost);
   root.removeEventListener('dragstart',nativeDragStart,true);
   keyboardTarget.removeEventListener('keydown',key);
   keyboardTarget.removeEventListener('keyup',keyup);
   blurTarget.removeEventListener('blur',blur);
  },
  get mounted(){return mounted}
 };
}
