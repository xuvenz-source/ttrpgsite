import {movementDiagnostics} from './MovementDiagnostics.js';
/**
 * Server-issued, bounded navigation graph. It contains permitted edges, NEVER
 * source wall geometry or authorization to persist a final position.
 * Missing/stale edges are impassable until the server refreshes the grant.
 */
export const NAV_DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],
 [1,1],[1,-1],[-1,1],[-1,-1]];
export const NAV_MAX_NODES=625;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer=Number.isSafeInteger;
const keyOf=(mapId,kind,id)=>mapId+':'+kind+':'+id;

/** Stable only while the SAME server-authorized visible cells, scene and
 * protocol epoch remain in force. Revisions with identical permission data
 * must not trigger another expensive 625-node navigation grant. */
export function navigationAuthorizationKey(frame){
 if(!frame||!UUID.test(String(frame.mapId||''))||
  frame.protocolVersion!==2||
  !integer(frame.navigationEnvironmentRevision)||
  frame.navigationEnvironmentRevision<0||
  typeof frame.enabled!=='boolean'||
  typeof frame.collisionEnabled!=='boolean'||
  typeof frame.partyShared!=='boolean'||
  !integer(frame.width)||!integer(frame.height)||
  frame.width<1||frame.height<1||
  Object.hasOwn(frame,'displayVisibleDuringRefresh')||
  !Array.isArray(frame.visible)||
  frame.visible.length>frame.width*frame.height||
  frame.visible.some(v=>!integer(v)||v<0||v>=frame.width*frame.height)||
  (frame.deltaProtocolVersion===1&&!UUID.test(String(frame.epoch||''))))return null;
 return JSON.stringify([frame.epoch||null,frame.width,frame.height,
  frame.navigationEnvironmentRevision,frame.collisionEnabled,
  frame.enabled,frame.partyShared,frame.visible]);
}


export function normalizeAuthorizedNavigation(raw,mapId,kind,id,receivedAt=Date.now()){
 if(!raw||raw.version!==1||raw.mapId!==mapId||raw.kind!==kind||
  raw.pieceId!==id||!UUID.test(String(mapId))||!UUID.test(String(id))||
  !['token','tool'].includes(kind)||!Array.isArray(raw.origin)||
  raw.origin.length!==2||!raw.origin.every(integer)||
  !integer(raw.visibilityRevision)||raw.visibilityRevision<0||
  !integer(raw.gridWidth)||!integer(raw.gridHeight)||
  raw.gridWidth<1||raw.gridHeight<1||raw.gridWidth>1000||raw.gridHeight>1000||
  !integer(raw.environmentRevision)||raw.environmentRevision<0||
  typeof raw.collisionEnabled!=='boolean'||
  !Array.isArray(raw.footprint)||raw.footprint.length!==2||
  !raw.footprint.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=12)||
  !Array.isArray(raw.nodes)||
  raw.nodes.length>NAV_MAX_NODES)return null;
 const nodes=new Map();
 for(const tuple of raw.nodes){
  if(!Array.isArray(tuple)||tuple.length!==3||!tuple.every(integer))return null;
  const [x,y,mask]=tuple;
  if(x<0||y<0||x>=raw.gridWidth||y>=raw.gridHeight||
   mask<0||mask>255||nodes.has(x+':'+y))return null;
  nodes.set(x+':'+y,mask);
 }
 // No geometry, character values or hidden map metadata may be smuggled in.
 if(['objects','scene','walls','doors','prepared','live','tokens','imagePaths']
  .some(key=>Object.hasOwn(raw,key)))return null;
 return {mapId,kind,id,baseX:raw.origin[0],baseY:raw.origin[1],
  revision:raw.visibilityRevision,environmentRevision:raw.environmentRevision,
  collisionEnabled:raw.collisionEnabled,
  footprintWidth:raw.footprint[0],footprintHeight:raw.footprint[1],
  nodes,expiresAt:receivedAt+12000};
}

