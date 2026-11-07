// Ephemeral movement packets are never authoritative. The database controls
// final x/y positions and which token each user may edit.
import {validMapMovementPacket} from './LiveMovementPreview.js';
export const MOVE_PREVIEW_INTERVAL_MS=50;
export const MOVE_PREVIEW_EXPIRE_MS=1200;
export const movementTopic=mapId=>'forge-map:'+mapId;
/** Apply RLS-authorized Realtime coordinates immediately without remounting
 * the entire board. Never override an in-flight optimistic local move.
 */
export function applyAuthoritativeTokenMotion(rows,event,mapId,pending=new Map()){
 const token=event?.new;
 if(event?.eventType!=='UPDATE'||!mapId||token?.map_id!==mapId||
  typeof token.id!=='string'||!Number.isSafeInteger(token.x)||
  !Number.isSafeInteger(token.y)||token.x<0||token.y<0||
  pending.has(token.id))return rows;
 let changed=false;
 const next=rows.map(row=>{
  if(row.id!==token.id||row.map_id!==mapId||
   (row.x===token.x&&row.y===token.y))return row;
  changed=true;return {...row,x:token.x,y:token.y};
 });
 return changed?next:rows;
}
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
