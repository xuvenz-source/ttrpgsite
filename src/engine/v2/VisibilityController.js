/**
 * World Engine V2 — single viewer vision owner.
 *
 * Does not subscribe to token Postgres changes or perform geometry queries.
 * The server alone produces the authorized cells and roster. The Phase 8
 * renderer receives only dirty masks and keyed sprite differences; no React
 * tree remount, fog canvas rebuild or independent frame timers.
 */
import {worldV2Trace} from './WorldTrace.js';
import {validWorldBroadcastId} from './BroadcastEnvelope.js';
import {
  normalizeWorldVisibilityFrame,makeWorldFogMask,
 diffWorldFogMasks,diffWorldVisiblePieces,sameWorldFogCells
} from './VisibilityFrame.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noop=()=>{};
const validId=v=>typeof v==='string'&&UUID.test(v);
export const WORLD_VISION_EVENT='world-vision-v2';
export function createVisibilityController({
 db,mapId,viewerId,dmPreview=false,getScene=()=>null,
 getPreviewPosition=()=>null,
 onFog=noop,onRoster=noop,onSnapshot=noop,onRevoke=noop,onError=noop
}={}){
 if(!db?.rpc||!validId(mapId)||!validId(viewerId)||
  typeof dmPreview!=='boolean'||typeof getScene!=='function'||
  typeof getPreviewPosition!=='function'||
  typeof onFog!=='function'||typeof onRoster!=='function'||
  typeof onSnapshot!=='function'||typeof onRevoke!=='function'||
  typeof onError!=='function')
  throw Error('Invalid V2 visibility controller');
 let disposed=false,epoch=0,currentMap=mapId,currentViewer=viewerId;
 let current=null,mask=null,inFlight=null,queued=false,authorized=false;
 const safe=(fn,...args)=>{try{fn(...args)}catch{}};
 function revoke(reason='revoked'){
  worldV2Trace.event('visibility.revoke',reason);
  epoch++;current=null;mask=null;authorized=false;queued=false;
  safe(onRevoke,{mapId:currentMap,viewerId:currentViewer,reason});
 }
 function validateScene(frame){
  const scene=getScene();
  // A future map switch may not authorize new visibility while the scene
  // metadata is stale. SceneManager is optional only for isolated tests.
  if(!scene)return true;
  return scene.mapId===currentMap &&
   scene.revision===frame.environmentRevision &&
   scene.sceneGeneration===frame.sceneGeneration &&
   (scene.published===true||
     scene.published===false&&scene.fogEnabled===false&&
     scene.collisionEnabled===false&&scene.environment===null);
 }
 function adopt(raw,requestEpoch){
  if(disposed||epoch!==requestEpoch)return null;
  const next=normalizeWorldVisibilityFrame(raw,currentMap,currentViewer);
  if(!next||!validateScene(next))throw Error('Invalid V2 authorized sight');
  // A delayed, valid RPC within the SAME scope/permission/scene cannot
  // replace newer server-authorized sight. Keep existing sprites/masks.
  const sameAuthority=current&&next.scope===current.scope&&
   next.environmentRevision===current.environmentRevision&&
   next.sceneGeneration===current.sceneGeneration&&
   next.permissionGeneration===current.permissionGeneration;
  if(sameAuthority&&(
   next.visionEpoch<current.visionEpoch||next.cursor<current.cursor
  )){
   worldV2Trace.event('visibility.stale-snapshot');
   return null;
  }
  if(current&&(
   next.sceneGeneration<current.sceneGeneration||
   next.environmentRevision<current.environmentRevision||
   next.permissionGeneration<current.permissionGeneration
  ))throw Error('Stale V2 authorized sight');
  const nextMask=sameWorldFogCells(current,next)?mask:makeWorldFogMask(next);
   // A fog-disabled large map has no raster. A new cursor is not a
   // reason to report a full blackout/redraw every movement packet.
   const changes=!next.enabled?
    {full:!current||current.enabled!==next.enabled,rects:[]}:
    diffWorldFogMasks(mask,nextMask,next.width,next.height);
  const pieces=diffWorldVisiblePieces(current?.visiblePieces,next.visiblePieces);
  const shouldUpdateFog=changes.full||changes.rects.length>0;
  const shouldUpdateRoster=pieces.added.length||pieces.removed.length||
   pieces.moved.length;
  const priorFrame=current,priorMask=mask,priorAuthorized=authorized;
  current=next;mask=nextMask;authorized=true;
  // Phase 8's single presentation owner needs EVERY accepted cursor,
  // including snapshots with no fog/roster delta. It may update its stream
  // gate without scheduling a redraw of otherwise unchanged sprites.
  // A presentation rejection is not an authorized sight. Propagate it
  // into the existing fail-closed refresh handler instead of reporting
  // a successful frame that the renderer never accepted.
  const decision=onSnapshot(next);
  if(decision==='stale'){
   current=priorFrame;mask=priorMask;authorized=priorAuthorized;
   worldV2Trace.event('visibility.stale-snapshot');
   return null;
  }
  if(decision===false)
   throw Error('V2 renderer rejected authorized sight');
  worldV2Trace.event('visibility.snapshot',
   changes.full?'full':changes.rects.length?'partial':'none');
  if(shouldUpdateFog)safe(onFog,{
   frame:next,mask:nextMask,dirty:changes
  });
  if(shouldUpdateRoster)safe(onRoster,{
   frame:next,...pieces
  });
  return next;
 }
 async function fetchFrame(){
  const virtual=dmPreview?getPreviewPosition():null;
  if(virtual&&(!validId(virtual.tokenId)||
   !Number.isSafeInteger(virtual.x)||!Number.isSafeInteger(virtual.y)))
   throw Error('Invalid virtual preview position');
  const args=dmPreview?virtual?{
   name:'preview_world_visibility_at_v2',
   params:{p_map:currentMap,p_viewer:currentViewer,
    p_token:virtual.tokenId,p_x:virtual.x,p_y:virtual.y}
  }:{
   name:'preview_world_visibility_v2',
   params:{p_map:currentMap,p_viewer:currentViewer}
  }:{
   name:'get_world_visibility_v2',params:{p_map:currentMap}
  };
  const done=worldV2Trace.begin('visibility.rpc');
  let result='error',data,error;
  try{({data,error}=await db.rpc(args.name,args.params));
   if(!error&&data)result='ok';
  }finally{done(result)}
  if(error||!data)throw Error('V2 viewer sight unavailable');
  return data;
 }
 function refresh(reason='manual'){
  if(disposed)return Promise.resolve(null);
  worldV2Trace.event('visibility.refresh',reason);
  if(inFlight){
   queued=true;
   const pending=inFlight;
   // A queued newer refresh is not failure of the current authorized frame.
   return pending.then(()=>inFlight&&inFlight!==pending?inFlight:current)
    .then(()=>current);
  }
  const requestEpoch=epoch;
  const task=Promise.resolve().then(fetchFrame).then(raw=>
   adopt(raw,requestEpoch)
  ).catch(error=>{
   if(!disposed&&epoch===requestEpoch){
    worldV2Trace.event('visibility.reject');
    revoke('invalid-snapshot');safe(onError,error);
   }
   return null;
  }).finally(()=>{
   if(inFlight===task)inFlight=null;
   if(!disposed&&queued){
    queued=false;void refresh('queued');
   }
  });
  inFlight=task;
  return task;
 }
 return Object.freeze({
  refresh,
  /**
   * Feed the server-owned private vision revision envelope delivered on the
   * EXISTING Phase 5 viewer channel. No second socket or token subscription.
   */
  onVisionDirty(notice){
   if(disposed||!validWorldBroadcastId(notice)||notice.version!==2||
    notice.mapId!==currentMap||notice.viewerId!==currentViewer||
    !Number.isSafeInteger(notice.visionEpoch)||notice.visionEpoch<0||
    !Number.isSafeInteger(notice.environmentRevision)||
    !Number.isSafeInteger(notice.permissionGeneration)||
    !Number.isSafeInteger(notice.sceneGeneration)||
    Object.keys(notice).some(k=>![
     'version','mapId','viewerId','visionEpoch',
     'environmentRevision','permissionGeneration','sceneGeneration','id'
    ].includes(k))){
    if(!disposed){
     worldV2Trace.event('visibility.notice','invalid-vision-notice');
     revoke('invalid-vision-notice');
    }
    return false;
   }
   // Older private dirty notices cannot invalidate newer authorized sight.
   // Incomparable or newer permission/scene generations still fail closed.
   if(current&&
    notice.environmentRevision<=current.environmentRevision&&
    notice.permissionGeneration<=current.permissionGeneration&&
    notice.sceneGeneration<=current.sceneGeneration&&
    notice.visionEpoch<=current.visionEpoch&&(
     notice.environmentRevision<current.environmentRevision||
     notice.permissionGeneration<current.permissionGeneration||
     notice.sceneGeneration<current.sceneGeneration
    )){
    worldV2Trace.event('visibility.notice','stale');
    return false;
   }
   if(current&&(
    notice.environmentRevision!==current.environmentRevision||
    notice.permissionGeneration!==current.permissionGeneration||
    notice.sceneGeneration!==current.sceneGeneration
   )){
    worldV2Trace.event('visibility.notice','vision-version-change');
    revoke('vision-version-change');
    void refresh('vision-version-change');return true;
   }
   if(current&&notice.visionEpoch<=current.visionEpoch)return false;
   // A normal token move does not revoke previously authorized static
   // exploration or remove the canvas. Request the fresh server visibility
   // mask and update only cells that actually changed.
   void refresh('movement-vision-dirty');
   return true;
  },
  /** Compatible with Phase 5 private observer onResync(reason). An
   * authorized snapshot returns cursor + visible roster in one RPC.
   */
  async observerSnapshot(){
   // Never unlock the stream from an ignored response. Bounded retry
   // addresses sight RPCs that raced already-accepted private motion.
   for(let attempt=0;attempt<3;attempt++){
    const frame=await refresh('observer-resync');
    if(frame)return frame;
    if(!authorized)break;
   }
   throw Error('No authorized V2 observer sight');
  },
  changeContext({mapId:nextMap,viewerId:nextViewer}={}){
   if(disposed||!validId(nextMap)||!validId(nextViewer))return false;
   if(nextMap===currentMap&&nextViewer===currentViewer)return true;
   revoke('context-change');
   currentMap=nextMap;currentViewer=nextViewer;
   return true;
  },
  revoke,
  dispose(){
   if(disposed)return;
   revoke('disposed');disposed=true;
  },
  get frame(){return current},
  get mask(){return mask},
  get authorized(){return authorized},
  get visiblePieces(){return current?.visiblePieces??[]},
  get mapId(){return currentMap},
  get viewerId(){return currentViewer}
 });
}
