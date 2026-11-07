/** DM-only prepared environment data. Coordinates are in map grid cells, not pixels. */
export const EMPTY_ENVIRONMENT={
 version:1,ambient:25,
 fog:{automatic:true,partyShared:true},
 effects:{weather:'none',intensity:0},
 objects:[]
};
const id=()=>globalThis.crypto?.randomUUID?.()||('env-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const between=(n,min,max)=>Math.max(min,Math.min(max,n));
export const normalizePoint=p=>({x:between(finite(p?.x),0,10000),y:between(finite(p?.y),0,10000)});
export function normalizeEnvironment(raw){
 const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 return {version:1,ambient:between(finite(source.ambient,25),0,100),
  fog:{automatic:source.fog?.automatic!==false,partyShared:source.fog?.partyShared!==false},
  effects:{weather:['none','rain','snow','fog'].includes(source.effects?.weather)?source.effects.weather:'none',
   intensity:between(finite(source.effects?.intensity),0,100)},
  objects:Array.isArray(source.objects)?source.objects.slice(0,2500).filter(o=>
   o&&typeof o.id==='string'&&['wall','door','window','light'].includes(o.type)).map(o=>({
    ...o,points:Array.isArray(o.points)?o.points.slice(0,500).map(normalizePoint):[],
    x:finite(o.x),y:finite(o.y),
    bright:between(finite(o.bright,20),0,500),
    dim:between(finite(o.dim,20),0,500)
   })):[]
 };
}
export function wallPreset(preset='solid'){
 const base={blocksMovement:true,blocksLight:true,vision:'block',oneWay:'a-to-b',
  attributeField:'',movementAt:null,visionAt:null,height:0};
 if(preset==='glass')return {...base,blocksLight:false,vision:'pass'};
 if(preset==='invisible')return {...base,blocksLight:false,vision:'pass'};
 if(preset==='one-way')return {...base,blocksLight:false,vision:'one-way'};
 if(preset==='elevation')return {...base,movementAt:15,visionAt:15,height:15};
 return base;
}
export function createBarrier(type,points,preset='solid'){
 if(!['wall','door','window'].includes(type)||!Array.isArray(points)||points.length<2)return null;
 const pts=points.map(normalizePoint);
 if(!pts.some((p,i)=>i&&Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y)>.01))return null;
 if(type==='wall')return {id:id(),type,points:pts,...wallPreset(preset)};
 return {id:id(),type,points:pts.slice(0,2),state:'closed',locked:false,
  blocksMovement:true,blocksLight:type==='door',vision:type==='door'?'block':'pass',
  oneWay:'a-to-b',attributeField:'',movementAt:null,visionAt:null,height:0};
}
export function createLight(point,config={}){
 const p=normalizePoint(point);
 return {id:id(),type:'light',x:p.x,y:p.y,bright:between(finite(config.bright,20),0,500),
  dim:between(finite(config.dim,20),0,500),color:config.color||'#ffce7a',
  intensity:between(finite(config.intensity,100),0,100),
  enabled:config.enabled!==false,effect:config.effect||'steady',elevation:finite(config.elevation)};
}
export function withObject(environment,object){
 const base=normalizeEnvironment(environment);
 return {...base,objects:[...base.objects,object]};
}
export function patchObject(environment,objectId,patch){
 const base=normalizeEnvironment(environment);
 return {...base,objects:base.objects.map(o=>o.id===objectId?{...o,...patch,id:o.id,type:o.type}:o)};
}
export function removeObject(environment,objectId){
 const base=normalizeEnvironment(environment);
 return {...base,objects:base.objects.filter(o=>o.id!==objectId)};
}
/** Per-token conditional gate; no mutable global wall state. Fail closed on missing fields. */
export function tokenAttributeValue(token,fieldId){
 if(!fieldId)return null;
 const raw=token?.field_values?.[fieldId]??token?.npc_values?.[fieldId];
 const value=raw&&typeof raw==='object'?raw.current:raw;
 return value!==''&&value!=null&&Number.isFinite(Number(value))?Number(value):null;
}
export function wallAllows(wall,token,kind='movement',fromSide='a'){
 const condition=kind==='vision'?wall.visionAt:wall.movementAt;
 if(condition!==null&&condition!==undefined&&condition!==''&&wall.attributeField){
  const value=tokenAttributeValue(token,wall.attributeField);
  if(value!==null&&value>=Number(condition))return true;
 }
 if(kind==='movement')return wall.blocksMovement===false||
  ((wall.type==='door'||wall.type==='window')&&wall.state==='open');
 if((wall.type==='door'||wall.type==='window')&&wall.state==='open')return true;
 // Closed curtains obscure sight through an otherwise transparent window.
 if(wall.type==='window'&&wall.curtains===true)return false;
 if(wall.vision==='pass')return true;
 if(wall.vision==='one-way')return wall.oneWay===(fromSide==='a'?'a-to-b':'b-to-a');
 return false;
}
/** Move exactly one door/window endpoint. Other end remains fixed; no grid snapping. */
export function resizeBarrierEndpoint(points,index,position){
 if(!Array.isArray(points)||points.length!==2||![0,1].includes(index))return null;
 const result=points.map((p,i)=>i===index?normalizePoint(position):normalizePoint(p));
 if(Math.hypot(result[1].x-result[0].x,result[1].y-result[0].y)<.01)return null;
 return result;
}
/** Translate an entire geometry object without snapping or distorting its shape at map edges. */
export function translateEnvironmentObject(object,offset,bounds){
 if(!object||!['wall','door','window','light'].includes(object.type))return null;
 const maxX=Number(bounds?.x),maxY=Number(bounds?.y);
 if(!Number.isFinite(maxX)||!Number.isFinite(maxY)||maxX<=0||maxY<=0)return null;
 const ox=Number(offset?.x),oy=Number(offset?.y);
 if(!Number.isFinite(ox)||!Number.isFinite(oy))return null;
 const points=object.type==='light'?[{x:Number(object.x),y:Number(object.y)}]:
  object.points?.map(p=>({x:Number(p.x),y:Number(p.y)}));
 if(!points?.length||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const minX=Math.min(...points.map(p=>p.x)),maxPointX=Math.max(...points.map(p=>p.x));
 const minY=Math.min(...points.map(p=>p.y)),maxPointY=Math.max(...points.map(p=>p.y));
 const dx=Math.max(-minX,Math.min(maxX-maxPointX,ox));
 const dy=Math.max(-minY,Math.min(maxY-maxPointY,oy));
 const round=n=>Math.round(n*10000)/10000;
 const translated=points.map(p=>({x:round(p.x+dx),y:round(p.y+dy)}));
 return object.type==='light'?{x:translated[0].x,y:translated[0].y}:
  {points:translated};
}
export function lightRadii(light){
 const bright=between(finite(light?.bright),0,500),dim=between(finite(light?.dim),0,500);
 return {bright,dim,outer:bright+dim};
}
export function snapEnvironmentPoint(point,snap=true){
 const p=normalizePoint(point);
 return snap?{x:Math.round(p.x),y:Math.round(p.y)}:p;
}
