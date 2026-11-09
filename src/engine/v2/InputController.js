/** Browser input adapter for a single V2 movement controller.
 * Does not import React, Supabase, or any existing movement engine.
 */
const arrows={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
const editable=target=>!!target&&(target.isContentEditable===true||
 /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName||'')||
 typeof target.closest==='function'&&!!target.closest('[contenteditable="true"],[role="textbox"]'));
export function createInputController({
 target,controller,pointFromEvent,resolveSelection,
 keyboardTarget=typeof window==='undefined'?target:window
}={}){
 if(!target?.addEventListener||!target?.removeEventListener||
  !keyboardTarget?.addEventListener||!keyboardTarget?.removeEventListener||
  !controller||typeof pointFromEvent!=='function'||
  typeof resolveSelection!=='function')throw Error('Invalid V2 input adapter');
 let mounted=false,activePointer=null;
 const point=event=>{
  try{return pointFromEvent(event)}catch{return null}
 };
 const release=()=>{
  const id=activePointer;activePointer=null;
  if(id!==null)try{
   if(target.hasPointerCapture?.(id))target.releasePointerCapture?.(id);
  }catch{}
 };
 const down=event=>{
  if(activePointer!==null||controller.active||event.button!==0)return;
  const p=point(event);if(!p)return;
  const picked=resolveSelection(event,p);
  if(!picked||!controller.beginGesture({...picked,pointer:p,
   mode:event.pointerType==='touch'?'touch':'drag'}))return;
  activePointer=event.pointerId;
  try{target.setPointerCapture?.(event.pointerId)}catch{}
  event.preventDefault?.();
 };
 const move=event=>{
  if(activePointer===null||event.pointerId!==activePointer)return;
  const samples=event.getCoalescedEvents?.();
  for(const sample of Array.isArray(samples)&&samples.length?samples:[event]){
   const p=point(sample);
   if(p)controller.updateGesture(p);
  }
  if(!controller.active)release();
  event.preventDefault?.();
 };
 const up=event=>{
  if(activePointer===null||event.pointerId!==activePointer)return;
  const p=point(event);
  if(p)controller.updateGesture(p);
  release();
  void controller.endGesture();
  event.preventDefault?.();
 };
 const cancel=event=>{
  if(activePointer===null||event?.pointerId!==activePointer)return;
  release();controller.cancelGesture('pointer-cancel');
 };
 const lost=event=>{
  if(activePointer!==null&&event.pointerId===activePointer){
   activePointer=null;controller.cancelGesture('lost-capture');
  }
 };
 const blur=()=>{
  if(activePointer!==null){release();controller.cancelGesture('blur')}
 };
 const key=event=>{
  if(event.key==='Escape'&&controller.active){
   release();controller.cancelGesture('user');event.preventDefault?.();return;
  }
  const delta=arrows[event.key];
  if(!delta||event.defaultPrevented||editable(event.target)||
   activePointer!==null||controller.active)return;
  const picked=resolveSelection(event,null,{keyboard:true});
  const origin=picked?.origin;
  if(!origin||!controller.beginGesture({...picked,pointer:origin,mode:'keyboard'}))return;
  controller.updateGesture({x:origin.x+delta[0],y:origin.y+delta[1]});
  void controller.endGesture();
  event.preventDefault?.();
 };
 return {
  mount(){
   if(mounted)return;mounted=true;
   target.addEventListener('pointerdown',down,{passive:false});
   target.addEventListener('pointermove',move,{passive:false});
   target.addEventListener('pointerup',up,{passive:false});
   target.addEventListener('pointercancel',cancel);
   target.addEventListener('lostpointercapture',lost);
   keyboardTarget.addEventListener('keydown',key);
   keyboardTarget.addEventListener('blur',blur);
  },
  unmount(){
   if(!mounted)return;
   mounted=false;release();controller.cancelGesture('unmount');
   target.removeEventListener('pointerdown',down);
   target.removeEventListener('pointermove',move);
   target.removeEventListener('pointerup',up);
   target.removeEventListener('pointercancel',cancel);
   target.removeEventListener('lostpointercapture',lost);
   keyboardTarget.removeEventListener('keydown',key);
   keyboardTarget.removeEventListener('blur',blur);
  },
  get mounted(){return mounted}
 };
}
