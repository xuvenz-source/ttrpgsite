import React,{useCallback,useLayoutEffect,useRef} from 'react';
import {TokenMonitors} from './TokenMonitors.jsx';

/** Static per-token monitor frames only rerender when their own position,
 * resources, token geometry, or display settings actually change.
 * Frames stay in one shared stacking layer above all token artwork.
 */
const TokenMonitorFrame=React.memo(function TokenMonitorFrame({
 token,remote,preview,config,fields,badge,cell,zoom,motionRuntime
}){
 const p={...token,...remote,...preview};
 const nodeRef=useRef(null);
 const bindNode=useCallback(node=>{
  nodeRef.current=node;
  if(!node)motionRuntime?.bind(token.id,'monitor',null);
 },[motionRuntime,token.id]);
 // Stable ref callback; canonical monitor position is rebased just before
 // browser paint, without detaching on unrelated player fog/roster renders.
 useLayoutEffect(()=>{
  if(nodeRef.current)motionRuntime?.bind(token.id,'monitor',nodeRef.current,{
   x:Number(p.x),y:Number(p.y),cell
  });
 },[motionRuntime,token.id,p.x,p.y,cell]);
 return <div className="token-monitor-frame"
  ref={bindNode}
  style={{
   left:Number(p.x)*cell,top:Number(p.y)*cell,
   width:cell*Number(p.span_x??1),height:cell*Number(p.span_y??1),
   opacity:token.visible?1:.55
  }}>
  <TokenMonitors config={config} normalized fields={fields} zoom={zoom}/>
  {badge&&<div className="token-encumbrance-indicator" title={badge.label}>{badge.icon}</div>}
 </div>;
});

export default function TokenMonitorFrames({
 tokens,remotePositions,preview,config,monitorValues,encumbranceBadges,gridSize,scale,motionRuntime
}){
 const cell=gridSize*scale;
 return <div className="token-monitors-over-all" aria-hidden="true">
  {tokens.map(token=><TokenMonitorFrame key={token.id}
   token={token} remote={remotePositions[token.id]} preview={preview[token.id]}
   config={config} fields={monitorValues[token.id]} badge={encumbranceBadges[token.id]}
   cell={cell} zoom={scale} motionRuntime={motionRuntime}/>)}
 </div>;
}
