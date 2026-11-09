/**
 * Decorative DM-only light fan. Scene environment objects are never
 * available to a player. The fan clips radial glow at light-blocking
 * walls/windows/doors, including around actual wall endpoints.
 * This is not sight authorization; the server remains the sole fog owner.
 */
const finite=Number.isFinite;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const diff=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const isPoint=p=>p&&finite(p.x)&&finite(p.y);
const blocksLight=object=>{
 if(!['wall','door','window'].includes(object?.type))return false;
 if(['open','broken'].includes(object.state))return false;
 if(object.type==='window'&&
  (object.curtains===true||object.curtains==='true'))return true;
 return object.blocksLight!==false;
};
/**
 * Returns a conservative view polygon or null if geometry is malformed or
 * unbounded. Up to 128 nearby blocker segments per light. There is deliberately
 * no unoccluded-fallback glow when this validator rejects geometry.
 */
export function occludedLightFan(objects,source,radius,{samples=128}={}){
 if(!Array.isArray(objects)||objects.length>120||!isPoint(source)||
  !finite(radius)||radius<=0||radius>200||
  !Number.isSafeInteger(samples)||samples<32||samples>256)return null;
 const segments=[];
 for(const object of objects){
  if(!blocksLight(object))continue;
  if(!Array.isArray(object.points)||object.points.length<2||
   object.points.length>80)return null;
  for(let i=1;i<object.points.length;i++){
   const a=object.points[i-1],b=object.points[i];
   if(!isPoint(a)||!isPoint(b))return null;
   // Far-away segments cannot occlude this radius.
   if(Math.max(Math.min(a.x,b.x)-source.x,
      source.x-Math.max(a.x,b.x),
      Math.min(a.y,b.y)-source.y,
      source.y-Math.max(a.y,b.y))>radius)continue;
   if(segments.length>=128)return null;
   segments.push({a,b,diff:diff(b,a)});
  }
 }
 const angles=[];
 const pushAngle=angle=>{
  if(!finite(angle))return;
  const normalized=(angle+2*Math.PI)%(2*Math.PI);
  angles.push(normalized);
 };
 for(let n=0;n<samples;n++)pushAngle(2*Math.PI*n/samples);
 // Extra rays either side of every blocker endpoint prevent interpolation
 // from creating a large visual shortcut across the end of a wall.
 for(const {a,b} of segments){
  for(const endpoint of [a,b]){
   const angle=Math.atan2(endpoint.y-source.y,endpoint.x-source.x);
   for(const shift of [-0.00005,0,0.00005])pushAngle(angle+shift);
  }
 }
 if(angles.length>1024)return null;
 angles.sort((a,b)=>a-b);
 const result=[],minRay=0.00001;
 for(const angle of angles){
  const direction={x:Math.cos(angle),y:Math.sin(angle)};
  let reach=radius;
  for(const segment of segments){
   const d=cross(direction,segment.diff);
   if(Math.abs(d)<1e-9)continue;
   const q=diff(segment.a,source);
   const distance=cross(q,segment.diff)/d;
   const along=cross(q,direction)/d;
   if(distance>minRay&&distance<reach&&
    along>=-0.00001&&along<=1.00001)reach=distance;
  }
  result.push({x:source.x+direction.x*reach,
   y:source.y+direction.y*reach});
 }
 return result;
}
