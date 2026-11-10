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
 if(!packet||typeof packet!=='object'||packet.version!==2||
  packet.mapId!==mapId||packet.viewerId!==viewerId||
  !int(packet.seq)||packet.seq<1||
  !int(packet.environmentRevision)||packet.environmentRevision<0||
  !int(packet.permissionGeneration)||packet.permissionGeneration<0||
  !Array.isArray(packet.items)||!packet.items.length||
  packet.items.length>MAX_OBSERVER_FRAME_PIECES||
  Object.keys(packet).some(k=>![
   'version','mapId','viewerId','seq','environmentRevision',
   'permissionGeneration','items'
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
 onRevoke=()=>{},onError=()=>{},onState=()=>{},onVisionDirty=()=>{}
}={}){
 if(!db?.channel||!db?.removeChannel||!uuid(mapId)||!uuid(viewerId)||
  typeof onResync!=='function'||typeof onPath!=='function'||
  typeof onHide!=='function'||typeof onRevoke!=='function'||
  typeof onError!=='function'||typeof onState!=='function'||
  typeof onVisionDirty!=='function')
  throw Error('Invalid V2 private observer transport');
 let channel=null,disposed=false,started=false,connected=false,locked=true;
 let generation=0,cursor=null,revision=null,permission=null;
 let roster=new Set(),pending=null,retryTimer=null,retryAttempts=0;
 // These origins come ONLY from an accepted, server-authorized sight RPC,
 // never an unauthenticated broadcast. Buffered old paths may arrive AFTER
 // the canonical position was reconciled when the B07 budget was exhausted.
 let sightScope=null,sightPositions=new Map(),sightFences=new Map();
 const sightPoint=p=>Number.isSafeInteger(p?.x)&&Number.isSafeInteger(p?.y)&&
  p.x>=0&&p.y>=0&&p.x<=10000&&p.y<=10000;
 function signedPositions(snapshot){
  if(!snapshot.visiblePieces.every(sightPoint))return null;
  return new Map(snapshot.visiblePieces.map(p=>[
   key(p),{x:p.x,y:p.y}
  ]));
 }
 const cancelRetry=()=>{
  if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null}
 };
 const state=reason=>onState({reason,connected,locked,cursor});
 const seal=reason=>{
  if(disposed)return;
  worldV2Trace.event('observer.seal',reason);
  locked=true;roster.clear();cursor=null;revision=null;permission=null;
  sightScope=null;sightPositions.clear();sightFences.clear();
  generation++;
  onRevoke(reason);state(reason);
 };
 async function resync(reason='manual'){
  if(disposed||!started||!connected)return false;
  cancelRetry();
  worldV2Trace.event('observer.resync',reason);
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
   sightScope=snapshot.scope??null;
   sightPositions=signedPositions(snapshot)??new Map();
   sightFences=new Map(sightPositions);
   locked=false;retryAttempts=0;
   worldV2Trace.event('observer.authorized');state('authorized');
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
 function incoming(payload){
  if(disposed||locked||!connected)return;
  const frame=payload?.payload;
  if(!validWorldMotionFrame(frame,mapId,viewerId)){
   worldV2Trace.event('observer.invalid-frame');
   void resync('invalid-packet');
   return;
  }
  if(frame.environmentRevision!==revision||
   frame.permissionGeneration!==permission){
   worldV2Trace.event('observer.version-change');
   void resync('version-change');return;
  }
  if(frame.seq<=cursor){worldV2Trace.event('observer.late-frame');return}
  if(frame.seq!==cursor+1){
   worldV2Trace.event('observer.sequence-gap');
   void resync('sequence-gap');return
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
    if(signed&&
     (item.path[0].x!==signed.x||item.path[0].y!==signed.y)){
     // A late B07 deferred frame starts behind a *newer canonical sight*.
     // Consume its stream cursor but NEVER rewind the sprite or seal the
     // terrain. The next legitimate path may start at the signed endpoint.
     worldV2Trace.event('observer.late-frame');
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
   worldV2Trace.event('observer.unknown-piece');
   void resync('unknown-piece');return
  }
  for(const item of pendingPaths)onPath(item,{seq:frame.seq,mapId});
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
   * Align the private cosmetic stream after a *separately authenticated*
   * canonical sight RPC has already been accepted by the renderer.
   * The caller must NOT invoke this with a broadcast or guessed roster.
   * A changed source position fences old deferred frames until a new
   * adjacent approved path begins at the signed canonical endpoint.
   */
  acceptSignedSight(snapshot){
   if(disposed||!started||!connected||locked||
    !validWorldObserverSnapshot(snapshot,mapId,viewerId)||
    snapshot.scope!==sightScope||
    !['dm','viewer'].includes(snapshot.scope)||
    snapshot.environmentRevision!==revision||
    snapshot.permissionGeneration!==permission||
    snapshot.cursor<cursor)return false;
   const next=signedPositions(snapshot);
   if(!next)return false;
   for(const [id,position] of next){
    const previous=sightPositions.get(id);
    if(!previous||previous.x!==position.x||previous.y!==position.y)
     sightFences.set(id,position);
   }
   for(const id of sightFences.keys())if(!next.has(id))
    sightFences.delete(id);
   sightPositions=next;
   roster=new Set(next.keys());
   cursor=snapshot.cursor;
   return true;
  },
  // Scene recovery awaits an existing observer snapshot rather than
  // invalidating it with another concurrent generation.
  whenSettled(){return pending||Promise.resolve(!locked)},
  // No send/broadcast method. All accepted motion is published by Postgres.
  async dispose(){
   if(disposed)return;
   disposed=true;started=false;connected=false;locked=true;
   cancelRetry();retryAttempts=0;
   generation++;roster.clear();cursor=null;revision=null;permission=null;
   sightScope=null;sightPositions.clear();sightFences.clear();
   const old=channel;channel=null;
   if(old)await db.removeChannel(old);
  },
  get connected(){return connected},
  get locked(){return locked},
  get cursor(){return cursor},
  get topic(){return worldObserverTopic(mapId,viewerId)}
 };
}
