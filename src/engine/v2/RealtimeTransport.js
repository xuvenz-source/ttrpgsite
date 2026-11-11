/**
 * World Engine V2 — viewer-scoped, receive-only Realtime transport.
 *
 * Incoming packets are cosmetic hints, never authorization to load a sprite,
 * move a canonical row or reveal fog. A fresh authorized roster + stream cursor
 * is required before accepting ANY motion after join/reconnect/gaps.
 *
 * Do not mount until Phase 7 supplies an atomic authorized sight/roster
 * refresh and Phase 9 wires this to the single V2 rendering store.
 */
import {worldV2Trace} from './WorldTrace.js';
import {validWorldBroadcastId} from './BroadcastEnvelope.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int=Number.isSafeInteger;
const uuid=x=>typeof x==='string'&&UUID.test(x);
const validPoint=p=>p&&int(p.x)&&int(p.y)&&p.x>=0&&p.y>=0&&
 p.x<=10000&&p.y<=10000&&Object.keys(p).every(k=>k==='x'||k==='y');
const key=p=>p.kind+':'+p.id;
export const worldObserverTopic=(mapId,viewerId)=>
 'forge-world-v2:'+mapId+':'+viewerId;
export const WORLD_MOTION_EVENT='world-motion-v2';
export const MAX_OBSERVER_FRAME_PIECES=48;
export const MAX_OBSERVER_PATH_POINTS=25;

function validPiece(item){
 if(!item||typeof item!=='object'||!['token','tool'].includes(item.kind)||
  !uuid(item.id)||!['path','hide'].includes(item.action)||
  Object.keys(item).some(k=>!['kind','id','action','path'].includes(k)))return false;
 if(item.action==='hide')return !Object.hasOwn(item,'path');
 if(!Array.isArray(item.path)||item.path.length<2||
  item.path.length>MAX_OBSERVER_PATH_POINTS||!item.path.every(validPoint))return false;
 for(let i=1;i<item.path.length;i++){
  const a=item.path[i-1],b=item.path[i];
  if(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))!==1)return false;
 }
 return true;
}
export function validWorldMotionFrame(packet,mapId,viewerId){
 if(!validWorldBroadcastId(packet)||packet.version!==2||
  packet.mapId!==mapId||packet.viewerId!==viewerId||
  !int(packet.seq)||packet.seq<1||
  !int(packet.environmentRevision)||packet.environmentRevision<0||
  !int(packet.permissionGeneration)||packet.permissionGeneration<0||
  !Array.isArray(packet.items)||!packet.items.length||
  packet.items.length>MAX_OBSERVER_FRAME_PIECES||
  Object.keys(packet).some(k=>![
   'version','mapId','viewerId','seq','environmentRevision',
   'permissionGeneration','items','id'
  ].includes(k)))return false;
 const ids=new Set();
 for(const item of packet.items){
  if(!validPiece(item)||ids.has(key(item)))return false;
  ids.add(key(item));
 }
 return true;
}
export function validWorldObserverSnapshot(snapshot,mapId,viewerId){
 if(!snapshot||snapshot.version!==2||
  snapshot.mapId!==mapId||snapshot.viewerId!==viewerId||
  !int(snapshot.cursor)||snapshot.cursor<0||
  !int(snapshot.environmentRevision)||snapshot.environmentRevision<0||
  !int(snapshot.permissionGeneration)||snapshot.permissionGeneration<0||
  !Array.isArray(snapshot.visiblePieces)||snapshot.visiblePieces.length>500)
  return false;
 const ids=new Set();
 for(const p of snapshot.visiblePieces){
  if(!p||!['token','tool'].includes(p.kind)||!uuid(p.id)||
   ids.has(key(p)))return false;
  ids.add(key(p));
 }
 return true;
}
/** Read the server-owned viewer cursor. This is NOT a sprite or sight grant.
 * The caller must combine it with a fresh, RLS-authorized roster and fog frame
 * (Phase 7) before unlock. Never invent a cursor or fall back to a public map.
 */
export async function fetchWorldObserverCursorV2({db,mapId,viewerId}={}){
 if(typeof db?.rpc!=='function'||!uuid(mapId)||!uuid(viewerId))
  throw Error('Invalid V2 observer cursor request');
 const {data,error}=await db.rpc('get_world_observer_cursor_v2',{p_map:mapId});
 if(error||!data||data.version!==2||
  data.mapId!==mapId||data.viewerId!==viewerId||
  !int(data.cursor)||data.cursor<0||
  !int(data.environmentRevision)||data.environmentRevision<0||
  !int(data.permissionGeneration)||data.permissionGeneration<0||
  Object.keys(data).some(k=>![
   'version','mapId','viewerId','cursor','environmentRevision',
   'permissionGeneration'
  ].includes(k)))
  throw Error('Unauthorized or invalid V2 observer cursor');
 return data;
}

