/**
 * World Engine V2: transport-only adapter for the versioned server movement API.
 * No client-authored position broadcast, no legacy RPC fallback, no hidden geometry.
 *
 * The Phase 4 SQL is staged independently and is NOT installed on production.
 * Do not connect this adapter to the live map until the integrated release.
 */
import {worldV2Trace} from './WorldTrace.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int=Number.isSafeInteger;
const point=p=>int(p?.x)&&int(p?.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const id=x=>uuid.test(String(x??''));
function validateSelection(selection){
 return Array.isArray(selection)&&selection.length>=1&&selection.length<=48&&
  selection.every(p=>['token','tool'].includes(p?.kind)&&id(p?.id))&&
  new Set(selection.map(p=>p.kind+':'+p.id)).size===selection.length;
}
function requireReply(data,error){
 if(error)throw Error('World movement server unavailable');
 if(!data||data.version!==2)throw Error('Invalid world movement response');
 return data;
}
async function traceRpc(db,name,params,metric){
 const done=worldV2Trace.begin(metric);let result='error';
 try{const response=await db.rpc(name,params);
  result=response?.error?'error':'ok';return response;
 }finally{done(result)}
}
export function createWorldAuthorityClient({db,commitReconciliation=false}={}){
 if(!db||typeof db.rpc!=='function'||typeof commitReconciliation!=='boolean')
  throw Error('V2 requires a valid RPC client and reconciliation mode');
 let disposed=false;
 const sessions=new Map();
 const required=()=>{if(disposed)throw Error('V2 authority disposed')};
 return {
  async begin({mapId,gestureId,selection,mode,origin,
   environmentRevision,permissionGeneration,collisionOverride=false}){
   required();
   if(!id(mapId)||!int(gestureId)||gestureId<1||
    !validateSelection(selection)||!point(origin)||
    !['drag','touch','keyboard','preview'].includes(mode)||
    !int(environmentRevision)||environmentRevision<0||
    !int(permissionGeneration)||permissionGeneration<0||
    typeof collisionOverride!=='boolean')
    throw Error('Invalid V2 begin request');
   const {data,error}=await traceRpc(db,'begin_world_motion_v2',{
    p_map:mapId,p_selection:selection,p_origin:origin,p_mode:mode,
    p_environment_revision:environmentRevision,
    p_permission_generation:permissionGeneration,
    p_collision_override:collisionOverride
   },'authority.begin');
   const reply=requireReply(data,error);
   if(!id(reply.sessionId)||disposed){
    throw Error('Invalid V2 movement session');
   }
   sessions.set(reply.sessionId,{mapId,gestureId,seq:0});
   return {version:2,sessionId:reply.sessionId};
  },
  async advance({mapId,sessionId,gestureId,seq,from,targets,
   environmentRevision,permissionGeneration}){
   required();
   const current=sessions.get(sessionId);
   if(!current||!id(sessionId)||current.mapId!==mapId||
    current.gestureId!==gestureId||!int(seq)||seq<=current.seq||
    !point(from)||!Array.isArray(targets)||!targets.length||
    targets.length>8||!targets.every(point)||!int(environmentRevision)||
    !int(permissionGeneration))
    throw Error('Invalid V2 movement batch');
   current.seq=seq; // reject local repeats even if the RPC fails
   const {data,error}=await traceRpc(db,'advance_world_motion_v2',{
    p_session:sessionId,p_seq:seq,p_from:from,
    p_targets:targets,p_environment_revision:environmentRevision,
    p_permission_generation:permissionGeneration
   },'authority.advance');
   const reply=requireReply(data,error);
   if(disposed||sessions.get(sessionId)!==current)
    throw Error('V2 movement cancelled');
   return reply; // MovementController validates exact accepted prefix/fields
  },
  async commit({mapId,sessionId,gestureId,seq,endpoint,
   environmentRevision,permissionGeneration}){
   required();
   const current=sessions.get(sessionId);
   if(!current||!id(sessionId)||current.mapId!==mapId||
    current.gestureId!==gestureId||!int(seq)||seq<=current.seq||
    !point(endpoint)||!int(environmentRevision)||!int(permissionGeneration))
    throw Error('Invalid V2 commit');
   current.seq=seq;
   try{
    // On an ambiguous transport failure, retry the identical idempotency
    // tuple; the B08 SQL server is the only canonical arbiter.
    const params={
     p_session:sessionId,p_seq:seq,p_endpoint:endpoint,
     p_environment_revision:environmentRevision,
     p_permission_generation:permissionGeneration
    };
    let response;
    for(let attempt=0;attempt<(commitReconciliation?2:1);attempt++){
     try{response=await traceRpc(db,'commit_world_motion_v2',
      params,'authority.commit')}
     catch(error){
      if(commitReconciliation&&attempt===0)continue;
      throw error;
     }
     if(response?.error&&commitReconciliation&&attempt===0)continue;
     break;
    }
    const reply=requireReply(response?.data,response?.error);
    if(disposed||sessions.get(sessionId)!==current)
     throw Error('V2 movement cancelled');
    return reply;
   }finally{if(sessions.get(sessionId)===current)sessions.delete(sessionId)}
  },
  async cancel({mapId,sessionId,gestureId}){
   if(!id(sessionId))return false;
   const current=sessions.get(sessionId);
   if(current&&(current.mapId!==mapId||current.gestureId!==gestureId))
    return false;
   sessions.delete(sessionId);
   if(disposed)return false;
   // The server checks actor and session ownership on cancellation.
   const {error}=await traceRpc(db,'cancel_world_motion_v2',{p_session:sessionId},'authority.cancel');
   return !error;
  },
  dispose(){disposed=true;sessions.clear()},
  get sessionCount(){return sessions.size}
 };
}
