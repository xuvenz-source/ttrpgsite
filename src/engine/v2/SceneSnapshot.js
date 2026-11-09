/**
 * Validated, immutable V2 publication snapshots. A player's snapshot MUST
 * never contain hidden walls, doors, static light locations or editor data.
 *
 * The database RPC determines scope using auth.uid(); a client cannot
 * authorize itself by setting scope:'dm'. Client validation is defense in
 * depth only; SQL authorization is the trust boundary.
 */
const int=Number.isSafeInteger;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPoint=(point,w,h)=>point&&finite(point.x)&&finite(point.y)&&
 point.x>=0&&point.y>=0&&point.x<=w&&point.y<=h;
const integerRange=(value,min,max)=>int(value)&&value>=min&&value<=max;
const numberRange=(value,min,max)=>finite(value)&&value>=min&&value<=max;
const weather=['none','rain','snow','fog'];
const barriers=['wall','door','window'];
const MAX_OBJECTS=120;
const MAX_POINTS=2500;
function immutable(object){
 if(object&&typeof object==='object'&&!Object.isFrozen(object)){
  for(const value of Object.values(object))immutable(value);
  Object.freeze(object);
 }
 return object;
}
const lightConfig=(light,w,h)=>{
 if(!validPoint(light,w,h)||
  !numberRange(light.bright,0,500)||!numberRange(light.dim,0,500)||
  !numberRange(light.intensity,0,100)||
  light.color!=null&&(typeof light.color!=='string'||light.color.length>64)||
  light.effect!=null&&(typeof light.effect!=='string'||light.effect.length>32)||
  light.enabled!=null&&typeof light.enabled!=='boolean')return null;
 return {id:light.id,type:'light',x:light.x,y:light.y,
  bright:light.bright,dim:light.dim,
  intensity:light.intensity,color:light.color??'#ffce7a',
  effect:light.effect??'steady',enabled:light.enabled!==false,
  elevation:numberRange(light.elevation,-10000,10000)?light.elevation:0};
};
const barrierConfig=(barrier,w,h)=>{
 if(!Array.isArray(barrier.points)||barrier.points.length<2||
  barrier.points.length>80||!barrier.points.every(p=>validPoint(p,w,h))||
  barrier.blocksMovement!=null&&typeof barrier.blocksMovement!=='boolean'||
  barrier.blocksLight!=null&&typeof barrier.blocksLight!=='boolean'||
  barrier.attributeField!=null&&(typeof barrier.attributeField!=='string'||
   barrier.attributeField.length>128)||
  barrier.movementAt!=null&&!numberRange(Number(barrier.movementAt),-100000,100000)||
  barrier.visionAt!=null&&!numberRange(Number(barrier.visionAt),-100000,100000)||
  barrier.vision!=null&&!['block','pass','one-way'].includes(barrier.vision)||
  barrier.oneWay!=null&&!['a-to-b','b-to-a'].includes(barrier.oneWay)||
  barrier.state!=null&&!['closed','open','broken'].includes(barrier.state))
  return null;
 return {id:barrier.id,type:barrier.type,
  points:barrier.points.map(p=>({x:p.x,y:p.y})),
  blocksMovement:barrier.blocksMovement!==false,
  blocksLight:barrier.blocksLight!==false,
  vision:barrier.vision??'block',oneWay:barrier.oneWay??'a-to-b',
  state:barrier.state??'closed',curtains:barrier.curtains===true,
  locked:barrier.locked===true,attributeField:barrier.attributeField??'',
  movementAt:barrier.movementAt??null,visionAt:barrier.visionAt??null,
  height:numberRange(barrier.height,-10000,10000)?barrier.height:0};
};
function normalizedEnvironment(raw,w,h){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  !Array.isArray(raw.objects)||raw.objects.length>MAX_OBJECTS)
  return null;
 const ids=new Set(),objects=[];let pointCount=0;
 for(const item of raw.objects){
  if(!item||typeof item!=='object'||typeof item.id!=='string'||
   item.id.length<1||item.id.length>128||ids.has(item.id)||
   ![...barriers,'light'].includes(item.type))return null;
  const next=item.type==='light'?lightConfig(item,w,h):
   barrierConfig(item,w,h);
  if(!next)return null;
  ids.add(item.id);
  if(next.points)pointCount+=next.points.length;
  if(pointCount>MAX_POINTS)return null;
  objects.push(next);
 }
 return {version:1,objects};
}
export function normalizeWorldSceneSnapshot(raw,mapId){
 if(!raw||typeof raw!=='object'||!uuid.test(mapId)||
  raw.version!==2||raw.mapId!==mapId||
  !['dm','viewer'].includes(raw.scope)||
  !integerRange(raw.revision,0,Number.MAX_SAFE_INTEGER)||
  !integerRange(raw.sceneGeneration,0,Number.MAX_SAFE_INTEGER)||
  !integerRange(raw.rulesRevision,0,Number.MAX_SAFE_INTEGER)||
  typeof raw.published!=='boolean'||
  typeof raw.fogEnabled!=='boolean'||
  typeof raw.collisionEnabled!=='boolean'||
  !numberRange(raw.ambient,0,100)||
  !raw.effects||!weather.includes(raw.effects.weather)||
  !numberRange(raw.effects.intensity,0,100)||
  !raw.dimensions||!integerRange(raw.dimensions.width,1,1000000)||
  !integerRange(raw.dimensions.height,1,1000000)||
  !integerRange(raw.dimensions.gridSize,1,10000))
  return null;
 const cellsW=Math.floor(raw.dimensions.width/raw.dimensions.gridSize);
 const cellsH=Math.floor(raw.dimensions.height/raw.dimensions.gridSize);
 if(cellsW<1||cellsH<1||cellsW>10000||cellsH>10000)return null;
 if(raw.scope==='viewer'&&raw.environment!==null)return null;
 if(raw.scope==='dm'&&!raw.published&&raw.environment!==null)return null;
 let environment=null;
 if(raw.scope==='dm'&&raw.published){
  environment=normalizedEnvironment(raw.environment,cellsW,cellsH);
  if(!environment)return null;
 }
 if(!raw.published&&(raw.fogEnabled||raw.collisionEnabled))return null;
 const result={
  version:2,mapId,scope:raw.scope,published:raw.published,
  revision:raw.revision,sceneGeneration:raw.sceneGeneration,
  rulesRevision:raw.rulesRevision,
  fogEnabled:raw.fogEnabled,collisionEnabled:raw.collisionEnabled,
  ambient:raw.ambient,effects:{weather:raw.effects.weather,
   intensity:raw.effects.intensity},
  dimensions:{width:raw.dimensions.width,height:raw.dimensions.height,
   gridSize:raw.dimensions.gridSize},
  environment
 };
 return immutable(result);
}
function affected(object,w,h){
 if(object.type==='light'){
  const radius=object.bright+object.dim;
  return {left:Math.max(0,object.x-radius),
   right:Math.min(w,object.x+radius),
   top:Math.max(0,object.y-radius),
   bottom:Math.min(h,object.y+radius)};
 }
 const xs=object.points.map(p=>p.x),ys=object.points.map(p=>p.y);
 return {left:Math.max(0,Math.min(...xs)-1),
  right:Math.min(w,Math.max(...xs)+1),
  top:Math.max(0,Math.min(...ys)-1),
  bottom:Math.min(h,Math.max(...ys)+1)};
}
export function worldSceneDirtyRegions(before,after){
 const full={full:true,regions:[]};
 if(!before||!after||before.mapId!==after.mapId||
  before.scope!==after.scope||before.published!==after.published||
  before.fogEnabled!==after.fogEnabled||
  before.collisionEnabled!==after.collisionEnabled||
  before.ambient!==after.ambient||
  before.effects.weather!==after.effects.weather||
  before.effects.intensity!==after.effects.intensity||
  before.dimensions.width!==after.dimensions.width||
  before.dimensions.height!==after.dimensions.height||
  before.dimensions.gridSize!==after.dimensions.gridSize)
  return full;
 const prior=before.environment?.objects||[];
 const current=after.environment?.objects||[];
 const oldById=new Map(prior.map(o=>[o.id,o]));
 const newById=new Map(current.map(o=>[o.id,o]));
 const ids=new Set([...oldById.keys(),...newById.keys()]);
 const regions=[];
 const width=Math.floor(after.dimensions.width/after.dimensions.gridSize);
 const height=Math.floor(after.dimensions.height/after.dimensions.gridSize);
 for(const id of ids){
  const previous=oldById.get(id),next=newById.get(id);
  if(JSON.stringify(previous)===JSON.stringify(next))continue;
  if(previous)regions.push(affected(previous,width,height));
  if(next)regions.push(affected(next,width,height));
  if(regions.length>80)return full;
 }
 return {full:false,regions};
}
