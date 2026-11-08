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
  !Array.isArray(frame.visible)||
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
  typeof raw.collisionEnabled!=='boolean'||!Array.isArray(raw.nodes)||
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
  collisionEnabled:raw.collisionEnabled,nodes,expiresAt:receivedAt+12000};
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
export function navigationRouteApproved(grant,origin,offsets){
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
   if(!navigationAllows(grant,at,next))return false;
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
 const grants=new Map(),inFlight=new Map(),revisions=new Map();
 let disposed=false;
 function validGrant(mapId,kind,id){
  const key=keyOf(mapId,kind,id),grant=grants.get(key);
  const revision=revisions.get(mapId);
  if(!revision||!grant||grant.expiresAt<=clock()||
   grant.authorizationKey!==revision.authorizationKey){
   grants.delete(key);return null;
  }
  return grant;
 }
 async function ensure(mapId,kind,id){
  if(disposed||!UUID.test(String(mapId))||!UUID.test(String(id))||
   !['token','tool'].includes(kind))return null;
  const exists=validGrant(mapId,kind,id);
  if(exists)return exists;
  const key=keyOf(mapId,kind,id);
  if(inFlight.has(key))return inFlight.get(key);
  const expectedRevision=revisions.get(mapId);
  if(!expectedRevision)return null; // Never use unversioned visibility as a grant.
  const task=(async()=>{
   const {data,error}=await db.rpc('get_authorized_map_navigation',{
    p_map:mapId,p_kind:kind,p_piece:id});
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
      grant.collisionEnabled===current.collisionEnabled)){
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
  warm(mapId,kind,id){void ensure(mapId,kind,id).catch(()=>{})},
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
   if(previous?.authorizationKey===authorizationKey)return;
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
  },
  allows(mapId,kind,id,from,to){
   return navigationAllows(validGrant(mapId,kind,id),from,to);
  },
  routeApproved(mapId,kind,id,origin,offsets){
   return navigationRouteApproved(validGrant(mapId,kind,id),origin,offsets);
  },
  hasGrant(mapId,kind,id){return !!validGrant(mapId,kind,id)},
  clear(){grants.clear();inFlight.clear();revisions.clear()},
  dispose(){disposed=true;grants.clear();inFlight.clear();revisions.clear()},
  get size(){return grants.size}
 };
}
