// Trusted motion protocol v2: only the server validates and broadcasts
// coordinates; this adapter never sends player-authored position broadcasts.
// One session is cached per map piece and no per-waypoint scene data enters JS.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAuthorizedMotionTransport({db}){
 const sessions=new Map();
 let disposed=false;
 const keyOf=params=>params.p_kind+':'+params.p_piece;
 async function send({params}){
  if(disposed||!params||!['token','tool'].includes(params.p_kind)||
    !UUID.test(String(params.p_map||''))||
    !UUID.test(String(params.p_piece||'')))return {data:false,error:null};
  const key=keyOf(params);
  let state=sessions.get(key);
  if(!state||state.mapId!==params.p_map){
   state={mapId:params.p_map,kind:params.p_kind,pieceId:params.p_piece,
    sessionId:null,initializing:null,consecutiveRejections:0};
   sessions.set(key,state);
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
   if(reply.data===true)state.consecutiveRejections=0;
   else if(++state.consecutiveRejections>=3) {
    // A stale/invalid session may not recover after a geometry/owner change.
    // Never treat it as permission; the next packet must obtain a NEW grant.
    sessions.delete(key);
   }
   return reply;
  }catch(error){
   if(sessions.get(key)===state)sessions.delete(key);
   return {data:false,error};
  }
 }
 async function end(mapId,tokenIds=[],toolIssueIds=[]){
  for(const id of tokenIds)sessions.delete('token:'+id);
  for(const id of toolIssueIds)sessions.delete('tool:'+id);
  if(!db||!mapId)return;
  const {error}=await db.rpc('end_map_motion_sessions',{
   p_map:mapId,p_token_ids:tokenIds,p_tool_issue_ids:toolIssueIds
  });
  if(error)throw error;
 }
 return {
  send,end,
  dispose(){disposed=true;sessions.clear()},
  get sessionCount(){return sessions.size}
 };
}
