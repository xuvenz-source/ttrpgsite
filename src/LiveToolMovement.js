import {toolCanControl} from './CampaignTools.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ephemeral public movement packets; the database remains authoritative.
 * The receiver must check campaign membership and tool edit permissions. */
export function allowedToolMovementPreview(payload,mapId,placements,issued,members,viewerId){
 if(!payload||payload.mapId!==mapId||payload.actor===viewerId||
  !UUID.test(String(payload.id||''))||!UUID.test(String(payload.actor||''))||
  !Number.isSafeInteger(payload.seq)||payload.seq<0||
  !Number.isInteger(payload.x)||!Number.isInteger(payload.y)||
  payload.x<0||payload.y<0||payload.x>10000||payload.y>10000)
  return false;
 const p=(placements||[]).find(row=>row.issue_id===payload.id&&row.map_id===mapId);
 const issue=(issued||[]).find(row=>row.id===payload.id);
 if(!p||!issue)return false;
 const dm=(members||[]).some(member=>member.user_id===payload.actor&&member.role==='dm');
 const member=(members||[]).some(member=>member.user_id===payload.actor);
 if(!member||!toolCanControl(issue,payload.actor,dm))return false;
 return true;
}
export function canSendToolMovementPreview(issue,actor,isDM,mapId){
 return !!mapId&&toolCanControl(issue,actor,isDM);
}
