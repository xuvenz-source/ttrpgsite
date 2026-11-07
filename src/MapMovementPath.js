/** Preserve changes of direction during a drag so a token may walk around
 * a doorway instead of being collision-tested as one straight teleport.
 * Coordinates are relative to the gesture's starting map cell.
 *
 * Consecutive points on the same line simplify to their endpoint. Keep
 * right-angle turns, backtracking and diagonal bends intact. 64 waypoints
 * prevent unbounded RPC inputs; the UI can still issue a shorter drag.
 */
export const MAX_MOTION_WAYPOINTS=64;
export function appendMovementWaypoint(points,dx,dy){
 if(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy)||
  Math.abs(dx)>128||Math.abs(dy)>128)return points;
 const previous=points[points.length-1];
 if(previous&&previous.dx===dx&&previous.dy===dy)return points;
 const next=[...points,{dx,dy}];
 if(next.length>=3){
  const a=next.at(-3),b=next.at(-2),c=next.at(-1);
  const ux=b.dx-a.dx,uy=b.dy-a.dy;
  const vx=c.dx-b.dx,vy=c.dy-b.dy;
  const cross=ux*vy-uy*vx;
  // Avoid coalescing a reversal, because the route behind a wall matters.
  if(cross===0&&ux*vx+uy*vy>=0)next.splice(-2,1);
 }
 return next.length>MAX_MOTION_WAYPOINTS?points:next;
}
export function movementPathDeltas(path){
 if(!Array.isArray(path)||!path.length)return [];
 let last={dx:0,dy:0};
 const steps=[];
 for(const point of path){
  if(!Number.isSafeInteger(point?.dx)||!Number.isSafeInteger(point?.dy))
   return null;
  const dx=point.dx-last.dx,dy=point.dy-last.dy;
  if(dx!==0||dy!==0)steps.push({dx,dy});
  last=point;
 }
 return steps.length<=MAX_MOTION_WAYPOINTS?steps:null;
}
