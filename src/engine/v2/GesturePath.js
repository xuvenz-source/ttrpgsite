/** Pure, bounded gesture-path logic. No database, fog or hidden-world access. */
export const MAX_GESTURE_BENDS=128;
export const MAX_BATCH_CELLS=24;
export const MAX_BATCH_TARGETS=8;
const finitePoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const integerPoint=p=>finitePoint(p)&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y);
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const roundSym=n=>Math.sign(n)*Math.round(Math.abs(n));

export function gridPoint(pointer){
 if(!finitePoint(pointer))return null;
 return {x:roundSym(pointer.x),y:roundSym(pointer.y)};
}

/** Preserve turns and reversals. Collapse only forward, collinear points. */
export function appendGestureBend(queue,target,origin,{maxBends=MAX_GESTURE_BENDS}={}){
 if(!Array.isArray(queue)||!integerPoint(target)||!integerPoint(origin)||
  !Number.isSafeInteger(maxBends)||maxBends<1)return false;
 const previous=queue.at(-1)||origin;
 if(same(previous,target))return true;
 const before=queue.at(-2)||origin;
 const ux=previous.x-before.x,uy=previous.y-before.y;
 const vx=target.x-previous.x,vy=target.y-previous.y;
 if(queue.length&&ux*vy===uy*vx&&ux*vx+uy*vy>0){
  queue[queue.length-1]={x:target.x,y:target.y};return true;
 }
 if(queue.length>=maxBends)return false;
 queue.push({x:target.x,y:target.y});
 return true;
}

/** Split a multi-cell gesture into bounded, ordered target segments.
 * Remaining includes an unfinished target: it must not be silently dropped.
 */
export function takeGestureBatch(from,queue,{maxCells=MAX_BATCH_CELLS,maxTargets=MAX_BATCH_TARGETS}={}){
 if(!integerPoint(from)||!Array.isArray(queue)||
  !Number.isSafeInteger(maxCells)||maxCells<1||maxCells>48||
  !Number.isSafeInteger(maxTargets)||maxTargets<1||maxTargets>12)
  return null;
 const targets=[];let at={...from},used=0,index=0;
 for(;index<queue.length&&targets.length<maxTargets;index++){
  const to=queue[index];if(!integerPoint(to))return null;
  const dx=to.x-at.x,dy=to.y-at.y;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(!steps)continue;
  const room=maxCells-used;
  if(!room)break;
  if(steps>room){
   const partial={x:at.x+roundSym(dx*room/steps),
    y:at.y+roundSym(dy*room/steps)};
   if(!integerPoint(partial)||same(at,partial))return null;
   targets.push(partial);
   return {targets,remaining:queue.slice(index),consumed:index};
  }
  targets.push({x:to.x,y:to.y});
  at=to;used+=steps;
 }
 return {targets,remaining:queue.slice(index),consumed:index};
}

/** Expand each ordered segment to 8-connected crossings for ACK validation.
 * This is NOT a collision check or an authorization to traverse corners.
 */
export function expandGestureRoute(from,targets,{maxCells=48}={}){
 if(!integerPoint(from)||!Array.isArray(targets)||!Number.isSafeInteger(maxCells)||
  maxCells<1||maxCells>512)return null;
 const cells=[];let at={...from};
 for(const to of targets){
  if(!integerPoint(to))return null;
  const dx=to.x-at.x,dy=to.y-at.y;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(steps>maxCells)return null;
  const start=at;
  for(let i=1;i<=steps;i++){
   const point={x:start.x+roundSym(dx*i/steps),y:start.y+roundSym(dy*i/steps)};
   const previous=cells.at(-1)||start;
   if(same(previous,point))continue;
   if(Math.max(Math.abs(previous.x-point.x),Math.abs(previous.y-point.y))!==1)return null;
   cells.push(point);
   if(cells.length>maxCells)return null;
  }
  at=to;
 }
 return cells;
}
