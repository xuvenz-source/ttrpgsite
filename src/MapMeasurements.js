export const FEET_PER_CELL=5;
export const MEASUREMENT_TOOLS=['line','circle','square','cone'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const round1=n=>Math.round(n*10)/10;
export function pointOnBattlemap(clientX,clientY,rect,width,height,gridSize,zoom){
 if(!rect||!gridSize||!zoom)return null;
 const maxX=width/gridSize,maxY=height/gridSize;
 const clamp=(v,max)=>Math.max(0,Math.min(max,v));
 return {
  x:clamp((clientX-rect.left)/(gridSize*zoom),maxX),
  y:clamp((clientY-rect.top)/(gridSize*zoom),maxY)
 };
}
export function validMeasurement(payload,mapId,maxX=1000,maxY=1000){
 if(!payload||payload.mapId!==mapId||
    typeof payload.id!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.id)||
    typeof payload.actor!=='string'||payload.actor.length>64||
    !MEASUREMENT_TOOLS.includes(payload.tool)||
    !payload.start||!payload.end)return false;
 for(const point of [payload.start,payload.end]){
  if(!finite(point.x)||!finite(point.y)||point.x<0||point.y<0||
   point.x>maxX||point.y>maxY)return false;
 }
 return typeof payload.final==='boolean';
}
export function measurementGeometry(measurement){
 if(!measurement||!MEASUREMENT_TOOLS.includes(measurement.tool))return null;
 const {start,end,tool}=measurement;
 if(!finite(start?.x)||!finite(start?.y)||!finite(end?.x)||!finite(end?.y))return null;
 const dx=end.x-start.x,dy=end.y-start.y;
 const distance=Math.hypot(dx,dy),radius=tool==='square'?Math.max(Math.abs(dx),Math.abs(dy)):distance;
 const feet=round1((tool==='square'?radius:distance)*FEET_PER_CELL);
 const origin={x:start.x,y:start.y};
 let label='';
 if(tool==='line')label=feet+' ft';
 else if(tool==='cone')label=feet+' ft cone';
 else label=feet+' ft radius';
 // Cone is as wide across its far end as it is long (53.13° total angle).
 const halfPerp={x:-(dy/2),y:dx/2};
 const corners=tool==='cone'&&distance>0?[
  origin,{x:end.x+halfPerp.x,y:end.y+halfPerp.y},
  {x:end.x-halfPerp.x,y:end.y-halfPerp.y}
 ]:[];
 return {
  tool,origin,end,length:distance,radius,feet,label,corners,
  square:{x:start.x-radius,y:start.y-radius,width:radius*2,height:radius*2},
  labelPoint:tool==='square'?{x:start.x+radius,y:start.y-radius}:end
 };
}
export function liveMeasurementPayload(measure,id,actor,mapId,final){
 return {id,actor,mapId,tool:measure.tool,
  start:{x:measure.start.x,y:measure.start.y},
  end:{x:measure.end.x,y:measure.end.y},
  final:!!final};
}
