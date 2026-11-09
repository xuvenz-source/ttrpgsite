/**
 * World Engine V2, Phase 3: deterministic local collision preflight.
 * This solver must receive ONLY geometry that the viewer is permitted to know.
 * Authoritative collision/permissions and concealed geometry remain SERVER-side.
 * Never use this result as proof of permission or persist it as a canonical move.
 */
import {
 validCollisionPoint,segmentCrossesSweptFootprint,
 segmentBoundingBox,footprintSweepBounds,boxesMayOverlap
} from './CollisionGeometry.js';

const EPS=1e-7;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const int=n=>Number.isSafeInteger(n);
const point=p=>({x:p.x,y:p.y});
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const same=(a,b)=>Math.abs(a.x-b.x)<EPS&&Math.abs(a.y-b.y)<EPS;
const attrNumber=v=>{
 const item=v&&typeof v==='object'?v.current:v;
 const raw=typeof item==='number'?String(item):item;
 return typeof raw==='string'&&/^-?[0-9]{1,5}(\.[0-9]{1,3})?$/.test(raw)?
  Number(raw):null;
};
function barrierPasses(segment,piece){
 const b=segment.rule;
 if(['door','window'].includes(b.type)&&['open','broken'].includes(b.state))
  return true;
 if(typeof b.attributeField==='string'&&b.attributeField&&b.movementAt!=null&&
  b.movementAt!==''&&attrNumber(b.movementAt)!==null){
  const fields=piece.attributes||piece.field_values||piece.npc_values;
  const value=attrNumber(fields?.[b.attributeField]);
  if(value!==null&&value>=Number(b.movementAt))return true;
 }
 // Existing server wall_passes uses 'oneWay' only for VISION.
 // Do not silently invent movement-direction exceptions on the client.
 return b.blocksMovement===false;
}
const fail=()=>({complete:false,blocked:true,offset:null,waypoints:[],reason:'invalid'});
/** Compile and validate a published/disclosed environment once per scene revision.
 * Invalid/missing geometry fails closed rather than disappearing from collision.
 *
 * 'dm' is full DM geometry; 'disclosed' is a server-sanitized viewer subset.
 * The caller MUST enforce this scope: a string is not an auth credential.
 */
export function compileCollisionScene({
 map,environment,revision,collisionEnabled=true,scope
}={}){
 if(!['dm','disclosed'].includes(scope)||!int(revision)||revision<0||
  typeof collisionEnabled!=='boolean'||!finite(map?.width)||!finite(map?.height)||
  !finite(map?.grid_size)||map.grid_size<=0||
  !Array.isArray(environment?.objects)||environment.objects.length>120)return null;
 const widthCells=Math.floor(map.width/map.grid_size);
 const heightCells=Math.floor(map.height/map.grid_size);
 if(!int(widthCells)||!int(heightCells)||widthCells<1||heightCells<1||
  widthCells>10000||heightCells>10000)return null;
 const segments=[];
 for(const object of environment.objects){
  if(!object||typeof object!=='object')return null;
  if(!['wall','door','window'].includes(object.type))continue;
  if(!Array.isArray(object.points)||object.points.length<2||
   object.points.length>80)return null;
  const rule={
   type:object.type,state:object.state,
   blocksMovement:object.blocksMovement,
   attributeField:object.attributeField,
   movementAt:object.movementAt
  };
  for(let i=1;i<object.points.length;i++){
   const a=object.points[i-1],b=object.points[i];
   if(!validCollisionPoint(a)||!validCollisionPoint(b))return null;
   if(Math.hypot(b.x-a.x,b.y-a.y)<EPS)continue;
   const from=point(a),to=point(b);
   const length=Math.hypot(to.x-from.x,to.y-from.y);
   segments.push({a:from,b:to,bounds:segmentBoundingBox(from,to),
    tangent:{x:(to.x-from.x)/length,y:(to.y-from.y)/length},rule});
  }
 }
 return {version:2,mapId:typeof map.id==='string'?map.id:null,
  scope,revision,collisionEnabled,widthCells,heightCells,segments};
}
function normalizedPieces(pieces){
 if(!Array.isArray(pieces)||pieces.length<1||pieces.length>64)return null;
 const ids=new Set(),out=[];
 for(const part of pieces){
  const width=part?.spanX??part?.span_x??part?.span??1;
  const height=part?.spanY??part?.span_y??part?.span??1;
  if(!validCollisionPoint(part)||!finite(width)||!finite(height)||
   width<=0||height<=0||width>12||height>12||
   !['token','tool'].includes(part.kind)||
   typeof part.id!=='string'||!part.id)return null;
  const key=part.kind+':'+part.id;
  if(ids.has(key))return null;
  ids.add(key);
  out.push({...part,spanX:width,spanY:height});
 }
 return out;
}
function footprintAt(part,anchor,offset){
 return {x:part.x+(offset.x-anchor.x),y:part.y+(offset.y-anchor.y)};
}
function insideBounds(scene,pieces,anchor,offset){
 return pieces.every(part=>{
  const pos=footprintAt(part,anchor,offset);
  return pos.x>=-EPS&&pos.y>=-EPS&&
   pos.x+part.spanX<=scene.widthCells+EPS&&
   pos.y+part.spanY<=scene.heightCells+EPS;
 });
}
function firstImpact(scene,pieces,anchor,from,to){
 let impact=null;
 const delta={x:to.x-from.x,y:to.y-from.y};
 const consider=(t,tangent)=>{
  if(t<0||t>1||impact&&t>=impact.t)return;
  impact={t,tangent};
 };
 for(const part of pieces){
  const pos=footprintAt(part,anchor,from);
  for(const axis of ['x','y']){
   const d=delta[axis],start=pos[axis];
   const maximum=axis==='x'?scene.widthCells:scene.heightCells;
   const span=axis==='x'?part.spanX:part.spanY;
   const end=start+d;
   if(d>0&&end+span>maximum+EPS)
    consider(Math.max(0,(maximum-span-start)/d),
     axis==='x'?{x:0,y:1}:{x:1,y:0});
   if(d<0&&end<-EPS)
    consider(Math.max(0,-start/d),
     axis==='x'?{x:0,y:1}:{x:1,y:0});
  }
 }
 if(!scene.collisionEnabled)return impact;
 for(const part of pieces){
  const start=footprintAt(part,anchor,from),end=footprintAt(part,anchor,to);
  const sweep=footprintSweepBounds(start,end,part.spanX,part.spanY);
  for(const segment of scene.segments){
   if(barrierPasses(segment,part)||!boxesMayOverlap(sweep,segment.bounds))continue;
   const intersects=t=>segmentCrossesSweptFootprint(segment.a,segment.b,
    start,lerp(start,end,t),part.spanX,part.spanY);
   if(!intersects(1))continue;
   if(intersects(0)){consider(0,segment.tangent);continue}
   let lo=0,hi=1;
   for(let i=0;i<32;i++){
    const mid=(lo+hi)/2;
    if(intersects(mid))hi=mid;
    else lo=mid;
   }
   consider(lo,segment.tangent);
  }
 }
 return impact;
}
/**
 * Sweep a whole mixed group as a rigid translation.
 * 'anchor' is the original grab/selected anchor (defaults to first piece).
 * 'from'/'to' are ABSOLUTE anchor grid coordinates, possibly fractional.
 *
 * The result is advisory presentation geometry, not an approved route.
 * Never give a player raw blocker geometry or source-specific failure details.
 */
