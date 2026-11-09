/**
 * World Engine V2 — one receive-only private scene-publication topic per map.
 * No token-position subscriptions, no polling, no per-cell updates, no
 * independent animation loop. DM draft edits never trigger this channel.
 *
 * Reconnect and lost notices are resolved through the server's persisted
 * sceneGeneration; an event is only an invalidation hint, NEVER geometry.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const worldSceneTopic=mapId=>'forge-world-scene-v2:'+mapId;
export const WORLD_SCENE_EVENT='scene-revision-v2';
const validNotice=(notice,mapId)=>notice?.version===2&&
 notice.mapId===mapId&&Number.isSafeInteger(notice.sceneGeneration)&&
 notice.sceneGeneration>=0&&Object.keys(notice).every(key=>
 ['version','mapId','sceneGeneration'].includes(key));

export function createSceneTransport({
 db,mapId,sceneManager,onError=()=>{},onState=()=>{}
}={}){
 if(typeof mapId!=='string'||!UUID.test(mapId)||!db?.channel||
  !db?.removeChannel||!db?.rpc||!sceneManager||
  sceneManager.mapId!==mapId||typeof sceneManager.load!=='function'||
  typeof onError!=='function'||typeof onState!=='function')
  throw Error('Invalid V2 scene transport');
 let started=false,disposed=false,online=false,channel=null;
 let loading=null,needsRefresh=false,target=0,epoch=0;
 const emit=reason=>{try{onState({reason,online,stale:sceneManager.stale})}catch{}};
 async function pump(){
  if(disposed||!started||!online)return false;
  needsRefresh=true;
  if(loading)return loading;
  const currentEpoch=epoch;
  const task=(async()=>{
   let result=false,attempts=0;
   while(!disposed&&online&&epoch===currentEpoch&&needsRefresh&&attempts<4){
    needsRefresh=false;attempts++;
    result=await sceneManager.load();
    if(!result&&sceneManager.stale){
     // Do not spin forever on invalid permissions or a DB outage.
     if(attempts>=4)break;
    }
    if(sceneManager.sceneGeneration===null||
     sceneManager.sceneGeneration<target)
     needsRefresh=true;
   }
   if(attempts>=4&&needsRefresh){
    needsRefresh=false;
    const error=Error('V2 scene publication refresh requires retry');
    try{onError(error)}catch{}
   }
   emit(result&&!sceneManager.stale?'scene-current':'scene-stale');
   return result&&!sceneManager.stale;
  })().finally(()=>{if(loading===task)loading=null});
  loading=task;
  return task;
 }
 function notice(event){
  if(disposed||!online)return;
  const value=event?.payload;
  if(!validNotice(value,mapId)){
   sceneManager.invalidate('invalid-scene-notice');
   void pump();return;
  }
  if(sceneManager.sceneGeneration!==null&&!sceneManager.stale&&
   value.sceneGeneration<=sceneManager.sceneGeneration)return;
  target=Math.max(target,value.sceneGeneration);
  sceneManager.notifyPublication(value);
  needsRefresh=true;
  void pump();
 }
 return Object.freeze({
  async start(){
   if(disposed)return false;
   if(started)return true;
   started=true;
   try{
    if(db.realtime?.setAuth)await db.realtime.setAuth();
    if(disposed||!started)return false;
    channel=db.channel(worldSceneTopic(mapId),
     {config:{private:true,broadcast:{self:false,ack:false}}});
    channel.on('broadcast',{event:WORLD_SCENE_EVENT},notice);
    channel.subscribe(status=>{
     if(disposed)return;
     if(status==='SUBSCRIBED'){
      online=true;epoch++;
      sceneManager.invalidate('scene-subscribed');
      needsRefresh=true;void pump();
     }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
      online=false;epoch++;
      sceneManager.invalidate('scene-disconnected');
      emit('disconnected');
     }
    });
    return true;
   }catch(error){
    started=false;sceneManager.invalidate('scene-connect-failed');
    try{onError(error)}catch{}
    return false;
   }
  },
  reload(){
   if(disposed||!online)return Promise.resolve(false);
   sceneManager.invalidate('scene-manual-reload');
   needsRefresh=true;return pump();
  },
  async dispose(){
   if(disposed)return;
   disposed=true;started=false;online=false;epoch++;
   needsRefresh=false;
   sceneManager.invalidate('scene-disposed');
   const prior=channel;channel=null;
   if(prior)await db.removeChannel(prior);
  },
  get online(){return online},
  get topic(){return worldSceneTopic(mapId)}
 });
}
