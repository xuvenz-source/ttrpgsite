/**
 * V2 deterministic movement geometry. No React, Supabase or legacy imports.
 * These predicates are LOCAL PREFLIGHT ONLY: they do not grant permission.
 */
const EPS=1e-8;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export const validCollisionPoint=p=>finite(p?.x)&&finite(p?.y)&&
 Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});

function convexHull(points){
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
 const make=items=>{
  const result=[];
  for(const point of items){
   while(result.length>=2){
    const a=result.at(-2),b=result.at(-1);
    if(cross(sub(b,a),sub(point,b))>EPS)break;
    result.pop();
   }
   result.push(point);
  }
  return result;
 };
 const lower=make(sorted),upper=make([...sorted].reverse());
 return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
function corners(position,spanX,spanY){
 const {x,y}=position;
 return [{x,y},{x:x+spanX,y},{x:x+spanX,y:y+spanY},{x,y:y+spanY}];
}
/** Union of a rectangular footprint translated along an entire segment.
 * Moving rapidly cannot jump across a thin line between sampled frames.
 */
export function sweptFootprintHull(from,to,spanX,spanY){
 if(!validCollisionPoint(from)||!validCollisionPoint(to)||
  !finite(spanX)||!finite(spanY)||spanX<=0||spanY<=0||
  spanX>12||spanY>12)return null;
 return convexHull([...corners(from,spanX,spanY),
  ...corners(to,spanX,spanY)]);
}
/** Segment crosses the strict INTERIOR of a swept convex footprint.
 * Merely touching or sliding along an edge is legal.
 */
export function segmentCrossesSweptFootprint(a,b,from,to,spanX,spanY){
 if(!validCollisionPoint(a)||!validCollisionPoint(b))return false;
 const hull=sweptFootprintHull(from,to,spanX,spanY);
 if(!hull||hull.length<3)return false;
 const dir=sub(b,a);
 let enter=0,leave=1;
 for(let i=0;i<hull.length;i++){
  const start=hull[i],end=hull[(i+1)%hull.length];
  const edge=sub(end,start);
  const initial=cross(edge,sub(a,start)),rate=cross(edge,dir);
  if(Math.abs(rate)<EPS){
   if(initial<=EPS)return false;
   continue;
  }
  const limit=(EPS-initial)/rate;
  if(rate>0)enter=Math.max(enter,limit);
  else leave=Math.min(leave,limit);
  if(leave-enter<=EPS)return false;
 }
 return leave-enter>EPS;
}
/** B10-R18-17: opt-in physical FOOTPRINT edge clearance (grid units).
 * Default is STRICT. Invalid requests FAIL CLOSED: true=colliding.
 * Never relaxes map bounds, door rules, LOS or server authorization.
 *
 * This must only be enabled by a separate, server-compatible release.
 * It is NOT wired into the current live scene compiler by default.
 */
export const WORLD_V2_WALL_EDGE_CLEARANCE_CELLS=0.10;
export function segmentCrossesSweptFootprintWithClearance(
 a,b,from,to,spanX,spanY,clearanceCells=0
){
 if(!validCollisionPoint(a)||!validCollisionPoint(b)||
  !validCollisionPoint(from)||!validCollisionPoint(to)||
  !finite(spanX)||!finite(spanY)||spanX<=0||spanY<=0||
  spanX>12||spanY>12||
  (clearanceCells!==0&&
   clearanceCells!==WORLD_V2_WALL_EDGE_CLEARANCE_CELLS))return true;
 if(clearanceCells===0)
  return segmentCrossesSweptFootprint(a,b,from,to,spanX,spanY);
 const insetX=Math.min(clearanceCells,spanX/4);
 const insetY=Math.min(clearanceCells,spanY/4);
 const internalFrom={x:from.x+insetX,y:from.y+insetY};
 const internalTo={x:to.x+insetX,y:to.y+insetY};
 return segmentCrossesSweptFootprint(
  a,b,internalFrom,internalTo,spanX-2*insetX,spanY-2*insetY);
}
export function segmentBoundingBox(a,b){
 return {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),
  minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};
}
export function footprintSweepBounds(from,to,spanX,spanY){
 return {minX:Math.min(from.x,to.x),maxX:Math.max(from.x,to.x)+spanX,
  minY:Math.min(from.y,to.y),maxY:Math.max(from.y,to.y)+spanY};
}
export function boxesMayOverlap(a,b){
 return a.minX<=b.maxX+EPS&&a.maxX+EPS>=b.minX&&
  a.minY<=b.maxY+EPS&&a.maxY+EPS>=b.minY;
}
