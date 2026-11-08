import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {validMeasurement,liveMeasurementPayload,pointOnBattlemap,
 measurementGeometry,addLineTurn,shouldBendLineOnRightPress,shouldBendLineOnKeyPress,
 acceptMeasurementEvent,applyMeasurementEventToVisible} from './MapMeasurements.js';
import {MeasurementToolBar,MapMeasurementOverlay} from './MapMeasurementTools.jsx';
import Artwork from './Artwork.jsx';
import MapPinLayer from './MapPinLayer.jsx';
import CampaignToolMapLayer from './CampaignToolMapLayer.jsx';
import {toolCanControl,toolCanBeHeld} from './CampaignTools.js';
import MapEnvironmentOverlay from './MapEnvironmentOverlay.jsx';
import MapObjectQuickAdjust from './MapObjectQuickAdjust.jsx';
import MapPlayerPreviewOverlay from './MapPlayerPreviewOverlay.jsx';
import MapFogOverlay from './MapFogOverlay.jsx';
import {tokenObservedByFogFrame} from './MapFogModel.js';
import {previewViewer,previewVisionPolygon,pointInPolygon} from './MapVisionPreview.js';
import {checkTokenMovement} from './MapCollision.js';
import {traceLegalTokenDestination} from './MapMovementTrajectory.js';
import {traceSolidGroupOffset} from './DragCollisionGuard.js';
import {stableTokenPresentation} from './StableTokenPresentation.js';
import {appendMovementWaypoint} from './MapMovementPath.js';
import {createTokenMotionRuntime} from './TokenMotionRuntime.js';
import {normalizeConfig} from './TokenMonitors.jsx';
import TokenMonitorFrames from './TokenMonitorFrames.jsx';
import {canControlMapToken,selectionRectangle,selectableTokenIds,
 selectableToolIds,groupToolFootprint,boundedGroupOffset} from './MapSelection.js';
import {TokenStatusBadges,TokenStatusPicker,normalizedEffects,normalizedCatalog,statusTitle} from './TokenStatuses.jsx';

