import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import WorldCanvasStack from './WorldCanvasStack.jsx';
import {createWorldV2TabletopRuntime} from './WorldV2TabletopRuntime.js';
import {pickWorldPointerTarget,worldMovementInputAllowed}
 from './PointerHitTest.js';
import {wasWorldPointerDownClaimed} from './WorldPointerOwnership.js';
import {worldGestureSelection} from './GestureSelection.js';
import {createWorldKeyboardStepper} from './KeyboardStepper.js';
import {visibleWorldPins} from './WorldPinVisibility.js';
import Artwork from '../../Artwork.jsx';
import MapPinLayer from '../../MapPinLayer.jsx';
import MapEnvironmentOverlay from '../../MapEnvironmentOverlay.jsx';
import MapObjectQuickAdjust from '../../MapObjectQuickAdjust.jsx';
import {MeasurementToolBar,MapMeasurementOverlay} from '../../MapMeasurementTools.jsx';
import {measurementGeometry,addLineTurn,pointOnBattlemap} from '../../MapMeasurements.js';
import {canControlMapToken,selectableTokenIds,selectableToolIds,
 selectionRectangle} from '../../MapSelection.js';
import {toolCanControl,toolCanBeHeld} from '../../CampaignTools.js';
import {normalizeConfig,TokenMonitors} from '../../TokenMonitors.jsx';
import {TokenStatusBadges,normalizedEffects,statusTitle}
 from '../../TokenStatuses.jsx';

/**
 * Phase 9 V2 alternative Board.
 * Props deliberately mirror BattlemapBoard so the app's sheet, DM editor,
 * tool distribution, map drop, handout and combat commands remain reachable.
 * No legacy MapFogOverlay/TokenMotionRuntime/ConcealedGestureBatch/MapCollision
 * is imported or mounted here. Routing uses the application's explicit
 * two-flag V2 cutover and remains mutually exclusive with the legacy board.
 */
// App keybindings route into V2 explicitly; never attach a second
// hard-coded arrow handler that could race a custom shortcut.
const noDuplicateKeyboard={addEventListener(){},removeEventListener(){}};
const styles={absolute:{position:'absolute',left:0,top:0},fill:{
 position:'absolute',inset:0}};
const idOf=p=>p.kind+':'+p.id;
const sameIds=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const sameCells=(a,b)=>a?.length===b?.length&&
 a?.every((value,i)=>value===b[i]);
const within=(point,piece)=>point&&
 point.x>=Number(piece.x)&&point.y>=Number(piece.y)&&
 point.x<Number(piece.x)+Number(piece.span_x??piece.span??1)&&
 point.y<Number(piece.y)+Number(piece.span_y??piece.span??1);
