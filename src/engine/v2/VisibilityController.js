/**
 * World Engine V2 — single viewer vision owner.
 *
 * Does not subscribe to token Postgres changes or perform geometry queries.
 * The server alone produces the authorized cells and roster. The Phase 8
 * renderer receives only dirty masks and keyed sprite differences; no React
 * tree remount, fog canvas rebuild or independent frame timers.
 */
import {
 normalizeWorldVisibilityFrame,makeWorldFogMask,
 diffWorldFogMasks,diffWorldVisiblePieces
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
   scene.published===true;
 }
 function adopt(raw,requestEpoch){
  if(disposed||epoch!==requestEpoch)return null;
  const next=normalizeWorldVisibilityFrame(raw,currentMap,currentViewer);
  if(!next||!validateScene(next))throw Error('Invalid V2 authorized sight');
  if(current&&(
   next.sceneGeneration<current.sceneGeneration||
   next.environmentRevision<current.environmentRevision||
   next.permissionGeneration<current.permissionGeneration||
   (next.sceneGeneration===current.sceneGeneration&&
    next.environmentRevision===current.environmentRevision&&
    next.permissionGeneration===current.permissionGeneration&&
    next.visionEpoch<current.visionEpoch)||
   next.cursor<current.cursor
  ))throw Error('Stale V2 authorized sight');
  const nextMask=makeWorldFogMask(next);
  const changes=diffWorldFogMasks(mask,nextMask,next.width,next.height);
  const pieces=diffWorldVisiblePieces(current?.visiblePieces,next.visiblePieces);
  const shouldUpdateFog=changes.full||changes.rects.length>0;
  const shouldUpdateRoster=pieces.added.length||pieces.removed.length||
   pieces.moved.length;
  current=next;mask=nextMask;authorized=true;
  // Phase 8's single presentation owner needs EVERY accepted cursor,
  // including snapshots with no fog/roster delta. It may update its stream
  // gate without scheduling a redraw of otherwise unchanged sprites.
  safe(onSnapshot,next);
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
  const {data,error}=await db.rpc(args.name,args.params);
  if(error||!data)throw Error('V2 viewer sight unavailable');
  return data;
 }
 function refresh(reason='manual'){
  if(disposed)return Promise.resolve(null);
  if(inFlight){
   queued=true;
   return inFlight.then(()=>inFlight?null:current);
  }
  const requestEpoch=epoch;
  const task=Promise.resolve().then(fetchFrame).then(raw=>
   adopt(raw,requestEpoch)
  ).catch(error=>{
   if(!disposed&&epoch===requestEpoch){
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
   if(disposed||!notice||notice.version!==2||
    notice.mapId!==currentMap||notice.viewerId!==currentViewer||
    !Number.isSafeInteger(notice.visionEpoch)||notice.visionEpoch<0||
    !Number.isSafeInteger(notice.environmentRevision)||
    !Number.isSafeInteger(notice.permissionGeneration)||
    !Number.isSafeInteger(notice.sceneGeneration)||
    Object.keys(notice).some(k=>![
     'version','mapId','viewerId','visionEpoch',
     'environmentRevision','permissionGeneration','sceneGeneration'
    ].includes(k))){
    if(!disposed)revoke('invalid-vision-notice');
    return false;
   }
   if(current&&(
    notice.environmentRevision!==current.environmentRevision||
    notice.permissionGeneration!==current.permissionGeneration||
    notice.sceneGeneration!==current.sceneGeneration
   )){
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
   const frame=await refresh('observer-resync');
   if(!frame)throw Error('No authorized V2 observer sight');
   return frame;
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
