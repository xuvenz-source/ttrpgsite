import React from 'react';
import {toolCanControl} from './CampaignTools.js';
import {lightOcclusionClip} from './MapVisionPreview.js';
import {lightCellRuns} from './AuthorizedLightMasks.js';

/** Native SVG clipPath gives the CSS radial gradient only cells that
 * published server lighting and this viewer's sight authorize.
 * Merge runs into rectangles; never send wall geometry to the browser.
 */
const AuthorizedLightClip=React.memo(function AuthorizedLightClip({
 id,cells,width,sourceX,sourceY,radius,cell
}){
 const runs=React.useMemo(()=>lightCellRuns(cells,width),[cells,width]);
 return <svg width="0" height="0" aria-hidden="true"
  style={{position:'absolute',pointerEvents:'none'}}>
  <defs><clipPath id={id} clipPathUnits="userSpaceOnUse">
   {runs.map(run=><rect key={run.x+':'+run.y}
    x={(run.x-sourceX)*cell+radius}
    y={(run.y-sourceY)*cell+radius}
    width={run.width*cell} height={cell}/>)}
  </clipPath></defs>
 </svg>;
});

const colorParts=hex=>{
 const raw=/^#[0-9a-f]{6}$/i.test(hex||'')?hex:'#ffce7a';
 return [1,3,5].map(i=>parseInt(raw.slice(i,i+2),16)).join(',');
};
/** Tool tokens are peers of characters for selection, drag, live previews and
 * final persistence. Board owns the gesture so mixed groups move together. */
export default function CampaignToolMapLayer({placements=[],issued=[],tokens=[],tokenPositions={},map,scale,userId,isDM,motionRuntime,
 environment=null,authorizedLightMasks=null,
 active=true,editing=false,measuring=false,preview={},remotePositions={},
 selectedIds=[],onTokenPointerDown,onTokenPointerMove,onTokenPointerUp,onTokenPointerCancel,onOpen}){
 if(!map)return null;
 const cell=Number(map.grid_size)*scale;
 return <div className="campaign-tool-map-layer" aria-label="Issued tool tokens">
  {placements.map(p=>{
   if(remotePositions[p.issue_id]?.hidden)return null;
   const own=issued.find(t=>t.id===p.issue_id);
   const carrier=p.held_by_token_id?
    tokens.find(token=>token.id===p.held_by_token_id&&token.visible!==false):null;
   if(p.held_by_token_id&&!carrier)return null;
   const canMove=!carrier&&active&&!editing&&!measuring&&toolCanControl(own,userId,isDM);
   const at=carrier?{...carrier,...tokenPositions[carrier.id]}:
    preview[p.issue_id]||remotePositions[p.issue_id]||p;
   const span=p.kind==='mount'?Math.max(1,Number(p.span)||2):1;
   const x=Number(at.x)*cell,y=Number(at.y)*cell;
   const centerX=carrier?Math.max(.25,Number(carrier.span_x??1))/2:.5;
   const centerY=carrier?Math.max(.25,Number(carrier.span_y??1))/2:.5;
   const total=(Number(p.light_bright)||0)+(Number(p.light_dim)||0);
   const lightOn=p.kind==='torch'&&p.light_enabled&&total>0;
   const radius=total/5*cell;
   const bright=Math.max(0,Math.min(100,100*(Number(p.light_bright)||0)/total));
   const rgb=colorParts(p.light_color);
   const occlusion=isDM&&lightOn?lightOcclusionClip({map,environment,
    x:Number(at.x)+centerX,y:Number(at.y)+centerY,radiusFeet:total}):null;
   const lightCells=authorizedLightMasks?.masks?.[p.issue_id];
   const clipId='tool-light-mask-'+p.issue_id;
   const clipPath=isDM?occlusion||'inset(100%)':
    lightCells?'url(#'+clipId+')':'inset(100%)';
   return <React.Fragment key={p.issue_id}>
    {lightOn&&!isDM&&lightCells&&<AuthorizedLightClip id={clipId}
     cells={lightCells} width={authorizedLightMasks.width}
     sourceX={Number(at.x)+centerX} sourceY={Number(at.y)+centerY}
     radius={radius} cell={cell}/>}
    {lightOn&&<div className="campaign-tool-light-radius" aria-hidden="true"
     ref={node=>isDM?motionRuntime?.bind(carrier?.id||'tool:'+p.issue_id,
      'light:'+p.issue_id,node,{x:Number(at.x),y:Number(at.y),cell}):
      undefined}
     style={{left:x+cell*centerX-radius,top:y+cell*centerY-radius,width:radius*2,height:radius*2,
      opacity:Math.min(1,Math.max(0,Number(p.light_intensity)||0)/100),
      clipPath,
      background:`radial-gradient(circle,rgba(${rgb},.65) 0%,rgba(${rgb},.32) ${bright}%,rgba(${rgb},0) 100%)`}}/>}
    {!carrier&&<button type="button"
     ref={node=>motionRuntime?.bind('tool:'+p.issue_id,
      'sprite',node,{x:Number(at.x),y:Number(at.y),cell})}
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
    </button>}
   </React.Fragment>;
  })}
 </div>;
}
