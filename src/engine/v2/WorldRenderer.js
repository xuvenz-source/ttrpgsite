/**
 * World Engine V2 — ONE client-side presentation owner for a map/viewer.
 *
 * Phase 9 mounts the supplied terrain <img>, scene/fog canvases and sprite
 * host ONCE, then forwards V2 scene, visibility, movement and observer events.
 * This renderer does not create subscriptions, authorize sight, mutate DB
 * coordinates, or start per-entity animation timers.
 *
 * Security: ONLY an exact Phase 7 viewer snapshot may create sprites.
 * Motion packets cannot introduce unknown entities. Revocations synchronously
 * remove sprites and conceal the fog canvas. Interpolation is restricted to
 * bounded server-approved adjacent waypoints (ObserverPathBuffer).
 */
import {createWorldFrameScheduler} from './WorldFrameScheduler.js';
import {createObserverPathBuffer} from './ObserverPathBuffer.js';
import {normalizeWorldSceneSnapshot,worldSceneDirtyRegions}
 from './SceneSnapshot.js';
import {normalizeWorldVisibilityFrame,makeWorldFogMask}
 from './VisibilityFrame.js';
import {paintWorldFogLayer,paintWorldStaticLayer,
 paintWorldMovingLightLayer}
 from './WorldLayerPainter.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId=x=>typeof x==='string'&&UUID.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const key=p=>p.kind+':'+p.id;
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
const noop=()=>{};
const STATES=new Set(['grabbed','sampled','presented','approved',
 'blocked','released','committed','cancelled','rejected','revoked']);
const validMotionPoint=p=>p&&finite(p.x)&&finite(p.y)&&
 p.x>=0&&p.y>=0&&p.x<=10000&&p.y<=10000;
const copyPoint=p=>({x:p.x,y:p.y});
const validSurfaces=s=>s&&s.terrain?.style&&
 s.staticCanvas?.getContext&&s.fogCanvas?.getContext&&
 s.spriteHost?.style&&s.spriteHost?.appendChild&&
 s.spriteHost?.removeChild;