export function navigationAllows(grant,from,to){
 if(!grant||!integer(from?.x)||!integer(from?.y)||
  !integer(to?.x)||!integer(to?.y))return false;
 const dx=to.x-from.x,dy=to.y-from.y;
 const index=NAV_DIRECTIONS.findIndex(([x,y])=>x===dx&&y===dy);
 return index>=0&&Boolean((grant.nodes.get(from.x+':'+from.y)||0)&(1<<index));
}

/** Expand compressed bends before checking each transition; no straight-line
 * shortcut can falsely justify a multi-corner movement. */
export function navigationRouteApproved(grant,origin,offsets,permitStep=()=>true){
 if(!grant||!Array.isArray(offsets)||!offsets.length||offsets.length>64||
  !integer(origin?.x)||!integer(origin?.y))return false;
 let at={x:origin.x,y:origin.y},last={dx:0,dy:0},count=0;
 if(!grant.nodes.has(at.x+':'+at.y))return false;
 for(const offset of offsets){
  if(!integer(offset?.dx)||!integer(offset?.dy)||
   Math.abs(offset.dx)>128||Math.abs(offset.dy)>128)return false;
  const sx=offset.dx-last.dx,sy=offset.dy-last.dy;
  const steps=Math.max(Math.abs(sx),Math.abs(sy));
  if(steps>512)return false;
  const initial=at;
  for(let i=1;i<=steps;i++){
   const next={x:origin.x+Math.round(last.dx+sx*i/steps),
    y:origin.y+Math.round(last.dy+sy*i/steps)};
   if(next.x===at.x&&next.y===at.y)continue;
   if(!navigationAllows(grant,at,next)||!permitStep(at,next))return false;
   at=next;
   if(++count>1024)return false;
  }
  last=offset;
  if(at.x!==origin.x+offset.dx||at.y!==origin.y+offset.dy)return false;
  if(initial===at&&steps>0)return false;
 }
 return count>0;
}

/** Caches validated grants by the viewer's effective authorization footprint,
 * not by noisy per-viewer movement revision ticks. */
