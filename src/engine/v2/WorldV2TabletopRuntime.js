/**
 * World Engine V2 / Phase 9 — integrated, SERVER-AUTHORIZED tabletop runtime.
 *
 * This is the only owner of V2 scene, fog, observer, gesture and input state
 * for a mounted campaign map. It never imports/calls any legacy movement,
 * fog, navigation or broadcast implementations.
 *
 * IMPORTANT: Phase 9 is staged behind an OFF-by-default cutover. The Phase 4–7
 * migrations must be applied together, and Phase 10 must remove the active
 * legacy subscriptions before V2 is allowed to run in production.
 */
import {createMovementController} from './MovementController.js';
import {createInputController} from './InputController.js';
import {createWorldAuthorityClient} from './AuthorityClient.js';
import {createSceneManager,fetchWorldSceneV2} from './SceneManager.js';
import {createSceneTransport} from './SceneTransport.js';
import {createVisibilityController} from './VisibilityController.js';
import {createWorldRealtimeTransport} from './RealtimeTransport.js';
import {collisionAllowsStep} from './CollisionSolver.js';
import {createPreviewAuthority} from './PreviewAuthority.js';
import {canPredictWithinWorldGrants} from './PredictionGrants.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid=x=>typeof x==='string'&&UUID.test(x);
const noop=()=>{};
const key=p=>p.kind+':'+p.id;
const validSpan=n=>Number.isFinite(n)&&n>0&&n<=12;
function authorizedPieces(rows,granted){
 if(!Array.isArray(rows)||!Array.isArray(granted))return null;
 const ids=new Set(granted.map(key)),result=[];
 for(const p of rows){
  if(!p||!ids.has(key(p))||!uuid(p.id)||
   !['token','tool'].includes(p.kind)||
   !Number.isFinite(p.x)||!Number.isFinite(p.y)||
   !validSpan(p.spanX)||!validSpan(p.spanY))return null;
  result.push({...p});
 }
 return result;
}
export function createWorldV2TabletopRuntime({
 db,mapId,viewerId,renderer,isDM=false,dmPreview=false,
 previewViewerId=null,
 getAuthorizedPieces=()=>[],onAuthorizedRoster=noop,
 onScene=noop,onError=noop,onCommit=noop,onState=noop,
 onGesture=noop
}={}){
 if(!db?.rpc||!db?.channel||!db?.removeChannel||
  !uuid(mapId)||!uuid(viewerId)||!renderer||
  typeof renderer.adoptScene!=='function'||
  typeof renderer.adoptVisibility!=='function'||
  typeof renderer.applyLocalMovement!=='function'||
  typeof renderer.applyObserverPath!=='function'||
  typeof renderer.applyObserverHide!=='function'||
  typeof isDM!=='boolean'||typeof dmPreview!=='boolean'||
  (dmPreview&&(!isDM||!uuid(previewViewerId)))||
  typeof getAuthorizedPieces!=='function'||
  [onAuthorizedRoster,onScene,onError,onCommit,onState,onGesture]
   .some(callback=>typeof callback!=='function'))
  throw Error('Invalid V2 tabletop integration');
 const identity=dmPreview?previewViewerId:viewerId;
 let disposed=false,started=false,connected=false,starting=null;
 let input=null,stream=null,sceneTransport=null;
 let refreshRevision=0,reloading=null,privateReady=false;
 let previewPosition=null,dmLightRefreshTimer=null;
 function scheduleDmLightRefresh(){
  if(disposed||!isDM||dmPreview||dmLightRefreshTimer!==null)return;
  dmLightRefreshTimer=setTimeout(()=>{
   dmLightRefreshTimer=null;
   if(!disposed)void refreshVisibility('dm-approved-motion-light');
  },150);
 }
 const signal=(fn,...args)=>{if(!disposed)try{fn(...args)}catch{}};
 const authorized=()=>!disposed&&!manager.stale&&
  !!vision.frame&&vision.authorized&&renderer.authorized&&
  manager.displayedScene?.revision===vision.frame.environmentRevision&&
  manager.displayedScene?.sceneGeneration===vision.frame.sceneGeneration;
 const state=reason=>signal(onState,{
  reason,mapId,viewerId,authorized:authorized(),connected,
  sceneStale:manager.stale,streamLocked:stream?.locked??true
 });
 const manager=createSceneManager({
  mapId,viewerId,
  fetchManifest:({mapId})=>fetchWorldSceneV2({db,mapId}),
  onChange:(snapshot,dirty)=>{
   if(disposed)return;
   renderer.adoptScene(snapshot,dirty);
   signal(onScene,snapshot);
   // A static publication cannot grant vision. Request a new actor-bound
   // frame separately; reject stale/mismatched generations on receipt.
   if(started)void refreshVisibility('scene-change');
  },
  onInvalidate:({reason})=>{
   if(disposed)return;
   movement?.cancelGesture('scene-change');
   renderer.revoke(reason,false);
   vision?.revoke(reason);
   privateReady=false;state(reason);
  },
  onError:error=>signal(onError,error)
 });
 const vision=createVisibilityController({
  db,mapId,viewerId:identity,dmPreview,
  getPreviewPosition:()=>previewPosition,
   getScene:()=>manager.stale?{mapId:'revoked'}:manager.displayedScene,
  onSnapshot:snapshot=>{
   if(disposed)return;
   if(!renderer.adoptVisibility(snapshot)){
    // Report only a bounded reason code: never expose scene cells,
    // private coordinates, hidden entity IDs, or raw RPC payloads.
    signal(onError,Error('V2 renderer rejected authorized sight: '+
     (renderer.lastSightRejection||'unclassified')));
    return;
   }
   privateReady=true;
   signal(onAuthorizedRoster,snapshot.visiblePieces,snapshot);
   state('authorized-sight');
  },
  onRevoke:({reason})=>{
   if(disposed)return;
   privateReady=false;
   renderer.revoke(reason,false);
   movement?.cancelGesture('permission');
   signal(onAuthorizedRoster,[],null);
   state(reason);
  },
  onError:error=>signal(onError,error)
 });
 const authority=dmPreview?createPreviewAuthority({
   getScene:()=>manager.stale?null:manager.collisionScene,
   getPieces:selection=>{
    try{return authorizedPieces(getAuthorizedPieces(selection),selection)}
    catch{return null}
   },
   getPosition:()=>previewPosition
  }):createWorldAuthorityClient({db});
 const movement=createMovementController({
  authority,
  canPredict:request=>{
    if(disposed||!authorized())return false;
    if(!isDM)return canPredictWithinWorldGrants({
     frame:vision.frame,scene:manager.displayedScene,request
    });
    if(manager.displayedScene.scope!=='dm')return false;
   const scene=manager.collisionScene;
   if(!scene||request.mapId!==mapId||
    request.environmentRevision!==scene.revision||
    request.permissionGeneration!==vision.frame.permissionGeneration||
    !Array.isArray(request.selection)||!request.selection.length)
    return false;
   // The caller only exposes pieces already in this viewer's server-
   // authorized roster. DM's collision cache is NEVER sent to a player.
   let parts;
   try{
    const rows=getAuthorizedPieces(request.selection);
    parts=authorizedPieces(rows,request.selection);
     if(dmPreview&&previewPosition&&parts)
      parts=parts.map(p=>p.id===previewPosition.tokenId?
       {...p,x:previewPosition.x,y:previewPosition.y}:p);
   }catch{return false}
   if(!parts||parts.length!==request.selection.length||
    !parts.every(p=>vision.frame.visiblePieces.some(row=>key(row)===key(p))))
    return false;
   const source=parts.find(p=>key(p)===key(request.selection[0]));
   if(!source)return false;
   return collisionAllowsStep({
    scene,pieces:parts,
    anchor:{x:source.x,y:source.y},
    from:request.from,to:request.pointer
   });
  },
  onEvent:event=>{
   if(disposed)return;
   renderer.applyLocalMovement(event);
   signal(onGesture,event);
   if(dmPreview&&['approved','blocked'].includes(event.type)&&
    event.selection?.length===1&&event.selection[0].kind==='token'){
    previewPosition={tokenId:event.selection[0].id,
     x:event.approved.x,y:event.approved.y};
    void refreshVisibility('virtual-preview-step');
   }
   if(event.type==='committed'&&dmPreview){
    // End the local handoff against a fresh non-mutating player-effective
    // snapshot; never ask the live movement database to commit preview.
    void refreshVisibility('virtual-preview-final');
   }
   if(event.type==='committed'&&!dmPreview){
    // Actor's final motion is acknowledged once by Phase 4. The renderer
    // holds its approved endpoint until this authorized snapshot arrives.
    signal(onCommit,{mapId,selection:event.selection,
     endpoint:event.approved});
    void refreshVisibility('committed');
   }else if(['rejected','cancelled','revoked'].includes(event.type)){
    void refreshVisibility('gesture-failed');
   }
  }
 });
 async function refreshVisibility(reason='manual'){
  if(disposed||manager.stale||!manager.displayedScene)return false;
  const revision=++refreshRevision;
  const result=await vision.refresh(reason);
  if(disposed||revision!==refreshRevision)return false;
  return !!result&&privateReady;
 }
 async function refreshScene(reason='manual'){
  if(disposed)return false;
  if(reloading)return reloading;
  const task=Promise.resolve().then(async()=>{
   manager.invalidate(reason);
   const ok=await manager.load();
   if(!ok||disposed)return false;
   return refreshVisibility('scene-resync');
  }).finally(()=>{if(reloading===task)reloading=null});
  reloading=task;return task;
 }
 function revoke(reason,hard=true){
  if(disposed)return;
  ++refreshRevision;privateReady=false;previewPosition=null;
   if(dmLightRefreshTimer!==null){
    clearTimeout(dmLightRefreshTimer);dmLightRefreshTimer=null;
   }
   movement.cancelGesture('permission');
  manager.revokeAuthorization();
  vision.revoke(reason);
  renderer.revoke(reason,hard);
  signal(onAuthorizedRoster,[],null);state(reason);
 }
 return Object.freeze({
  start(){
   if(disposed)return Promise.resolve(false);
   if(started)return Promise.resolve(authorized());
   if(starting)return starting;
   // The first scene adoption cannot trigger an independent sight request:
   // started remains false until the initial scene and sight are coherent.
   const task=(async()=>{
   const ok=await manager.load();
   if(!ok||disposed){state('scene-unavailable');return false}
   if(!(await refreshVisibility('initial'))||disposed){
    state('sight-unavailable');return false;
   }
   // A DM cannot (and must not) join another player's private movement
   // channel using their DM JWT. In player-effective DM preview, use only
   // the DM-authorized preview RPC; a dedicated preview observer feed is a
   // Phase 10 integration task, never a bypass of recipient channel RLS.
   if(!dmPreview)stream=createWorldRealtimeTransport({
    db,mapId,viewerId:identity,
    onResync:async reason=>{
     if(manager.stale){
      if(!await manager.load())throw Error('V2 scene resync failed');
     }
     const snapshot=await vision.observerSnapshot();
     if(!snapshot||!renderer.authorized)
      throw Error('Viewer snapshot failed renderer authorization');
     return snapshot;
    },
    onPath:(item,meta)=>{
     if(!renderer.applyObserverPath(item,meta))
       signal(onError,Error('V2 observer path denied by renderer'));
      else scheduleDmLightRefresh();
    },
    onHide:(item,meta)=>{
      if(renderer.applyObserverHide(item,meta))scheduleDmLightRefresh();
     },
    onVisionDirty:notice=>{
     if(!vision.onVisionDirty(notice))return;
     // onSnapshot automatically repaints only changed fog and sprite rows.
    },
    onRevoke:reason=>{
     connected=false;privateReady=false;
     renderer.revoke(reason,false);
     movement.cancelGesture('disconnected');
     state(reason);
    },
    onState:streamState=>{
     connected=streamState.connected;
     state('private-'+streamState.reason);
    },
    onError:error=>signal(onError,error)
   });
   sceneTransport=createSceneTransport({
    db,mapId,sceneManager:manager,
    onState:sceneState=>{
     state('scene-'+sceneState.reason);
     if(sceneState.reason==='scene-current')
      void refreshVisibility('scene-current');
    },
    onError:error=>signal(onError,error)
   });
   if(stream&&(!await stream.start()||disposed))return false;
   if(!await sceneTransport.start()||disposed)return false;
   started=true;state('started');return true;
   })().finally(()=>{if(starting===task)starting=null});
   starting=task;
   return task;
  },
  attachInput({target,pointFromEvent,resolveSelection,
   onPointerRelease=()=>false,keyboardTarget,keyboardIdleMs=90}={}){
   if(disposed||input||!target)return false;
   const choose=(event,p,context)=>{
    if(!authorized())return null;
    let picked;
    try{picked=resolveSelection(event,p,context)}catch{return null}
    if(!picked||picked.mapId!==mapId||
     !Array.isArray(picked.selection)||!picked.selection.length||
     !picked.selection.every(piece=>vision.visiblePieces.some(
      row=>key(row)===key(piece))))return null;
    if(dmPreview&&picked.mode!=='preview')return null;
    return {...picked,
     environmentRevision:manager.displayedScene.revision,
     permissionGeneration:vision.frame.permissionGeneration};
   };
   input=createInputController({
    target,controller:movement,pointFromEvent,
    resolveSelection:choose,onPointerRelease,
    ...(keyboardTarget?{keyboardTarget}:{}),
    keyboardIdleMs
   });
   input.mount();return true;
  },
  detachInput(){input?.unmount();input=null},
  refreshVisibility,refreshScene,revoke,
  forceReauthorize:async()=>{
   if(disposed)return false;
   movement.cancelGesture('permission');
   renderer.revoke('manual-resync',false);
   return refreshScene('manual-resync');
  },
  async dispose(){
   if(disposed)return;
   disposed=true;started=false;connected=false;privateReady=false;
   ++refreshRevision;
    if(dmLightRefreshTimer!==null){
     clearTimeout(dmLightRefreshTimer);dmLightRefreshTimer=null;
    }
    input?.unmount();input=null;
   movement.dispose();authority.dispose();
   const s=stream,t=sceneTransport;
   stream=null;sceneTransport=null;
   await Promise.allSettled([s?.dispose(),t?.dispose()]);
   vision.dispose();manager.dispose();
  },
  get renderer(){return renderer},
  get movement(){return movement},
  get sceneManager(){return manager},
  get visibility(){return vision},
  get stream(){return stream},
  get active(){return authorized()},
  get started(){return started},
  get disposed(){return disposed},
  get currentMap(){return mapId},
  get effectiveViewer(){return identity},
   get previewPosition(){return previewPosition?{...previewPosition}:null}
 });
}
