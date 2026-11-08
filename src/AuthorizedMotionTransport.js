// Trusted motion protocol v2: only the server validates and broadcasts
// coordinates; this adapter never sends player-authored position broadcasts.
// One session is cached per map piece and no per-waypoint scene data enters JS.
import {movementDiagnostics} from './MovementDiagnostics.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAuthorizedMotionTransport({db}){
 const sessions=new Map();
 const grants=new Map();
 let disposed=false;
 const keyOf=params=>params.p_kind+':'+params.p_piece;
 async function send({params}){
  if(disposed||!params||!['token','tool'].includes(params.p_kind)||
    !UUID.test(String(params.p_map||''))||
    !UUID.test(String(params.p_piece||'')))return {data:false,error:null};
  const done=movementDiagnostics.begin('movement-preview-rpc');
  const key=keyOf(params);
  let state=sessions.get(key);
  if(!state||state.mapId!==params.p_map){
   state={mapId:params.p_map,kind:params.p_kind,pieceId:params.p_piece,
    sessionId:null,initializing:null,consecutiveRejections:0};
   sessions.set(key,state);
   grants.delete(key);
   state.initializing=db.rpc('begin_map_motion_session',{
    p_map:params.p_map,p_kind:params.p_kind,p_piece:params.p_piece,
    p_ignore_collision:params.p_ignore_collision===true
   }).then(({data,error})=>{
    if(error)throw error;
    if(!UUID.test(String(data?.sessionId||''))||
       data?.mapId!==params.p_map||data?.pieceId!==params.p_piece)
     throw Error('Invalid server motion session');
    state.sessionId=data.sessionId;
    return state.sessionId;
   });
  }
  try{
   const sessionId=state.sessionId||await state.initializing;
   if(disposed||sessions.get(key)!==state)return {data:false,error:null};
   const reply=await db.rpc('advance_map_motion_session',{
    p_session:sessionId,p_x:params.p_x,p_y:params.p_y,p_seq:params.p_seq
   });
   if(reply.error)throw reply.error;
   if(reply.data===true){
    state.consecutiveRejections=0;
    const grant=grants.get(key)||{mapId:params.p_map,sessionId,path:[]};
    if(grant.sessionId!==sessionId){grant.sessionId=sessionId;grant.path=[]}
    const previous=grant.path.at(-1);
    if(!previous||previous.x!==params.p_x||previous.y!==params.p_y){
     grant.path.push({x:params.p_x,y:params.p_y,seq:params.p_seq});
     // Bounded gesture data, even for long-running drag sessions.
     if(grant.path.length>64)grant.path.splice(0,grant.path.length-64);
    }
    grants.set(key,grant);
   }
   else if(++state.consecutiveRejections>=3){
    // A rejected wall sample is NOT a stale session; retain the previous
    // grant so a user can slide along the barrier. Session expiry and final
    // writes remain server-authoritative.
    state.consecutiveRejections=3;
   }
   return reply;
  }catch(error){
   if(sessions.get(key)===state)sessions.delete(key);
   return {data:false,error};
  }finally{done()}
 }
 async function end(mapId,tokenIds=[],toolIssueIds=[]){
  for(const id of tokenIds){sessions.delete('token:'+id);grants.delete('token:'+id)}
  for(const id of toolIssueIds){sessions.delete('tool:'+id);grants.delete('tool:'+id)}
  if(!db||!mapId)return;
  const {error}=await db.rpc('end_map_motion_sessions',{
   p_map:mapId,p_token_ids:tokenIds,p_tool_issue_ids:toolIssueIds
  });
  if(error)throw error;
 }
 return {
  send,end,
  getApproved(mapId,kind,pieceId){
   const grant=grants.get(kind+':'+pieceId);
   return grant?.mapId===mapId?grant.path.at(-1)||null:null;
  },
  getApprovedPath(mapId,kind,pieceId){
   const grant=grants.get(kind+':'+pieceId);
   return grant?.mapId===mapId?[...grant.path]:[];
  },
  dispose(){disposed=true;sessions.clear();grants.clear()},
  get sessionCount(){return sessions.size}
 };
}
