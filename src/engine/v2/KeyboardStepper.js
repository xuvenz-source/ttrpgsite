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
  typeof clearTimer!=='function'||!Number.isSafeInteger(idleMs)||
  idleMs<0||idleMs>1000||!Number.isSafeInteger(maxQueued)||
  maxQueued<1||maxQueued>64)throw Error('Invalid V2 keyboard stepper');
 let cursor=null,timer=null,finishing=null,finishingRuntime=null,disposed=false;
 let gesturePick=null,resumePick=null;
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
   // Never replay a prior map/viewer's input through a replacement runtime.
   if(runtime!==finishingRuntime||queued.length>=maxQueued)return false;
   queued.push([dx,dy]);return true;
  }
  if(cursor&&!runtime.movement.active)cursor=null;
  if(!cursor){
   if(runtime.movement.active)return false;
   onFocus();
   const picked=resumePick||makePick(runtime);
   resumePick=null;
   const scene=runtime.sceneManager.displayedScene,frame=runtime.visibility.frame;
   if(!picked?.origin||!scene||!frame)return false;
   if(!runtime.movement.beginGesture({
    ...picked,pointer:picked.origin,mode:picked.mode==='preview'?'preview':'keyboard',
    environmentRevision:scene.revision,
    permissionGeneration:frame.permissionGeneration
   }))return false;
   cursor={...picked.origin};
   gesturePick={mapId:picked.mapId,mode:picked.mode,
    selection:picked.selection?.map(p=>({kind:p.kind,id:p.id}))};
  }
  const to={x:cursor.x+dx,y:cursor.y+dy};
  if(!runtime.movement.updateGesture(to)){cursor=null;return false}
  cursor=to;return true;
 }
 function finish(){
  clearIdle();
  if(disposed||!cursor)return;
  cursor=null;
  const previousPick=gesturePick;gesturePick=null;resumePick=null;
  const runtime=getRuntime();
  if(!runtime?.active)return;
  const task=Promise.resolve(runtime.movement.endGesture()).catch(()=>null);
  finishing=task;finishingRuntime=runtime;
  void task.then(async result=>{
   if(disposed||finishing!==task)return;
   // No queued arrow may start from a failed, revoked, uncertain or
   // different-map commit. The next anchor MUST come from fresh sight.
   if(result?.status!=='committed'||getRuntime()!==runtime||!runtime.active){
    queued.length=0;finishing=null;finishingRuntime=null;return;
   }
   if(queued.length){
    let ready=false;
    try{ready=await runtime.refreshVisibility?.('keyboard-continuation')===true}
    catch{}
    if(disposed||finishing!==task)return;
    // A successful refresh may still be an older signed cursor. Validate
    // the next canonical actor anchor AND the same group before replaying.
    onFocus();
    let pick=null;
    try{if(ready&&getRuntime()===runtime&&runtime.active)
     pick=makePick(runtime)}
    catch{};
    const endpoint=result.endpoint;
    const sameGroup=Array.isArray(previousPick?.selection)&&
     Array.isArray(pick?.selection)&&
     previousPick.selection.length===pick.selection.length&&
     previousPick.selection.every((p,i)=>p.kind===pick.selection[i]?.kind&&
      p.id===pick.selection[i]?.id);
    if(!ready||!pick?.origin||!Number.isSafeInteger(endpoint?.x)||
     !Number.isSafeInteger(endpoint?.y)||
     pick.origin.x!==endpoint.x||pick.origin.y!==endpoint.y||
     pick.mapId!==previousPick?.mapId||pick.mode!==previousPick?.mode||
     !sameGroup||getRuntime()!==runtime||!runtime.active){
     queued.length=0;finishing=null;finishingRuntime=null;return;
    }
    resumePick=pick;
   }
   finishing=null;finishingRuntime=null;
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
   finishingRuntime=null;gesturePick=null;resumePick=null;
   if(cursor)getRuntime()?.movement.cancelGesture('keyboard-unmount');
   cursor=null;
  },
  get queueLength(){return queued.length},
  get moving(){return cursor!==null||finishing!==null}
 });
}