export default function Board({db,map,url,tokens,user,isDM,move,moveGroup,remove,resize,onNpcDrop,onCharacterDrop,
 toolPlacements=[],toolIssued=[],onToolPlace,onToolPickUp,onToolOpen,onToolHold,
 onToolMovementPreview,remoteToolPositions={},onUnitDrop,onTokenEdit,onTokenQuick,onTokenStatus,statusCatalog,scale,setScale,selectedId,setSelectedId,displayConfig,monitorValues,encumbranceBadges={},onMovementPreview,remotePositions={},
 onMeasurementPreview,remoteMeasurements={},hotbarInset=false,fogFrame=null,authorizedLightMasks=null,
 environment,publishedEnvironment,environmentEditor,registerPreviewStep,onAddEnvironmentObject,onSelectEnvironmentObject,
 onPatchEnvironmentObject,characters=[],template,active=true,combatActiveTokenId=null,
 registerRemoteMotion,handoutPins=[],onCreateHandoutPin,onOpenHandoutPin,onMoveHandoutPin,
 onReadHandoutPin,onCollectHandoutPin,onDeleteHandoutPin,onSelectHandoutPin,
 onDeleteEnvironmentObject}){
 const[preview,setPreview]=useState({});
 const motion=useRef(null);
 if(!motion.current)motion.current=createTokenMotionRuntime();
 const spriteNodes=useRef(new Map()),spriteRefs=useRef(new Map());
 const mountedSight=useRef({key:null,seen:new Set()});
 // Stable React ref identities: a fog, roster or monitor rerender must not
 // detach/rebind every sprite and capture an in-flight CSS transition as
 // the element's permanent base transition.
 function spriteRef(id){
  let callback=spriteRefs.current.get(id);
  if(!callback){
   callback=node=>{
    if(node)spriteNodes.current.set(id,node);
    else{
     spriteNodes.current.delete(id);
     motion.current?.bind(id,'sprite',null);
    }
   };
   spriteRefs.current.set(id,callback);
  }
  return callback;
 }
 // Reusable through React dev effect remounts; clear without retiring runtime.
 useEffect(()=>{const runtime=motion.current;return()=>runtime.clear()},[]);
 useEffect(()=>{
  registerRemoteMotion?.(motion.current);
  return()=>registerRemoteMotion?.(null);
 },[registerRemoteMotion]);
 const[toolPreview,setToolPreview]=useState({});
 const[selectedIds,setSelectedIds]=useState([]);
 const[selectedToolIds,setSelectedToolIds]=useState([]);
 const[marquee,setMarquee]=useState(null);
 const[activeMeasureTool,setActiveMeasureTool]=useState(null),
  [localMeasurements,setLocalMeasurements]=useState([]);
 const measureDrag=useRef(null),toolDrag=useRef(null);
 const lastCenteredMap=useRef(null);
 const boardRef=useRef(null),viewportRef=useRef(null),
  drag=useRef(null),resizeDrag=useRef(null),pan=useRef(null),
  selection=useRef(null),primaryRef=useRef(null),zoomRef=useRef(scale);
 const [panning,setPanning]=useState(false);
 const [previewPosition,setPreviewPosition]=useState(null);
 const previewDrag=useRef(null),previewNudgeRef=useRef(null);
 // Reuse derived rendering data during drag, measurement and marquee updates.
 const sourcePreviewToken=isDM&&environmentEditor?.previewing?
  tokens.find(t=>t.id===(environmentEditor.previewTokenId||tokens.find(x=>x.visible!==false)?.id)):null;
 const previewToken=sourcePreviewToken&&previewPosition?.mapId===map.id&&
  previewPosition?.id===sourcePreviewToken.id?
  {...sourcePreviewToken,x:previewPosition.x,y:previewPosition.y}:sourcePreviewToken;
 const viewer=useMemo(()=>previewViewer(previewToken,characters),[previewToken,characters]);
 const previewEnvironment=publishedEnvironment||environment;
 const previewActive=!!(isDM&&environmentEditor?.previewing&&viewer&&previewEnvironment);
 function movePreviewToken(origin,destination){
  if(!origin||!previewEnvironment)return false;
  const direct=checkTokenMovement({token:origin,destination,map,environment:previewEnvironment});
  const legal=direct.allowed?destination:traceLegalTokenDestination({
   token:origin,destination,map,environment:previewEnvironment
  });
  if(!direct.allowed&&legal.x===Number(origin.x)&&legal.y===Number(origin.y))
   return false;
  setPreviewPosition({id:origin.id,mapId:map.id,x:legal.x,y:legal.y});
  return true;
 }
 // Keyboard bindings and pointer dragging share one swept-wall test. All
 // simulated moves remain board-local, never updating map_tokens.
 previewNudgeRef.current=(dx,dy)=>{
  if(!active||!previewActive||!previewToken)return false;
  return movePreviewToken(previewToken,{
   x:Number(previewToken.x)+dx,y:Number(previewToken.y)+dy
  });
 };
 useEffect(()=>{
  if(!registerPreviewStep)return;
  const step=(dx,dy)=>previewNudgeRef.current?.(dx,dy)??false;
  registerPreviewStep(step);
  return()=>registerPreviewStep(null);
 },[registerPreviewStep]);
 const previewPolygon=useMemo(()=>previewActive?
  previewVisionPolygon({map,environment:previewEnvironment,viewer,maxFeet:60}):[],
  [previewActive,map,previewEnvironment,viewer]);
 const visibleTokens=useMemo(()=>{
  // Visibility ticks may arrive before the refreshed RLS token query. Never
  // leave an old NPC token faintly visible through previously explored fog.
  const allowed=isDM?tokens:tokens.filter(t=>t.visible&&
   !remotePositions[t.id]?.hidden&&tokenObservedByFogFrame(t,fogFrame,user));
  if(!previewActive)return allowed;
  return allowed.filter(t=>t.visible!==false&&
   (t.id===previewToken?.id||pointInPolygon({
    x:Number(t.x)+Number(t.span_x??1)/2,
    y:Number(t.y)+Number(t.span_y??1)/2},previewPolygon)))
    .map(t=>t.id===previewToken?.id?previewToken:t);
 },[tokens,isDM,previewActive,previewToken,previewPolygon,fogFrame,user,remotePositions]);
 // Preserve sprites already authorized at least once. Sight can be revoked
 // temporarily on an incoming viewer tick without destroying every artwork
 // element. Fresh RLS omissions and never-seen NPCs are still unmounted.
 const sightKey=map.id+':'+user;
 if(mountedSight.current.key!==sightKey)
  mountedSight.current={key:sightKey,seen:new Set()};
 const presentation=stableTokenPresentation(tokens,visibleTokens,
  mountedSight.current.seen,map.id);
 mountedSight.current.seen=presentation.seen;
 const presentedTokens=isDM?visibleTokens:presentation.displayed;
 const concealedIds=isDM?new Set():presentation.concealed;
 // Retire a local drop preview only after React has committed the matching
 // optimistic left/top (and its separate monitor frame) before the next paint.
 useLayoutEffect(()=>{
  const cell=map.grid_size*scale;
  for(const token of presentedTokens){
   const p={...token,...remotePositions[token.id],...preview[token.id]};
   const node=spriteNodes.current.get(token.id);
   if(node)motion.current?.bind(token.id,'sprite',node,{
    x:Number(p.x),y:Number(p.y),cell
   });
   motion.current?.reconcile(token.id,Number(token.x),Number(token.y));
  }
 },[presentedTokens,remotePositions,preview,map.grid_size,scale]);
 const displaySettings=useMemo(()=>normalizeConfig(displayConfig),[displayConfig]);
 const statusPosition=displaySettings.statusPosition;
 const measures=useMemo(()=>[...Object.values(remoteMeasurements),...localMeasurements],[remoteMeasurements,localMeasurements]);
 useEffect(()=>{
  previewDrag.current=null;
  setPreviewPosition(null);
 },[map.id,environmentEditor?.previewing,environmentEditor?.previewTokenId]);
 const environmentHandlers=useRef({onAddEnvironmentObject,onSelectEnvironmentObject,onPatchEnvironmentObject});
 environmentHandlers.current={onAddEnvironmentObject,onSelectEnvironmentObject,onPatchEnvironmentObject};
 const handleEnvironmentAdd=useCallback(object=>environmentHandlers.current.onAddEnvironmentObject?.(object),[]);
 const handleEnvironmentSelect=useCallback((ids,options)=>environmentHandlers.current.onSelectEnvironmentObject?.(ids,options),[]);
 const handleEnvironmentPatch=useCallback((id,change,opts)=>
  environmentHandlers.current.onPatchEnvironmentObject?.(id,change,opts),[]);
 function selectTokens(ids,toolIds=[]){
  const unique=[...new Set(ids)],uniqueTools=[...new Set(toolIds)];
  setSelectedIds(unique);
  setSelectedToolIds(uniqueTools);
  primaryRef.current=unique[0]||null;
  setSelectedId(primaryRef.current);
 }
 // Keep selections made elsewhere (new tokens, keyboard actions) in sync.
 useEffect(()=>{
  if(selectedId!==primaryRef.current){
   primaryRef.current=selectedId;
   setSelectedIds(selectedId?[selectedId]:[]);
   setSelectedToolIds([]);
  }
 },[selectedId]);
 // Pinned measurements remain until the creator clears them.
 useEffect(()=>{
  setActiveMeasureTool(null);setLocalMeasurements([]);
  measureDrag.current=null;toolDrag.current=null;
 },[map.id]);
 useEffect(()=>{
  function onEscape(event){
   if(!active||event.key!=='Escape'||!activeMeasureTool)return;
   event.preventDefault();
   const current=measureDrag.current;
   if(current){
    setLocalMeasurements(existing=>existing.filter(m=>m.id!==current.measure.id));
    onMeasurementPreview?.(current.measure,'remove');
   }
   setActiveMeasureTool(null);
   measureDrag.current=null;toolDrag.current=null;
  }
  window.addEventListener('keydown',onEscape);
  return()=>window.removeEventListener('keydown',onEscape);
 },[active,activeMeasureTool,onMeasurementPreview]);
 // Recenter only when opening a different map, not during zoom/pan.
 useLayoutEffect(()=>{
  if(!active||lastCenteredMap.current===map.id)return;
  const vp=viewportRef.current;
  if(!vp||!vp.clientWidth||!vp.clientHeight)return;
  vp.scrollLeft=Math.max(0,(vp.scrollWidth-vp.clientWidth)/2);
  vp.scrollTop=Math.max(0,(vp.scrollHeight-vp.clientHeight)/2);
  lastCenteredMap.current=map.id;
 },[map.id,active]);
 useEffect(()=>{zoomRef.current=scale},[scale]);
 // A remote snapshot must not cancel the drag that is actively in progress.
 useEffect(()=>{if(!drag.current)setPreview({})},[tokens]);
 useEffect(()=>{
  motion.current?.clear();
  primaryRef.current=null;setSelectedId(null);setSelectedIds([]);
  setMarquee(null);selection.current=null;drag.current=null;
  setSelectedToolIds([]);setToolPreview({});
 },[map.id]);
 useEffect(()=>{
  setSelectedIds(old=>old.filter(id=>tokens.some(t=>
   t.id===id&&canControlMapToken(t,user,isDM,map.id))));
  if(selectedId&&!tokens.some(t=>t.id===selectedId))selectTokens([]);
 },[selectedId,tokens,user,isDM,map.id]);
 useEffect(()=>{
  setSelectedToolIds(old=>{
   const allowed=old.filter(id=>toolPlacements.some(p=>p.issue_id===id&&
    toolCanControl(toolIssued.find(i=>i.id===id),user,isDM)));
   return allowed.length===old.length?old:allowed;
  });
 },[toolPlacements,toolIssued,user,isDM,map.id]);
 useEffect(()=>{
  if(!selectedId||!viewportRef.current)return;
  const token=tokens.find(t=>t.id===selectedId);
  if(!token)return;
  const node=viewportRef.current,cell=map.grid_size*scale;
  const x=(Number(token.x)+Number(token.span_x??1)/2)*cell;
  const y=(Number(token.y)+Number(token.span_y??1)/2)*cell;
  const visibleLeft=node.scrollLeft,visibleRight=visibleLeft+node.clientWidth;
  const visibleTop=node.scrollTop;
  const clearance=hotbarInset?78:0;
  const visibleBottom=visibleTop+Math.max(35,node.clientHeight-clearance);
  if(x<visibleLeft+32||x>visibleRight-32)node.scrollLeft=Math.max(0,x-node.clientWidth/2);
  if(y<visibleTop+32||y>visibleBottom-32)
   node.scrollTop=Math.max(0,y-(node.clientHeight-clearance)/2);
  node.focus({preventScroll:true});
 },[selectedId,map.id,hotbarInset]);
 useEffect(()=>{
  function handleDelete(e){
   if(!active||e.key!=='Delete'||e.defaultPrevented||e.repeat)return;
   const el=e.target;
   if(el instanceof Element && (el.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')||
     (el.closest('button')&&!el.closest('.map-env-marker,.campaign-tool-map-token,.map-handout-pin'))))return;
   if(document.querySelector('.modal-backdrop'))return;
   if(isDM&&environmentEditor?.enabled&&environmentEditor.layer==='light'){
    const pin=handoutPins.find(item=>item.id===environmentEditor.selectedPinId);
    if(!environmentEditor.lockLight&&pin){
     e.preventDefault();e.stopPropagation();
     if(window.confirm('Remove this pin from the map?'))
      void Promise.resolve(onDeleteHandoutPin?.(pin)).catch(console.error);
     return;
    }
    const ids=(environmentEditor.selectedIds?.length?environmentEditor.selectedIds:
     environmentEditor.selectedId?[environmentEditor.selectedId]:[])
     .filter(id=>environment?.objects?.some(o=>o.id===id));
    if(!environmentEditor.lockLight&&ids.length){
     e.preventDefault();e.stopPropagation();
     onDeleteEnvironmentObject?.(ids);return;
    }
    // Lock is on by default so map-editing Delete never destroys a token.
    if(environmentEditor.lockTokens!==false)return;
   }
   const removableTools=selectedToolIds.filter(id=>
    toolCanControl(toolIssued.find(t=>t.id===id),user,isDM));
   if(removableTools.length){
    e.preventDefault();e.stopPropagation();
    setSelectedToolIds([]);
    for(const id of removableTools)onToolPickUp?.(id);
    return;
   }
   if(!isDM)return;
   const t=tokens.find(x=>x.id===selectedId);
   if(!t)return;
   e.preventDefault();e.stopPropagation();setSelectedId(null);remove(t);
  }
  document.addEventListener('keydown',handleDelete);
  return()=>document.removeEventListener('keydown',handleDelete);
 },[active,selectedId,selectedToolIds,isDM,user,tokens,toolIssued,
   remove,onToolPickUp,environmentEditor,environment,onDeleteEnvironmentObject,
   handoutPins,onDeleteHandoutPin]);
 useEffect(()=>{
  const node=viewportRef.current;if(!node)return;
  const wheel=e=>{
   if(!e.ctrlKey)return;
   e.preventDefault();e.stopPropagation();
   const stops=[.25,.35,.5,.7,1,1.5,2,3],before=zoomRef.current;
   const nearest=stops.reduce((best,value,i)=>Math.abs(value-before)<Math.abs(stops[best]-before)?i:best,0);
   const next=stops[Math.max(0,Math.min(stops.length-1,nearest+(e.deltaY<0?1:-1)))];
   if(next===before)return;
   const rect=node.getBoundingClientRect(),vx=e.clientX-rect.left,vy=e.clientY-rect.top;
   const wx=(node.scrollLeft+vx)/before,wy=(node.scrollTop+vy)/before;
   zoomRef.current=next;setScale(next);
   requestAnimationFrame(()=>{
    node.scrollLeft=Math.max(0,wx*next-vx);
    node.scrollTop=Math.max(0,wy*next-vy);
   });
  };
  node.addEventListener('wheel',wheel,{passive:false});
  return()=>node.removeEventListener('wheel',wheel);
 },[]);
 const pos=e=>{
  const rect=boardRef.current.getBoundingClientRect(),cell=zoomRef.current*map.grid_size;
  return{
   x:Math.max(0,Math.min(1000,Math.floor((e.clientX-rect.left)/cell))),
   y:Math.max(0,Math.min(1000,Math.floor((e.clientY-rect.top)/cell)))
  };
 };
 const snapSize=(v)=>Math.max(.25,Math.min(12,Math.round(v*4)/4));
 function dropOnMap(e){
  if(previewActive)return;
  const kinds=['application/x-forge-character','application/x-forge-unit',
   'application/x-forge-npc','application/x-forge-tool'];
  const match=kinds.find(k=>e.dataTransfer.types.includes(k));
  if(!match)return;
  e.preventDefault();
  const id=e.dataTransfer.getData(match);
  if(!id)return;
  const p=pos(e);
  if(match==='application/x-forge-character')onCharacterDrop(id,p.x,p.y);
  else if(match==='application/x-forge-unit')onUnitDrop(id,p.x,p.y);
  else if(match==='application/x-forge-tool'){
   const carrier=e.target.closest('.token')?.dataset.tokenId;
   if(carrier&&toolCanBeHeld(toolIssued.find(item=>item.id===id)))onToolHold?.(id,carrier);
   else onToolPlace?.(id,p.x,p.y);
  }
  else if(isDM)onNpcDrop(id,p.x,p.y);
 }
 function allowMapDrop(e){
  if(previewActive)return;
  const types=e.dataTransfer.types;
  const allowed=types.includes('application/x-forge-character')||
    types.includes('application/x-forge-unit')||
    types.includes('application/x-forge-tool')||
    (isDM&&types.includes('application/x-forge-npc'));
  if(allowed)e.preventDefault();
 }
 const boardPoint=e=>{
  const rect=boardRef.current?.getBoundingClientRect();
  return rect?{
   x:Math.max(0,Math.min(map.width*zoomRef.current,e.clientX-rect.left)),
   y:Math.max(0,Math.min(map.height*zoomRef.current,e.clientY-rect.top))
  }:{x:0,y:0};
 };
 const mapPointInCells=e=>pointOnBattlemap(e.clientX,e.clientY,
  boardRef.current?.getBoundingClientRect(),map.width,map.height,
  map.grid_size,zoomRef.current);
 function beginMeasurement(pointerId,tool,point,pinned=false,sourceButton=0){
  if(!point||measureDrag.current)return;
  const measure={id:crypto.randomUUID(),tool,start:point,end:point};
  measureDrag.current={pointerId,measure,pinned,sourceButton};
  setLocalMeasurements(existing=>[...existing,{...measure,isLocal:true}]);
  onMeasurementPreview?.(measure,'preview');
 }
 function updateMeasurement(e){
  const current=measureDrag.current;
  if(!current||current.pointerId!==e.pointerId)return;
  const point=mapPointInCells(e);
  if(!point)return;
  if(current.measure.end.x===point.x&&current.measure.end.y===point.y)return;
  const next={...current.measure,end:point};
  current.measure=next;
  setLocalMeasurements(existing=>existing.map(m=>m.id===next.id?
   {...next,isLocal:true}:m));
  onMeasurementPreview?.(next,'preview');
 }
 function finishMeasurement(e,cancel=false){
  const current=measureDrag.current;
  if(!current||current.pointerId!==e.pointerId)return;
  // Releasing the secondary button while primary remains down must NOT
  // finish a multi-leg movement measurement.
  if(!cancel&&e.button===2&&current.sourceButton===0)return;
  measureDrag.current=null;
  const point=cancel?current.measure.end:
   mapPointInCells(e)||current.measure.end;
  const done={...current.measure,end:point};
  const meaningful=done.tool==='line'?
   (measurementGeometry(done)?.feet||0)>0:
   Math.hypot(done.end.x-done.start.x,done.end.y-done.start.y)>=.5;
  if(!cancel&&meaningful&&current.pinned){
   setLocalMeasurements(existing=>existing.map(m=>m.id===done.id?
    {...done,isLocal:true,pinned:true}:m));
   onMeasurementPreview?.(done,'pin');
  }else{
   // Remove is broadcast without throttling; local removal is immediate.
   setLocalMeasurements(existing=>existing.filter(m=>m.id!==done.id));
   onMeasurementPreview?.(done,'remove');
  }
 }
 function clearMyPinnedMeasurements(){
  setLocalMeasurements(existing=>existing.filter(m=>!m.pinned));
  onMeasurementPreview?.(null,'clear');
 }
 function onToolPointerDown(e,tool){
  if(e.button!==0&&e.button!==2)return;
  // On a chorded right-click, keep the original left-drag and add a turn.
  if(e.button===2&&measureDrag.current){pinCurrentMeasurementOnRightClick(e);return}
  if(toolDrag.current)return;
  setActiveMeasureTool(tool);
  e.preventDefault();e.stopPropagation();
  toolDrag.current={pointerId:e.pointerId,tool,pinned:e.button===2,sourceButton:e.button};
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
 }
 function onToolPointerMove(e){
  const current=toolDrag.current;
  if(!current||current.pointerId!==e.pointerId)return;
  const rect=boardRef.current?.getBoundingClientRect();
  if(!rect)return;
  if(!measureDrag.current){
   if(e.clientX<rect.left||e.clientX>rect.right||
      e.clientY<rect.top||e.clientY>rect.bottom)return;
   beginMeasurement(e.pointerId,current.tool,mapPointInCells(e),current.pinned,current.sourceButton);
  }else updateMeasurement(e);
 }
 function onToolPointerUp(e,cancel=false){
  if(toolDrag.current?.pointerId!==e.pointerId)return;
  if(!cancel&&e.button===2&&measureDrag.current?.sourceButton===0)return;
  finishMeasurement(e,cancel);
  toolDrag.current=null;
  try{if(e.currentTarget.hasPointerCapture(e.pointerId))
   e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
 }
 function startMeasurementCapture(e){
  if(!activeMeasureTool||(e.button!==0&&e.button!==2)||
   pan.current||measureDrag.current)return;
  e.preventDefault();e.stopPropagation();
  beginMeasurement(e.pointerId,activeMeasureTool,mapPointInCells(e),
   e.button===2,e.button);
  try{viewportRef.current?.setPointerCapture(e.pointerId)}catch{}
 }
 function pinCurrentMeasurementOnRightClick(e){
  // A secondary click during a held primary-button line measurement
  // creates a snapped bend rather than pinning the line. A right-button
  // measurement started on its own still pins as before.
  if(!activeMeasureTool||!(e.button===2||e.type==='contextmenu')||!measureDrag.current)return;
  e.preventDefault();e.stopPropagation();
  const current=measureDrag.current;
  if(shouldBendLineOnRightPress(current,2)){
   const next=addLineTurn(current.measure,mapPointInCells(e)||current.measure.end);
   if(next!==current.measure){
    current.measure=next;
    setLocalMeasurements(existing=>existing.map(m=>m.id===next.id?
     {...next,isLocal:true}:m));
    onMeasurementPreview?.(next,'preview',true);
   }
   return;
  }
  measureDrag.current.pinned=true;
 }
 // When a measurement begins on the floating toolbar, the button captures
 // its pointer while the user drags onto the map. A second mouse button can
 // therefore be retargeted to the toolbar rather than the map viewport.
 // Catch chorded right-clicks globally during a measurement, without affecting
 // standalone right-drag pinning or interactions outside the battlemap.
 useEffect(()=>{
  if(!active||!activeMeasureTool)return;
  function onMouseDown(e){
   if(e.button!==2||!measureDrag.current)return;
   const rect=boardRef.current?.getBoundingClientRect();
   if(!rect||e.clientX<rect.left||e.clientX>rect.right||
    e.clientY<rect.top||e.clientY>rect.bottom)return;
   pinCurrentMeasurementOnRightClick(e);
  }
  // Some browsers delay pointerup until both mouse buttons are released.
  // Native left mouseup always terminates a left-drag measurement promptly.
  function onMouseUp(e){
   const current=measureDrag.current;
   if(e.button!==0||current?.sourceButton!==0)return;
   finishMeasurement({pointerId:current.pointerId,button:0,
    clientX:e.clientX,clientY:e.clientY});
   if(toolDrag.current?.pointerId===current.pointerId)toolDrag.current=null;
  }
  // Continue tracking even when a second mouse button drops pointer capture.
  function onMouseMove(e){
   const current=measureDrag.current;
   if(current?.sourceButton!==0)return;
   updateMeasurement({pointerId:current.pointerId,clientX:e.clientX,clientY:e.clientY});
  }
  // Context-menu events are more reliable than secondary pointerdown when
  // the primary pointer is captured by the measurement toolbar or viewport.
  function onContextMenu(e){
   if(!shouldBendLineOnRightPress(measureDrag.current,2))return;
   const rect=boardRef.current?.getBoundingClientRect();
   if(!rect||e.clientX<rect.left||e.clientX>rect.right||
    e.clientY<rect.top||e.clientY>rect.bottom)return;
   pinCurrentMeasurementOnRightClick(e);
  }
  window.addEventListener('contextmenu',onContextMenu,true);
  window.addEventListener('mousedown',onMouseDown,true);
  window.addEventListener('mousemove',onMouseMove,true);
  window.addEventListener('mouseup',onMouseUp,true);
  return()=>{
   window.removeEventListener('contextmenu',onContextMenu,true);
   window.removeEventListener('mousedown',onMouseDown,true);
   window.removeEventListener('mousemove',onMouseMove,true);
   window.removeEventListener('mouseup',onMouseUp,true);
  };
 },[active,activeMeasureTool]);
 // Preserve line bending when browsers suppress right presses during
 // pointer capture. R adds a snapped turn at the active line endpoint.
 useEffect(()=>{
  if(!active||activeMeasureTool!=='line')return;
  const onTurnKey=e=>{
   const current=measureDrag.current;
   if(!shouldBendLineOnKeyPress(current,e.key,e.repeat))return;
   if(e.target instanceof Element&&e.target.closest(
    'input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
   e.preventDefault();e.stopPropagation();
   const next=addLineTurn(current.measure,current.measure.end);
   if(next===current.measure)return;
   current.measure=next;
   setLocalMeasurements(existing=>existing.map(m=>m.id===next.id?
    {...next,isLocal:true}:m));
   onMeasurementPreview?.(next,'preview',true);
  };
  window.addEventListener('keydown',onTurnKey,true);
  return()=>window.removeEventListener('keydown',onTurnKey,true);
 },[active,activeMeasureTool,onMeasurementPreview]);
 function startPan(e){
  // Middle mouse pans even if it starts over a token. Touch keeps one-finger
  // panning because touchscreens do not have a middle mouse button.
  if(e.button!==1&&!(e.pointerType==='touch'&&e.button===0))return;
  const viewport=viewportRef.current;if(!viewport)return;
  e.preventDefault();e.stopPropagation();
  pan.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,
   left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(e.pointerId);
  setPanning(true);
 }
 function startMarquee(e){
  if(environmentEditor?.enabled||previewActive)return;
  if(activeMeasureTool||e.button!==0||e.pointerType==='touch'||pan.current||drag.current||
     e.altKey||e.ctrlKey||e.metaKey||
     e.target.closest('.token,.campaign-tool-map-token'))return;
  const viewport=viewportRef.current;
  if(!viewport||!boardRef.current)return;
  const start=boardPoint(e);
  e.preventDefault();
  selection.current={id:e.pointerId,start,originX:e.clientX,
   originY:e.clientY,additive:e.shiftKey,originalIds:selectedIds,
   originalToolIds:selectedToolIds};
  setMarquee({start,end:start});
  viewport.setPointerCapture(e.pointerId);
 }
 function moveViewportPointer(e){
  const info=pan.current;
  if(info&&info.id===e.pointerId){
   const viewport=viewportRef.current;
   viewport.scrollLeft=info.left-(e.clientX-info.startX);
   viewport.scrollTop=info.top-(e.clientY-info.startY);
   return;
  }
  const select=selection.current;
  if(select?.id===e.pointerId)
   setMarquee({start:select.start,end:boardPoint(e)});
 }
 function endViewportPointer(e,cancel=false){
  if(pan.current?.id===e.pointerId){
   pan.current=null;setPanning(false);
  }
  const info=selection.current;
  if(info?.id===e.pointerId){
   selection.current=null;setMarquee(null);
   if(!cancel){
    const dragged=Math.hypot(e.clientX-info.originX,e.clientY-info.originY)>=4;
    if(dragged){
     const rect=selectionRectangle(info.start,boardPoint(e));
     const found=selectableTokenIds(tokens,rect,map.grid_size*zoomRef.current,
      user,isDM,map.id);
     const foundTools=selectableToolIds(toolPlacements,toolIssued,rect,
      map.grid_size*zoomRef.current,user,isDM,map.id);
     selectTokens(info.additive?[...info.originalIds,...found]:found,
      info.additive?[...info.originalToolIds,...foundTools]:foundTools);
    }else if(!info.additive)selectTokens([]);
   }
  }
  const viewport=viewportRef.current;
  if(viewport?.hasPointerCapture(e.pointerId))
   viewport.releasePointerCapture(e.pointerId);
 }
 function startTokenDrag(e,t,canMove){
  e.stopPropagation();
  if(isDM&&environmentEditor?.enabled&&environmentEditor.layer==='light'&&
   environmentEditor.lockTokens!==false)return;
  if(previewActive){
   // Preview movement is local only. Never send DM-preview coordinates to the
   // server; test the same swept-footprint collision against prepared walls.
   if(e.button!==0||t.id!==previewToken?.id)return;
   e.preventDefault();
   previewDrag.current={id:t.id,pointerId:e.pointerId,
    startX:e.clientX,startY:e.clientY,
    token:{...previewToken}};
   try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
   return;
  }
  if(e.button!==0)return;
  const grouped=canMove&&selectedIds.includes(t.id)&&
    selectedIds.length+selectedToolIds.length>1;
   const group=grouped?
   selectedIds.filter(id=>tokens.some(other=>other.id===id&&
    canControlMapToken(other,user,isDM,map.id))):[t.id];
  const toolGroup=grouped?selectedToolIds.filter(id=>toolPlacements.some(p=>
    p.issue_id===id&&toolCanControl(toolIssued.find(i=>i.id===id),user,isDM))):[];
  if(!canMove)primaryRef.current=t.id;
  if(canMove)selectTokens(group,toolGroup);
  else{setSelectedIds([]);setSelectedId(t.id)}
  viewportRef.current?.focus({preventScroll:true});
  if(!canMove||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const members=tokens.filter(token=>group.includes(token.id));
  const tools=toolPlacements.filter(p=>toolGroup.includes(p.issue_id));
  e.currentTarget.setPointerCapture(e.pointerId);
  drag.current={id:t.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,
   members,tools,dx:0,dy:0,path:[],lastFogWrite:0,persistedDuringDrag:false};
 }
 function startToolDrag(e,p,canMove){
  e.stopPropagation();
  if(!canMove||!active||previewActive||environmentEditor?.enabled||
    activeMeasureTool||e.button!==0)return;
  e.preventDefault();
  const grouped=selectedToolIds.includes(p.issue_id)&&
   selectedIds.length+selectedToolIds.length>1;
  const selectedTokens=grouped?selectedIds.filter(id=>tokens.some(t=>
   t.id===id&&canControlMapToken(t,user,isDM,map.id))):[];
  const selectedTools=grouped?selectedToolIds.filter(id=>toolPlacements.some(row=>
   row.issue_id===id&&toolCanControl(toolIssued.find(i=>i.id===id),user,isDM))):[p.issue_id];
  selectTokens(selectedTokens,selectedTools);
  viewportRef.current?.focus({preventScroll:true});
  if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
  drag.current={id:'tool:'+p.issue_id,pointerId:e.pointerId,
   startX:e.clientX,startY:e.clientY,
   members:tokens.filter(t=>selectedTokens.includes(t.id)),
   tools:toolPlacements.filter(row=>selectedTools.includes(row.issue_id)),
   dx:0,dy:0,path:[]};
 }
 function moveTokenDrag(e,t){
  const simulated=previewDrag.current;
  if(simulated&&simulated.id===t.id&&simulated.pointerId===e.pointerId){
   const cell=map.grid_size*zoomRef.current;
   const delta=boundedGroupOffset([simulated.token],
    (e.clientX-simulated.startX)/cell,(e.clientY-simulated.startY)/cell,
    map.width,map.height,map.grid_size);
   const destination={x:Number(simulated.token.x)+delta.dx,
    y:Number(simulated.token.y)+delta.dy};
   movePreviewToken(simulated.token,destination);
   return;
  }
  const info=drag.current;
  if(!info||info.id!==t.id||info.pointerId!==e.pointerId)return;
  const cell=map.grid_size*zoomRef.current;
  const requested=boundedGroupOffset([...info.members,...(info.tools||[]).map(groupToolFootprint)],
   (e.clientX-info.startX)/cell,(e.clientY-info.startY)/cell,
   map.width,map.height,map.grid_size);
  const collisionScene=publishedEnvironment||environment;
  const delta=isDM&&environmentEditor?.ignoreCollision!==true&&collisionScene?
   traceSolidGroupOffset({
    pieces:[...info.members,...(info.tools||[]).map(groupToolFootprint)],
    map,environment:collisionScene,previous:{dx:info.dx,dy:info.dy},
    desired:requested
   }):requested;
  if(info.dx===delta.dx&&info.dy===delta.dy)return;
  const path=appendMovementWaypoint(info.path||[],delta.dx,delta.dy);
  if(path===info.path)return; // Reached bounded path complexity.
  info.path=path;
  info.dx=delta.dx;info.dy=delta.dy;
  // DM has locally authorized wall geometry for immediate, solid dragging.
  // Players cannot preview through secret walls before the server approves.
  if(isDM)for(const token of info.members)
   motion.current?.preview(token.id,
    Number(token.x)+delta.dx,Number(token.y)+delta.dy);
  for(const t of info.members){
   const next={x:Number(t.x)+delta.dx,y:Number(t.y)+delta.dy};
   onMovementPreview?.(t,next.x,next.y,false);
  }
  // An ordinary token-only drag has no tool positions to change.
  // Avoid allocating a new React state object and rerendering the board on
  // every grid step just to keep an empty tool preview unchanged.
  if(isDM&&info.tools?.length)setToolPreview(old=>{
   const next={...old};
   for(const tool of info.tools)
    next[tool.issue_id]={x:Number(tool.x)+delta.dx,y:Number(tool.y)+delta.dy};
   return next;
  });
  for(const tool of info.tools||[])
   onToolMovementPreview?.(tool,Number(tool.x)+delta.dx,Number(tool.y)+delta.dy,false);
  // Server-validated observer previews carry movement without writing
  // token positions or invalidating fog on every pointer sample.
  // Only the final release persists via authoritative movement writes.
 }
 function toolDropCarrier(event){
  const rect=boardRef.current?.getBoundingClientRect(),cell=map.grid_size*zoomRef.current;
  if(!rect||!(cell>0))return null;
  const x=(event.clientX-rect.left)/cell,y=(event.clientY-rect.top)/cell;
  return tokens.find(token=>canControlMapToken(token,user,isDM,map.id)&&
   x>=Number(token.x)&&x<Number(token.x)+Number(token.span_x??1)&&
   y>=Number(token.y)&&y<Number(token.y)+Number(token.span_y??1));
 }
 function finishTokenDrag(e,t,cancel=false){
  const simulated=previewDrag.current;
  if(simulated&&simulated.id===t.id&&simulated.pointerId===e.pointerId){
   previewDrag.current=null;
   if(cancel)setPreviewPosition({id:t.id,mapId:map.id,
    x:Number(simulated.token.x),y:Number(simulated.token.y)});
   try{if(e.currentTarget.hasPointerCapture(e.pointerId))
    e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
   return;
  }
  const info=drag.current;
  if(!info||info.id!==t.id||info.pointerId!==e.pointerId)return;
  drag.current=null;
  for(const member of info.members){
   if(cancel)motion.current?.clearPreview(member.id);
   else motion.current?.handoff(member.id);
  }
  if(e.currentTarget.hasPointerCapture(e.pointerId))
   e.currentTarget.releasePointerCapture(e.pointerId);
  if(cancel){
   setPreview(old=>{
    const next={...old};
    for(const member of info.members)delete next[member.id];
    return next;
   });
  }
  const atomicGroup=!cancel&&!!moveGroup&&
   (info.members.length+(info.tools||[]).length)>0;
  // Keep group tool sprites at the destination until the atomic RPC settles;
  // otherwise a slow round-trip would flash their old positions.
  setToolPreview(old=>{
   const next={...old};
   for(const tool of info.tools||[]){
    if(atomicGroup&&isDM)next[tool.issue_id]={
     x:Number(tool.x)+info.dx,y:Number(tool.y)+info.dy};
    else delete next[tool.issue_id];
   }
   return next;
  });
  if(!cancel&&Math.hypot(e.clientX-info.startX,e.clientY-info.startY)>8&&
    info.tools?.length===1&&info.members.length===0){
   const issue=toolIssued.find(t=>t.id===info.tools[0].issue_id);
   const carrier=toolCanBeHeld(issue)?toolDropCarrier(e):null;
   if(carrier){
    onToolMovementPreview?.(info.tools[0],
     Number(info.tools[0].x),Number(info.tools[0].y),true,true);
    setSelectedToolIds([]);onToolHold?.(issue.id,carrier.id);return;
   }
  }
  // Complete the local drag in the same React batch as the optimistic move.
  setPreview(old=>{
   const next={...old};
   for(const token of info.members)delete next[token.id];
   return next;
  });
  if(info.dx===0&&info.dy===0&&!cancel&&!info.persistedDuringDrag){
   for(const member of info.members)motion.current?.clearPreview(member.id);
   setToolPreview(old=>{
    const next={...old};
    for(const tool of info.tools||[])delete next[tool.issue_id];
    return next;
   });
   return;
  }
  if(atomicGroup){
   for(const token of info.members)
    onMovementPreview?.(token,Number(token.x)+info.dx,
     Number(token.y)+info.dy,true);
   for(const tool of info.tools||[])
    onToolMovementPreview?.(tool,Number(tool.x)+info.dx,
     Number(tool.y)+info.dy,true);
   // The parent performs a single server transaction. The returned promise
   // resolves only after refreshing tool projections or after a failure.
   Promise.resolve(moveGroup({
    tokens:info.members,tools:info.tools||[],dx:info.dx,dy:info.dy,
    path:info.path||[]
   })).catch(error=>console.warn('Group movement rejected',error)).finally(()=>{
    for(const member of info.members)motion.current?.clearPreview(member.id);
    setToolPreview(old=>{
     const next={...old};
     for(const tool of info.tools||[])delete next[tool.issue_id];
     return next;
    });
   });
   return;
  }
  for(const t of info.members){
   const next=cancel?{x:Number(t.x),y:Number(t.y)}:
    {x:Number(t.x)+info.dx,y:Number(t.y)+info.dy};
   onMovementPreview?.(t,next.x,next.y,true,cancel);
   if(!cancel||info.persistedDuringDrag)move(t,next.x,next.y);
  }
  for(const tool of info.tools||[]){
   const next=cancel?{x:Number(tool.x),y:Number(tool.y)}:
    {x:Number(tool.x)+info.dx,y:Number(tool.y)+info.dy};
   onToolMovementPreview?.(tool,next.x,next.y,true,cancel);
   if(!cancel)onToolPlace?.(tool.issue_id,next.x,next.y);
  }
 }
 return <>
  <MeasurementToolBar tool={activeMeasureTool}
   onPointerDown={onToolPointerDown} onPointerMove={onToolPointerMove}
   onPointerUp={e=>onToolPointerUp(e)}
   onPointerCancel={e=>{
    if(measureDrag.current?.sourceButton===0)return;
    onToolPointerUp(e,true);
   }}
   onKeySelect={setActiveMeasureTool} onClearPins={clearMyPinnedMeasurements}/>
  <div className={'mapscroll map-pan-region'+(panning?' is-panning':'')+
    (marquee?' is-selecting':'')} ref={viewportRef}
    aria-label="Battlemap viewport — middle mouse drag to pan, left drag to select tokens" tabIndex={0}
    onMouseDownCapture={pinCurrentMeasurementOnRightClick}
    onMouseDown={e=>{if(e.button===1)e.preventDefault()}}
    onContextMenu={e=>{if(activeMeasureTool){
     e.preventDefault();
     pinCurrentMeasurementOnRightClick(e);
    }}}
    onAuxClick={e=>{if(e.button===1)e.preventDefault()}}
    onPointerDownCapture={e=>{
     if(e.button===2&&measureDrag.current)pinCurrentMeasurementOnRightClick(e);
     else if(e.button===1||e.pointerType==='touch'&&!activeMeasureTool)startPan(e);
     else if(!environmentEditor?.enabled&&!previewActive)startMeasurementCapture(e);
    }} onPointerDown={startMarquee}
    onPointerMove={e=>{moveViewportPointer(e);updateMeasurement(e)}}
    onPointerUp={e=>{finishMeasurement(e);endViewportPointer(e)}}
    onPointerCancel={e=>{finishMeasurement(e,true);endViewportPointer(e,true)}}
    onLostPointerCapture={e=>{
     // Native mouseup, not lost capture, completes a held-left route.
     if(measureDrag.current?.sourceButton===0)return;
     finishMeasurement(e,true);endViewportPointer(e,true);
    }}>
   <div className="board-scroll-content" style={{
    width:map.width*scale,height:map.height*scale+(hotbarInset?78:0)
   }}>
   <div ref={boardRef} className={'board'+(isDM&&environmentEditor?.enabled?
    (environmentEditor.lockTokens!==false?' map-editor-tokens-locked':' map-editor-tokens-unlocked'):'')}
    onDragOver={allowMapDrop}
    onDrop={dropOnMap}
    style={{width:map.width*scale,height:map.height*scale,backgroundImage:(isDM&&environmentEditor?.enabled&&environmentEditor.showBackground===false)?undefined:(url?'url('+JSON.stringify(url)+')':undefined),backgroundSize:'100% 100%'}}>
    <div className="gridlines" style={{backgroundSize:(map.grid_size*scale)+'px '+(map.grid_size*scale)+'px'}}/>
    <MapPinLayer map={map} scale={scale} pins={handoutPins} isDM={isDM}
     editor={environmentEditor} active={active}
     onCreate={onCreateHandoutPin} onOpen={onOpenHandoutPin} onMove={onMoveHandoutPin}
     onRead={onReadHandoutPin} onCollect={onCollectHandoutPin}
     onDelete={onDeleteHandoutPin} onSelect={onSelectHandoutPin}/>
    <CampaignToolMapLayer motionRuntime={motion.current} authorizedLightMasks={authorizedLightMasks}
     map={map} scale={scale} userId={user} isDM={isDM}
     tokens={visibleTokens} tokenPositions={{...remotePositions,...preview}}
     active={active} editing={!!environmentEditor?.enabled} measuring={!!activeMeasureTool}
     placements={toolPlacements} issued={toolIssued}
     remotePositions={remoteToolPositions} preview={toolPreview}
      selectedIds={selectedToolIds}
      onTokenPointerDown={startToolDrag}
      onTokenPointerMove={(e,p)=>moveTokenDrag(e,{id:'tool:'+p.issue_id})}
      onTokenPointerUp={(e,p)=>finishTokenDrag(e,{id:'tool:'+p.issue_id})}
      onTokenPointerCancel={(e,p)=>finishTokenDrag(e,{id:'tool:'+p.issue_id},true)}
      onOpen={onToolOpen} environment={isDM?(previewActive?previewEnvironment:environment):null}/>
    {isDM&&environment&&<MapEnvironmentOverlay map={map} scale={scale}
     objects={environment.objects} editor={environmentEditor}
     onAdd={handleEnvironmentAdd} onSelect={handleEnvironmentSelect}
     onPatch={handleEnvironmentPatch}/>}
    {isDM&&!previewActive&&environment&&environmentEditor?.selectedId&&
     (environmentEditor.selectedIds?.length||1)===1&&
     <MapObjectQuickAdjust key={environmentEditor.selectedId}
      map={map} scale={scale}
      object={environment.objects.find(o=>o.id===environmentEditor.selectedId)}
      template={template} onPatch={handleEnvironmentPatch}
      onClose={()=>handleEnvironmentSelect(null)}/>}
    {presentedTokens.map(t=>{
     const p={...t,...remotePositions[t.id],...preview[t.id]},
      concealed=concealedIds.has(t.id),
      canMove=(previewActive&&t.id===previewToken?.id)||
       (!previewActive&&canControlMapToken(t,user,isDM,map.id)&&
        !(isDM&&environmentEditor?.enabled&&environmentEditor.lockTokens!==false));
     const effectTitles=normalizedEffects(t.status_effects).map(x=>statusTitle(x,statusCatalog));
     const cell=map.grid_size*scale,spanX=Number(p.span_x??1),spanY=Number(p.span_y??1);
     return <div key={t.id} data-token-id={t.id}
      ref={spriteRef(t.id)} className={'token '+(t.image_path?'token-image':'')+
      (!previewActive&&selectedIds.includes(t.id)?' token-selected':'')+
      (combatActiveTokenId===t.id?' token-current-turn':'')+
      (normalizedEffects(t.status_effects).some(effect=>effect.id==='dead')?' token-dead':'')}
      style={{
       left:Number(p.x)*cell,top:Number(p.y)*cell,width:cell*spanX,height:cell*spanY,
       visibility:concealed?'hidden':'visible',pointerEvents:concealed?'none':undefined,
       opacity:t.visible?1:.55,cursor:canMove?'grab':'default',
        transition:remotePositions[t.id]&&!preview[t.id]?
         'left 50ms linear, top 50ms linear':undefined
      }}
      title={t.name+(effectTitles.length?' · '+effectTitles.join(', '):'')+
       ((isDM||t.owner_id===user)?' · Alt + double-click to edit sheet':'')}
      onDoubleClick={e=>{if(e.altKey&&!previewActive&&
       (isDM||(t.owner_id===user&&t.visible!==false&&t.map_id===map.id))&&
       !(isDM&&environmentEditor?.enabled&&environmentEditor.lockTokens!==false)){
       e.preventDefault();e.stopPropagation();onTokenEdit(t)
      }}}
      onClick={e=>{
       if(previewActive||isDM&&environmentEditor?.enabled&&environmentEditor.lockTokens!==false)return;
       if(e.shiftKey&&!e.ctrlKey&&!e.altKey){
        e.preventDefault();e.stopPropagation();onTokenStatus(t);return;
       }
       if(e.ctrlKey&&!e.altKey&&canMove){
        e.preventDefault();e.stopPropagation();
        onTokenQuick(t);
       }
      }}
      onPointerDown={e=>startTokenDrag(e,t,canMove)}
      onPointerMove={e=>moveTokenDrag(e,t)}
      onPointerUp={e=>finishTokenDrag(e,t)}
      onPointerCancel={e=>finishTokenDrag(e,t,true)}>
      {t.image_path?<Artwork db={db} path={t.image_path} alt={t.name} className="token-art" loading="eager"/>:
       <span className="token-placeholder">{t.name.slice(0,2).toUpperCase()}</span>}
      {normalizedEffects(t.status_effects).some(effect=>effect.id==='dead')&&
       <span className="token-dead-overlay" aria-hidden="true"/>}
      <TokenStatusBadges effects={t.status_effects} catalog={statusCatalog}
       position={statusPosition}
       canEdit={isDM||t.owner_id===user} onOpen={()=>onTokenStatus(t)}/>
      {isDM&&!previewActive&&selectedId===t.id&&selectedIds.length===1&&<div className="token-resize-handle" role="button"
        aria-label={'Resize '+t.name} title="Drag to change token footprint"
        onPointerDown={e=>{
         e.stopPropagation();e.preventDefault();
         if(e.button!==0)return;
         resizeDrag.current={id:t.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,
          w:Number(t.span_x??1),h:Number(t.span_y??1)};
         e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
         const d=resizeDrag.current;if(!d||d.id!==t.id||d.pointerId!==e.pointerId)return;
         const cellWidth=map.grid_size*zoomRef.current;
         const w=snapSize(d.w+(e.clientX-d.startX)/cellWidth),
           h=snapSize(d.h+(e.clientY-d.startY)/cellWidth);
         setPreview(old=>({...old,[t.id]:{...old[t.id],span_x:w,span_y:h}}));
        }}
        onPointerUp={e=>{
         const d=resizeDrag.current;if(!d||d.id!==t.id||d.pointerId!==e.pointerId)return;
         resizeDrag.current=null;
         const cellWidth=map.grid_size*zoomRef.current,
          w=snapSize(d.w+(e.clientX-d.startX)/cellWidth),
          h=snapSize(d.h+(e.clientY-d.startY)/cellWidth);
         if(w!==d.w||h!==d.h){
          setPreview(old=>({...old,[t.id]:{...old[t.id],span_x:w,span_y:h}}));
          resize(t,w,h);
         }
        }}
        onPointerCancel={()=>{resizeDrag.current=null;setPreview({})}}>
       <span aria-hidden="true">↘</span>
      </div>}
     </div>;
    })}
    {marquee&&Math.hypot(marquee.end.x-marquee.start.x,
     marquee.end.y-marquee.start.y)>3&&<div
      className="map-selection-marquee" aria-hidden="true"
      style={(()=>{
       const r=selectionRectangle(marquee.start,marquee.end);
       return {left:r.x,top:r.y,width:r.width,height:r.height};
      })()}/>}
    {!isDM&&<MapFogOverlay map={map} scale={scale} frame={fogFrame}/>}
    <MapMeasurementOverlay map={map} scale={scale} measures={measures}/>
    {/* Resource widgets must be siblings of all tokens: a child inside one
        token's stacking context cannot rise above an overlapping token. */}
    <TokenMonitorFrames motionRuntime={motion.current} tokens={presentedTokens} concealedIds={concealedIds} remotePositions={remotePositions}
     preview={preview} config={displaySettings} monitorValues={monitorValues}
     encumbranceBadges={encumbranceBadges} gridSize={map.grid_size} scale={scale}/>
    {previewActive&&<MapPlayerPreviewOverlay map={map} environment={previewEnvironment}
     polygon={previewPolygon} viewerName={previewToken?.name}/>}
   </div>
   </div>
  </div>
 </>;
}
