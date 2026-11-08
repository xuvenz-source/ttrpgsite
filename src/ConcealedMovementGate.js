/** A hidden-wall-safe gesture requests only the next adjacent movement.
 * The server owns every collision, group and permission decision. Browser
 * state never contains untraversed passability, raw walls or secret-door data.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const needsConcealedStep=(frame,isDM)=>
 !isDM&&frame?.protocolVersion===2&&frame?.collisionEnabled===true;

export function nextConcealedStep(previous,requested){
 const values=[previous?.dx,previous?.dy,requested?.dx,requested?.dy];
 if(!values.every(Number.isSafeInteger))return null;
 const dx=Math.sign(requested.dx-previous.dx);
 const dy=Math.sign(requested.dy-previous.dy);
 if(!dx&&!dy)return null;
 const x=previous.dx+dx,y=previous.dy+dy;
 if(Math.abs(x)>12||Math.abs(y)>12)return null;
 return {dx:x,dy:y};
}

export function createConcealedMovementGate({db}){
 let disposed=false;
 return {
  async begin(mapId,tokenIds=[],toolIssueIds=[]){
   if(disposed||!UUID.test(String(mapId))||!Array.isArray(tokenIds)||
    !Array.isArray(toolIssueIds)||!tokenIds.concat(toolIssueIds).length||
    !tokenIds.concat(toolIssueIds).every(id=>UUID.test(String(id))))
    throw Error('Invalid concealed movement gesture');
   const {data,error}=await db.rpc('begin_authorized_navigation_gesture',{
    p_map:mapId,p_token_ids:tokenIds,p_tool_issue_ids:toolIssueIds
   });
   if(error)throw error;
   if(!UUID.test(String(data?.sessionId)))throw Error('No secure movement session');
   if(disposed){
    void db.rpc('end_authorized_navigation_gesture',{
     p_session:data.sessionId
    });
    throw Error('Movement session disposed');
   }
   return data.sessionId;
  },
  async approve(sessionId,point,seq){
   if(disposed||!UUID.test(String(sessionId))||
    !Number.isSafeInteger(point?.dx)||!Number.isSafeInteger(point?.dy)||
    !Number.isSafeInteger(seq)||seq<1)return false;
   const {data,error}=await db.rpc('advance_authorized_navigation_gesture',{
    p_session:sessionId,p_dx:point.dx,p_dy:point.dy,p_seq:seq
   });
   if(error)throw error;
   return !disposed&&data===true;
  },
  async end(sessionId){
   if(!UUID.test(String(sessionId)))return;
   const {error}=await db.rpc('end_authorized_navigation_gesture',{
    p_session:sessionId
   });
   if(error)throw error;
  },
  dispose(){disposed=true}
 };
}
