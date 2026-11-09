import React,{useEffect,useMemo,useRef} from 'react';
import {movementDiagnostics} from './MovementDiagnostics.js';
import {normalizeAuthorizedFogFrame,MAX_FOG_AXIS} from './MapFogModel.js';
import {fogPaintMask,changedFogCells,FOG_UNEXPLORED,FOG_EXPLORED} from './FogRenderDelta.js';

/** Per-viewer sanitized fog: presentation only, never permission. Keep the
 * canvas mounted and paint only changed cells on authorized revisions.
 */
export default function MapFogOverlay({map,frame,scale=1}){
 const canvas=useRef(null);
 const painted=useRef({mapId:null,width:0,height:0,mask:null});
 const mapId=map?.id;
 const sanitized=useMemo(()=>normalizeAuthorizedFogFrame(frame,mapId),
  [frame,mapId]);
 // Cosmetic continuity is confined to explored memory. Current entity
 // visibility remains server-authoritative and is not derived from this set.
 const displayVisible=useMemo(()=>{
  if(!sanitized?.enabled||!Array.isArray(frame?.displayVisibleDuringRefresh))return null;
  const explored=new Set(sanitized.explored);
  return new Set(frame.displayVisibleDuringRefresh.filter(index=>
   Number.isSafeInteger(index)&&explored.has(index)));
 },[sanitized,frame]);
 const fallbackWidth=Math.ceil(Number(map?.width)/Number(map?.grid_size));
 const fallbackHeight=Math.ceil(Number(map?.height)/Number(map?.grid_size));
 const width=sanitized?.width||(
  Number.isFinite(fallbackWidth)?Math.max(1,Math.min(MAX_FOG_AXIS,fallbackWidth)):1);
 const height=sanitized?.height||(
  Number.isFinite(fallbackHeight)?Math.max(1,Math.min(MAX_FOG_AXIS,fallbackHeight)):1);
 useEffect(()=>{
  const context=canvas.current?.getContext('2d',{alpha:true});
  if(!context)return;
  context.imageSmoothingEnabled=false;
  const old=painted.current;
  const sameMap=old.mapId===mapId&&old.width===width&&old.height===height;
  // Invalid/unavailable authorization always becomes opaque, even during a
  // network interruption. Do not reuse stale visibility from another map.
  if(!sanitized){
   if(!sameMap||!old.mask||old.mask.some(v=>v!==FOG_UNEXPLORED)){
    movementDiagnostics.count('fog-canvas-invalidated');
    context.fillStyle='#040914';
    context.fillRect(0,0,width,height);
   }
   painted.current={mapId,width,height,mask:new Uint8Array(width*height)};
   return;
  }
  const next=fogPaintMask(sanitized,displayVisible);
  if(!next)return;
  const dirty=changedFogCells(sameMap?old.mask:null,next);
  if(dirty.length===width*height)movementDiagnostics.count('fog-canvas-full-frame');
  else if(dirty.length)movementDiagnostics.count('fog-canvas-delta-frame');
  const finishPaint=movementDiagnostics.begin('fog-canvas-paint');
  for(const index of dirty){
   const x=index%width,y=Math.floor(index/width),state=next[index];
   context.clearRect(x,y,1,1);
   if(state===FOG_UNEXPLORED||state===FOG_EXPLORED){
    context.fillStyle=state===FOG_UNEXPLORED?'#040914':'rgba(4,9,20,.74)';
    context.fillRect(x,y,1,1);
   }
  }
  painted.current={mapId,width,height,mask:next};
  finishPaint();
 },[sanitized,width,height,displayVisible,mapId]);
 if(!map)return null;
 return <canvas ref={canvas} className="map-fog-overlay"
  width={width} height={height}
  style={{width:map.width*scale,height:map.height*scale}}
  aria-hidden="true"/>;
}
