/** A bounded queue of ACTUAL pointer bends, not a shortcut to the latest point.
 * Targets are absolute offsets from the server-issued gesture's canonical origin.
 * The server alone decides which crossings are legal.
 */
export const MAX_SECURE_BATCH_CELLS=24;
export const MAX_SECURE_BATCH_TARGETS=8;
export const MAX_SECURE_QUEUED_BENDS=64;
const int=Number.isSafeInteger;
const valid=p=>int(p?.dx)&&int(p?.dy)&&Math.abs(p.dx)<=128&&Math.abs(p.dy)<=128;
const roundSym=n=>Math.sign(n)*Math.round(Math.abs(n));
export function enqueueConcealedTarget(queue,target,from={dx:0,dy:0}){
 if(!Array.isArray(queue)||!valid(target)||!valid(from))return false;
 const prev=queue.at(-1)||from;
 if(prev.dx===target.dx&&prev.dy===target.dy)return true;
 const before=queue.at(-2)||from;
 const ux=prev.dx-before.dx,uy=prev.dy-before.dy;
 const vx=target.dx-prev.dx,vy=target.dy-prev.dy;
 if(queue.length&&ux*vy-uy*vx===0&&ux*vx+uy*vy>=0){
  queue[queue.length-1]={dx:target.dx,dy:target.dy};return true;
 }
 if(queue.length>=MAX_SECURE_QUEUED_BENDS)return false;
 queue.push({dx:target.dx,dy:target.dy});return true;
}
/** Take up to 24 swept cells, even if pointer events skip entire corridors.
 * 'remaining' preserves bends when a segment must be split across batches.
 */
export function takeConcealedBatch(from,queued,{maxCells=MAX_SECURE_BATCH_CELLS,
 maxTargets=MAX_SECURE_BATCH_TARGETS}={}){
 if(!valid(from)||!Array.isArray(queued)||!int(maxCells)||maxCells<1||
    maxCells>48||!int(maxTargets)||maxTargets<1||maxTargets>12)
  return {targets:[],remaining:queued||[]};
 const targets=[];let at={dx:from.dx,dy:from.dy},used=0,index=0;
 for(;index<queued.length&&targets.length<maxTargets;index++){
  const point=queued[index];
  if(!valid(point))break;
  const dx=point.dx-at.dx,dy=point.dy-at.dy;
  const steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(!steps)continue;
  const room=maxCells-used;
  if(!room)break;
  if(steps>room){
   const partial={dx:at.dx+roundSym(dx*room/steps),
    dy:at.dy+roundSym(dy*room/steps)};
   if(!valid(partial)||(partial.dx===at.dx&&partial.dy===at.dy))break;
   targets.push(partial);
   return {targets,remaining:queued.slice(index)};
  }
  targets.push({dx:point.dx,dy:point.dy});
  at=point;used+=steps;
 }
 return {targets,remaining:queued.slice(index)};
}
