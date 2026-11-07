import {wallAllows} from './MapEnvironment.js';

// Local collision geometry mirrors the future database movement rules.
// IMPORTANT: a browser result is advisory, not authorization to move.
const EPS=1e-8;
const number=n=>typeof n==='number'&&Number.isFinite(n);
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const subtract=(a,b)=>({x:a.x-b.x,y:a.y-b.y});

function convexHull(points){
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
 const build=list=>{
  const hull=[];
  for(const p of list){
   while(hull.length>=2){
    const a=hull[hull.length-2],b=hull[hull.length-1];
    if(cross(subtract(b,a),subtract(p,b))>EPS)break;
    hull.pop();
   }
   hull.push(p);
  }
  return hull;
 };
 const lower=build(sorted),upper=build([...sorted].reverse());
 return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
function rectCorners(x,y,width,height){
 return [{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
}
/** Convex hull of the start and end footprints: covers the entire swept
 * rectangle, including diagonals, corners, and wide creature footprints.
 */
export function sweptTokenHull(token,destination){
 const x=Number(token?.x),y=Number(token?.y);
 const toX=Number(destination?.x),toY=Number(destination?.y);
 const w=Number(token?.span_x??1),h=Number(token?.span_y??1);
 if(![x,y,toX,toY,w,h].every(Number.isFinite)||
    w<=0||h<=0||w>12||h>12)return null;
 return convexHull([...rectCorners(x,y,w,h),...rectCorners(toX,toY,w,h)]);
}
/** Clip a barrier against the STRICT INTERIOR of a convex CCW polygon.
 * Touching a cell edge is allowed; moving through a wall is not.
 */
export function barrierCrossesSweptHull(a,b,hull){
 if(!Array.isArray(hull)||hull.length<3||
    ![a?.x,a?.y,b?.x,b?.y].every(number))return false;
 const d=subtract(b,a);let enter=0,exit=1;
 for(let i=0;i<hull.length;i++){
  const start=hull[i],end=hull[(i+1)%hull.length];
  const edge=subtract(end,start);
  const initial=cross(edge,subtract(a,start));
  const rate=cross(edge,d);
  if(Math.abs(rate)<EPS){if(initial<=EPS)return false;continue}
  const limit=(EPS-initial)/rate;
  if(rate>0)enter=Math.max(enter,limit);
  else exit=Math.min(exit,limit);
  if(exit-enter<=EPS)return false;
 }
 return exit-enter>EPS;
}
export function blockingBarrierSegments(environment,token){
 const segments=[];
 for(const object of environment?.objects||[]){
  if(!['wall','door','window'].includes(object?.type)||
     !Array.isArray(object.points))continue;
  // A smashed portal is traversable, like an open portal.
  if(['door','window'].includes(object.type)&&object.state==='broken')continue;
  if(wallAllows(object,token,'movement'))continue;
  for(let i=1;i<object.points.length;i++){
   const a=object.points[i-1],b=object.points[i];
   if(![a?.x,a?.y,b?.x,b?.y].every(number)||
      Math.hypot(a.x-b.x,a.y-b.y)<EPS)continue;
   segments.push({id:object.id,type:object.type,a,b});
  }
 }
 return segments;
}
/** Deterministic geometry preflight for tests and DM simulations only.
 * The final server trigger must reject direct REST/keyboard/group writes too.
 */
export function checkTokenMovement({token,destination,map,environment}){
 const grid=Number(map?.grid_size),width=Math.floor(Number(map?.width)/grid),
  height=Math.floor(Number(map?.height)/grid);
 const x=Number(destination?.x),y=Number(destination?.y);
 const w=Number(token?.span_x??1),h=Number(token?.span_y??1);
 if(!number(grid)||grid<=0||!number(width)||!number(height)||
    !number(x)||!number(y)||!Number.isInteger(x)||!Number.isInteger(y)||
    !number(w)||!number(h)||w<=0||h<=0||w>12||h>12)
  return {allowed:false,reason:'invalid'};
 if(x<0||y<0||x+w>width+EPS||y+h>height+EPS)
  return {allowed:false,reason:'bounds'};
 const hull=sweptTokenHull(token,destination);
 if(!hull)return {allowed:false,reason:'invalid'};
 for(const obstacle of blockingBarrierSegments(environment,token)){
  if(barrierCrossesSweptHull(obstacle.a,obstacle.b,hull))
   return {allowed:false,reason:'barrier',blockerId:obstacle.id};
 }
 return {allowed:true,reason:'ok'};
}
