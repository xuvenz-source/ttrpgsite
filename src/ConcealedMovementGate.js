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
  async approveBatch(sessionId,targets,seq,origin={dx:0,dy:0}){
   if(disposed||!UUID.test(String(sessionId))||!Array.isArray(targets)||
      targets.length<1||targets.length>12||!Number.isSafeInteger(seq)||
      seq<1||!Number.isSafeInteger(origin?.dx)||!Number.isSafeInteger(origin?.dy)||
      targets.some(p=>!Number.isSafeInteger(p?.dx)||
       !Number.isSafeInteger(p?.dy)||Math.abs(p.dx)>128||Math.abs(p.dy)>128))
    throw Error('Invalid secure movement batch');
   const {data,error}=await db.rpc('advance_authorized_navigation_gesture_batch',{
    p_session:sessionId,p_targets:targets,p_seq:seq
   });
   if(error)throw error;
   if(disposed)return null;
   // This allowlist is intentionally stricter than the database response.
   if(!data||data.version!==1||data.seq!==seq||
      typeof data.blocked!=='boolean'||!Array.isArray(data.approved)||
      data.approved.length>48||
      Object.keys(data).some(k=>!['version','seq','blocked','approved'].includes(k)))
    throw Error('Invalid secure movement acknowledgement');
   let at=origin;
   for(const point of data.approved){
    if(!Number.isSafeInteger(point?.dx)||!Number.isSafeInteger(point?.dy)||
       Object.keys(point).some(k=>!['dx','dy'].includes(k))||
       Math.max(Math.abs(point.dx-at.dx),Math.abs(point.dy-at.dy))!==1)
     throw Error('Invalid secure movement path');
    at=point;
   }
   if(!data.blocked&&data.approved.length===0)
    throw Error('Empty secure movement acknowledgement');
   return {approved:data.approved,blocked:data.blocked};
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
