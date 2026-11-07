// Ephemeral movement packets are never authoritative. The database controls
// final x/y positions and which token each user may edit.
import {validMapMovementPacket} from './LiveMovementPreview.js';
export const MOVE_PREVIEW_INTERVAL_MS=50;
export const MOVE_PREVIEW_EXPIRE_MS=1200;
export const movementTopic=mapId=>'forge-map:'+mapId;
export function allowedMovementPreview(payload,mapId,tokens,members,viewerId){
 if(!validMapMovementPacket(payload,mapId,viewerId))return false;
 const t=tokens.find(row=>row.id===payload.id&&row.map_id===mapId);
 if(!t)return false;
 const dm=members.some(member=>member.user_id===payload.actor&&member.role==='dm');
 if(!dm&&t.owner_id!==payload.actor)return false;

 return true;
}
export function canSendMovementPreview(token,actor,mapId,isDM){
 return Boolean(token&&token.map_id===mapId&&
  (isDM||token.owner_id===actor));
}
