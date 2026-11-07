import {wallAllows} from './MapEnvironment.js';
import {FEET_PER_CELL} from './MapMeasurements.js';

// Geometry in grid-cell coordinates. This is a DM-only visual preview; it is
// deliberately not the server-authoritative player visibility calculation.
const EPS=0.00001;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
export function wallSegments(environment,viewer,kind='vision'){
 const segments=[];
 for(const object of environment?.objects||[]){
  if(!['wall','door','window'].includes(object.type)||!Array.isArray(object.points))continue;
  for(let i=1;i<object.points.length;i++){
   const a=object.points[i-1],b=object.points[i];
   if(Math.hypot(a.x-b.x,a.y-b.y)<EPS)continue;
   const side=cross(sub(b,a),sub(viewer,a))>=0?'a':'b';
   if(!wallAllows(object,viewer.token,kind,side))
    segments.push([a,b]);
  }
 }
 return segments;
}
export function raySegmentIntersection(origin,angle,a,b){
 const direction={x:Math.cos(angle),y:Math.sin(angle)},edge=sub(b,a);
 const denominator=cross(direction,edge);
 if(Math.abs(denominator)<EPS)return null;
 const delta=sub(a,origin);
 const distance=cross(delta,edge)/denominator;
 const unit=cross(delta,direction)/denominator;
 if(distance<0||unit<-EPS||unit>1+EPS)return null;
 return {x:origin.x+distance*direction.x,y:origin.y+distance*direction.y,distance};
}
export function previewVisionPolygon({map,environment,viewer,maxFeet=60,kind='vision'}){
 if(!map||!viewer)return [];
 const width=map.width/map.grid_size,height=map.height/map.grid_size;
 if(!(width>0&&height>0))return [];
 const origin={x:Math.max(0,Math.min(width,viewer.x)),
  y:Math.max(0,Math.min(height,viewer.y)),token:viewer.token};
 const border=[
  [{x:0,y:0},{x:width,y:0}],
  [{x:width,y:0},{x:width,y:height}],
  [{x:width,y:height},{x:0,y:height}],
  [{x:0,y:height},{x:0,y:0}]
 ];
 const walls=wallSegments(environment,origin,kind);
 const blockers=[...border,...walls];
 const candidates=[];
 for(let i=0;i<96;i++)candidates.push(i*Math.PI*2/96);
 for(const [a,b] of blockers){
  for(const p of [a,b]){
   const angle=Math.atan2(p.y-origin.y,p.x-origin.x);
   candidates.push(angle-EPS,angle,angle+EPS);
  }
 }
 const maxRange=Math.max(1,Math.min(500,Number(maxFeet)||60))/FEET_PER_CELL;
 const hits=candidates.map(angle=>{
  let limit=maxRange,hit={x:origin.x+Math.cos(angle)*limit,
   y:origin.y+Math.sin(angle)*limit};
  for(const [a,b] of blockers){
   const intersection=raySegmentIntersection(origin,angle,a,b);
   if(intersection&&intersection.distance<limit){
    limit=intersection.distance;hit=intersection;
   }
  }
  return {angle:(angle+2*Math.PI)%(2*Math.PI),
   x:Math.max(0,Math.min(width,hit.x)),y:Math.max(0,Math.min(height,hit.y))};
 }).sort((a,b)=>a.angle-b.angle);
 return hits.map(({x,y})=>({x,y}));
}
export function pointInPolygon(point,polygon){
 if(!point||!Array.isArray(polygon)||polygon.length<3)return false;
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  const intersects=((a.y>point.y)!==(b.y>point.y))&&
   point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x;
  if(intersects)inside=!inside;
 }
 return inside;
}
export function previewViewer(token,characters=[]){
 if(!token)return null;
 const sheet=characters.find(c=>c.id===token.character_id);
 return {x:Number(token.x)+(Number(token.span_x??1)/2),
  y:Number(token.y)+(Number(token.span_y??1)/2),
  token:{...token,field_values:sheet?.field_values||token.field_values||{}}};
}

/** CSS clip path for a radial light gradient, evaluated from the light source.
 * Rays travel around the ends of finite wall segments, not through their faces.
 * Returns null only when no safe clipping geometry can be calculated.
 */
export function lightOcclusionClip({map,environment,x,y,radiusFeet}){
 const cx=Number(x),cy=Number(y),radius=Number(radiusFeet)/FEET_PER_CELL;
 if(!map||!environment||!Number.isFinite(cx)||!Number.isFinite(cy)||
  !Number.isFinite(radius)||radius<=0)return null;
 const polygon=previewVisionPolygon({map,environment,viewer:{x:cx,y:cy},
  maxFeet:radiusFeet,kind:'light'});
 if(polygon.length<3)return null;
 const percent=n=>Math.round(n*10000)/10000+'%';
 return 'polygon('+polygon.map(p=>
  percent((p.x-(cx-radius))/(2*radius)*100)+' '+
  percent((p.y-(cy-radius))/(2*radius)*100)).join(',')+')';
}
