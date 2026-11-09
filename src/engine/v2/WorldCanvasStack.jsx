import React,{useLayoutEffect,useRef} from 'react';
import {createWorldRenderer} from './WorldRenderer.js';

/**
 * Phase 8 mount contract for the eventual Phase 9 TabletopAdapter.
 *
 * This module is intentionally NOT imported by the active tabletop.
 * Terrain, static guides, sprites and the fog canvas are persistent sibling
 * layers, not conditionally remounted during movement or fog refresh.
 *
 * The caller supplies map/viewer identity, an authorized snapshot pipeline
 * and a server-owned sprite appearance factory via onRendererReady.
 * Mounting this component alone creates no subscriptions or visibility grants.
 */
export default function WorldCanvasStack({
 mapId,viewerId,onRendererReady,createSpriteElement,
 onRemoveSprite,onNeedResync,onRendererError,
 mapLayers=null,playerPreview=false,className='',style={},children
}){
 const root=useRef(null),stage=useRef(null),terrain=useRef(null);
 const statics=useRef(null),fog=useRef(null),sprites=useRef(null);
 const rendererRef=useRef(null);
 const callback=useRef(onRendererReady);
 callback.current=onRendererReady;
 const createSprite=useRef(createSpriteElement);
 createSprite.current=createSpriteElement;
 const spriteRemoved=useRef(onRemoveSprite),resync=useRef(onNeedResync);
 const rendererError=useRef(onRendererError);
 spriteRemoved.current=onRemoveSprite;
 resync.current=onNeedResync;
 rendererError.current=onRendererError;
 // A single renderer exists for this mounted board. React re-rendering the
 // toolbar, token data, fog or character sheet never remounts canvas layers.
 useLayoutEffect(()=>{
  const renderer=createWorldRenderer({
   mapId,viewerId,
   surfaces:{
    terrain:terrain.current,
    staticCanvas:statics.current,
    fogCanvas:fog.current,
    spriteHost:sprites.current,
    viewport:stage.current
   },
   createSpriteElement:createSprite.current??null,
   onRemoveSprite:event=>spriteRemoved.current?.(event),
   onNeedResync:reason=>resync.current?.(reason),
   onError:error=>rendererError.current?.(error),
   playerPreview
  });
  rendererRef.current=renderer;
  callback.current?.(renderer);
  return ()=>{
   callback.current?.(null);
   renderer.dispose();
   rendererRef.current=null;
  };
 // Mount ownership intentionally independent of runtime map/fog/token props.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useLayoutEffect(()=>{
  rendererRef.current?.changeContext({mapId,viewerId});
 },[mapId,viewerId]);
 return (
  <div ref={root} className={'world-v2-viewport '+className}
   style={{position:'relative',width:'100%',height:'100%',
    overflow:'hidden',...style}}>
   <div ref={stage} className="world-v2-stage"
    style={{position:'absolute',left:0,top:0,transformOrigin:'0 0'}}>
    <img ref={terrain} alt="" draggable={false}
     className="world-v2-terrain"
     style={{position:'absolute',left:0,top:0,zIndex:0,
      pointerEvents:'none',userSelect:'none'}}/>
    <canvas ref={statics} aria-hidden="true"
     className="world-v2-environment"
     style={{position:'absolute',left:0,top:0,zIndex:1,
      pointerEvents:'none'}}/>
    <div ref={sprites} className="world-v2-sprites"
     style={{position:'absolute',left:0,top:0,zIndex:2,
      pointerEvents:'none'}}/>
    {mapLayers}
    <canvas ref={fog} aria-hidden="true"
     className="world-v2-fog"
     style={{position:'absolute',left:0,top:0,zIndex:1000,
      pointerEvents:'none',backgroundColor:'#040914'}}/>
   </div>
   {children}
  </div>
 );
}
