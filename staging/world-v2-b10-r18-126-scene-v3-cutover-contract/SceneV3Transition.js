/**
 * B10-R18-126 / DORMANT ONLY. Do not import into release-pinned src/.
 * Proof-of-integration contract for a future all-at-once V3 scene cutover.
 * No V2 shared-channel fallback. No timers, movement hooks or polling.
 *
 * Its host MUST synchronously mask the entire campaign view in onLock,
 * and synchronously reveal only a fresh, server-authorized scene on onAllow.
 * R123 teardown, Realtime subscriber cleanup and signed asset eviction are
 * additional mandatory host responsibilities, not implemented here.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const R126_LIVE_ENABLED=false;
export const SCENE_V3_EVENT='scene-revision-v2'; // unchanged scene payload protocol
const allowedKeys=['version','mapId','sceneGeneration','id'];
const error=code=>Object.assign(new Error('Scene access unavailable'),{code});
const safeCall=(fn,...args)=>{try{fn(...args)}catch{}};
const isFn=fn=>typeof fn==='function';
const strictTopic=(x,mapId,viewerId)=>{
 if(typeof x!=='string'||x.split(':').length!==4)return false;
 const [prefix,map,actor,epoch]=x.split(':');
 return prefix==='forge-world-scene-v3'&&UUID.test(map)&&UUID.test(actor)&&
  UUID.test(epoch)&&map.toLowerCase()===mapId.toLowerCase()&&
  actor.toLowerCase()===viewerId.toLowerCase();
};
const validNotice=(x,mapId)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&
 x.version===2&&x.mapId===mapId&&
 Number.isSafeInteger(x.sceneGeneration)&&x.sceneGeneration>=0&&
 Object.keys(x).every(key=>allowedKeys.includes(key));

export function createSceneV3Transition({
 db,mapId,viewerId,sceneManager,onLock,onAllow,
 onDenied=()=>{},onState=()=>{},onError=()=>{}
}={}){
 if(!UUID.test(mapId||'')||!UUID.test(viewerId||'')||
  !db?.auth?.getUser||!db?.rpc||!db?.channel||!db?.removeChannel||
  !sceneManager||sceneManager.mapId!==mapId||
  !isFn(sceneManager.load)||!isFn(sceneManager.invalidate)||
  !isFn(onLock)||!isFn(onAllow)||!isFn(onDenied)||
  !isFn(onState)||!isFn(onError))throw error('invalid_configuration');

 let disposed=false,revision=0,channel=null,topic='',online=false;
 let phase='closed',lastGeneration=-1,load=null,dirty=false;
 const snapshot=()=>Object.freeze({
  phase,authorized:phase==='authorized',connected:online,
  disposed,hasTopic:!!topic,revision
 });
 function mask(reason){
  phase='locked';online=false;
  sceneManager.invalidate('scene-v3-'+reason);
  const result=onLock(Object.freeze({reason}));
  if(result&&typeof result.then==='function'){
   void Promise.resolve(result).catch(()=>{});
   throw error('asynchronous_mask');
  }
  safeCall(onState,snapshot());
 }
 function deny(reason){
  mask(reason);
  safeCall(onDenied,Object.freeze({reason}));
 }
 const active=(n,c)=>!disposed&&revision===n&&channel===c;
 function clearOld(){
  const previous=channel;
  channel=null;topic='';online=false;lastGeneration=-1;
  dirty=false;load=null;
  if(previous)void Promise.resolve(db.removeChannel(previous))
   .catch(err=>safeCall(onError,err));
 }
 async function pump(n,c){
  if(!active(n,c)||!online)return false;
  dirty=true;
  if(load)return load;
  const work=(async()=>{
   let tries=0;
   while(active(n,c)&&online&&dirty&&tries<4){
    dirty=false;tries++;
    let ok=false;
    try{ok=await sceneManager.load();}
    catch(e){safeCall(onError,e);}
    if(!active(n,c)||!online)return false;
    if(!ok||sceneManager.stale){
     // Failed fresh server authorization must never retain old render data.
     deny('scene-read-denied');
     return false;
    }
    if(phase!=='authorized'){
     try{
      const result=onAllow(Object.freeze({reason:'fresh-scene-authorized'}));
      if(result&&typeof result.then==='function')throw error('asynchronous_reveal');
      phase='authorized';
      safeCall(onState,snapshot());
     }catch(e){
      safeCall(onError,e);
      deny('reveal-failed');return false;
     }
    }
    if(lastGeneration>=0&&sceneManager.sceneGeneration!==null&&
       sceneManager.sceneGeneration<lastGeneration)dirty=true;
   }
   if(dirty&&active(n,c))deny('scene-generation-stale');
   return active(n,c)&&online&&phase==='authorized';
  })().finally(()=>{if(load===work)load=null});
  load=work;return work;
 }
 function notice(event,n,c){
  if(!active(n,c)||!online)return;
  const payload=event?.payload;
  if(!validNotice(payload,mapId)){
   safeCall(onError,error('invalid_notice'));
   // An untrusted event cannot grant or revoke access by itself.
   // Invalidate/reload through the server, not any packet geometry.
   sceneManager.invalidate('scene-v3-invalid-notice');
   void pump(n,c);return;
  }
  if(sceneManager.sceneGeneration!==null&&!sceneManager.stale&&
   payload.sceneGeneration<=sceneManager.sceneGeneration)return;
  lastGeneration=Math.max(lastGeneration,payload.sceneGeneration);
  sceneManager.notifyPublication?.(payload);
  void pump(n,c);
 }
 async function enter(){
  if(disposed)throw error('disposed');
  const n=++revision;
  mask('revalidating');
  clearOld();
  try{
   // A campaign ID, local DM hint, presence, or cached topic is not proof.
   const identity=await db.auth.getUser();
   if(disposed||revision!==n)return false;
   if(identity?.error||identity?.data?.user?.id!==viewerId){
    deny('identity-unverified');return false;
   }
   if(db.realtime?.setAuth)await db.realtime.setAuth();
   if(disposed||revision!==n)return false;
   const proof=await db.rpc('get_authorized_scene_channel_v3',{p_map:mapId});
   if(disposed||revision!==n)return false;
   if(proof?.error||!strictTopic(proof?.data,mapId,viewerId)){
    deny('membership-unverified');return false;
   }
   topic=proof.data;
   const c=db.channel(topic,{
    config:{private:true,broadcast:{self:false,ack:false}}
   });
   if(disposed||revision!==n){
    void Promise.resolve(db.removeChannel(c)).catch(()=>{});
    return false;
   }
   channel=c;
   c.on('broadcast',{event:SCENE_V3_EVENT},event=>notice(event,n,c));
   c.subscribe(status=>{
    if(!active(n,c))return;
    if(status==='SUBSCRIBED'){
     online=true;
     sceneManager.invalidate('scene-v3-joined');
     void pump(n,c);
    }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
     deny('channel-not-authorized');
    }
   });
   return true; // Only means subscribed attempted, NEVER render authorized.
  }catch(e){
   if(!disposed&&revision===n){safeCall(onError,e);deny('scene-connect-failed');}
   return false;
  }
 }
 function dispose(){
  if(disposed)return Promise.resolve();
  ++revision;
  mask('disposed');
  disposed=true;phase='disposed';
  const old=channel;channel=null;topic='';dirty=false;load=null;
  safeCall(onState,snapshot());
  return old?Promise.resolve(db.removeChannel(old)).catch(e=>safeCall(onError,e)):
   Promise.resolve();
 }
 return Object.freeze({
  enter,reenter:enter,dispose,snapshot,
  get topic(){return phase==='authorized'?topic:''}
 });
}
