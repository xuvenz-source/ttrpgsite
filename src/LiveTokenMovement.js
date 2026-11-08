// Ephemeral movement packets are never authoritative. The database controls
// final x/y positions and which token each user may edit.
import {validMapMovementPacket} from './LiveMovementPreview.js';
export const MOVE_PREVIEW_INTERVAL_MS=50;
// Fog-enabled maps cannot use shared preview broadcasts: RLS-authorized
// token writes convey intermediate positions instead at a bounded rate.
export const FOG_DRAG_PERSIST_INTERVAL_MS=180;
export function shouldPersistFogDrag(fogEnabled,lastSent,now){
 return fogEnabled===true&&Number.isFinite(now)&&
  (lastSent===0||now-lastSent>=FOG_DRAG_PERSIST_INTERVAL_MS);
}
export const MOVE_PREVIEW_EXPIRE_MS=1200;
export const movementTopic=mapId=>'forge-map:'+mapId;
/** A delayed RLS snapshot may have been queried BEFORE the newer Realtime
 * coordinate event. Compare database-issued update times, not client clocks;
 * only retain an existing row when that same row remains authorized in the
 * freshly returned snapshot (missing RLS rows must still disappear). */
export function isOlderTokenSnapshot(incoming,current){
 if(!incoming||!current||incoming.id!==current.id)return false;
 const old=Date.parse(incoming.updated_at),now=Date.parse(current.updated_at);
 return Number.isFinite(old)&&Number.isFinite(now)&&old<now;
}
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
   isOlderTokenSnapshot(token,row))return row;
  const updatedAt=token.updated_at||row.updated_at;
  if(row.x===token.x&&row.y===token.y&&row.updated_at===updatedAt)return row;
  changed=true;return {...row,x:token.x,y:token.y,updated_at:updatedAt};
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

/** Realtime snapshots normally allocate new JS rows for every unchanged
 * token. Retain their object identities so a movement tick cannot force every
 * token monitor/art surface to rerender. Do not hide newly observed rows or
 * retain rows omitted by the current RLS-filtered query. */
export function reconcileTokenSnapshot(previous,incoming){
 const existing=new Map((previous||[]).map(token=>[token.id,token]));
 let changed=(previous||[]).length!==incoming.length;
 const next=incoming.map((token,index)=>{
  const before=existing.get(token.id);
  if(!before){changed=true;return token}
  // A slow RLS fetch may finish after a newer movement event has already
  // painted this SAME still-authorized token. Keep the newer row instead of
  // sending its sprite backwards (but do not retain omitted RLS rows).
  if(isOlderTokenSnapshot(token,before)){
   if(before!==previous[index])changed=true;
   return before;
  }
  const keys=Object.keys(token);
  const stable=keys.length===Object.keys(before).length&&keys.every(key=>{
   const a=before[key],b=token[key];
   return a===b||(a&&b&&typeof a==='object'&&typeof b==='object'&&
    JSON.stringify(a)===JSON.stringify(b));
  });
  const item=stable?before:token;
  if(item!==previous[index])changed=true;
  return item;
 });
 return changed?next:previous;
}
/** Only a known, already-rendered token's coordinate-only update may skip
 * the immediate whole-map background fetch. All other updates reconcile.
 * The whitelist excludes transient DB columns such as updated_at. */
export function isPositionOnlyTokenEvent(event,rows,mapId){
 if(event?.eventType!=='UPDATE'||event.new?.map_id!==mapId||
   !Number.isSafeInteger(event.new.x)||!Number.isSafeInteger(event.new.y))return false;
 const current=rows.find(t=>t.id===event.new.id);
 if(!current||current.map_id!==mapId)return false;
 if(current.x===event.new.x&&current.y===event.new.y)return false;
 for(const [key,value] of Object.entries(current)){
  if(['x','y','updated_at'].includes(key))continue;
  if(!Object.hasOwn(event.new,key))return false;
  const next=event.new[key];
  if(value!==next&&JSON.stringify(value)!==JSON.stringify(next))return false;
 }
 return true;
}
