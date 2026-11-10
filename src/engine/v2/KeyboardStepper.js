/**
 * World V2 keyboard gesture buffering. Real and DM-preview movement share
 * the same locally responsive held gesture; a rapid follow-up key press is
 * queued while the previous authorized commit completes rather than lost.
 * No position is written here. MovementController still owns every grant.
 */
export function createWorldKeyboardStepper({
 getRuntime,makePick,onFocus=()=>{},
 setTimer=(fn,ms)=>setTimeout(fn,ms),
 clearTimer=id=>clearTimeout(id),
 idleMs=180,maxQueued=24
}={}){
 if(typeof getRuntime!=='function'||typeof makePick!=='function'||
  typeof onFocus!=='function'||typeof setTimer!=='function'||
  typeof clearTimer!=='function')throw Error('Invalid V2 keyboard stepper');
 let cursor=null,timer=null,finishing=null,disposed=false;
 const queued=[];
 const clearIdle=()=>{
  if(timer!==null)clearTimer(timer);
  timer=null;
 };
 function send(dx,dy){
  if(disposed||!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy)||
   Math.abs(dx)+Math.abs(dy)!==1)return false;
  const runtime=getRuntime();
  if(!runtime?.active)return false;
  if(finishing){
   if(queued.length>=maxQueued)return false;
   queued.push([dx,dy]);return true;
  }
  if(cursor&&!runtime.movement.active)cursor=null;
  if(!cursor){
   if(runtime.movement.active)return false;
   onFocus();
   const picked=makePick(runtime);
   const scene=runtime.sceneManager.displayedScene,frame=runtime.visibility.frame;
   if(!picked?.origin||!scene||!frame)return false;
   if(!runtime.movement.beginGesture({
    ...picked,pointer:picked.origin,mode:picked.mode==='preview'?'preview':'keyboard',
    environmentRevision:scene.revision,
    permissionGeneration:frame.permissionGeneration
   }))return false;
   cursor={...picked.origin};
  }
  const to={x:cursor.x+dx,y:cursor.y+dy};
  if(!runtime.movement.updateGesture(to)){cursor=null;return false}
  cursor=to;return true;
 }
 function finish(){
  clearIdle();
  if(disposed||!cursor)return;
  cursor=null;
  const runtime=getRuntime();
  if(!runtime)return;
  const task=Promise.resolve(runtime.movement.endGesture()).catch(()=>null);
  finishing=task;
  void task.then(async()=>{
   if(disposed||finishing!==task)return;
   // The next movement starts from a new server-authorized canonical
   // position after the previous one commits (or preview virtual position).
   if(queued.length)try{
    await runtime.refreshVisibility?.('keyboard-continuation');
   }catch{}
   if(disposed||finishing!==task)return;
   finishing=null;
   const pending=queued.splice(0);
   for(const [dx,dy] of pending)if(!send(dx,dy))break;
   if(cursor)timer=setTimer(finish,idleMs);
  });
 }
 return Object.freeze({
  step(dx,dy,{release=false}={}){
   if(disposed)return false;
   if(release){
    if(!cursor)return finishing!==null;
    clearIdle();timer=setTimer(finish,idleMs);
    return true;
   }
   clearIdle();
   return send(dx,dy);
  },
  dispose(){
   disposed=true;clearIdle();queued.length=0;
   if(cursor)getRuntime()?.movement.cancelGesture('keyboard-unmount');
   cursor=null;
  },
  get queueLength(){return queued.length},
  get moving(){return cursor!==null||finishing!==null}
 });
}
