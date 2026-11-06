// Ephemeral movement packets are never authoritative. The database controls
// final x/y positions and which token each user may edit.
export const MOVE_PREVIEW_INTERVAL_MS=50;
export const MOVE_PREVIEW_EXPIRE_MS=1200;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const movementTopic=mapId=>'forge-map:'+mapId;
export function allowedMovementPreview(payload,mapId,tokens,members,viewerId){
 if(!payload||payload.mapId!==mapId||!UUID.test(String(payload.id||''))||
    !UUID.test(String(payload.actor||''))||payload.actor===viewerId)return false;
 const t=tokens.find(row=>row.id===payload.id&&row.map_id===mapId);
 if(!t)return false;
 const dm=members.some(member=>member.user_id===payload.actor&&member.role==='dm');
 if(!dm&&t.owner_id!==payload.actor)return false;
 if(!Number.isInteger(payload.x)||!Number.isInteger(payload.y)||
    payload.x<0||payload.y<0||payload.x>10000||payload.y>10000||
    !Number.isSafeInteger(payload.seq)||payload.seq<0)return false;
 return true;
}
export function canSendMovementPreview(token,actor,mapId,isDM){
 return Boolean(token&&token.map_id===mapId&&
  (isDM||token.owner_id===actor));
}