export function solveCollisionPath({
 scene,pieces,anchor,from,to,allowSliding=true,maxSlides=3
}={}){
 const parts=normalizedPieces(pieces);
 if(!scene||scene.version!==2||!['dm','disclosed'].includes(scene.scope)||
  !parts||!validCollisionPoint(from)||!validCollisionPoint(to)||
  typeof allowSliding!=='boolean'||!int(maxSlides)||maxSlides<0||maxSlides>4)
  return fail();
 const base=anchor??point(parts[0]);
 if(!validCollisionPoint(base)||!insideBounds(scene,parts,base,from))
  return fail();
 if(Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))>512)return fail();
 let current=point(from),goal=point(to),blocked=false;
 const waypoints=[];
 for(let attempt=0;attempt<=maxSlides;attempt++){
  if(same(current,goal))break;
  const hit=firstImpact(scene,parts,base,current,goal);
  if(!hit){
   current=goal;waypoints.push(point(current));break;
  }
  blocked=true;
  // Keep a microscopic clearance on the legal side of a solid edge.
  // Without it, float rounding can put the touching wall inside the next
  // swept rectangle and incorrectly prevent a parallel wall slide.
  const stride=Math.max(Math.abs(goal.x-current.x),Math.abs(goal.y-current.y),1);
  const safeT=Math.max(0,hit.t-1e-6/stride);
  const at=lerp(current,goal,safeT);
  if(!same(at,current)){
   current=at;waypoints.push(point(current));
  }
  if(!allowSliding||attempt===maxSlides)break;
  const remain={x:goal.x-current.x,y:goal.y-current.y};
  const slide=remain.x*hit.tangent.x+remain.y*hit.tangent.y;
  if(Math.abs(slide)<EPS)break;
  const next={x:current.x+hit.tangent.x*slide,
   y:current.y+hit.tangent.y*slide};
  if(same(next,current))break;
  goal=next;
 }
 return {complete:!blocked&&same(current,to),
  blocked,offset:point(current),waypoints,reason:blocked?'blocked':'ok'};
}
/** One direct step without sliding: useful for exact grid edges or
 * authorized navigation grants. The server still revalidates this move.
 */
export function collisionAllowsStep(options){
 const result=solveCollisionPath({...options,allowSliding:false,maxSlides:0});
 return result.complete===true;
}
