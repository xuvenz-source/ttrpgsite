import {toolCanControl} from './CampaignTools.js';
import {validMapMovementPacket} from './LiveMovementPreview.js';
/** Ephemeral public movement packets; the database remains authoritative.
 * The receiver must check campaign membership and tool edit permissions. */
export function allowedToolMovementPreview(payload,mapId,placements,issued,members,viewerId){
 if(!validMapMovementPacket(payload,mapId,viewerId))return false;
 const p=(placements||[]).find(row=>row.issue_id===payload.id&&row.map_id===mapId);
 const issue=(issued||[]).find(row=>row.id===payload.id);
 if(!p)return false;
 const dm=(members||[]).some(member=>member.user_id===payload.actor&&member.role==='dm');
 const member=(members||[]).some(member=>member.user_id===payload.actor);
 // All viewers may trust a known campaign DM's movement of a public map
 // placement; personal issue records are intentionally invisible to others.
 if(!member||(!dm&&!toolCanControl(issue,payload.actor,false)))return false;
 return true;
}
export function canSendToolMovementPreview(issue,actor,isDM,mapId){
 return !!mapId&&toolCanControl(issue,actor,isDM);
}
