import React,{useId,useMemo} from 'react';
import {lightRadii} from './MapEnvironment.js';
import {FEET_PER_CELL} from './MapMeasurements.js';
import {previewVisionPolygon} from './MapVisionPreview.js';

/** Non-interactive, DM-only approximation of a chosen token's present sight.
 * Never used for player authorization, token movement, or fog persistence.
 */
export default function MapPlayerPreviewOverlay({map,environment,polygon,viewerName}){
 const id=useId().replace(/:/g,'');
 const width=map.width/map.grid_size,height=map.height/map.grid_size;
 const vertices=(polygon||[]).map(p=>p.x+','+p.y).join(' ');
 const lights=useMemo(()=>(environment?.objects||[])
  .filter(o=>o.type==='light'&&o.enabled!==false)
  .map((light,index)=>{
   const reach=lightRadii(light).outer;
   return {...light,clipId:'preview-light-occlusion-'+id+'-'+index,
    polygon:reach>0?previewVisionPolygon({map,environment,
     viewer:{x:Number(light.x),y:Number(light.y)},maxFeet:reach,kind:'light'}):[]};
  }),[environment,map,id]);
 const ambient=Math.max(0,Math.min(100,Number(environment?.ambient??25)));
 return <>
  <svg className="map-player-preview-overlay" aria-hidden="true"
   viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
   <defs>
    <mask id={'preview-outside-'+id} maskUnits="userSpaceOnUse"
     x="0" y="0" width={width} height={height}>
     <rect x="0" y="0" width={width} height={height} fill="white"/>
     {polygon?.length>=3&&<polygon points={vertices} fill="black"/>}
    </mask>
    <clipPath id={'preview-within-'+id}>
     {polygon?.length>=3&&<polygon points={vertices}/>}
    </clipPath>
    {lights.map(light=><clipPath id={light.clipId} key={light.clipId}
      clipPathUnits="userSpaceOnUse">
      <polygon points={light.polygon.map(p=>p.x+','+p.y).join(' ')}/>
     </clipPath>)}
    <mask id={'preview-lights-'+id} maskUnits="userSpaceOnUse"
     x="0" y="0" width={width} height={height}>
     <rect x="0" y="0" width={width} height={height} fill="white"/>
     {lights.map(light=>{
      const {bright,outer}=lightRadii(light);
      const intensity=Math.max(0,Math.min(100,Number(light.intensity??100)))/100;
      return <g key={light.id} clipPath={'url(#'+light.clipId+')'}>
       {outer>0&&<circle cx={light.x} cy={light.y} r={outer/FEET_PER_CELL}
        fill="#777" opacity={intensity}/>}
       {bright>0&&<circle cx={light.x} cy={light.y} r={bright/FEET_PER_CELL}
        fill="black" opacity={intensity}/>}
      </g>;
     })}
    </mask>
   </defs>
   <rect x="0" y="0" width={width} height={height} fill="#03060d"
    opacity=".98" mask={`url(#preview-outside-${id})`}/>
   {polygon?.length>=3&&<rect x="0" y="0" width={width} height={height}
    fill="#020710" opacity={Math.max(.07,1-ambient/100)}
    mask={`url(#preview-lights-${id})`}
    clipPath={`url(#preview-within-${id})`}/>}
  </svg>
  <div className="map-player-preview-label" role="status">
   <strong>Player perspective · {viewerName||'Token'}</strong>
   <span>DM-only simulation of sight, light and wall collision — token movement is not saved</span>
  </div>
 </>;
}
