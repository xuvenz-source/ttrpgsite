import React,{useEffect,useMemo,useRef} from 'react';
import {normalizeAuthorizedFogFrame,FOG_UNEXPLORED,FOG_EXPLORED,
 fogMasks,MAX_FOG_AXIS} from './MapFogModel.js';

/** Displays per-viewer fog. Server RLS independently filters token,
 * monitor, combat and artwork data; this is presentation only. */
export default function MapFogOverlay({map,frame,scale=1}){
 const canvas=useRef(null);
 const mapId=map?.id;
 const sanitized=useMemo(()=>normalizeAuthorizedFogFrame(frame,mapId),
  [frame,mapId]);
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
  context.clearRect(0,0,width,height);
  // An unavailable, unauthenticated or invalid frame must never reveal cells.
  if(!sanitized){
   context.fillStyle='#040914';
   context.fillRect(0,0,width,height);
   return;
  }
  const mask=fogMasks(sanitized);
  for(let i=0;i<mask.length;i++){
   const state=mask[i];
   if(state!==FOG_UNEXPLORED&&state!==FOG_EXPLORED)continue;
   context.fillStyle=state===FOG_UNEXPLORED?'#040914':'rgba(4,9,20,.74)';
   context.fillRect(i%width,Math.floor(i/width),1,1);
  }
 },[sanitized,width,height]);
 if(!map)return null;
 return <canvas ref={canvas} className="map-fog-overlay"
  width={width} height={height}
  style={{width:map.width*scale,height:map.height*scale}}
  aria-hidden="true"/>;
}
