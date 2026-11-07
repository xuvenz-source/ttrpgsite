import React,{useEffect,useRef,useState} from 'react';
import {createBarrier,createLight,normalizePoint,resizeBarrierEndpoint,translateEnvironmentObject} from './MapEnvironment.js';
import {FEET_PER_CELL} from './MapMeasurements.js';

const pointText=points=>(points||[]).map(p=>p.x+','+p.y).join(' ');
const center=o=>o.type==='light'?{x:o.x,y:o.y}:
 {x:((o.points?.[0]?.x||0)+(o.points?.[1]?.x||0))/2,
  y:((o.points?.[0]?.y||0)+(o.points?.[1]?.y||0))/2};
const colors={door:'#ed956d',window:'#64ddd6'};

/** DM-only editor/markers. Never mounted in the player client or preview. */
function MapEnvironmentOverlay({map,scale,objects=[],editor,onAdd,onSelect,onPatch}){
 const [draft,setDraft]=useState([]),[cursor,setCursor]=useState(null),[dragPreview,setDragPreview]=useState(null);
 const drawing=useRef(false),drag=useRef(null),svg=useRef(null);
 const maxX=map.width/map.grid_size,maxY=map.height/map.grid_size;
 const shown=editor?.showLight!==false&&!editor?.previewing;
 const editing=shown&&editor?.enabled&&editor.layer==='light'&&!editor.lockLight;
 const tool=editor?.tool||'select';
 const cell=map.grid_size*scale;
 useEffect(()=>{
  setDraft([]);setCursor(null);setDragPreview(null);drawing.current=false;drag.current=null;
 },[map.id,tool,editing]);
 useEffect(()=>{
  if(!editing)return;
  function keydown(e){
   if(e.key==='Escape'){setDraft([]);setCursor(null);drawing.current=false;return}
   if(e.key==='Enter'&&tool==='wall-line'&&draft.length>1){
    e.preventDefault();const wall=createBarrier('wall',draft,editor.preset);
    if(wall)onAdd(wall);setDraft([]);setCursor(null);
   }
  }
  window.addEventListener('keydown',keydown);
  return()=>window.removeEventListener('keydown',keydown);
 },[editing,tool,draft,editor?.preset,onAdd]);
 if(!shown)return null;
 function point(e){
  const rect=svg.current?.getBoundingClientRect();
  if(!rect||!rect.width||!rect.height)return null;
  const p=normalizePoint({x:(e.clientX-rect.left)/rect.width*maxX,
   y:(e.clientY-rect.top)/rect.height*maxY});
  // Fractional cells preserve true cursor placement on map artwork.
  return {x:Math.round(Math.max(0,Math.min(maxX,p.x))*10000)/10000,
   y:Math.round(Math.max(0,Math.min(maxY,p.y))*10000)/10000};
 }
 function finishLine(){
  if(draft.length>1){
   const wall=createBarrier('wall',draft,editor.preset);
   if(wall)onAdd(wall);
  }
  setDraft([]);setCursor(null);drawing.current=false;
 }
 function pointerDown(e){
  if(!editing)return;
  if(e.button===2){e.preventDefault();e.stopPropagation();return}
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  const p=point(e);if(!p)return;
  if(tool==='wall-line'){setDraft(old=>[...old,p].slice(0,500));return}
  if(tool==='wall-pen'){
   drawing.current=true;setDraft([p]);
   try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
   return;
  }
  if(tool==='select'){onSelect(null);return}
  if(tool==='light'){onAdd(createLight(p,{bright:editor.lightBright??20,dim:editor.lightDim??20}));return}
  if(tool==='door'||tool==='window'){
   const end={x:Math.min(maxX,p.x+1),y:p.y};
   const first=end.x===p.x?{x:Math.max(0,p.x-1),y:p.y}:p;
   const barrier=createBarrier(tool,[first,end]);
   if(barrier)onAdd(barrier);
  }
 }
 function startMove(e,object){
  if(!editing||tool!=='select'||e.button!==0)return;
  const origin=point(e);if(!origin)return;
  e.preventDefault();e.stopPropagation();
  onSelect(object.id);
  drag.current={kind:'translate',id:object.id,pointerId:e.pointerId,
   origin,original:object,patch:null,moved:false};
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
 }
 function startHandle(e,object,index){
  if(!editing||tool!=='select'||e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  drag.current={kind:'resize',id:object.id,index,pointerId:e.pointerId,
   points:object.points.map(p=>({...p}))};
  setDragPreview({id:object.id,points:object.points.map(p=>({...p}))});
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
 }
 function pointerMove(e){
  if(drag.current&&drag.current.pointerId===e.pointerId){
   const p=point(e);if(!p)return;
   const current=drag.current;
   if(current.kind==='translate'){
    const patch=translateEnvironmentObject(current.original,{
     x:p.x-current.origin.x,y:p.y-current.origin.y},{x:maxX,y:maxY});
    if(!patch)return;
    current.patch=patch;
    current.moved=Math.hypot(p.x-current.origin.x,p.y-current.origin.y)>.015;
    setDragPreview({id:current.id,patch});
   }else{
    const points=resizeBarrierEndpoint(current.points,current.index,p);
    if(!points)return;
    current.points=points;
    setDragPreview({id:current.id,points});
   }
   return;
  }
  if(!editing)return;
  if(tool==='wall-line'){
   const p=point(e);if(p)setCursor(old=>old?.x===p.x&&old?.y===p.y?old:p);
  }else if(tool==='wall-pen'&&drawing.current){
   const p=point(e);if(!p)return;
   setDraft(old=>{
    if(old.length>=500)return old;
    const last=old[old.length-1];
    return last&&Math.hypot(last.x-p.x,last.y-p.y)<.065?old:[...old,p];
   });
  }
 }
 function pointerUp(e){
  if(drag.current&&drag.current.pointerId===e.pointerId){
   e.preventDefault();e.stopPropagation();
   const current=drag.current;
   drag.current=null;setDragPreview(null);
   if(current.kind==='resize')onPatch(current.id,{points:current.points},{immediate:true});
   else if(current.moved&&current.patch)onPatch(current.id,current.patch,{immediate:true});
   try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
   return;
  }
  if(tool!=='wall-pen'||!drawing.current)return;
  e.preventDefault();e.stopPropagation();drawing.current=false;
  const p=point(e),last=draft[draft.length-1];
  const points=last&&p&&Math.hypot(p.x-last.x,p.y-last.y)>.035?
   [...draft,p]:draft;
  const wall=createBarrier('wall',points,editor.preset);
  if(wall)onAdd(wall);
  setDraft([]);
  try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
 }
 function color(object){
  if(object.type==='door'||object.type==='window')return colors[object.type];
  if(object.vision==='one-way')return '#e5b0ff';
  if(object.vision==='pass')return '#6ddfd4';
  return '#ffc36b';
 }
 const canResize=editing&&tool==='select';
 const radius=Math.max(.10,5/cell);
 return <>
  <svg ref={svg} className={'map-env-overlay '+(editing?'map-env-editing':'map-env-readonly')}
   aria-label="DM environment map geometry" viewBox={`0 0 ${maxX} ${maxY}`} preserveAspectRatio="none"
   onContextMenu={e=>{if(editing){e.preventDefault();e.stopPropagation();if(tool==='wall-line')finishLine()}}}
   onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
   onPointerCancel={()=>{drag.current=null;setDragPreview(null);drawing.current=false;setDraft([])}}>
   {objects.map(object=>{
    const selected=editor.selectedId===object.id;
    const rendered=dragPreview?.id===object.id&&dragPreview.patch?
     {...object,...dragPreview.patch}:object;
    if(object.type==='light'){
     if(!editing)return null;
     const {x=0,y=0,bright=0,dim=0}=rendered;
     const inner=Number(bright)/FEET_PER_CELL,outer=(Number(bright)+Number(dim))/FEET_PER_CELL;
     return <g key={object.id}>
      {outer>0&&<circle cx={x} cy={y} r={outer} fill="none"
       stroke={object.color||'#f6be75'} opacity=".5" strokeWidth=".12" strokeDasharray=".45 .3"/>}
      {inner>0&&<circle cx={x} cy={y} r={inner} fill="none"
       stroke={object.color||'#f6be75'} opacity=".95" strokeWidth=".12"/>}
      <circle cx={x} cy={y} r={selected ? .3 : .19} fill={object.color||'#f6be75'}/>
     </g>;
    }
    const pts=dragPreview?.id===object.id&&dragPreview.points?
     dragPreview.points:rendered.points||[];
    if(pts.length<2)return null;
    const isPortal=object.type==='door'||object.type==='window';
    return <g key={object.id}>
     {editing&&<polyline points={pointText(pts)} fill="none"
      stroke={selected?'#ffffff':color(object)} strokeWidth={selected?3.5:2.6}
      vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={object.vision==='pass'?'6 4':undefined}/>}
     {editing&&object.vision==='one-way'&&<text x={(pts[0].x+pts[1].x)/2}
      y={(pts[0].y+pts[1].y)/2-.3} fontSize=".52" fill="#f1ddff" textAnchor="middle">
       {object.oneWay==='b-to-a'?'B → A':'A → B'}</text>}
     {editing&&<polyline points={pointText(pts)} fill="none"
      stroke="transparent" strokeWidth={15} vectorEffect="non-scaling-stroke"
      onPointerDown={e=>{
       if(tool!=='select')return;
       startMove(e,object);
      }}/>} 
     {isPortal&&pts.slice(0,2).map((p,i)=><g key={i}>
      <circle cx={p.x} cy={p.y} r={radius} fill="#f43f51" stroke="#ffffff"
       strokeWidth={1.6} vectorEffect="non-scaling-stroke"
       pointerEvents={canResize?'all':'none'}
       onPointerDown={e=>startHandle(e,object,i)}/>
      {canResize&&<circle cx={p.x} cy={p.y} r={Math.max(.26,12/cell)}
       fill="transparent" pointerEvents="all"
       onPointerDown={e=>startHandle(e,object,i)}/>}
     </g>)}
     {selected&&editing&&!isPortal&&pts.map((p,i)=><circle key={i}
      cx={p.x} cy={p.y} r={radius} fill="white" stroke="#e5a457"
      strokeWidth={1.2} vectorEffect="non-scaling-stroke"/>)}
    </g>;
   })}
   {editing&&draft.length>0&&<polyline
    points={pointText(tool==='wall-line'&&cursor?[...draft,cursor]:draft)}
    fill="none" stroke="#ffffff" strokeWidth={2.6} strokeDasharray="6 4"
    vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
    pointerEvents="none"/>}
  </svg>
  <div className="map-env-marker-layer" aria-label="DM map object markers">
   {objects.filter(o=>o.type==='door'||o.type==='window'||o.type==='light').map(o=>{
    const rendered=dragPreview?.id===o.id&&dragPreview.patch?
     {...o,...dragPreview.patch}:o;
    const p=center(rendered),selected=o.id===editor.selectedId;
    return <button type="button" key={o.id}
     className={'map-env-marker map-env-marker-'+o.type+(selected?' is-selected':'')}
     style={{left:p.x*cell,top:p.y*cell}}
     title={'Adjust '+o.type+(o.locked?' (locked)':'')}
     aria-label={'Adjust '+o.type+(o.locked?' (locked)':'')}
     onPointerDown={e=>{e.stopPropagation();startMove(e,o)}}
     onPointerMove={pointerMove} onPointerUp={pointerUp}
     onPointerCancel={()=>{drag.current=null;setDragPreview(null)}}
     onClick={e=>{e.preventDefault();e.stopPropagation();onSelect(o.id)}}>
     <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      {o.type==='door'?<><rect x="6" y="3" width="12" height="18" rx="1.3" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="15" cy="13" r="1" fill="currentColor"/><path d="M8 5v14" stroke="currentColor" strokeWidth="1.2"/></>:
      o.type==='window'?<><rect x="3" y="4" width="18" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 4v16M3 12h18" stroke="currentColor" strokeWidth="1.7"/></>:
      <><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5M4 4l4 4m8 8 4 4M20 4l-4 4M8 16l-4 4" stroke="currentColor" strokeWidth="1.6"/></>}
     </svg>
     {(o.locked||o.state==='open')&&<span className="map-env-marker-state">
      {o.locked?'🔒':'↗'}</span>}
    </button>;
   })}
  </div>
 </>;
}
export default React.memo(MapEnvironmentOverlay);