const ignoreTags=el=>!!el?.closest?.(
 'input,textarea,select,[contenteditable="true"],[role="textbox"]');
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
function SpriteContent({piece,token,tool,issued,selected,isDM,user,
 preview,db,display,values,badge,statusCatalog,onTokenEdit,onTokenQuick,
 onTokenStatus,onToolOpen,onResize,onSelect}){
 if(piece.kind==='tool'){
  return <button type="button" className="campaign-tool-map-token"
   style={{position:'absolute',inset:0,width:'100%',height:'100%'}}
   title={(tool?.name||'Tool')+' · Double-click for its sheet'}
   aria-label={(tool?.name||'Tool')+' tool token'}
   onDoubleClick={e=>{e.preventDefault();e.stopPropagation();
    if(issued)onToolOpen?.(piece.id)}}
   onClick={e=>{if(!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey)
    onSelect?.(piece)}}>
   <span aria-hidden="true">{tool?.icon||'🧰'}</span>
  </button>;
 }
 if(!token)return <span aria-hidden="true" className="token-placeholder">…</span>;
 const effects=normalizedEffects(token.status_effects);
 const dead=effects.some(item=>item.id==='dead');
 const canEdit=isDM||token.owner_id===user;
 return <div className="world-v2-token-content" draggable={false}
  onDragStart={event=>event.preventDefault()}
  style={{position:'relative',width:'100%',height:'100%',pointerEvents:'auto'}}
  onDoubleClick={e=>{
   if(e.altKey&&!preview&&canEdit){
    e.preventDefault();e.stopPropagation();onTokenEdit?.(token);
   }
  }}
  onClick={e=>{
   if(preview){
    if(!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey)onSelect?.(piece);
    return;
   }
   if(e.shiftKey&&!e.ctrlKey&&!e.altKey){
    e.preventDefault();e.stopPropagation();onTokenStatus?.(token);
   }else if(e.ctrlKey&&!e.altKey&&canEdit){
    e.preventDefault();e.stopPropagation();onTokenQuick?.(token);
   }else if(!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey)
    onSelect?.(piece);
  }}>
  {token.image_path?<Artwork db={db} path={token.image_path}
   alt={token.name} className="token-art" loading="eager"/>:
   <span className="token-placeholder">{String(token.name||'?').slice(0,2).toUpperCase()}</span>}
  {dead&&<span className="token-dead-overlay" aria-hidden="true"/>}
  <TokenStatusBadges effects={token.status_effects}
   catalog={statusCatalog} position={display.statusPosition}
   canEdit={canEdit} onOpen={()=>onTokenStatus?.(token)}/>
  <TokenMonitors config={display} normalized fields={values} zoom={1}/>
  {badge&&<div className="token-encumbrance-indicator" title={badge.label}>{badge.icon}</div>}
  {isDM&&!preview&&selected&&<div className="token-resize-handle"
   role="button" title="Drag to change token footprint"
   aria-label={'Resize '+token.name}
   onPointerDown={e=>onResize(e,token)}>
   <span aria-hidden="true">↘</span>
  </div>}
 </div>;
}
export default function WorldV2Board(props){
 const {
  db,map,url,tokens=[],user,isDM,active=true,
  environment,environmentEditor,publishedEnvironment,characters=[],
  scale=1,setScale=()=>{},selectedId,setSelectedId=()=>{},
  toolPlacements=[],toolIssued=[],handoutPins=[],remoteMeasurements={},
  displayConfig,monitorValues={},encumbranceBadges={},statusCatalog,
  onMeasurementPreview,onTokenEdit,onTokenQuick,onTokenStatus,onToolOpen,
  onNpcDrop,onCharacterDrop,onUnitDrop,onToolPlace,onToolHold,onToolPickUp,
  onCreateHandoutPin,onOpenHandoutPin,onMoveHandoutPin,onReadHandoutPin,
  onCollectHandoutPin,onDeleteHandoutPin,onSelectHandoutPin,
  onAddEnvironmentObject,onSelectEnvironmentObject,onPatchEnvironmentObject,
  onDeleteEnvironmentObject,registerV2Step,resize,
  onMovementCommitted,onV2Error,remove,hotbarInset=false
 }=props;
 const viewport=useRef(null),board=useRef(null);
 const rendererRef=useRef(null),runtimeRef=useRef(null),roots=useRef(new Map());
 const latest=useRef(props);latest.current=props;
 const rosterMetadata=useMemo(()=>JSON.stringify({
  // Only roster/permission/appearance changes, never x/y cell positions.
  // Remote motion uses V2 private paths, not token row React state.
  tokens:tokens.filter(t=>t.map_id===map.id)
   .map(t=>[t.id,t.owner_id,t.visible,t.span_x,t.span_y,
    t.character_id]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),
  tools:toolPlacements.filter(t=>t.map_id===map.id)
   .map(t=>[t.issue_id,t.held_by_token_id,t.kind,t.span,
    t.light_enabled,t.light_bright,t.light_dim])
   .sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
 }),[tokens,toolPlacements,map.id]);
 const [selectedTokenIds,setSelectedTokenIds]=useState([]);
 const [selectedToolIds,setSelectedToolIds]=useState([]);
 const selectedRef=useRef({tokens:[],tools:[]});
 const [roster,setRoster]=useState([]),[issue,setIssue]=useState(null);
 const [dragIssue,setDragIssue]=useState(null);
 const [authorizedSight,setAuthorizedSight]=useState(null);
 const [activeMeasure,setActiveMeasure]=useState(null);
 const [localMeasures,setLocalMeasures]=useState([]);
 const measureRef=useRef(null),marqueeRef=useRef(null),panRef=useRef(null);
 const [marquee,setMarquee]=useState(null);
 const [panning,setPanning]=useState(false);
 const resizeRef=useRef(null),zoomAnchor=useRef(null);
 const wheelHandler=useRef(null);
 const settings=useMemo(()=>normalizeConfig(displayConfig),[displayConfig]);
 const previewToken=tokens.find(token=>token.id===environmentEditor?.previewTokenId);
 const previewViewerId=previewToken?.owner_id;
 const previewRequested=Boolean(isDM&&environmentEditor?.previewing);
 // DM-owned actors produce DM-scoped sight, not player-effective sight.
 // Preview needs an actual player identity; never downgrade DM scope.
 const dmPreview=Boolean(previewRequested&&previewViewerId&&previewViewerId!==user);
 const identity=dmPreview?previewViewerId:user;
 const boardIdentity=map.id+':'+user+':'+(dmPreview?previewViewerId:'normal');
 const currentMeta=useRef(new Map());
 function setSelection(tokenIds=[],toolIds=[]){
  const tk=[...new Set(tokenIds)],tl=[...new Set(toolIds)];
  selectedRef.current={tokens:tk,tools:tl};
  setSelectedTokenIds(prev=>sameIds(prev,tk)?prev:tk);
  setSelectedToolIds(prev=>sameIds(prev,tl)?prev:tl);
  latest.current.setSelectedId?.(tk[0]||null);
 }
 useEffect(()=>{
  if(selectedId&&selectedId!==selectedRef.current.tokens[0]){
   selectedRef.current={tokens:[selectedId],tools:[]};
   setSelectedTokenIds([selectedId]);setSelectedToolIds([]);
  }
 },[selectedId]);
 const createSpriteElement=useCallback(piece=>{
  const node=document.createElement('div');
  node.dataset.worldKind=piece.kind;node.dataset.worldId=piece.id;
  roots.current.set(idOf(piece),{node,piece});
  return node;
 },[]);
 const onRemoveSprite=useCallback(({kind,id})=>{
  roots.current.delete(kind+':'+id);
  // A private concealment packet immediately detaches the native node.
  // Also release its React portal on this event, not on a later roster poll.
  setRoster(previous=>previous.some(piece=>
   piece.kind===kind&&piece.id===id)?
   previous.filter(piece=>!(piece.kind===kind&&piece.id===id)):
   previous);
 },[]);
 // All sprite artwork belongs to ONE React tree via keyed portals.
 // WorldRenderer imperatively moves only their persistent container nodes.
 // Position changes and private fog ticks don't create React roots or
 // remount independent Artwork / TokenMonitors / sheet action content.
 const spriteContent=useMemo(()=>{
  const byToken=new Map(tokens.map(row=>[row.id,row]));
  const byTool=new Map(toolPlacements.map(row=>[row.issue_id,row]));
  const byIssue=new Map(toolIssued.map(row=>[row.id,row]));
  const selected=new Set(selectedTokenIds),selectedTools=new Set(selectedToolIds);
  const content=normalizeConfig(displayConfig);
  return roster.map(piece=>{
   const entry=roots.current.get(idOf(piece));
   if(!entry)return null;
   const token=piece.kind==='token'?byToken.get(piece.id):null;
   const tool=piece.kind==='tool'?byTool.get(piece.id):null;
   const own=piece.kind==='tool'?byIssue.get(piece.id):null;
   return {
    ...entry,token,tool,own,
    selected:selected.has(piece.id),
    selectedTool:selectedTools.has(piece.id),
    currentTurn:props.combatActiveTokenId===piece.id,
    content
   };
  }).filter(Boolean);
 },[roster,tokens,toolPlacements,toolIssued,selectedTokenIds,selectedToolIds,
  displayConfig,monitorValues,encumbranceBadges,statusCatalog,
  props.combatActiveTokenId,previewRequested,isDM,user]);
 useLayoutEffect(()=>{
  const renderer=rendererRef.current;
  if(!renderer?.authorized)return;
  for(const entry of spriteContent){
   const {node,piece,token,tool}=entry;
   if(piece.kind==='token'){
    if(token){
     node.dataset.tokenId=piece.id;
     node.className='token'+(token.image_path?' token-image':'')+
      (entry.selected?' token-selected':'')+
      (entry.currentTurn?' token-current-turn':'')+
      (normalizedEffects(token.status_effects).some(v=>v.id==='dead')?
       ' token-dead':'');
     node.title=String(token.name||'Token')+
      ((isDM||token.owner_id===user)?
       ' · Alt + double-click to edit sheet':'');
     node.style.opacity=token.visible?1:.55;
     renderer.setSpriteDimensions('token',piece.id,{
      spanX:Number(token.span_x??1),spanY:Number(token.span_y??1)});
    }
   }else if(tool){
    node.className='campaign-tool-map-token'+
     (entry.selectedTool?' tool-selected':'');
    renderer.setSpriteDimensions('tool',piece.id,{
     spanX:Number(tool.span??1),spanY:Number(tool.span??1)});
   }
  }
 },[spriteContent,isDM,user]);
 function pointerPieceAt(event,point){
  return pickWorldPointerTarget({
   event,point,visiblePieces:runtimeRef.current?.visibility.visiblePieces??[],
   tokens:latest.current.tokens,toolPlacements:latest.current.toolPlacements,
   toolIssued:latest.current.toolIssued,user,isDM,mapId:map.id
  });
 }
 function selectVisiblePiece(piece){
  if(!piece||!runtimeRef.current?.visibility.visiblePieces.some(
   row=>idOf(row)===idOf(piece)))return;
  const src=latest.current;
  if(piece.kind==='token'){
   const token=src.tokens.find(t=>t.id===piece.id);
   if(!canControlMapToken(token,user,isDM,map.id)||
    dmPreview&&piece.id!==previewToken?.id)return;
   setSelection([piece.id],[]);
  }else if(piece.kind==='tool'&&!previewRequested){
   const issue=src.toolIssued.find(t=>t.id===piece.id);
   if(!toolCanControl(issue,user,isDM))return;
   setSelection([], [piece.id]);
  }
 }
 const spritePortals=useMemo(()=>spriteContent.map(entry=>createPortal(
  <SpriteContent piece={entry.piece} token={entry.token}
   tool={entry.tool} issued={entry.own} selected={entry.selected}
   isDM={isDM} user={user} preview={previewRequested}
   db={db} display={entry.content}
   values={monitorValues?.[entry.piece.id]}
   badge={encumbranceBadges?.[entry.piece.id]}
   statusCatalog={statusCatalog}
   onToolOpen={id=>latest.current.onToolOpen?.(id)}
   onTokenEdit={item=>latest.current.onTokenEdit?.(item)}
   onTokenQuick={item=>latest.current.onTokenQuick?.(item)}
   onTokenStatus={item=>latest.current.onTokenStatus?.(item)}
   onResize={startResize} onSelect={selectVisiblePiece}/>,
  entry.node,idOf(entry.piece)
 )),[spriteContent,monitorValues,encumbranceBadges,statusCatalog,
  db,user,isDM,previewRequested,dmPreview,previewToken?.id]);
 function mapGridPoint(event){
  const rect=board.current?.getBoundingClientRect();
  if(!rect||!rect.width||!rect.height)return null;
  const cell=map.grid_size*scale;
  return {x:clamp((event.clientX-rect.left)/cell,0,
   Math.floor(map.width/map.grid_size)-0.000001),
   y:clamp((event.clientY-rect.top)/cell,0,
    Math.floor(map.height/map.grid_size)-0.000001)};
 }
 const authorizeSelection=(selection)=>{
  const granted=runtimeRef.current?.visibility.visiblePieces??[];
  return selection.every(piece=>granted.some(v=>idOf(v)===idOf(piece)));
 };
 function resolveSelection(event,point,{keyboard=false}={}){
  // Arrow keys control the world only while the map viewport owns focus.
  // Campaign sheets, hotbar settings and other noneditable controls
  // must not accidentally move a selected token.
  if(keyboard&&typeof document!=='undefined'&&
   document.activeElement!==viewport.current&&
   !viewport.current?.contains(document.activeElement))return null;
  // One editor/preview/measurement gate for pointer and keyboard.
  if(!worldMovementInputAllowed({
   active,activeMeasure,previewRequested,dmPreview,environmentEditor
  }))return null;
  const hit=keyboard?null:pointerPieceAt(event,point);
  const kind=hit?.kind,id=hit?.id;
  if(!keyboard&&(!id||!['token','tool'].includes(kind)))return null;
  const picked=keyboard?
   [...selectedRef.current.tokens.map(id=>({kind:'token',id})),
    ...selectedRef.current.tools.map(id=>({kind:'tool',id}))][0]:
   {kind,id};
  if(!picked)return null;
  const inputs=latest.current;
  const t=inputs.tokens.find(row=>row.id===picked.id);
  const p=inputs.toolPlacements.find(row=>row.issue_id===picked.id);
  const own=inputs.toolIssued.find(row=>row.id===picked.id);
  const movable=picked.kind==='token'?
   Boolean(t&&canControlMapToken(t,user,isDM,map.id)):
   Boolean(p&&!p.held_by_token_id&&toolCanControl(own,user,isDM));
  if(!movable||dmPreview&&(
   picked.kind!=='token'||picked.id!==previewToken?.id))return null;
  if(!keyboard){
   const prev=selectedRef.current;
   if(dmPreview&&(event.shiftKey||event.altKey||
    event.ctrlKey||event.metaKey))return null;
   if(event.shiftKey){
    const item=picked.kind==='token'?prev.tokens:prev.tools;
    const next=item.includes(picked.id)?
     item.filter(v=>v!==picked.id):[...item,picked.id];
    setSelection(picked.kind==='token'?next:prev.tokens,
     picked.kind==='tool'?next:prev.tools);
    return null;
   }
   if(event.altKey||event.ctrlKey||event.metaKey){
    setSelection(picked.kind==='token'?[picked.id]:[],
     picked.kind==='tool'?[picked.id]:[]);
    return null;
   }
  }
  const previous=selectedRef.current;
  const selected=worldGestureSelection({
   picked,selectedTokens:previous.tokens,selectedTools:previous.tools,
   keyboard,preview:dmPreview
  });
  const selection=selected.filter(piece=>{
   if(piece.kind==='token'){
    const row=inputs.tokens.find(item=>item.id===piece.id);
    return row&&canControlMapToken(row,user,isDM,map.id);
   }
   const row=inputs.toolPlacements.find(item=>item.issue_id===piece.id);
   const issued=inputs.toolIssued.find(item=>item.id===piece.id);
   return row&&!row.held_by_token_id&&toolCanControl(issued,user,isDM);
  });
  if(!selection.length||!authorizeSelection(selection))return null;
  if(!keyboard)setSelection(selection.filter(p=>p.kind==='token').map(p=>p.id),
   selection.filter(p=>p.kind==='tool').map(p=>p.id));
  const current=runtimeRef.current?.visibility.visiblePieces.find(
   part=>part.kind===picked.kind&&part.id===picked.id);
  if(!current)return null;
  const virtual=dmPreview?runtimeRef.current?.previewPosition:null;
  const origin=virtual&&virtual.tokenId===picked.id?
   {x:virtual.x,y:virtual.y}:
   {x:current.x,y:current.y};
  if(!Number.isSafeInteger(origin.x)||!Number.isSafeInteger(origin.y))
   return null;
  if(!keyboard)viewport.current?.focus?.({preventScroll:true});
  return {mapId:map.id,origin,selection,
   mode:dmPreview?'preview':undefined,
   collisionOverride:Boolean(isDM&&!dmPreview&&
    environmentEditor?.ignoreCollision===true)};
 }
 const resolveRef=useRef(resolveSelection);resolveRef.current=resolveSelection;
 function releaseToolOnToken(event,pick,point){
  if(!pick||!point||pick.mode==='preview'||pick.selection.length!==1||
   pick.selection[0].kind!=='tool')return false;
  const data=latest.current,issue=data.toolIssued.find(x=>x.id===pick.selection[0].id);
  if(!issue||!toolCanBeHeld(issue))return false;
  const positions=runtimeRef.current?.visibility.visiblePieces??[];
  const carrier=data.tokens.find(t=>{
   const actual=positions.find(v=>v.kind==='token'&&v.id===t.id);
   return t.map_id===map.id&&actual&&within(point,{...t,...actual})&&
    canControlMapToken(t,user,isDM,map.id);
  });
  if(!carrier)return false;
  Promise.resolve().then(()=>data.onToolHold?.(issue.id,carrier.id))
   .catch(error=>setIssue(error?.message||String(error)));
  return true;
 }
 const releaseRef=useRef(releaseToolOnToken);releaseRef.current=releaseToolOnToken;
 function onRendererReady(renderer){
  if(!renderer){
   const old=runtimeRef.current;runtimeRef.current=null;
   void old?.dispose();
   rendererRef.current=null;
   roots.current.clear();return;
  }
  rendererRef.current=renderer;
  setIssue(null);
  if(previewRequested&&!dmPreview){
   setIssue('Choose a token owned by an actual player for DM preview.');return;
  }
  const runtime=createWorldV2TabletopRuntime({
   db,mapId:map.id,viewerId:user,renderer,isDM,dmPreview,
   previewViewerId:dmPreview?previewViewerId:null,
   getAuthorizedPieces:selection=>selection.map(p=>{
    const src=latest.current;
    const v=p.kind==='token'?src.tokens.find(x=>x.id===p.id):
     src.toolPlacements.find(x=>x.issue_id===p.id);
    const current=runtimeRef.current?.visibility.visiblePieces.find(
     row=>row.kind===p.kind&&row.id===p.id);
    if(!v||!current)return null;
    return {kind:p.kind,id:p.id,x:current.x,y:current.y,
     spanX:Number(v.span_x??v.span??1),spanY:Number(v.span_y??v.span??1),
     attributes:p.kind==='token'?
      (src.characters.find(c=>c.id===v.character_id)?.field_values||
       v.npc_values||{}):
      (src.toolIssued.find(x=>x.id===p.id)?.state?.attrs||{})};
   }),
   onAuthorizedRoster:(rows,snapshot)=>{
    setRoster(previous=>{
     const old=previous.map(idOf),next=rows.map(idOf);
     return sameIds(old,next)?previous:rows;
    });
    setAuthorizedSight(previous=>
     !snapshot?null:
     previous?.mapId===snapshot.mapId&&
     previous.scope===snapshot.scope&&
     previous.enabled===snapshot.enabled&&
     previous.permissionGeneration===snapshot.permissionGeneration&&
     sameCells(previous.visible,snapshot.visible)?
      previous:snapshot);
   },
   onCommit:()=>{
    latest.current.onMovementCommitted?.();
   },
   onGesture:event=>{
    // Never expose private movement payloads or coordinates.
    if(event.type==='grabbed'||event.type==='approved')setDragIssue(null);
    else if(event.type==='rejected')
     setDragIssue('Movement rejected: verify collision rules and token permissions.');
   },
   onError:error=>{
    setIssue(error?.message||'World Engine V2 authorization unavailable.');
    latest.current.onV2Error?.(error);
   },
   onState:report=>{
    // A prior transient observer failure must not remain displayed after
    // the same actor has regained a complete, server-authorized snapshot.
    if(report.authorized&&(dmPreview||!report.streamLocked))
     setIssue(previous=>previous&&/^(No authorized V2 observer sight|V2 viewer sight unavailable|V2 renderer rejected authorized sight|World Engine V2 unavailable)/.test(previous)?
      null:previous);
   },
   onScene:snapshot=>{
    if(latest.current.url)renderer.setTerrainSource(latest.current.url);
    latest.current.onV2SceneSnapshot?.(snapshot);
   }
  });
  runtimeRef.current=runtime;
  runtime.attachInput({
   // Capture from the map viewport across all portal and overlay layers.
   target:viewport.current,
   keyboardTarget:noDuplicateKeyboard,
   pointFromEvent:event=>mapGridRef.current(event),
   resolveSelection:(event,point,context)=>resolveRef.current(event,point,context),
   onPointerRelease:(event,pick,point)=>
    releaseRef.current(event,pick,point),
   onPointerStatus:(event,code)=>{
    if(code==='grabbed'){setDragIssue(null);return}
    const point=mapGridRef.current(event);
    if(!point)return;
    // No sprite lookup is needed for this generic authorization state:
    // hidden IDs and coordinates must never reach diagnostics. When sight
    // is unavailable, the visible roster itself may be empty.
    if(previewRequested&&!dmPreview){
     setDragIssue('Player preview requires a token assigned to an actual campaign player.');
     return;
    }
    if(!runtimeRef.current?.active){
     setDragIssue('Drag blocked: map sight is not yet authorized.');
     return;
    }
    const editor=latest.current.environmentEditor;
    if(!dmPreview&&editor?.enabled&&editor.lockTokens!==false){
     setDragIssue('Drag blocked: turn off Lock Tokens in the DM map editor.');
     return;
    }
    if(activeMeasureRef.current){
     setDragIssue('Drag blocked: exit the measurement tool first.');
     return;
    }
    if(!pointerPieceAt(event,point))return;
    if(code==='lost-capture')
     setDragIssue('Drag interrupted: pointer capture was lost.');
    else if(code==='busy')
     setDragIssue('Drag blocked: another movement is finishing.');
    else setDragIssue('Drag could not start: check token or player-preview selection.');
   }
  });
  void runtime.start().then(ok=>{
   if(!ok&&runtimeRef.current===runtime)
    setIssue(previous=>previous||
     'World Engine V2 unavailable; movement is safely disabled.');
  }).catch(error=>setIssue(error?.message||String(error)));
 }
 const rendererReady=useRef(onRendererReady);
 rendererReady.current=onRendererReady;
 const mapGridRef=useRef(mapGridPoint);mapGridRef.current=mapGridPoint;
 const activeMeasureRef=useRef(activeMeasure);activeMeasureRef.current=activeMeasure;
 // The authorized scene may exist before the signed map URL arrives.
 // Asset URL refreshes update only the persistent <img>, never remount fog.
 useLayoutEffect(()=>{
  const renderer=rendererRef.current;
  if(renderer?.currentScene)
   renderer.setTerrainSource(typeof url==='string'?url:'');
 },[url,map.id,boardIdentity]);
 useLayoutEffect(()=>{
  rendererRef.current?.setCamera({zoom:scale});
  const anchor=zoomAnchor.current;
  if(anchor&&viewport.current){
   viewport.current.scrollLeft=anchor.x*scale-anchor.vx;
   viewport.current.scrollTop=anchor.y*scale-anchor.vy;
   zoomAnchor.current=null;
  }
 },[scale,map.id]);
 useEffect(()=>{
  const runtime=runtimeRef.current;
  if(!runtime)return;
  if(active){
   rendererRef.current?.resume();
   void runtime.refreshVisibility('board-active');
  }else rendererRef.current?.pause();
 },[active]);
 useEffect(()=>{
  const runtime=runtimeRef.current;
  if(runtime?.started&&runtime.currentMap===map.id)
   void runtime.refreshVisibility('map-roster-metadata-changed');
 },[rosterMetadata,map.id]);
 // V2 preview uses only the KeyboardStepper below. The legacy preview
 // step handler remains in BattlemapBoard and never runs under V2 cutover.
 useEffect(()=>{
  if(!registerV2Step)return;
  // The same real/preview stepper owns one held gesture, including rapid
  // taps while the previous server commit is still finishing.
  const stepper=createWorldKeyboardStepper({
   getRuntime:()=>runtimeRef.current,
   onFocus:()=>viewport.current?.focus?.({preventScroll:true}),
   makePick:runtime=>{
    if(!worldMovementInputAllowed({
     active,activeMeasure,previewRequested,dmPreview,environmentEditor
    }))return null;
    if(dmPreview){
     const actor=latest.current.tokens.find(t=>t.id===previewToken?.id);
     const sight=runtime.visibility.frame;
     const approved=runtime.previewPosition||
      sight?.visiblePieces.find(p=>p.kind==='token'&&p.id===actor?.id);
     if(!actor||!approved||
      !canControlMapToken(actor,user,true,map.id))return null;
     return {mapId:map.id,origin:{x:approved.x,y:approved.y},
      selection:[{kind:'token',id:actor.id}],mode:'preview'};
    }
    return resolveRef.current({target:board.current},null,{keyboard:true});
   }
  });
  registerV2Step((dx,dy,options)=>stepper.step(dx,dy,options));
  return()=>{stepper.dispose();registerV2Step(null)};
 },[registerV2Step,map.id,dmPreview,previewRequested,previewToken?.id,user]);

 function startResize(event,token){
  if(!isDM||previewRequested||event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  resizeRef.current={
   id:token.id,point:event.pointerId,x:event.clientX,y:event.clientY,
   spanX:Number(token.span_x??1),spanY:Number(token.span_y??1)
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
 }
 function endResize(event,cancel=false){
  const r=resizeRef.current;
  if(!r||r.point!==event.pointerId)return false;
  resizeRef.current=null;
  event.preventDefault();event.stopPropagation();
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  if(cancel)return true;
  const cell=map.grid_size*scale;
  const w=clamp(Math.round((r.spanX+(event.clientX-r.x)/cell)*4)/4,.25,12);
  const h=clamp(Math.round((r.spanY+(event.clientY-r.y)/cell)*4)/4,.25,12);
  if(w!==r.spanX||h!==r.spanY)
   latest.current.resize?.(latest.current.tokens.find(t=>t.id===r.id),w,h);
  return true;
 }
 function viewportPoint(event){
  const rect=board.current?.getBoundingClientRect();
  return rect?{x:event.clientX-rect.left,y:event.clientY-rect.top}:null;
 }
 function endMarquee(event,cancel=false){
  const info=marqueeRef.current;
  if(!info||info.pointerId!==event.pointerId)return;
  marqueeRef.current=null;setMarquee(null);
  if(!cancel){
   const p=viewportPoint(event);
   const moved=Math.hypot(p.x-info.start.x,p.y-info.start.y)>4;
   if(moved){
    const area=selectionRectangle(info.start,p);
    const ts=selectableTokenIds(latest.current.tokens,area,
     map.grid_size*scale,user,isDM,map.id);
    const tools=selectableToolIds(latest.current.toolPlacements,
     latest.current.toolIssued,area,map.grid_size*scale,user,isDM,map.id);
    const granted=new Set(runtimeRef.current?.visibility.visiblePieces.map(idOf));
    const acceptedTokens=ts.filter(id=>granted.has('token:'+id));
    const acceptedTools=tools.filter(id=>granted.has('tool:'+id));
    setSelection(info.additive?[
     ...info.prevTokens,...acceptedTokens]:acceptedTokens,
     info.additive?[...info.prevTools,...acceptedTools]:acceptedTools);
   }else if(!info.additive)setSelection([]);
  }
 }
 function onBoardDown(event){
  // A document-capture V2 movement claim owns this pointerdown before
  // React can begin a competing marquee or pan.
  if(wasWorldPointerDownClaimed(event))return;
  if(event.button===1||
   event.pointerType==='touch'&&
    !pointerPieceAt(event,mapGridPoint(event))){
   panRef.current={id:event.pointerId,x:event.clientX,y:event.clientY,
    left:viewport.current?.scrollLeft||0,top:viewport.current?.scrollTop||0};
   setPanning(true);event.preventDefault();
   event.currentTarget.setPointerCapture?.(event.pointerId);return;
  }
  if(activeMeasure&&(event.button===0||event.button===2)){
   startMeasure(event,activeMeasure);return;
  }
  if(event.button!==0||activeMeasure||
   previewRequested||
   !worldMovementInputAllowed({
    active,activeMeasure,previewRequested,dmPreview,environmentEditor
   })||
   event.target.closest?.(
    '[data-world-id],.map-handout-pin,.map-handout-placement,'+
    '.map-measure-tool,.map-env-overlay,.map-env-marker,'+
    '.map-object-quick-adjust')||
   pointerPieceAt(event,mapGridPoint(event)))
   return;
  const p=viewportPoint(event);
  if(!p)return;
  marqueeRef.current={pointerId:event.pointerId,start:p,
   prevTokens:selectedRef.current.tokens,prevTools:selectedRef.current.tools,
   additive:event.shiftKey};
  setMarquee({start:p,end:p});
  event.currentTarget.setPointerCapture?.(event.pointerId);
 }
 function onBoardMove(event){
  if(resizeRef.current?.point===event.pointerId){
   const r=resizeRef.current,cell=map.grid_size*scale;
   const w=clamp(Math.round((r.spanX+(event.clientX-r.x)/cell)*4)/4,.25,12);
   const h=clamp(Math.round((r.spanY+(event.clientY-r.y)/cell)*4)/4,.25,12);
   rendererRef.current?.setSpriteDimensions('token',r.id,{
    spanX:w,spanY:h});
  }
  const pan=panRef.current;
  if(pan?.id===event.pointerId&&viewport.current){
   viewport.current.scrollLeft=pan.left-(event.clientX-pan.x);
   viewport.current.scrollTop=pan.top-(event.clientY-pan.y);
  }
  if(marqueeRef.current?.pointerId===event.pointerId){
   const p=viewportPoint(event);
   if(p)setMarquee({start:marqueeRef.current.start,end:p});
  }
  if(measureRef.current?.pointerId===event.pointerId){
   const next=pointOnBattlemap(event.clientX,event.clientY,
    board.current?.getBoundingClientRect(),map.width,map.height,
    map.grid_size,scale);
   if(next){
    const current=measureRef.current;
    current.measure={...current.measure,end:next};
    setLocalMeasures(items=>items.map(m=>
     m.id===current.measure.id?{...current.measure,isLocal:true}:m));
    onMeasurementPreview?.(current.measure,'preview');
   }
  }
 }
 function onBoardUp(event,cancel=false){
  if(endResize(event,cancel))return;
  if(panRef.current?.id===event.pointerId){
   panRef.current=null;setPanning(false);
  }
  endMarquee(event,cancel);
  const m=measureRef.current;
  if(m?.pointerId===event.pointerId){
   measureRef.current=null;
   const meaningful=(measurementGeometry(m.measure)?.feet??0)>0;
   if(!cancel&&meaningful&&m.pinned){
    setLocalMeasures(old=>old.map(v=>v.id===m.measure.id?
     {...m.measure,isLocal:true,pinned:true}:v));
    onMeasurementPreview?.(m.measure,'pin');
   }else{
    setLocalMeasures(old=>old.filter(v=>v.id!==m.measure.id));
    onMeasurementPreview?.(m.measure,'remove');
   }
  }
 }
 function startMeasure(event,tool){
  if(event.button!==0&&event.button!==2)return;
  setActiveMeasure(tool);event.preventDefault();event.stopPropagation();
  const p=pointOnBattlemap(event.clientX,event.clientY,
   board.current?.getBoundingClientRect(),map.width,map.height,
   map.grid_size,scale);
  if(!p)return;
  const measure={id:crypto.randomUUID(),tool,start:p,end:p};
  measureRef.current={pointerId:event.pointerId,measure,
   pinned:event.button===2};
  setLocalMeasures(items=>[...items,{...measure,isLocal:true}]);
  onMeasurementPreview?.(measure,'preview');
  event.currentTarget.setPointerCapture?.(event.pointerId);
 }
 function onDrop(event){
  if(previewRequested)return;
  const types=['application/x-forge-character','application/x-forge-unit',
   'application/x-forge-npc','application/x-forge-tool'];
  const type=types.find(t=>event.dataTransfer.types.includes(t));
  if(!type)return;
  event.preventDefault();
  const id=event.dataTransfer.getData(type),p=mapGridPoint(event);
  if(!id||!p)return;
  const x=Math.floor(p.x),y=Math.floor(p.y);
  if(type===types[0])onCharacterDrop?.(id,x,y);
  else if(type===types[1])onUnitDrop?.(id,x,y);
  else if(type===types[2]&&isDM)onNpcDrop?.(id,x,y);
  else if(type===types[3]){
   const holder=event.target.closest?.('[data-token-id]');
   const issue=toolIssued.find(v=>v.id===id);
   if(holder&&toolCanBeHeld(issue))onToolHold?.(id,holder.dataset.tokenId);
   else onToolPlace?.(id,x,y);
  }
 }
 useEffect(()=>{
  const handler=event=>{
   if(!active||ignoreTags(event.target))return;
   if(event.key==='Escape'){
    setActiveMeasure(null);measureRef.current=null;
    runtimeRef.current?.movement.cancelGesture('user');
   }
   if(event.key==='r'&&activeMeasure==='line'&&measureRef.current){
    const current=measureRef.current;
    current.measure=addLineTurn(current.measure,current.measure.end);
    onMeasurementPreview?.(current.measure,'preview',true);
    event.preventDefault();
   }
   if(event.key!=='Delete'||!isDM||event.repeat)return;
   if(environmentEditor?.enabled){
    if(environmentEditor.selectedId&&!environmentEditor.lockLight){
     onDeleteEnvironmentObject?.(environmentEditor.selectedIds?.length?
      environmentEditor.selectedIds:[environmentEditor.selectedId]);
     event.preventDefault();return;
    }
    if(environmentEditor.lockTokens!==false)return;
   }
   const tools=selectedRef.current.tools;
   if(tools.length){
    for(const id of tools)onToolPickUp?.(id);
    setSelection([]);event.preventDefault();return;
   }
   const token=latest.current.tokens.find(t=>t.id===selectedRef.current.tokens[0]);
   if(token){remove?.(token);setSelection([]);event.preventDefault()}
  };
  document.addEventListener('keydown',handler);
  return()=>document.removeEventListener('keydown',handler);
 },[active,isDM,activeMeasure,environmentEditor,onMeasurementPreview,
  onDeleteEnvironmentObject,onToolPickUp,remove]);
 useEffect(()=>{
  setSelection([]);setLocalMeasures([]);setActiveMeasure(null);
 },[map.id]);
 useEffect(()=>setDragIssue(null),[map.id,dmPreview]);
 useEffect(()=>{
  for(const item of roster)if(item.kind==='token'){
   const t=tokens.find(row=>row.id===item.id);
   if(t&&!canControlMapToken(t,user,isDM,map.id)&&selectedRef.current.tokens.includes(t.id))
    setSelection([],selectedRef.current.tools);
  }
 },[tokens,map.id,user,isDM,roster]);
 const measures=useMemo(()=>[
  ...Object.values(remoteMeasurements),...localMeasures
 ],[remoteMeasurements,localMeasures]);
 const editor=environmentEditor;
 const visiblePins=useMemo(()=>visibleWorldPins(handoutPins,authorizedSight),
  [handoutPins,authorizedSight]);
 const mapLayers=<>
  <div className="gridlines" style={{...styles.fill,
   pointerEvents:'none',
   backgroundSize:map.grid_size+'px '+map.grid_size+'px'}}/>
  <MapMeasurementOverlay map={map} scale={1} measures={measures}/>
 </>;
 // Grid and measuring stay under fog. The player-visible interaction
 // surfaces are filtered by server-authorized sight before painting.
 const foregroundLayers=<>
  <MapPinLayer map={map} scale={1} pointerScale={scale}
   pins={visiblePins} isDM={isDM&&!dmPreview} editor={editor} active={active}
   onCreate={onCreateHandoutPin} onOpen={onOpenHandoutPin}
   onMove={onMoveHandoutPin} onRead={onReadHandoutPin}
   onCollect={onCollectHandoutPin} onDelete={onDeleteHandoutPin}
   onSelect={onSelectHandoutPin}/>
  {isDM&&!dmPreview&&environment&&<MapEnvironmentOverlay
   map={map} scale={1} objects={environment.objects}
   editor={editor} onAdd={onAddEnvironmentObject}
   onSelect={onSelectEnvironmentObject}
   onPatch={onPatchEnvironmentObject}/>}
  {isDM&&!dmPreview&&editor?.enabled&&editor?.selectedId&&
   <MapObjectQuickAdjust map={map} scale={1}
    object={environment?.objects?.find(o=>o.id===editor.selectedId)}
    template={props.template} onPatch={onPatchEnvironmentObject}
    onClose={()=>onSelectEnvironmentObject?.(null)}/>}
  {marquee&&<div className="map-selection-marquee"
   style={{...styles.absolute,...selectionRectangle(
    marquee.start,marquee.end)}} aria-hidden="true"/>}
 </>;
 const zoomStops=[.25,.35,.5,.7,1,1.5,2,3];
 function onWheel(e){
  if(!e.ctrlKey)return;
  e.preventDefault();e.stopPropagation();
  const step=zoomStops.reduce((best,_,i)=>
   Math.abs(zoomStops[i]-scale)<Math.abs(zoomStops[best]-scale)?i:best,0);
  const next=zoomStops[clamp(step+(e.deltaY<0?1:-1),0,zoomStops.length-1)];
  if(next===scale)return;
  const rect=viewport.current?.getBoundingClientRect();
  if(rect){
   const vx=e.clientX-rect.left,vy=e.clientY-rect.top;
   zoomAnchor.current={
    x:((viewport.current.scrollLeft+vx)/scale),
    y:((viewport.current.scrollTop+vy)/scale),vx,vy
   };
  }
  setScale(next);
 }
 wheelHandler.current=onWheel;
 useEffect(()=>{
  const node=viewport.current;
  if(!node)return;
  const nativeWheel=event=>wheelHandler.current?.(event);
  node.addEventListener('wheel',nativeWheel,{passive:false});
  return()=>node.removeEventListener('wheel',nativeWheel);
 },[]);
 return <>
  <MeasurementToolBar tool={activeMeasure}
   onPointerDown={startMeasure} onPointerMove={onBoardMove}
   onPointerUp={onBoardUp} onPointerCancel={e=>onBoardUp(e,true)}
   onKeySelect={setActiveMeasure}
   onClearPins={()=>{setLocalMeasures(old=>old.filter(m=>!m.pinned));
    onMeasurementPreview?.(null,'clear')}}/>
  {issue&&<div role="alert" className="world-v2-engine-error">{issue}</div>}
  {dragIssue&&<div role="status" className="world-v2-engine-error"
   style={{pointerEvents:'none'}}>{dragIssue}</div>}
  {dmPreview&&<div role="status" className="world-v2-preview-note">
   DM preview movement is simulated. Player positions and explored fog are not saved.
  </div>}
  <div ref={viewport}
   className={'mapscroll map-pan-region'+(panning?' is-panning':'')}
   tabIndex={0}
   aria-label="World Engine V2 battlemap viewport">
   <div className="board-scroll-content" style={{
    width:map.width*scale,height:map.height*scale+(hotbarInset?78:0)
   }}>
    <div ref={board}
     className={'board world-v2-board'+(
      isDM&&editor?.enabled&&editor.lockTokens!==false?
      ' map-editor-tokens-locked':'')}
     style={{width:map.width*scale,height:map.height*scale,
      position:'relative'}}
     onDragOver={e=>{
      if(Array.from(e.dataTransfer?.types||[]).some(t=>
       t.startsWith('application/x-forge-')))
       e.preventDefault();
     }}
     onDrop={onDrop}
     onPointerDownCapture={onBoardDown}
     onPointerMove={onBoardMove}
     onPointerUp={e=>onBoardUp(e)}
     onPointerCancel={e=>onBoardUp(e,true)}
     onContextMenu={e=>{
      if(measureRef.current&&activeMeasure==='line'){
       const current=measureRef.current;
       current.measure=addLineTurn(current.measure,current.measure.end);
       e.preventDefault();
       onMeasurementPreview?.(current.measure,'preview',true);
      }
     }}>
     <WorldCanvasStack key={boardIdentity}
      mapId={map.id} viewerId={identity}
      mapWidth={map.width} mapHeight={map.height}
      playerPreview={dmPreview}
      tokensAboveEditor={Boolean(isDM&&!dmPreview&&editor?.enabled&&editor.lockTokens===false)}
      createSpriteElement={createSpriteElement}
      onRemoveSprite={onRemoveSprite}
      onRendererReady={renderer=>rendererReady.current(renderer)}
      onNeedResync={reason=>{
       const r=runtimeRef.current;
       if(!r)return;
       // MovementController already reconciles commit, cancellation and
       // rejection. Do not force a scene/permission reload on ordinary
       // interaction or create a recursive revocation loop.
       if(['canonical-commit','gesture-rejected',
        'gesture-cancelled'].includes(reason))return;
       if(['observer-sequence-gap','observer-path-discontinuity',
        'observer-path-not-in-authorized-fog',
        'invalid-or-stale-visibility','invalid-fog-mask',
        'bad-roster','sprite-factory-error',
        'invalid-published-scene'].includes(reason))
        void r.forceReauthorize();
      }}
      onRendererError={error=>setIssue(error?.message||String(error))}
      style={{width:map.width*scale,height:map.height*scale}}
      mapLayers={mapLayers} foregroundLayers={foregroundLayers}/>
    </div>
   </div>
  </div>
  {spritePortals}
 </>;
}
