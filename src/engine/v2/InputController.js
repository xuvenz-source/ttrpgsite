/** Browser input adapter for a single V2 movement controller.
 * Does not import React, Supabase, or any existing movement engine.
 */
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
 // Pointer capture is not guaranteed (e.g. a detached element or browser
 // gesture takeover). Keep the move/up lifecycle on the owning document if
 // capture fails instead of silently losing every movement sample.
 const documentTarget=target.ownerDocument;
 const canUseDocument=documentTarget&&documentTarget!==target&&
  typeof documentTarget.addEventListener==='function'&&
  typeof documentTarget.removeEventListener==='function';
 let fallbackAttached=false;
 const detachFallback=()=>{
  if(!fallbackAttached)return;
  fallbackAttached=false;
  documentTarget.removeEventListener('pointermove',move,true);
  documentTarget.removeEventListener('pointerup',up,true);
  documentTarget.removeEventListener('pointercancel',cancel,true);
 };
 const attachFallback=()=>{
  if(!canUseDocument||fallbackAttached)return;
  fallbackAttached=true;
  documentTarget.addEventListener('pointermove',move,{capture:true,passive:false});
  documentTarget.addEventListener('pointerup',up,{capture:true,passive:false});
  documentTarget.addEventListener('pointercancel',cancel,true);
 };
 const heldArrows=new Set();
 const clearKeyboardTimer=()=>{
  if(keyboardTimer!==null)clearTimer(keyboardTimer);
  keyboardTimer=null;
 };
 const finishKeyboard=()=>{
  clearKeyboardTimer();
  if(!keyboardCursor)return;
  keyboardCursor=null;heldArrows.clear();
  void controller.endGesture();
 };
 const point=event=>{
  try{return pointFromEvent(event)}catch{return null}
 };
 const release=()=>{
  const id=activePointer;activePointer=null;
  pointerOffset=null;activePick=null;lastMoveEvent=null;detachFallback();
  if(id!==null)try{
   if(target.hasPointerCapture?.(id))target.releasePointerCapture?.(id);
  }catch{}
 };
 const down=event=>{
  if(event.button!==0||event.isPrimary===false)return;
  if(activePointer!==null||controller.active){
   onPointerStatus(event,'busy');return;
  }
  const p=point(event);
  if(!p){onPointerStatus(event,'point');return}
  const picked=resolveSelection(event,p);
  if(!picked?.origin){onPointerStatus(event,'selection');return}
  const originPoint=Object.freeze({x:picked.origin.x,y:picked.origin.y});
  if(!controller.beginGesture({...picked,pointer:originPoint,
   mode:picked.mode==='preview'?'preview':
    event.pointerType==='touch'?'touch':'drag'})){
   onPointerStatus(event,'begin');return;
  }
  onPointerStatus(event,'grabbed');
  // Grab offset is fixed at pointer-down. Without it, clicking the middle
  // of a wide token snaps the anchor to the cursor's top-left grid cell.
  pointerOffset={x:originPoint.x-p.x,y:originPoint.y-p.y};
  activePick=picked;
  activePointer=event.pointerId;
  let captured=false;
  try{
   if(typeof target.setPointerCapture==='function'){
    target.setPointerCapture(event.pointerId);
    captured=target.hasPointerCapture?.(event.pointerId)!==false;
   }
  }catch{}
  if(!captured)attachFallback();
  event.preventDefault?.();
 };
 const move=event=>{
  if(activePointer===null||event.pointerId!==activePointer||
   event===lastMoveEvent)return;
  lastMoveEvent=event;
  const samples=event.getCoalescedEvents?.();
  for(const sample of Array.isArray(samples)&&samples.length?samples:[event]){
   const p=point(sample);
   if(p)controller.updateGesture({
    x:p.x+(pointerOffset?.x??0),
    y:p.y+(pointerOffset?.y??0)
   });
  }
  if(!controller.active)release();
  event.preventDefault?.();
 };
 const up=event=>{
  if(activePointer===null||event.pointerId!==activePointer)return;
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
  release();controller.cancelGesture('pointer-cancel');
 };
 const lost=event=>{
  if(activePointer===null||event.pointerId!==activePointer)return;
  // Losing capture during a real drag should not leave an unfinishable
  // gesture. The document fallback keeps its matching release observable.
  if(canUseDocument){attachFallback();return}
  release();controller.cancelGesture('lost-capture');
  onPointerStatus(event,'lost-capture');
 };
 const nativeDragStart=event=>{
  // Map sprites move through Pointer Events, not the browser HTML5 DnD
  // machinery. Do not interfere with drops arriving from the Units panel.
  if(event.target?.closest?.('[data-world-kind][data-world-id]'))
   event.preventDefault?.();
 };
 const blur=()=>{
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
   // Capture before a child React portal or overlay stops bubbling. The
   // resolver still enforces server sight, control and editor permissions.
   target.addEventListener('pointerdown',down,{capture:true,passive:false});
   target.addEventListener('pointermove',move,{passive:false});
   target.addEventListener('pointerup',up,{passive:false});
   target.addEventListener('pointercancel',cancel);
   target.addEventListener('lostpointercapture',lost);
   target.addEventListener('dragstart',nativeDragStart,{capture:true});
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
   target.removeEventListener('pointerdown',down,true);
   target.removeEventListener('pointermove',move);
   target.removeEventListener('pointerup',up);
   target.removeEventListener('pointercancel',cancel);
   target.removeEventListener('lostpointercapture',lost);
   target.removeEventListener('dragstart',nativeDragStart,true);
   keyboardTarget.removeEventListener('keydown',key);
   keyboardTarget.removeEventListener('keyup',keyup);
   blurTarget.removeEventListener('blur',blur);
  },
  get mounted(){return mounted}
 };
}
