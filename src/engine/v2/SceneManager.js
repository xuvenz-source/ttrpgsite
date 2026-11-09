/**
 * World Engine V2 — one active map's published, immutable static scene.
 *
 * React tokens, tool coordinates and character edits NEVER invalidate this
 * manager. Only a server-authenticated publication generation, reconnect,
 * map switch or explicit authorization change may request a new scene.
 *
 * An invalidated scene is retained only for STATIC BACKGROUND CONTINUITY.
 * Its collision cache and hidden/vision grants are unusable until a fresh
 * server-authorized scene has been adopted. Phase 7 revokes sight separately.
 */
import {compileCollisionScene} from './CollisionSolver.js';
import {createSceneSpatialIndex} from './SceneSpatialIndex.js';
import {normalizeWorldSceneSnapshot,worldSceneDirtyRegions} from './SceneSnapshot.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid=value=>typeof value==='string'&&UUID.test(value);
const noop=()=>{};
const signature=scene=>[
 scene.mapId,scene.scope,scene.revision,scene.sceneGeneration,
 scene.rulesRevision,scene.published,scene.fogEnabled,scene.collisionEnabled,
 scene.dimensions.width,scene.dimensions.height,scene.dimensions.gridSize
].join(':');
export function createSceneManager({
 mapId,viewerId,fetchManifest,onChange=noop,onInvalidate=noop,onError=noop
}={}){
 if(!isUuid(mapId)||!isUuid(viewerId)||typeof fetchManifest!=='function'||
  typeof onChange!=='function'||typeof onInvalidate!=='function'||
  typeof onError!=='function')
  throw Error('V2 SceneManager needs an authorized map and loader');
 let currentMap=mapId,currentViewer=viewerId,disposed=false;
 let epoch=0,manifest=null,collision=null,spatial=null,stale=true;
 let requiredGeneration=0,inFlight=null,builds=0,fetches=0;
 const call=(fn,...args)=>{try{fn(...args)}catch{}};
 function invalidate(reason='scene-change',generation=null){
  if(disposed)return false;
  if(generation!==null){
   if(!Number.isSafeInteger(generation)||generation<0)return false;
   if(manifest&&!stale&&generation<=manifest.sceneGeneration)return false;
   if(generation<requiredGeneration)return false;
   requiredGeneration=Math.max(requiredGeneration,generation);
  }
  epoch++;
  stale=true;
  // Keep the static visual map to avoid black flashes, but revoke any
  // interpretation of this scene as current movement/vision authority.
  collision=null;spatial=null;
  call(onInvalidate,{reason,mapId:currentMap,viewerId:currentViewer,
   requiredGeneration});
  return true;
 }
 async function load(){
  if(disposed)return false;
  if(inFlight)return inFlight;
  const requestMap=currentMap,requestViewer=currentViewer,requestEpoch=epoch;
  const work=Promise.resolve().then(()=>{
   fetches++;
   return fetchManifest({mapId:requestMap,viewerId:requestViewer});
  }).then(raw=>{
   if(disposed||requestEpoch!==epoch||
    currentMap!==requestMap||currentViewer!==requestViewer)return false;
   const accepted=normalizeWorldSceneSnapshot(raw,requestMap);
   if(!accepted||accepted.sceneGeneration<requiredGeneration||
    (manifest&&accepted.scope===manifest.scope&&
     (accepted.revision<manifest.revision||
      accepted.sceneGeneration<manifest.sceneGeneration)))
    throw Error('Invalid or stale V2 published scene');
   const nextKey=signature(accepted);
   const unchanged=manifest&&signature(manifest)===nextKey;
   let candidate=unchanged?collision:null,lookup=unchanged?spatial:null;
   // A stale reload of the same published generation may reuse the
   // original immutable compilation, never a mutable player scene.
   if(unchanged&&manifest?.scope==='dm'&&manifest.published&&
    candidate===null&&manifest.environment){
    const base=compileCollisionScene({
     map:{id:requestMap,width:accepted.dimensions.width,
      height:accepted.dimensions.height,
      grid_size:accepted.dimensions.gridSize},
     environment:accepted.environment,revision:accepted.revision,
     collisionEnabled:accepted.collisionEnabled,scope:'dm'
    });
    if(!base)throw Error('Invalid DM collision geometry');
    lookup=createSceneSpatialIndex(base);
    candidate=Object.freeze({...base,querySegments:lookup.query});
    builds++;
   }else if(!unchanged&&accepted.scope==='dm'&&accepted.published){
    const base=compileCollisionScene({
     map:{id:requestMap,width:accepted.dimensions.width,
      height:accepted.dimensions.height,
      grid_size:accepted.dimensions.gridSize},
     environment:accepted.environment,revision:accepted.revision,
     collisionEnabled:accepted.collisionEnabled,scope:'dm'
    });
    if(!base)throw Error('Invalid DM collision geometry');
    lookup=createSceneSpatialIndex(base);
    candidate=Object.freeze({...base,querySegments:lookup.query});
    builds++;
   }
   const previous=manifest;
   manifest=unchanged?manifest:accepted;
   collision=candidate;spatial=lookup;
   stale=false;requiredGeneration=manifest.sceneGeneration;
   if(!unchanged){
    call(onChange,manifest,worldSceneDirtyRegions(previous,manifest));
   }
   return true;
  }).catch(error=>{
   if(!disposed&&requestEpoch===epoch){
    stale=true;collision=null;spatial=null;
    call(onError,error);
   }
   return false;
  }).finally(()=>{if(inFlight===work)inFlight=null});
  inFlight=work;
  return work;
 }
 return Object.freeze({
  load,
  notifyPublication(event){
   if(!event||event.version!==2||event.mapId!==currentMap||
    !Number.isSafeInteger(event.sceneGeneration)||
    event.sceneGeneration<0||
    Object.keys(event).some(k=>!['version','mapId','sceneGeneration'].includes(k)))
    return invalidate('invalid-scene-notice');
   return invalidate('published',event.sceneGeneration);
  },
  invalidate,
  changeContext({mapId:nextMap,viewerId:nextViewer}={}){
   if(disposed||!isUuid(nextMap)||!isUuid(nextViewer))return false;
   if(currentMap===nextMap&&currentViewer===nextViewer)return true;
   epoch++;currentMap=nextMap;currentViewer=nextViewer;
   manifest=null;collision=null;spatial=null;stale=true;
   requiredGeneration=0;
   call(onInvalidate,{reason:'context-change',mapId:currentMap,
    viewerId:currentViewer,requiredGeneration:0});
   return true;
  },
  dispose(){
   if(disposed)return;
   disposed=true;epoch++;inFlight=null;
   manifest=null;collision=null;spatial=null;stale=true;
  },
  // Retaining the scene for presentation does not grant physical movement.
  get displayedScene(){return manifest},
  get collisionScene(){return stale?null:collision},
  get sceneIndex(){return stale?null:spatial},
  get sceneGeneration(){return manifest?.sceneGeneration??null},
  get stale(){return stale},
  get mapId(){return currentMap},
  get viewerId(){return currentViewer},
  get statistics(){return {fetches,builds,indexMode:spatial?.mode??null}}
 });
}

/** The public V2 RPC never returns prepared editor data, player-visible
 * barrier positions or light object coordinates. The server checks auth.uid().
 */
export async function fetchWorldSceneV2({db,mapId}={}){
 if(typeof db?.rpc!=='function'||!isUuid(mapId))
  throw Error('Invalid V2 scene request');
 const {data,error}=await db.rpc('get_world_scene_v2',{p_map:mapId});
 if(error||!data)throw Error('V2 published scene unavailable');
 const result=normalizeWorldSceneSnapshot(data,mapId);
 if(!result)throw Error('Invalid V2 scene response');
 return result;
}
