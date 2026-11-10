/**
 * B06: cosmetic one-cell presentation certified by a current, normalized
 * server-authorized visibility snapshot. Not a motion permission or a commit.
 * No client wall/LOS inference, new RPC, private geometry or browser broadcast.
 */
import {canPredictWithinWorldGrants} from './PredictionGrants.js';

const integer=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>Number.isFinite(n);
const exact=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
const copy=p=>({x:p.x,y:p.y});
const keys=['scope','mapId','viewerId','environmentRevision',
 'permissionGeneration','sceneGeneration','visionEpoch','cursor'];
const allowed=new Set([...keys,'from','position']);

/** Unforgeable only in the application trust model: caller must supply a
 * normalized frame fetched through the signed server sight RPC. The browser
 * cannot manufacture new privileges by creating this cosmetic object.
 */
export function certifyViewerMotion({frame,scene,request}={}){
 if(!frame||frame.version!==2||frame.scope!=='viewer'||
  !scene||scene.scope!=='viewer'||scene.published!==true||
  typeof frame.viewerId!=='string'||!frame.viewerId||
  !integer(frame.cursor)||!integer(frame.visionEpoch)||
  !integer(frame.sceneGeneration)||
  !integer(frame.environmentRevision)||
  !integer(frame.permissionGeneration)||
  !Array.isArray(frame.visiblePieces)||!Array.isArray(frame.predictionGrants)||
  !request||!finite(request.pointer?.x)||!finite(request.pointer?.y)||
  !finite(request.from?.x)||!finite(request.from?.y)||
  !canPredictWithinWorldGrants({frame,scene,request}))
  return null;
 const {from,pointer}=request;
 // The authoritative grant is for one bounded quadrant around the signed
 // anchor. No second cell or inferred continuation from an old frame.
 if(Math.abs(pointer.x-from.x)>1||Math.abs(pointer.y-from.y)>1)
  return null;
 if(exact(from,pointer))return null; // No-op needs no speculative sprite.
 return Object.freeze({
  scope:'viewer',
  mapId:frame.mapId,viewerId:frame.viewerId,
  environmentRevision:frame.environmentRevision,
  permissionGeneration:frame.permissionGeneration,
  sceneGeneration:frame.sceneGeneration,
  visionEpoch:frame.visionEpoch,cursor:frame.cursor,
  from:Object.freeze(copy(from)),position:Object.freeze(copy(pointer))
 });
}

/** Every paint/refresh rechecks the exact snapshot identity and grid anchor.
 * A higher cursor/vision epoch is a NEW authority, not reusable proof.
 */
export function certifiedMotionMatchesSight(certificate,frame,scene){
 if(!certificate||typeof certificate!=='object'||!frame||
  frame.version!==2||frame.scope!=='viewer'||
  !scene||scene.scope!=='viewer'||scene.published!==true||
  Object.keys(certificate).length!==allowed.size||
  Object.keys(certificate).some(k=>!allowed.has(k))||
  !keys.every(k=>certificate[k]===frame[k])||
  scene.mapId!==frame.mapId||
  scene.revision!==frame.environmentRevision||
  scene.sceneGeneration!==frame.sceneGeneration||
  !finite(certificate.position?.x)||!finite(certificate.position?.y)||
  !integer(certificate.from?.x)||!integer(certificate.from?.y))
  return false;
 return Math.abs(certificate.position.x-certificate.from.x)<=1 &&
  Math.abs(certificate.position.y-certificate.from.y)<=1;
}

/** A certificate may be displayed only for the exact locally picked
 * authorized selection and the latest approved anchor. Re-check the signed
 * grants against the current frame rather than trusting a caller-sent flag.
 */
export function certifiedMotionPaintAllowed({
 certificate,frame,scene,mapId,selection,approved,presented
}={}){
 if(!certifiedMotionMatchesSight(certificate,frame,scene)||
  mapId!==certificate.mapId||
  !exact(approved,certificate.from)||
  !exact(presented,certificate.position)||
  !Array.isArray(selection)||!selection.length||selection.length>48)
  return false;
 return canPredictWithinWorldGrants({frame,scene,request:{
  mapId,selection,from:approved,pointer:presented,
  environmentRevision:certificate.environmentRevision,
  permissionGeneration:certificate.permissionGeneration
 }});
}
