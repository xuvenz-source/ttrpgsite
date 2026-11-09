/**
 * Viewer movement presentation from server-certified collision-free envelopes.
 * No wall objects, secret boundaries, client heuristics, or role-based
 * bypasses can authorize a predicted local fraction. The server still
 * independently commits every movement step.
 */
const validPoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const id=p=>p.kind+':'+p.id;
const EPS=1e-8;
export function canPredictWithinWorldGrants({frame,scene,request}={}){
 if(!frame||frame.scope!=='viewer'||!scene||
  scene.scope!=='viewer'||scene.published!==true||
  frame.mapId!==scene.mapId||
  frame.environmentRevision!==scene.revision||
  frame.sceneGeneration!==scene.sceneGeneration||
  !request||request.mapId!==frame.mapId||
  request.environmentRevision!==frame.environmentRevision||
  request.permissionGeneration!==frame.permissionGeneration||
  !validPoint(request.from)||!validPoint(request.pointer)||
  !Array.isArray(request.selection)||!request.selection.length||
  request.selection.length>48||
  !Array.isArray(frame.predictionGrants))return false;
 const dx=request.pointer.x-request.from.x;
 const dy=request.pointer.y-request.from.y;
 if(Math.abs(dx)>1+EPS||Math.abs(dy)>1+EPS)return false;
 if(Math.abs(dx)<EPS&&Math.abs(dy)<EPS)return true;
 const xSign=dx>EPS?1:dx<-EPS?-1:0;
 const ySign=dy>EPS?1:dy<-EPS?-1:0;
 const granted=new Map(frame.predictionGrants.map(g=>[id(g),g]));
 const visible=new Map(frame.visiblePieces.map(p=>[id(p),p]));
 const seen=new Set();
 for(const item of request.selection){
  if(!['token','tool'].includes(item?.kind)||
   typeof item.id!=='string')return false;
  const key=id(item),grant=granted.get(key),piece=visible.get(key);
  if(seen.has(key)||!grant||!piece||
   grant.x!==piece.x||grant.y!==piece.y||
   !Array.isArray(grant.quadrants))return false;
  seen.add(key);
  // Only the selected group's first actor is the approved input anchor.
  if(item===request.selection[0]&&
   (request.from.x!==piece.x||request.from.y!==piece.y))return false;
  if(!grant.quadrants.some(q=>Array.isArray(q)&&q.length===2&&
   (xSign===0||q[0]===xSign)&&
   (ySign===0||q[1]===ySign)))return false;
 }
 return true;
}
