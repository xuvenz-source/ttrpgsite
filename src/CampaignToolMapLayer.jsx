import React,{useRef,useState} from 'react';
import {toolCanControl} from './CampaignTools.js';

const colorParts=hex=>{
 const raw=/^#[0-9a-f]{6}$/i.test(hex||'')?hex:'#ffce7a';
 return [1,3,5].map(i=>parseInt(raw.slice(i,i+2),16)).join(',');
};
/** Map placements expose public icon/light fields but never private tool state. */
export default function CampaignToolMapLayer({placements=[],issued=[],map,scale,userId,isDM,
 active=true,editing=false,measuring=false,onMove,onOpen}){
 const [preview,setPreview]=useState({});
 const drag=useRef(null);
 if(!map)return null;
 const cell=Number(map.grid_size)*scale;
 const maxX=Math.max(0,Math.floor(map.width/map.grid_size));
 const maxY=Math.max(0,Math.floor(map.height/map.grid_size));
 function start(e,p,canMove){
  if(!active||editing||measuring||!canMove||e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  drag.current={id:p.issue_id,pointerId:e.pointerId,
   startX:e.clientX,startY:e.clientY,x:p.x,y:p.y};
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
 }
 function move(e,p){
  const d=drag.current;
  if(!d||d.id!==p.issue_id||d.pointerId!==e.pointerId)return;
  const span=p.kind==='mount'?Number(p.span)||2:1;
  const x=Math.max(0,Math.min(maxX-span,Math.round(d.x+(e.clientX-d.startX)/cell)));
  const y=Math.max(0,Math.min(maxY-span,Math.round(d.y+(e.clientY-d.startY)/cell)));
  setPreview(previous=>({...previous,[d.id]:{x,y}}));
 }
 function stop(e,p,cancel=false){
  const d=drag.current;
  if(!d||d.id!==p.issue_id||d.pointerId!==e.pointerId)return;
  drag.current=null;
  const next=preview[d.id]||{x:d.x,y:d.y};
  setPreview(previous=>{const copy={...previous};delete copy[d.id];return copy});
  try{if(e.currentTarget.hasPointerCapture(e.pointerId))
   e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
  if(!cancel&&(next.x!==d.x||next.y!==d.y))
   onMove?.(d.id,next.x,next.y);
 }
 return <div className="campaign-tool-map-layer" aria-label="Issued tool tokens">
  {placements.map(p=>{
   const own=issued.find(t=>t.id===p.issue_id);
   const canMove=toolCanControl(own,userId,isDM);
   const at=preview[p.issue_id]||p,span=p.kind==='mount'?Math.max(1,Number(p.span)||2):1;
   const x=Number(at.x)*cell,y=Number(at.y)*cell;
   const total=(Number(p.light_bright)||0)+(Number(p.light_dim)||0);
   const lightOn=p.kind==='torch'&&p.light_enabled&&total>0;
   const radius=total/5*cell;
   const bright=Math.max(0,Math.min(100,100*(Number(p.light_bright)||0)/total));
   const rgb=colorParts(p.light_color);
   return <React.Fragment key={p.issue_id}>
    {lightOn&&<div className="campaign-tool-light-radius" aria-hidden="true"
     style={{left:x+cell/2-radius,top:y+cell/2-radius,width:radius*2,height:radius*2,
      opacity:Math.min(1,Math.max(0,Number(p.light_intensity)||0)/100),
      background:`radial-gradient(circle,rgba(${rgb},.65) 0%,rgba(${rgb},.32) ${bright}%,rgba(${rgb},0) 100%)`}}/>}
    <button type="button" className={'campaign-tool-map-token'+(canMove?' can-move':'')}
     style={{left:x,top:y,width:cell*span,height:cell*span}}
     title={p.name+(canMove?' · Drag to move, double-click for sheet':'')}
     aria-label={p.name+' tool token'}
     onPointerDown={e=>start(e,p,canMove)} onPointerMove={e=>move(e,p)}
     onPointerUp={e=>stop(e,p)} onPointerCancel={e=>stop(e,p,true)}
     onDoubleClick={e=>{if(own){e.stopPropagation();onOpen?.(p.issue_id)}}}>
     <span aria-hidden="true">{p.icon||'🧰'}</span>
    </button>
   </React.Fragment>;
  })}
 </div>;
}
