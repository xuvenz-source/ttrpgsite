/**
 * Bridge from the Phase 3 collision preflight to Phase 2 canPredict.
 * Preflight is NOT an authorization grant. The independent authorization
 * predicate must verify the ENTIRE trajectory, including fractional display.
 */
import {collisionAllowsStep} from './CollisionSolver.js';
export function createCollisionPredictor({
 scene,mapId,pieces,anchor,permissionGeneration,authorizePath
}={}){
 if(!scene||scene.version!==2||typeof mapId!=='string'||!mapId||
  !Array.isArray(pieces)||!Number.isSafeInteger(permissionGeneration)||
  typeof authorizePath!=='function')
  throw Error('V2 collision predictor requires an authorized scene and path validator');
 const source=new Set(pieces.map(p=>p.kind+':'+p.id));
 if(source.size!==pieces.length)throw Error('Duplicate V2 collision piece');
 return ({mapId:requestMap,selection,from,pointer,
  environmentRevision,permissionGeneration:requestPermission,mode})=>{
  if(requestMap!==mapId||scene.mapId!==mapId||
   environmentRevision!==scene.revision||
   requestPermission!==permissionGeneration||
   !Array.isArray(selection)||selection.length!==source.size||
   !selection.every(piece=>source.has(piece.kind+':'+piece.id)))
   return false;
  const request={mapId,selection,from,to:pointer,environmentRevision,
   permissionGeneration,mode};
  // Any error or unknown edge is a denial. Never auto-fallback to full
  // DM scene geometry for an ordinary player.
  try{
   return authorizePath(request)===true&&collisionAllowsStep({
    scene,pieces,anchor,from,to:pointer
   });
  }catch{return false}
 };
}
