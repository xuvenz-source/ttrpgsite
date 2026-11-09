/** Compact geometry-only envelope validation. Observer packets are issued by
 * private, authenticated Postgres Realtime channels; the client does not use
 * the coordinates to authorize sight, sprites or map entry.
 */
export const MAX_VERIFIED_OBSERVER_POINTS=49;
export const MAX_BUFFERED_OBSERVER_POINTS=96;
export function validVerifiedObserverPath(path){
 if(!Array.isArray(path)||path.length<2||
    path.length>MAX_VERIFIED_OBSERVER_POINTS)return false;
 let previous=null;
 for(const point of path){
  if(!point||typeof point!=='object'||Array.isArray(point)||
     Object.keys(point).length!==2||
     !Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)||
     point.x<0||point.y<0||point.x>10000||point.y>10000||
     Object.keys(point).some(key=>key!=='x'&&key!=='y'))return false;
  if(previous&&Math.max(Math.abs(point.x-previous.x),
   Math.abs(point.y-previous.y))!==1)return false;
  previous=point;
 }
 return true;
}
export const sameObserverCell=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
export function appendVerifiedObserverPoints(existing,newPath){
 if(!validVerifiedObserverPath(newPath))return null;
 if(!Array.isArray(existing)||!existing.length)return [...newPath];
 if(!sameObserverCell(existing.at(-1),newPath[0])||
   existing.length+newPath.length-1>MAX_BUFFERED_OBSERVER_POINTS)
  return null;
 return [...existing,...newPath.slice(1)];
}
