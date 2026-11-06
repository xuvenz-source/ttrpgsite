import React,{useEffect,useRef,useState} from 'react';
import {createBarrier,createLight,snapEnvironmentPoint} from './MapEnvironment.js';
import {FEET_PER_CELL} from './MapMeasurements.js';

/** DM-only editor overlay. None of these geometry objects are sent to players. */
export default function MapEnvironmentOverlay({map,scale,objects=[],editor,onAdd,onSelect}){
 const [draft,setDraft]=useState([]);
 const [cursor,setCursor]=useState(null);
 const drawing=useRef(false),svg=useRef(null);
 const maxX=map.width/map.grid_size,maxY=map.height/map.grid_size;
 const active=editor?.enabled&&editor.layer==='light'&&!editor.lockLight&&editor.showLight!==false;
 const tool=editor?.tool||'select';
 useEffect(()=>{setDraft([]);setCursor(null);drawing.current=false},[map.id,tool]);
 useEffect(()=>{
  if(!active)return;
  const handle=e=>{
   if(e.key==='Escape'){setDraft([]);drawing.current=false}
   if(e.key==='Enter'&&tool==='wall-line'&&draft.length>1){
    const object=createBarrier('wall',draft,editor.preset);
    if(object)onAdd(object);
    setDraft([]);
   }
  };
  window.addEventListener('keydown',handle);
  return()=>window.removeEventListener('keydown',handle);
 },[active,tool,draft,editor.preset,onAdd]);
 if(!active)return null;
 const clamp=p=>({x:Math.min(maxX,Math.max(0,p.x)),y:Math.min(maxY,Math.max(0,p.y))});
 function point(e){
  const rect=svg.current?.getBoundingClientRect();
  if(!rect||rect.width<=0||rect.height<=0)return null;
  return clamp(snapEnvironmentPoint({x:(e.clientX-rect.left)/rect.width*maxX,
   y:(e.clientY-rect.top)/rect.height*maxY},editor.snap!==false));
 }
 function finishLine(){
  if(draft.length>1){
   const object=createBarrier('wall',draft,editor.preset);
   if(object)onAdd(object);
  }
  setDraft([]);setCursor(null);drawing.current=false;
 }
 function pointerDown(e){
  if(e.button!==0&&e.button!==2)return;
  e.stopPropagation();e.preventDefault();
  if(e.button===2){
   if(tool==='wall-line')finishLine();
   return;
  }
  const p=point(e);if(!p)return;
  if(tool==='wall-line'){setDraft(old=>[...old,p].slice(0,500));return}
  if(tool==='wall-pen'){
   drawing.current=true;setDraft([p]);
   try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
   return;
  }
  if(tool==='select'){onSelect(null);return}
  if(tool==='light'){
   onAdd(createLight(p,{bright:editor.lightBright??20,dim:editor.lightDim??20}));
   return;
  }
  if(tool==='door'||tool==='window'){
   const end={x:Math.min(maxX,p.x+1),y:p.y};
   const first=end.x===p.x?{x:Math.max(0,p.x-1),y:p.y}:p;
   const obj=createBarrier(tool,[first,end]);
   if(obj)onAdd(obj);
  }
 }
 function pointerMove(e){
  // Only the connected-line tool needs a hover preview. Grid snapping means
  // many pointer events share a coordinate: retain state when it is unchanged.
  if(tool==='wall-line'){
   const p=point(e);if(!p)return;
   setCursor(old=>old?.x===p.x&&old?.y===p.y?old:p);
   return;
  }
  if(tool!=='wall-pen'||!drawing.current)return;
  const p=point(e);if(!p)return;
  setDraft(old=>{
   if(old.length>=500)return old;
   const last=old[old.length-1];
   return last&&Math.hypot(last.x-p.x,last.y-p.y)<.12?old:[...old,p];
  });
 }
 function pointerUp(e){
  if(tool!=='wall-pen'||!drawing.current)return;
  e.preventDefault();e.stopPropagation();
  drawing.current=false;
  const p=point(e);
  const last=draft[draft.length-1];
  const points=last&&p&&Math.hypot(p.x-last.x,p.y-last.y)>.05?
   [...draft,p]:draft;
  const obj=createBarrier('wall',points,editor.preset);
  if(obj)onAdd(obj);
  setDraft([]);
  try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
 }
 function segmentColor(obj){
  if(obj.type==='door')return '#f3a96b';
  if(obj.type==='window')return '#7bd9e4';
  if(obj.vision==='one-way')return '#e5b0ff';
  if(obj.vision==='pass')return '#6ddfd4';
  return '#ffc36b';
 }
 const pointsString=pts=>(pts||[]).map(p=>p.x+','+p.y).join(' ');
 return <svg ref={svg} className="map-env-overlay map-env-editing" aria-label="DM environment drawing surface"
  viewBox={`0 0 ${maxX} ${maxY}`} preserveAspectRatio="none"
  onContextMenu={e=>{e.preventDefault();e.stopPropagation()}}
  onPointerDown={pointerDown} onPointerMove={pointerMove}
  onPointerUp={pointerUp} onPointerCancel={()=>{drawing.current=false;setDraft([])}}>
  {objects.map(obj=>{
   const selected=obj.id===editor.selectedId;
   if(obj.type==='light'){
    const {x=0,y=0,bright=0,dim=0}=obj;
    const brightCells=Number(bright)/FEET_PER_CELL;
    const outer=(Number(bright)+Number(dim))/FEET_PER_CELL;
    return <g key={obj.id} onPointerDown={e=>{
     if(tool!=='select')return;e.stopPropagation();e.preventDefault();onSelect(obj.id);
    }}>
     {outer>0&&<circle cx={x} cy={y} r={outer} fill="none"
      stroke={obj.color||'#f6be75'} strokeOpacity=".52" strokeDasharray=".4 .4"
      strokeWidth=".08" vectorEffect="non-scaling-stroke"/>}
     {brightCells>0&&<circle cx={x} cy={y} r={brightCells} fill="none"
      stroke={obj.color||'#f6be75'} strokeOpacity=".9"
      strokeWidth=".11" vectorEffect="non-scaling-stroke"/>}
     <circle cx={x} cy={y} r={selected ? .35 : .22}
      fill={obj.color||'#f6be75'} stroke={selected?'white':'#292f3c'}
      strokeWidth=".07" vectorEffect="non-scaling-stroke"/>
    </g>;
   }
   const pts=obj.points||[];
   if(pts.length<2)return null;
   return <g key={obj.id}>
    <polyline points={pointsString(pts)} fill="none" stroke={selected?'#ffffff':segmentColor(obj)}
     strokeWidth={selected?4:3} vectorEffect="non-scaling-stroke"
     strokeLinecap="round" strokeLinejoin="round"
     strokeDasharray={obj.vision==='pass'?'7 5':undefined}/>
    {obj.vision==='one-way'&&<text x={(pts[0].x+pts[1].x)/2}
     y={(pts[0].y+pts[1].y)/2-.3} fill="#f5d8ff" fontSize=".65"
     textAnchor="middle">{obj.oneWay==='b-to-a'?'B → A':'A → B'}</text>}
    <polyline points={pointsString(pts)} fill="none" stroke="transparent"
     strokeWidth={16} vectorEffect="non-scaling-stroke" onPointerDown={e=>{
      if(tool!=='select')return;
      e.stopPropagation();e.preventDefault();onSelect(obj.id);
     }}/>
    {selected&&pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y}
     r=".16" fill="white" stroke="#e5a457" strokeWidth=".05"/>)}
   </g>;
  })}
  {draft.length>0&&<polyline points={pointsString(tool==='wall-line'&&cursor?[...draft,cursor]:draft)}
   fill="none" stroke="#ffffff" strokeDasharray="5 4" strokeWidth={3}
   strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
   pointerEvents="none"/>}
 </svg>;
}
