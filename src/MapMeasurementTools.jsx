import React from 'react';
import {MEASUREMENT_TOOLS,measurementGeometry} from './MapMeasurements.js';

export function MeasurementToolIcon({tool}){
 return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
  fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
  strokeLinejoin="round">
  {tool==='line'&&<>
   <path d="M4 20 20 4"/><circle cx="4" cy="20" r="2" fill="currentColor"/>
   <circle cx="20" cy="4" r="2" fill="currentColor"/>
  </>}
  {tool==='circle'&&<>
   <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>
   <path d="M12 12 18.5 5.5"/>
  </>}
  {tool==='square'&&<>
   <rect x="3.5" y="3.5" width="17" height="17" rx="1"/>
   <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
   <path d="M12 12 20 4"/>
  </>}
  {tool==='cone'&&<>
   <path d="M4 12 20 3 20 21Z" fill="currentColor" fillOpacity=".16"/>
   <circle cx="4" cy="12" r="1.4" fill="currentColor"/>
  </>}
 </svg>;
}
export function MeasurementToolBar({tool,onPointerDown,onPointerMove,onPointerUp,onPointerCancel,onKeySelect}){
 const names={line:'Direct line',circle:'Circle radius',square:'Square radius',cone:'Cone'};
 return <div className="map-measure-toolbar" role="toolbar" aria-label="Battlemap measurement tools">
  {MEASUREMENT_TOOLS.map(id=><button key={id} type="button"
   className={'map-measure-tool'+(tool===id?' selected':'')}
   aria-label={names[id]} aria-pressed={tool===id}
   title={names[id]+': click then drag on map, or drag the icon onto the map'}
   onPointerDown={e=>onPointerDown(e,id)}
   onPointerMove={onPointerMove}
   onPointerUp={onPointerUp}
   onPointerCancel={onPointerCancel}
   onClick={e=>{if(e.detail===0)onKeySelect(id)}}>
   <MeasurementToolIcon tool={id}/>
  </button>)}
  {tool&&<button type="button" className="map-measure-tool map-measure-close"
   aria-label="Stop measuring" title="Stop measuring (Esc)"
   onClick={()=>onKeySelect(null)}>
   <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 5 19 19M19 5 5 19"/>
   </svg>
  </button>}
 </div>;
}
export function MapMeasurementOverlay({measures=[],map,scale}){
 const unit=map.grid_size*scale;
 const width=map.width/map.grid_size,height=map.height/map.grid_size;
 if(!unit||!width||!height)return null;
 const strokeWidth=2/unit,small=1/unit,font=12/unit;
 return <svg className="map-measure-overlay"
  width={map.width*scale} height={map.height*scale}
  viewBox={'0 0 '+width+' '+height} preserveAspectRatio="none"
  aria-label="Live battlemap measurements">
  {measures.map(measure=>{
   const g=measurementGeometry(measure);
   if(!g)return null;
   const label=g.label,point=g.labelPoint;
   const labelWidth=(label.length*7+14)/unit,labelHeight=20/unit;
   const lx=Math.max(0,Math.min(width-labelWidth,point.x+.1));
   const ly=Math.max(labelHeight,Math.min(height,point.y-.12));
   const origin=g.origin,end=g.end;
   return <g key={measure.id}
    className={measure.isLocal?'map-measure-local':'map-measure-remote'}>
    {g.tool==='line'&&<line x1={origin.x} y1={origin.y}
     x2={end.x} y2={end.y} strokeWidth={strokeWidth}/>}
    {g.tool==='circle'&&<circle cx={origin.x} cy={origin.y} r={g.radius}
     strokeWidth={strokeWidth} fillOpacity=".2"/>}
    {g.tool==='square'&&<rect {...g.square}
     strokeWidth={strokeWidth} fillOpacity=".2"/>}
    {g.tool==='cone'&&g.corners.length===3&&<polygon
     points={g.corners.map(p=>p.x+','+p.y).join(' ')}
     strokeWidth={strokeWidth} fillOpacity=".2"/>}
    <circle cx={origin.x} cy={origin.y} r={3.5/unit} strokeWidth={small}
     className="map-measure-start"/>
    <rect className="map-measure-label-back" x={lx} y={ly-labelHeight}
     width={labelWidth} height={labelHeight} rx={3/unit}/>
    <text className="map-measure-label" x={lx+7/unit}
     y={ly-5/unit} fontSize={font}>{label}</text>
   </g>;
  })}
 </svg>;
}