function configureHost(host,scene){
 const style=host.style,dim=scene.dimensions;
 const width=dim.width+'px',height=dim.height+'px';
 if(style.width!==width)style.width=width;
 if(style.height!==height)style.height=height;
 style.position='absolute';style.left='0';style.top='0';
 style.overflow='visible';
}
function configureTerrain(terrain,scene){
 const style=terrain.style,dim=scene.dimensions;
 style.position='absolute';style.left='0';style.top='0';
 style.width=dim.width+'px';style.height=dim.height+'px';
 style.pointerEvents='none';
}
const defaults=host=>piece=>{
 const node=host.ownerDocument?.createElement?.('div');
 if(!node)throw Error('World renderer needs a sprite factory or document');
 node.className='world-v2-sprite world-v2-'+piece.kind;
 return node;
};
export function createWorldRenderer({
 mapId,viewerId,surfaces,createSpriteElement=null,
 requestFrame, cancelFrame,onError=noop,onNeedResync=noop,
 onRemoveSprite=noop,
 playerPreview=false,pixelsPerCell=8,reducedMotion=false
}={}){
 if(!validId(mapId)||!validId(viewerId)||!validSurfaces(surfaces)||
  createSpriteElement!==null&&typeof createSpriteElement!=='function'||
  typeof onError!=='function'||typeof onNeedResync!=='function'||
  typeof onRemoveSprite!=='function'||
  typeof playerPreview!=='boolean'||typeof reducedMotion!=='boolean'||
  !Number.isSafeInteger(pixelsPerCell)||pixelsPerCell<2||pixelsPerCell>16)
  throw Error('Invalid V2 WorldRenderer configuration');
 const makeSprite=createSpriteElement||defaults(surfaces.spriteHost);
 const observer=createObserverPathBuffer();
 const sprites=new Map(),dirtySprites=new Set();
 let currentMap=mapId,currentViewer=viewerId;
 let scene=null,visibility=null,fogMask=null,paintedMask=null;
  let paintedLightFrame=null,lightPending=false;
 let authorized=false,disposed=false,local=null;
 let lastSightRejection=null;
 let staticPending=null,fogPending=false,terrainUrl=null;
 let latestSeq=0,seqItems=new Set(),lastSceneRevision=null;
 let stats={frames:0,spritePaints:0,spriteCreates:0,spriteRemoves:0,
  fogPaintedCells:0,fogDraws:0,staticDraws:0,terrainAssignments:0,
  rejectedPackets:0,fullFogDraws:0,
   movingLightDraws:0,movingLightCells:0};
 const safe=(fn,...args)=>{try{fn(...args)}catch{}};
 const present=p=>validMotionPoint(p)&&
  p.x<(scene?.dimensions.width??0)/(scene?.dimensions.gridSize??1)&&
  p.y<(scene?.dimensions.height??0)/(scene?.dimensions.gridSize??1);
 function masked(p,spanX=1,spanY=1){
  if(!visibility||!present(p))return false;
  if(!visibility.enabled)return true;
  // Match the server's centre-based current visibility for a footprint.
  const x=Math.floor(p.x+spanX/2),y=Math.floor(p.y+spanY/2);
  if(x<0||y<0||x>=visibility.width||y>=visibility.height)return false;
  return fogMask?.[y*visibility.width+x]===2;
 }
 function removeSprite(id){
  const entry=sprites.get(id);
  if(!entry)return;
  sprites.delete(id);dirtySprites.delete(id);
  if(entry.node?.parentNode===surfaces.spriteHost)
   surfaces.spriteHost.removeChild(entry.node);
  else if(entry.node?.parentNode?.removeChild)
   entry.node.parentNode.removeChild(entry.node);
  stats.spriteRemoves++;
  safe(onRemoveSprite,{kind:id.split(':')[0],id:id.split(':')[1],
   node:entry.node});
 }
 function clearSprites(){
  for(const id of [...sprites.keys()])removeSprite(id);
  dirtySprites.clear();
 }
 function clearLocal(){
  if(!local)return;
  for(const part of local.anchors.values()){
   const item=sprites.get(key(part));
   if(item){
    item.node.style.outline=part.baseOutline;
    item.node.style.outlineOffset=part.baseOutlineOffset;
    item.node.style.filter=part.baseFilter;
    dirtySprites.add(key(part));
   }
  }
  local=null;
 }
 function setOpaque(){
  const d=scene?.dimensions;
  paintWorldFogLayer({
   canvas:surfaces.fogCanvas,frame:null,mask:null,
   widthPx:d?.width??1,heightPx:d?.height??1
  });
  paintedMask=null;fogPending=false;
   paintedLightFrame=null;lightPending=false;
   if(surfaces.movingCanvas){
    surfaces.movingCanvas.width=1;surfaces.movingCanvas.height=1;
   }
 }
 // Permissions are revoked synchronously, without waiting for a RAF.
 function seal(reason='authorization-revoked',{
  forgetScene=false,requestResync=true
 }={}){
  authorized=false;visibility=null;fogMask=null;paintedMask=null;
  observer.authorizePieces([]);clearLocal();clearSprites();
  latestSeq=0;seqItems.clear();setOpaque();
  if(forgetScene){
   // A role/map revocation must immediately erase any DM-only guide layer.
   surfaces.staticCanvas.width=1;surfaces.staticCanvas.height=1;
   if(surfaces.staticCanvas.style)
    surfaces.staticCanvas.style.backgroundColor='transparent';
   scene=null;staticPending=null;lastSceneRevision=null;
   terrainUrl=null;
   if(typeof surfaces.terrain.removeAttribute==='function')
    surfaces.terrain.removeAttribute('src');
   else surfaces.terrain.src='';
  }
  if(requestResync)safe(onNeedResync,reason);
 }
 function installSprite(item){
  const id=key(item);
  if(sprites.has(id))return true;
  let node;
  try{node=makeSprite(item)}catch(error){safe(onError,error);return false}
  if(!node?.style||typeof node!=='object')return false;
  node.style.position='absolute';
  node.style.left='0px';node.style.top='0px';
  node.style.pointerEvents='auto';
  node.style.transition='none';
  node.style.visibility='hidden';
  node.style.willChange='translate';
  const dim=scene.dimensions.gridSize;
  node.style.width=dim+'px';node.style.height=dim+'px';
  if(node.dataset){
   node.dataset.worldKind=item.kind;node.dataset.worldId=item.id;
  }
  surfaces.spriteHost.appendChild(node);
  sprites.set(id,{node,x:null,y:null,visible:false,
   spanX:1,spanY:1});
  dirtySprites.add(id);stats.spriteCreates++;
  return true;
 }
 function paintSprite(id){
  const sprite=sprites.get(id);
  if(!sprite)return;
  const origin=observer.getPosition(...id.split(':'));
  let position=origin,isLocal=false;
  if(local?.anchors.has(id)){
   const anchor=local.anchors.get(id),p=local.display;
   position={x:anchor.x+p.x-local.origin.x,
    y:anchor.y+p.y-local.origin.y};
   isLocal=true;
  }
  const allowed=authorized&&position&&present(position)&&
   (isLocal||masked(position,sprite.spanX,sprite.spanY));
  if(!allowed){
   if(sprite.visible||sprite.node.style.visibility!=='hidden'){
    sprite.node.style.visibility='hidden';sprite.visible=false;
    stats.spritePaints++;
   }
   return;
  }
  const x=position.x*scene.dimensions.gridSize;
  const y=position.y*scene.dimensions.gridSize;
  if(sprite.x!==x||sprite.y!==y||!sprite.visible){
   sprite.node.style.translate=x+'px '+y+'px';
   sprite.node.style.visibility='visible';
   sprite.x=x;sprite.y=y;sprite.visible=true;
   stats.spritePaints++;
  }
 }
 function draw({now}){
  if(disposed)return false;
  stats.frames++;
  if(staticPending&&scene){
   const snapshot=staticPending;staticPending=null;
   const d=playerPreview?{...scene,scope:'viewer',environment:null}:scene;
   const result=paintWorldStaticLayer({canvas:surfaces.staticCanvas,
    scene:d,dirty:snapshot.dirty,forceFull:snapshot.forceFull});
   if(result.ok&&result.objects>=0)stats.staticDraws++;
   else safe(onError,Error('V2 static painter failed'));
  }
  if(lightPending&&scene){
    lightPending=false;
    if(surfaces.movingCanvas){
    const result=paintWorldMovingLightLayer({
     canvas:surfaces.movingCanvas,scene,
     frame:authorized?visibility:null,
     previousFrame:paintedLightFrame,playerPreview
    });
    if(result.ok){
     paintedLightFrame=authorized?visibility:null;
     stats.movingLightDraws++;
     stats.movingLightCells+=result.painted;
    }else safe(onError,Error('V2 moving-light painter failed'));
    }
   }
   if(fogPending&&scene){
   fogPending=false;
   const result=paintWorldFogLayer({
    canvas:surfaces.fogCanvas,frame:authorized?visibility:null,
    mask:authorized?fogMask:null,previousMask:paintedMask,
    widthPx:scene.dimensions.width,heightPx:scene.dimensions.height,
    pixelsPerCell
   });
   if(result.ok){
    paintedMask=authorized?fogMask:null;
    stats.fogPaintedCells+=result.cells;
    stats.fogDraws++;
    if(result.full)stats.fullFogDraws++;
   }else safe(onError,Error('V2 fog painter failed'));
  }
  if(authorized){
   const advanced=observer.tick(now);
   for(const p of advanced)dirtySprites.add(key(p));
   for(const id of dirtySprites)paintSprite(id);
   dirtySprites.clear();
  }else dirtySprites.clear();
  return authorized&&observer.pendingCount>0;
 }
 const scheduler=createWorldFrameScheduler({
  ...(requestFrame?{requestFrame}:{}),
  ...(cancelFrame?{cancelFrame}:{}),
  onFrame:draw,onError
 });
 function reconcileLocal(frame){
  if(!local||!local.handoff)return;
  let settled=true;
  for(const [id,anchor] of local.anchors){
   const piece=frame.visiblePieces.find(row=>key(row)===id);
   if(!piece||!same(piece,{
    x:anchor.x+local.display.x-local.origin.x,
    y:anchor.y+local.display.y-local.origin.y
   })){settled=false;break}
  }
  if(settled)clearLocal();
 }
 return Object.freeze({
  /** Accept only the published Phase 6 scene. It never repaints terrain. */
  adoptScene(raw,dirty=null){
   if(disposed)return false;
   const next=normalizeWorldSceneSnapshot(raw,currentMap);
   // New or unconfigured maps are playable with no fog/collision rules.
    // The server explicitly reports published:false, no geometry and both
    // safety rules disabled. Never accept an unpublished protected scene.
    const safeUnconfigured=next?.published===false&&
     next.fogEnabled===false&&next.collisionEnabled===false&&
     next.environment===null;
    if(!next||next.published!==true&&!safeUnconfigured){
    seal('invalid-published-scene',{forgetScene:true});return false;
   }
   if(scene&&(
    next.sceneGeneration<scene.sceneGeneration||
    next.revision<scene.revision)){
    stats.rejectedPackets++;return false;
   }
   const prior=scene;
   const sameScene=prior&&
    prior.sceneGeneration===next.sceneGeneration&&
    prior.revision===next.revision&&
    prior.scope===next.scope&&
    prior.fogEnabled===next.fogEnabled&&
    prior.collisionEnabled===next.collisionEnabled&&
    prior.rulesRevision===next.rulesRevision&&
    prior.ambient===next.ambient&&
    prior.effects.weather===next.effects.weather&&
    prior.effects.intensity===next.effects.intensity&&
    prior.dimensions.width===next.dimensions.width&&
    prior.dimensions.height===next.dimensions.height&&
    prior.dimensions.gridSize===next.dimensions.gridSize;
   if(sameScene)return true;
   if(prior){
    // A real publication invalidates prior sight and observer authorization.
    seal('scene-publication');
   }
   scene=next;
   const d=worldSceneDirtyRegions(prior,scene);
   staticPending={dirty:dirty&&typeof dirty==='object'?dirty:d,
    forceFull:!prior};
   configureHost(surfaces.spriteHost,scene);
   configureTerrain(surfaces.terrain,scene);
    fogPending=true;lightPending=true;
   lastSceneRevision=next.revision;
   scheduler.invalidate();
   return true;
  },
  /**
   * Only this atomic Phase 7 sight/roster/cursor frame authorizes sprites.
   * An older cursor cannot resurrect a sprite concealed by a newer packet.
   */
  adoptVisibility(raw){
   if(disposed||!scene){
    lastSightRejection='no-active-scene';return false;
   }
   const next=normalizeWorldVisibilityFrame(raw,currentMap,currentViewer);
   const scoped=next&&(playerPreview?
    scene.scope==='dm'&&next.scope==='viewer':
    scene.scope===next.scope);
   if(!next||!scoped||next.environmentRevision!==scene.revision||
    next.sceneGeneration!==scene.sceneGeneration||
    next.cursor<latestSeq){
    lastSightRejection=!next?'invalid-frame':
     !scoped?'viewer-scope-mismatch':
     next.environmentRevision!==scene.revision?'environment-revision-mismatch':
     next.sceneGeneration!==scene.sceneGeneration?'scene-generation-mismatch':
     'observer-cursor-regression';
    stats.rejectedPackets++;
    // A role/scope mismatch or malformed frame is a hard authorization
    // revocation: erase the cached DM scene, guide pixels and map bitmap.
    // A same-scope older cursor still cannot revive a hidden sprite.
    seal('invalid-or-stale-visibility',{forgetScene:!next||!scoped});
    return false;
   }
   if(visibility&&(
    next.environmentRevision<visibility.environmentRevision||
    next.sceneGeneration<visibility.sceneGeneration||
    next.permissionGeneration<visibility.permissionGeneration||
    (next.permissionGeneration===visibility.permissionGeneration&&
     next.sceneGeneration===visibility.sceneGeneration&&
     next.visionEpoch<visibility.visionEpoch)||
    next.cursor<visibility.cursor)){
    lastSightRejection='stale-visibility-frame';
    stats.rejectedPackets++;return false;
   }
   if(visibility&&next.permissionGeneration!==visibility.permissionGeneration){
    // An authenticated role/assignment change may turn a DM into a
    // regular player. Never reuse a DM-full environment after a new
    // permission generation, even when the published revision is identical.
    lastSightRejection='permission-generation-changed';
    stats.rejectedPackets++;
    seal('permission-generation-changed',{forgetScene:true});
    return false;
   }
   const nextMask=makeWorldFogMask(next);
   if(next.enabled&&!nextMask){
    lastSightRejection='invalid-fog-mask';
    stats.rejectedPackets++;seal('invalid-fog-mask');return false;
   }
   const previously=visibility;
   const prevMask=fogMask;
   const priorPositions=new Map();
   for(const id of sprites.keys()){
    const [kind,pieceId]=id.split(':');
    priorPositions.set(id,observer.getPosition(kind,pieceId));
   }
   visibility=next;fogMask=nextMask;authorized=true;
   latestSeq=next.cursor;seqItems.clear();
   if(!observer.reconcilePieces(next.visiblePieces)){
    lastSightRejection='invalid-authorized-roster';
    seal('bad-roster');return false;
   }
   const permitted=new Set(next.visiblePieces.map(key));
   for(const id of [...sprites.keys()])if(!permitted.has(id))
    removeSprite(id);
   // Remove an in-progress drag when its selection disappears from the
   // server-authorized roster. Never let an old local overlay reveal it.
   if(local&&[...local.anchors.keys()].some(id=>!permitted.has(id)))
    clearLocal();
   for(const piece of next.visiblePieces)if(!installSprite(piece)){
    lastSightRejection='sprite-factory-error';
    seal('sprite-factory-error');return false;
   }
   reconcileLocal(next);
   const maskChanged=Boolean(prevMask)!==Boolean(nextMask)||
    Boolean(prevMask&&nextMask&&(
     prevMask.length!==nextMask.length||
     prevMask.some((value,i)=>value!==nextMask[i])));
   if(!previously||maskChanged)fogPending=true;
    const changedPlayerLights=(previously?.lightCells?.length??-1)!==
     next.lightCells.length||next.lightCells.some((entry,i)=>
      entry[0]!==previously.lightCells[i]?.[0]||
      entry[1]!==previously.lightCells[i]?.[1]);
    const changedDmLights=(previously?.dmMovingLights?.length??-1)!==
     next.dmMovingLights.length||next.dmMovingLights.some((entry,i)=>
      entry.x!==previously.dmMovingLights[i]?.x||
      entry.y!==previously.dmMovingLights[i]?.y||
      entry.reach!==previously.dmMovingLights[i]?.reach);
    if(changedPlayerLights||changedDmLights)lightPending=true;
   // Compare old and newly authorized cosmetic positions. Cursor-only
   // advances update stream authorization without painting 500 idle sprites.
   for(const piece of next.visiblePieces){
    const id=key(piece);
    if(maskChanged||!previously||!priorPositions.has(id)||
     !same(priorPositions.get(id),
      observer.getPosition(piece.kind,piece.id)))
     dirtySprites.add(id);
   }
   if(fogPending||lightPending||dirtySprites.size||staticPending)
    scheduler.invalidate();
   lastSightRejection=null;
   return true;
  },
  /**
   * Called by the Phase 5 private observer channel ONLY; it does not trust
   * public Postgres position events or accept unknown/hidden sprite IDs.
   */
  applyObserverPath(item,meta){
   if(disposed||!authorized||!scene||!visibility||
    !meta||meta.mapId!==currentMap||
    !Number.isSafeInteger(meta.seq)||meta.seq<1||
    !item||!['token','tool'].includes(item.kind)||!validId(item.id)||
    !sprites.has(key(item))){
    stats.rejectedPackets++;return false;
   }
   if(meta.seq<latestSeq||
    (meta.seq===latestSeq&&
     (!seqItems.size||seqItems.has(key(item))))){
    stats.rejectedPackets++;return false;
   }
   if(meta.seq>latestSeq+1){
    seal('observer-sequence-gap');return false;
   }
   if(!Array.isArray(item.path)||!item.path.length||
    item.path.some(point=>{
     const sprite=sprites.get(key(item));
     return !masked(point,sprite?.spanX??1,sprite?.spanY??1);
    })){
    stats.rejectedPackets++;
    seal('observer-path-not-in-authorized-fog');return false;
   }
   if(!observer.applyPath(item)){
    stats.rejectedPackets++;seal('observer-path-discontinuity');return false;
   }
   if(meta.seq>latestSeq){latestSeq=meta.seq;seqItems.clear()}
   seqItems.add(key(item));
   dirtySprites.add(key(item));scheduler.wake();
   return true;
  },
  applyObserverHide(item,meta=null){
   if(disposed||!item||!['token','tool'].includes(item.kind)||
    !validId(item.id)||item.action!=='hide')return false;
   // Hiding an already-authorized piece is always safe even if the event
   // cursor is missing. A stamped cursor prevents a stale re-show.
   if(meta?.mapId===currentMap&&Number.isSafeInteger(meta.seq)){
    if(meta.seq<latestSeq||
     (meta.seq===latestSeq&&(!seqItems.size||seqItems.has(key(item)))))
     return false;
    if(meta.seq>latestSeq+1){seal('observer-sequence-gap');return false}
    if(meta.seq>latestSeq){latestSeq=meta.seq;seqItems.clear()}
    seqItems.add(key(item));
   }
   if(observer.applyHide(item)){
    removeSprite(key(item));return true;
   }
   return false;
  },
  /**
   * Phase 2 local gesture is already constrained by the injected Phase 3
   * known-geometry predictor and Phase 4 authority. It may update its own
   * authorized sprite immediately; it cannot create a missing NPC.
   */
  applyLocalMovement(event){
   if(disposed||!authorized||!scene||!event||
    event.mapId!==currentMap||!STATES.has(event.type)||
    !Number.isSafeInteger(event.gestureId)||event.gestureId<1)
    return false;
   if(event.type==='grabbed'){
    if(local)clearLocal();
    if(!Array.isArray(event.selection)||!event.selection.length||
     event.selection.length>48||!validMotionPoint(event.approved))return false;
    const anchors=new Map();
    for(const p of event.selection){
     if(!p||!['token','tool'].includes(p.kind)||!validId(p.id)||
      !sprites.has(key(p))||anchors.has(key(p)))return false;
     const position=observer.getPosition(p.kind,p.id);
     if(!position)return false;
     const sprite=sprites.get(key(p)).node;
     anchors.set(key(p),{kind:p.kind,id:p.id,...position,
      baseOutline:sprite.style.outline??'',
      baseOutlineOffset:sprite.style.outlineOffset??'',
      baseFilter:sprite.style.filter??''});
    }
    local={gestureId:event.gestureId,origin:copyPoint(event.approved),
     approved:copyPoint(event.approved),display:copyPoint(event.approved),
     predicted:false,handoff:false,anchors};
    for(const id of anchors.keys()){
     const node=sprites.get(id).node;
     node.style.outline='2px solid rgba(145,211,255,0.95)';
     node.style.outlineOffset='1px';
     node.style.filter='brightness(1.1)';
     dirtySprites.add(id);
    }
    scheduler.invalidate();return true;
   }
   if(!local||event.gestureId!==local.gestureId)return false;
   if(event.type==='presented'){
    if(event.predicted!==true||!validMotionPoint(event.presented))
     return false;
    local.display=copyPoint(event.presented);local.predicted=true;
   }else if(event.type==='approved'||event.type==='blocked'){
    if(!validMotionPoint(event.approved))return false;
    local.approved=copyPoint(event.approved);
    if(event.type==='blocked'||!local.predicted){
     local.display=copyPoint(event.approved);local.predicted=false;
    }else if(same(local.display,local.approved))local.predicted=false;
   }else if(event.type==='committed'){
    if(!validMotionPoint(event.approved))return false;
    local.approved=copyPoint(event.approved);
    local.display=copyPoint(event.approved);
    local.predicted=false;local.handoff=true;
    // Phase 9 MUST fetch an authorized canonical roster after commit.
    safe(onNeedResync,'canonical-commit');
   }else if(event.type==='cancelled'||event.type==='rejected'){
    clearLocal();
    safe(onNeedResync,'gesture-'+event.type);
   }else if(event.type==='revoked'){
    seal('gesture-revoked');return true;
   }
   // sampled and released retain their last known-authorized presentation.
   for(const id of local?.anchors.keys()??[])dirtySprites.add(id);
   scheduler.invalidate();return true;
  },
  /**
   * Phase 9 supplies dimensions only from RLS-authorized token/tool rows
   * AFTER Phase 7 grants the piece ID. Metadata never creates a sprite,
   * reveals fog, changes movement physics or remounts a token.
   */
  setSpriteDimensions(kind,id,{spanX=1,spanY=1}={}){
   if(disposed||!authorized||!scene||
    !['token','tool'].includes(kind)||!validId(id)||
    !finite(spanX)||!finite(spanY)||spanX<=0||spanY<=0||
    spanX>12||spanY>12)return false;
   const sprite=sprites.get(kind+':'+id);
   if(!sprite)return false;
   if(sprite.spanX===spanX&&sprite.spanY===spanY)return true;
   sprite.spanX=spanX;sprite.spanY=spanY;
   const size=scene.dimensions.gridSize;
   sprite.node.style.width=size*spanX+'px';
   sprite.node.style.height=size*spanY+'px';
   dirtySprites.add(kind+':'+id);scheduler.invalidate();
   return true;
  },
  setTerrainSource(source){
   if(disposed||!scene||typeof source!=='string'||
    source.length>4096||
    (source!==''&&!/^(https?:\\/\\/|blob:|\\/)/i.test(source)))
    return false;
   if(terrainUrl===source||!terrainUrl&&source==='')return true;
   terrainUrl=source||null;
   if(source)surfaces.terrain.src=source;
   else if(typeof surfaces.terrain.removeAttribute==='function')
    surfaces.terrain.removeAttribute('src');
   else surfaces.terrain.src='';
   stats.terrainAssignments++;return true;
  },
  /** Camera is CSS-only, independent of canvas or sprite recalculation. */
  setCamera({x=0,y=0,zoom=1}={}){
   if(disposed||!finite(x)||!finite(y)||!finite(zoom)||
    zoom<0.1||zoom>8||!surfaces.viewport?.style)return false;
   const style=surfaces.viewport.style;
   style.transformOrigin='0 0';
   style.transform='translate3d('+x+'px,'+y+'px,0) scale('+zoom+')';
   return true;
  },
  /**
   * A map or permission switch clears all authorized sprites/fog right now.
   * A static scene publication may retain terrain while sight refreshes.
   */
  revoke(reason='permission-revoked',hard=true){
   if(disposed)return;
   seal(reason,{forgetScene:hard,requestResync:false});
  },
  changeContext({mapId:nextMap,viewerId:nextViewer}={}){
   if(disposed||!validId(nextMap)||!validId(nextViewer))return false;
   if(nextMap===currentMap&&nextViewer===currentViewer)return true;
   seal('viewer-map-switch',{forgetScene:true,requestResync:false});
   currentMap=nextMap;currentViewer=nextViewer;
   return true;
  },
  pause(){scheduler.pause();observer.resetClock()},
  resume(){observer.resetClock();scheduler.resume()},
  dispose(){
   if(disposed)return;
   disposed=true;scheduler.dispose();
   observer.dispose();clearLocal();clearSprites();
   scene=null;visibility=null;fogMask=null;paintedMask=null;
   staticPending=null;fogPending=false;
    lightPending=false;paintedLightFrame=null;
  },
  get stats(){return Object.freeze({...stats,
   scheduler:scheduler.stats,observerPending:observer.pendingCount,
   sprites:sprites.size})},
  get spriteKeys(){return [...sprites.keys()]},
  getSpriteElement(kind,id){return sprites.get(kind+':'+id)?.node??null},
  get currentScene(){return scene},
  get currentVisibility(){return visibility},
  get lastSightRejection(){return lastSightRejection},
  get authorized(){return authorized},
  get mapId(){return currentMap},
  get viewerId(){return currentViewer}
 });
}
