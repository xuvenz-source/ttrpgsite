import {toolCanControl} from './CampaignTools.js';
import {MOVE_PREVIEW_INTERVAL_MS,MOVE_PREVIEW_EXPIRE_MS} from './LiveTokenMovement.js';
export const TOOL_MOVE_PREVIEW_INTERVAL_MS=MOVE_PREVIEW_INTERVAL_MS;
export const TOOL_MOVE_PREVIEW_EXPIRE_MS=MOVE_PREVIEW_EXPIRE_MS;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Remote previews are never authoritative; the live Supabase row decides the
 * final destination. Only display previews for authorized, visible tools.
 */
export function allowedToolMovementPreview(payload,mapId,placements,issued,members,viewerId){
 if(!payload||payload.mapId!==mapId||
    !UUID.test(String(payload.id||''))||!UUID.test(String(payload.actor||''))||
    payload.actor===viewerId||!Number.isSafeInteger(payload.seq)||payload.seq<0||
    !Number.isInteger(payload.x)||!Number.isInteger(payload.y)||
    payload.x<0||payload.y<0||payload.x>10000||payload.y>10000)return false;
 const placed=(placements||[]).find(p=>p.issue_id===payload.id&&p.map_id===mapId);
 const tool=(issued||[]).find(t=>t.id===payload.id);
 const actor=(members||[]).find(m=>m.user_id===payload.actor);
 return !!(placed&&tool&&actor&&toolCanControl(tool,payload.actor,actor.role==='dm'));
}
export function canSendToolMovementPreview(placement,tool,actor,mapId,isDM){
 return !!(placement&&placement.map_id===mapId&&
  tool?.id===placement.issue_id&&toolCanControl(tool,actor,isDM));
}