/**
 * onResync(reason) MUST obtain an authoritative, RLS-authorized snapshot,
 * including the *viewer-specific* stream cursor. This is intentionally a
 * required injected dependency until the Phase 7 scene/sight RPC is complete.
 */
export function createWorldRealtimeTransport({
 db,mapId,viewerId,onResync,onPath=()=>{},onHide=()=>{},
 onRevoke=()=>{},onError=()=>{},onState=()=>{},onVisionDirty=()=>{},
 softResyncEnabled=false,softRecoveryTimeoutMs=700,
 scheduleRecovery=(fn,delay)=>setTimeout(fn,delay),
 cancelRecovery=handle=>clearTimeout(handle),
 trace=worldV2Trace
}={}){
 if(!db?.channel||!db?.removeChannel||!uuid(mapId)||!uuid(viewerId)||
  typeof onResync!=='function'||typeof onPath!=='function'||
  typeof onHide!=='function'||typeof onRevoke!=='function'||
  typeof onError!=='function'||typeof onState!=='function'||
  typeof onVisionDirty!=='function'||
  typeof softResyncEnabled!=='boolean'||
  !Number.isSafeInteger(softRecoveryTimeoutMs)||
  softRecoveryTimeoutMs<200||softRecoveryTimeoutMs>2000||
  typeof scheduleRecovery!=='function'||
  typeof cancelRecovery!=='function'||
  typeof trace?.event!=='function'||typeof trace?.begin!=='function')
  throw Error('Invalid V2 private observer transport');
 let channel=null,disposed=false,started=false,connected=false,locked=true;
 let generation=0,cursor=null,revision=null,permission=null;
 let roster=new Set(),pending=null,retryTimer=null,retryAttempts=0;
 let acceptedFrameClock=null;
 // Positions here originate ONLY from accepted server-signed sight.
 // A private motion packet is never a new permission to show a sprite.
 let sightScope=null,sightPositions=new Map(),sightFences=new Map();
 // Only stable-generation, previously signed sight enters a bounded hold.
 // No unverified movement path is queued/replayed during reauthorization.
 let guardedPending=null,guardedTimer=null,guardedTarget=0;
 let guardedDropped=0;
 const clearGuarded=()=>{
  if(guardedTimer!==null){
   cancelRecovery(guardedTimer);guardedTimer=null;
  }
  guardedPending=null;guardedTarget=0;guardedDropped=0;
 };
 const sightPoint=p=>int(p?.x)&&int(p?.y)&&p.x>=0&&p.y>=0&&
  p.x<=10000&&p.y<=10000;
 const signedPositions=snapshot=>{
  if(!snapshot.visiblePieces.every(sightPoint))return null;
  return new Map(snapshot.visiblePieces.map(p=>[
   key(p),{x:p.x,y:p.y}
  ]));
 };
 const cancelRetry=()=>{
  if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null}
 };
 const state=reason=>onState({reason,connected,locked,cursor});
 const seal=reason=>{
  if(disposed)return;
  trace.event('observer.seal',reason);
  clearGuarded();
  locked=true;roster.clear();cursor=null;revision=null;permission=null;
  sightScope=null;sightPositions.clear();sightFences.clear();
  // Do not include permission loss or offline intervals in packet cadence.
  acceptedFrameClock=null;
  generation++;
  onRevoke(reason);state(reason);
 };
 async function resync(reason='manual'){
  if(disposed||!started||!connected)return false;
  cancelRetry();
  trace.event('observer.resync',reason);
  if(reason!=='sight-retry')retryAttempts=0;
  seal(reason);
  const current=generation;
  if(pending) {
   // The older request is now invalid; its response will be discarded.
  }
  const task=Promise.resolve().then(()=>onResync(reason)).then(snapshot=>{
   if(disposed||!connected||current!==generation)return false;
   if(!validWorldObserverSnapshot(snapshot,mapId,viewerId))
    throw Error('Invalid authorized V2 observer snapshot');
   cursor=snapshot.cursor;
   revision=snapshot.environmentRevision;
   permission=snapshot.permissionGeneration;
   roster=new Set(snapshot.visiblePieces.map(key));
   // A legacy typed cursor lacking full positions cannot authorize
   // origin fencing or a later signed-roster update.
   sightScope=['dm','viewer'].includes(snapshot.scope)?snapshot.scope:null;
   sightPositions=sightScope?(signedPositions(snapshot)??new Map()):new Map();
   sightFences.clear();
   locked=false;retryAttempts=0;
   trace.event('observer.authorized');state('authorized');
   return true;
  }).catch(error=>{
   if(!disposed&&current===generation){
    locked=true;state('resync-error');
    // Never loop indefinitely on revoked permissions or a database outage.
    // A short bounded retry covers an in-flight scene/subscription refresh;
    // the channel remains locked until the server returns an authorized
    // snapshot. A later scene-current event can independently reauthorize.
    if(retryAttempts<2){
     retryAttempts++;
     retryTimer=setTimeout(()=>{
      retryTimer=null;
      if(!disposed&&started&&connected&&locked)
       void resync('sight-retry');
     },150*retryAttempts);
    }else onError(error);
   }
   return false;
  }).finally(()=>{if(pending===task)pending=null});
  pending=task;
  return task;
 }
 // Only unknown-roster or missing-sequence frames within the existing
 // permission/scene generation may wait for fresh authenticated sight.
 // Every incompatible packet/disconnect/permission change still hard seals.
 function recoverGuarded(reason,requiredCursor){
  if(!softResyncEnabled||disposed||!connected||locked||
   !sightScope||!Number.isSafeInteger(requiredCursor)||
   requiredCursor<1){
   void resync(reason);return;
  }
  if(guardedPending){
   guardedTarget=Math.max(guardedTarget,requiredCursor);
   return;
  }
  guardedTarget=requiredCursor;guardedDropped=0;
  const fence=generation;
  const task=Promise.resolve().then(async()=>{
   for(let attempt=0;attempt<3;attempt++){
    if(disposed||!connected||locked||generation!==fence)return;
    // onResync MUST first adopt independent server-authenticated signed
    // sight in the renderer; this transport cannot grant new sprites.
    const snapshot=await onResync('observer-guarded-sight');
    if(disposed||!connected||locked||generation!==fence)return;
    if(!validWorldObserverSnapshot(snapshot,mapId,viewerId)||
     snapshot.scope!==sightScope||
     snapshot.environmentRevision!==revision||
     snapshot.permissionGeneration!==permission||
     !signedPositions(snapshot)){
     void resync('observer-guarded-invalid');return;
    }
    if(snapshot.cursor<guardedTarget)continue;
    if(!transportAcceptSigned(snapshot)){
     void resync('observer-guarded-rejected');return;
    }
    trace.event('observer.guarded-recovered',reason);
    clearGuarded();state('authorized');return;
   }
   if(!disposed&&connected&&!locked&&generation===fence)
    void resync('observer-guarded-stale');
  }).catch(()=>{
   if(!disposed&&connected&&!locked&&generation===fence)
    void resync('observer-guarded-error');
  }).finally(()=>{
   if(guardedPending===task)clearGuarded();
  });
  guardedPending=task;
  guardedTimer=scheduleRecovery(()=>{
   guardedTimer=null;
   if(guardedPending===task&&!disposed&&connected&&!locked&&
    generation===fence)void resync('observer-guarded-timeout');
  },softRecoveryTimeoutMs);
  trace.event('observer.guarded-start',reason);state('recovering');
 }
 function incoming(payload){
  if(disposed||locked||!connected)return;
  const frame=payload?.payload;
  if(!validWorldMotionFrame(frame,mapId,viewerId)){
   trace.event('observer.invalid-frame');
   void resync('invalid-packet');
   return;
  }
  if(frame.environmentRevision!==revision||
   frame.permissionGeneration!==permission){
   trace.event('observer.version-change');
   void resync('version-change');return;
  }
  if(frame.seq<=cursor){trace.event('observer.late-frame');return}
  // A hide in a missing-sequence frame or during a guarded grace period
  // may represent a new LOS/concealment decision. Do not keep painting the
  // old signed roster for 700ms while a private hide is already known.
  // A full seal is safer than inferring which out-of-order paths are valid.
  if(softResyncEnabled&&frame.items.some(item=>item.action==='hide')&&
   (guardedPending||frame.seq!==cursor+1)){
   void resync('observer-guarded-hide');return;
  }
  if(guardedPending){
   // Hold only the sequence bound. Private payload/coordinates are dropped.
   guardedDropped++;
   if(guardedDropped>16){
    void resync('observer-guarded-overflow');return;
   }
   guardedTarget=Math.max(guardedTarget,frame.seq);
   trace.event('observer.guarded-held');return;
  }
  if(frame.seq!==cursor+1){
   trace.event('observer.sequence-gap');
   recoverGuarded('sequence-gap',frame.seq);return
  }
  cursor=frame.seq;
  const pendingPaths=[];
  let needRoster=false;
  for(const item of frame.items){
   const id=key(item);
   if(item.action==='hide'){
    // Never reveal IDs or send hide actions for a piece never in an
    // authorized roster; conceal a known sprite immediately.
    if(roster.has(id)){
     roster.delete(id);sightPositions.delete(id);sightFences.delete(id);
     onHide(item,{seq:frame.seq,mapId});
    }
   }else if(roster.has(id)){
    const signed=sightFences.get(id);
    if(signed&&(item.path[0].x!==signed.x||
     item.path[0].y!==signed.y)){
     // No old queued route can rewind a newer signed canonical point.
     // Consume the stream cursor, not the unpresentable trajectory.
     trace.event('observer.late-frame');
     continue;
    }
    if(signed)sightFences.delete(id);
    pendingPaths.push(item);
   }else{
    // A piece entering light may require a new authorized roster; do not
    // use this packet as permission to render a previously unknown NPC.
    needRoster=true;
   }
  }
  if(needRoster){
   trace.event('observer.unknown-piece');
   recoverGuarded('unknown-piece',frame.seq);return
  }
  for(const item of pendingPaths)onPath(item,{seq:frame.seq,mapId});
  // Success-only, recipient-side instrumentation. All packet, private
  // identity, sequence, roster, and scene checks above must pass first.
  // No token ID, coordinates, path length or raw payload is captured.
  acceptedFrameClock?.('ok');
  acceptedFrameClock=trace.begin('observer.frame-gap');
  trace.event('observer.frame-accepted');
 }
 // The caller MUST first adopt the full server-signed sight in renderer.
 // This stream only follows its authorized cosmetic cursor and roster.
 function transportAcceptSigned(snapshot){
  if(disposed||!started||!connected||locked||
   !validWorldObserverSnapshot(snapshot,mapId,viewerId)||
   !['dm','viewer'].includes(snapshot.scope)||
   snapshot.cursor<cursor)return false;
  if(!sightScope)return false;
  if(snapshot.scope!==sightScope||
   snapshot.environmentRevision!==revision||
   snapshot.permissionGeneration!==permission){
   void resync('signed-sight-version-change');return false;
  }
  const next=signedPositions(snapshot);
  if(!next)return false;
  for(const [id,position] of next){
   const previous=sightPositions.get(id);
   if(!previous||previous.x!==position.x||previous.y!==position.y)
    sightFences.set(id,position);
  }
  for(const id of sightFences.keys())
   if(!next.has(id))sightFences.delete(id);
  sightPositions=next;roster=new Set(next.keys());
  cursor=snapshot.cursor;
  return true;
 }
 return {
  async start(){
   if(disposed)return false;
   if(started)return true;
   started=true;
   // Supabase private Realtime authorization uses the authenticated JWT.
   try{if(db.realtime?.setAuth)await db.realtime.setAuth()}
   catch(error){started=false;onError(error);return false}
   if(disposed||!started)return false;
   channel=db.channel(worldObserverTopic(mapId,viewerId),
    {config:{private:true,broadcast:{self:false,ack:false}}});
   channel.on('broadcast',{event:WORLD_MOTION_EVENT},incoming);
   channel.on('broadcast',{event:'world-vision-v2'},payload=>{
    if(disposed||!connected)return;
    // Even a same-generation sight-dirty notice can mean a previously
    // visible NPC left LOS. The guarded view must not outlive that signal.
    // Reauthorize instead of retaining a potentially stale roster/mask.
    if(guardedPending){
     void resync('observer-guarded-vision-dirty');return;
    }
    try{onVisionDirty(payload?.payload)}catch{
     void resync('invalid-vision-event');
    }
   });
   channel.subscribe(status=>{
    if(disposed)return;
    if(status==='SUBSCRIBED'){
     connected=true;void resync('subscribed');
    }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
     connected=false;cancelRetry();retryAttempts=0;
     seal('disconnected');
    }
   });
   return true;
  },
  resync,
  /**
   * This may be called ONLY after an independently authenticated signed
   * sight has been accepted by the renderer. An unsigned motion packet
   * or server cursor alone must never grant a new visible roster.
   */
  acceptSignedSight:transportAcceptSigned,
  // Scene recovery awaits an existing observer snapshot rather than
  // invalidating it with another concurrent generation.
  whenSettled(){return pending||Promise.resolve(!locked)},
  // No send/broadcast method. All accepted motion is published by Postgres.
  async dispose(){
   if(disposed)return;
   disposed=true;started=false;connected=false;locked=true;
   cancelRetry();retryAttempts=0;
   clearGuarded();
   generation++;roster.clear();cursor=null;revision=null;permission=null;
   sightScope=null;sightPositions.clear();sightFences.clear();
   acceptedFrameClock=null;
   const old=channel;channel=null;
   if(old)await db.removeChannel(old);
  },
  get connected(){return connected},
  get locked(){return locked},
  get recovering(){return guardedPending!==null},
  get cursor(){return cursor},
  get topic(){return worldObserverTopic(mapId,viewerId)}
 };
}
