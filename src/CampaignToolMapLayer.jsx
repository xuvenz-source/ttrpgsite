import React from 'react';
import {toolCanControl} from './CampaignTools.js';

const colorParts=hex=>{
 const raw=/^#[0-9a-f]{6}$/i.test(hex||'')?hex:'#ffce7a';
 return [1,3,5].map(i=>parseInt(raw.slice(i,i+2),16)).join(',');
};
/** Tool tokens are peers of characters for selection, drag, live previews and
 * final persistence. Board owns the gesture so mixed groups move together. */
export default function CampaignToolMapLayer({placements=[],issued=[],map,scale,userId,isDM,
 active=true,editing=false,measuring=false,preview={},remotePositions={},
 selectedIds=[],onTokenPointerDown,onTokenPointerMove,onTokenPointerUp,onTokenPointerCancel,onOpen}){
 if(!map)return null;
 const cell=Number(map.grid_size)*scale;
 return <div className="campaign-tool-map-layer" aria-label="Issued tool tokens">
  {placements.map(p=>{
   const own=issued.find(t=>t.id===p.issue_id);
   const canMove=active&&!editing&&!measuring&&toolCanControl(own,userId,isDM);
   const at=preview[p.issue_id]||remotePositions[p.issue_id]||p;
   const span=p.kind==='mount'?Math.max(1,Number(p.span)||2):1;
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
    <button type="button"
     className={'campaign-tool-map-token'+(canMove?' can-move':'')+
      (selectedIds.includes(p.issue_id)?' tool-selected':'')}
     style={{left:x,top:y,width:cell*span,height:cell*span}}
     title={p.name+(canMove?' · Drag with selected characters, double-click for sheet':'')}
     aria-label={p.name+' tool token'}
     onPointerDown={e=>{if(canMove&&e.button===0)onTokenPointerDown?.(e,p,canMove)}}
     onPointerMove={e=>onTokenPointerMove?.(e,p)}
     onPointerUp={e=>onTokenPointerUp?.(e,p)}
     onPointerCancel={e=>onTokenPointerCancel?.(e,p)}
     onDoubleClick={e=>{if(own){e.stopPropagation();onOpen?.(p.issue_id)}}}>
     <span aria-hidden="true">{p.icon||'🧰'}</span>
    </button>
   </React.Fragment>;
  })}
 </div>;
}
