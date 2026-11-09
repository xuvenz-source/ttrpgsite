/**
 * World Engine V2 — exactly one injected requestAnimationFrame owner.
 *
 * Maps, fog, 500 sprites and all accepted routes share this scheduler.
 * No token, gesture, scene, or fog layer owns another timer or RAF.
 * A static map becomes completely idle after a single dirty paint.
 */
const noop=()=>{};
export function createWorldFrameScheduler({
 requestFrame=callback=>requestAnimationFrame(callback),
 cancelFrame=handle=>cancelAnimationFrame(handle),
 onFrame,onError=noop,maxDeltaMs=80
}={}){
 if(typeof requestFrame!=='function'||typeof cancelFrame!=='function'||
  typeof onFrame!=='function'||typeof onError!=='function'||
  !Number.isFinite(maxDeltaMs)||maxDeltaMs<8||maxDeltaMs>250)
  throw Error('Invalid V2 frame scheduler');
 let queued=null,inside=false,disposed=false,paused=false;
 let dirty=false,animating=false,lastNow=null;
 let frameCount=0,requestedCount=0,cancelledCount=0;
 function schedule(){
  if(disposed||paused||inside||queued!==null||(!dirty&&!animating))
   return;
  queued=requestFrame(frame);
  requestedCount++;
 }
 function frame(now){
  if(disposed||paused)return;
  queued=null;inside=true;
  const time=Number.isFinite(now)?now:0;
  const dt=lastNow===null?0:
   Math.max(0,Math.min(maxDeltaMs,time-lastNow));
  lastNow=time;
  const wasDirty=dirty;
  dirty=false;
  try{
   // The callback does one shared motion advance and paints only changed
   // layers/sprites, returning true only while a route still needs frames.
   animating=onFrame({now:time,deltaMs:dt,dirty:wasDirty})===true;
  }catch(error){
   animating=false;
   try{onError(error)}catch{}
  }finally{
   inside=false;frameCount++;schedule();
  }
 }
 return Object.freeze({
  invalidate(){if(disposed)return false;dirty=true;schedule();return true},
  wake(){if(disposed)return false;animating=true;dirty=true;schedule();return true},
  pause(){
   if(disposed||paused)return;
   paused=true;lastNow=null;
   if(queued!==null){cancelFrame(queued);queued=null;cancelledCount++}
  },
  resume(){
   if(disposed||!paused)return;
   paused=false;lastNow=null;dirty=true;schedule();
  },
  dispose(){
   if(disposed)return;
   disposed=true;paused=true;animating=false;dirty=false;lastNow=null;
   if(queued!==null){cancelFrame(queued);queued=null;cancelledCount++}
  },
  get stats(){return Object.freeze({
   frameCount,requestedCount,cancelledCount,
   scheduled:queued!==null,paused,disposed
  })},
  get disposed(){return disposed}
 });
}