export function createAuthorizedNavigation({db,clock=Date.now}){
 const grants=new Map(),inFlight=new Map(),revisions=new Map(),origins=new Map();
 const matchingOrigin=(grant,origin)=>!origin||
  (grant?.baseX===origin.x&&grant?.baseY===origin.y);
 const frameKey=frame=>JSON.stringify([frame.mapId,frame.epoch||null,
  frame.navigationEnvironmentRevision,frame.enabled,
  frame.collisionEnabled,frame.partyShared,frame.width,frame.height]);
 function withinSight(auth,grant,point){
  if(!auth||!grant)return false;
  if(!auth.fogEnabled)return true;
  if(!auth.visible)return false;
  const x=Number(point?.x),y=Number(point?.y);
  if(!integer(x)||!integer(y))return false;
  for(let cx=x;cx<Math.ceil(x+grant.footprintWidth);cx++)
   for(let cy=y;cy<Math.ceil(y+grant.footprintHeight);cy++)
    if(cx<0||cy<0||cx>=auth.width||cy>=auth.height||
     !auth.visible.has(cx+cy*auth.width))return false;
  return true;
 }
 function stepAllowed(grant,auth,from,to){
  return navigationAllows(grant,from,to)&&
   withinSight(auth,grant,from)&&withinSight(auth,grant,to);
 }
 let disposed=false;
 function validGrant(mapId,kind,id){
  const key=keyOf(mapId,kind,id),grant=grants.get(key);
  const revision=revisions.get(mapId),origin=origins.get(key);
  if(grant&&grant.expiresAt<=clock())movementDiagnostics.count('navigationGrantExpired');
  if(!revision||!grant||grant.expiresAt<=clock()||
   grant.authorizationKey!==revision.authorizationKey||
   !matchingOrigin(grant,origin)){
   grants.delete(key);return null;
  }
  return grant;
 }
 async function ensure(mapId,kind,id,origin=undefined){
  if(disposed||!UUID.test(String(mapId))||!UUID.test(String(id))||
   !['token','tool'].includes(kind))return null;
  const key=keyOf(mapId,kind,id);
  if(origin!==undefined){
   if(!integer(origin?.x)||!integer(origin?.y))return null;
   const previous=origins.get(key);
   if(!previous||previous.x!==origin.x||previous.y!==origin.y){
    origins.set(key,{x:origin.x,y:origin.y});
    grants.delete(key);inFlight.delete(key);
    if(previous)movementDiagnostics.count('navigationOriginChanged');
   }
  }
  const expectedOrigin=origins.get(key);
  const exists=validGrant(mapId,kind,id);
  if(exists){movementDiagnostics.count('navigationGrantCacheHit');return exists;}
  if(inFlight.has(key)){
   movementDiagnostics.count('navigationGrantCoalesced');
   return inFlight.get(key);
  }
  const expectedRevision=revisions.get(mapId);
  if(!expectedRevision)return null; // Never use unversioned visibility as a grant.
  movementDiagnostics.count('navigationGrantRequested');
  const task=(async()=>{
   const finish=movementDiagnostics.begin('navigation-grant-rpc');
   let response;
   try{
    response=await db.rpc('get_authorized_map_navigation',{
     p_map:mapId,p_kind:kind,p_piece:id});
   }finally{finish()}
   const {data,error}=response;
   if(error)throw error;
   const grant=normalizeAuthorizedNavigation(data,mapId,kind,id,clock());
   if(!grant)throw Error('Invalid authorized navigation grant');
   const current=revisions.get(mapId);
   if(!disposed&&current&&
    current.authorizationKey===expectedRevision.authorizationKey&&
    current.revision===grant.revision&&
    (current.environmentRevision===undefined||
      grant.environmentRevision===current.environmentRevision)&&
    (current.collisionEnabled===undefined||
      grant.collisionEnabled===current.collisionEnabled)&&
    matchingOrigin(grant,expectedOrigin)&&
    (!expectedOrigin||
      (origins.get(key)?.x===expectedOrigin.x&&
       origins.get(key)?.y===expectedOrigin.y))){
    const stored={...grant,authorizationKey:current.authorizationKey};
    grants.set(key,stored);return stored;
   }
   return null;
  })().finally(()=>{if(inFlight.get(key)===task)inFlight.delete(key)});
  inFlight.set(key,task);
  return task;
 }
 return {
  ensure,
  warm(mapId,kind,id,origin=undefined){
   void ensure(mapId,kind,id,origin).catch(()=>{});
  },
  /** Adopt only a currently CONFIRMED server fog frame. A newer sight set
   * clips all previously granted edges, but does not discard walls/grants
   * merely because the player has moved and the fog mask has shifted.
   * A scene or identity change invalidates the whole graph immediately. */
  adoptFrame(mapId,frame){
   if(!UUID.test(String(mapId)))return false;
   if(!frame||frame.mapId!==mapId||
      navigationAuthorizationKey(frame)===null){
    this.revoke(mapId);return false;
   }
   const old=revisions.get(mapId);
   if(old&&frame.revision<old.revision){
    this.revoke(mapId);return false;
   }
   const hardKey=frameKey(frame);
   const previousKey=old?.authorizationKey;
   revisions.set(mapId,{
    revision:frame.revision,authorizationKey:hardKey,
    environmentRevision:frame.navigationEnvironmentRevision,
    collisionEnabled:frame.collisionEnabled,
    fogEnabled:frame.enabled,width:frame.width,height:frame.height,
    visible:new Set(frame.visible)
   });
   if(previousKey===hardKey){
    if(old.revision!==frame.revision)
     movementDiagnostics.count('navigationRevisionReused');
    return true;
   }
   movementDiagnostics.count('navigationAuthorizationChanged');
   for(const [id,grant] of grants)
    if(grant.mapId===mapId)grants.delete(id);
   for(const id of inFlight.keys())if(id.startsWith(mapId+':'))inFlight.delete(id);
   return true;
  },
  authority(mapId){return revisions.get(mapId)?.authorizationKey||null;},
  /** Revoke grants for pieces whose authoritative RLS projection no longer
   * permits movement by this viewer, independently of fog-cell changes. */
  retainPermitted(mapId,permitted){
   if(!UUID.test(String(mapId))||!(permitted instanceof Set))return;
   for(const id of grants.keys())
    if(id.startsWith(mapId+':')&&!permitted.has(id))grants.delete(id);
   for(const id of inFlight.keys())
    if(id.startsWith(mapId+':')&&!permitted.has(id))inFlight.delete(id);
   for(const id of origins.keys())
    if(id.startsWith(mapId+':')&&!permitted.has(id))origins.delete(id);
  },

  // Passing a stable key from navigationAuthorizationKey() keeps an existing
  // grant across harmless visibility revision increments. Two-argument calls
  // remain strict for older consumers and tests.
  setRevision(mapId,revision,key=undefined,environmentRevision=undefined,
    collisionEnabled=undefined){
   if(!UUID.test(String(mapId)))return;
   const revoke=()=>{
    revisions.delete(mapId);
    for(const [id,grant] of grants)
     if(grant.mapId===mapId)grants.delete(id);
    for(const id of inFlight.keys())if(id.startsWith(mapId+':'))inFlight.delete(id);
    for(const id of origins.keys())if(id.startsWith(mapId+':'))origins.delete(id);
   };
   if(!integer(revision)||revision<0||key===null||
      (key!==undefined&&(!integer(environmentRevision)||
        environmentRevision<0||typeof collisionEnabled!=='boolean'))){
    revoke();return;
   }
   const authorizationKey=key===undefined?'revision:'+revision:key;
   if(typeof authorizationKey!=='string'||!authorizationKey){revoke();return;}
   const previous=revisions.get(mapId);
   if(previous&&revision<previous.revision){revoke();return;}
   revisions.set(mapId,{revision,authorizationKey,
    environmentRevision,collisionEnabled});
   if(previous?.authorizationKey===authorizationKey){
    if(previous.revision!==revision)
     movementDiagnostics.count('navigationRevisionReused');
    return;
   }
   movementDiagnostics.count('navigationAuthorizationChanged');
   for(const [id,grant] of grants)
    if(grant.mapId===mapId)grants.delete(id);
   for(const id of inFlight.keys())if(id.startsWith(mapId+':'))inFlight.delete(id);
  },
  revoke(mapId){
   if(!UUID.test(String(mapId)))return;
   revisions.delete(mapId);
   for(const [id,grant] of grants)
    if(grant.mapId===mapId)grants.delete(id);
   for(const id of inFlight.keys())if(id.startsWith(mapId+':'))inFlight.delete(id);
   for(const id of origins.keys())if(id.startsWith(mapId+':'))origins.delete(id);
  },
  allows(mapId,kind,id,from,to){
   return stepAllowed(validGrant(mapId,kind,id),revisions.get(mapId),from,to);
  },
  /** Previously traversed segments were already authorized at paint time.
   * Do not retroactively invalidate them when the player's sight moves and
   * old cells become unseen. Each NEW step is still clipped via allows().
   * The final endpoint must be currently authorized; the server independently
   * revalidates the entire trajectory against current walls and permissions. */
  routeApproved(mapId,kind,id,origin,offsets){
   const grant=validGrant(mapId,kind,id);
   if(!matchingOrigin(grant,origin)||grant?.baseX!==origin?.x||
      grant?.baseY!==origin?.y||
      !navigationRouteApproved(grant,origin,offsets))return false;
   const end=offsets?.at(-1);
   return withinSight(revisions.get(mapId),grant,{
    x:origin.x+end.dx,y:origin.y+end.dy});
  },
  canOccupy(mapId,kind,id,position){
   return withinSight(revisions.get(mapId),validGrant(mapId,kind,id),position);
  },
  hasGrant(mapId,kind,id){return !!validGrant(mapId,kind,id)},
  clear(){grants.clear();inFlight.clear();revisions.clear();origins.clear()},
  dispose(){disposed=true;grants.clear();inFlight.clear();revisions.clear();origins.clear()},
  get size(){return grants.size}
 };
}
