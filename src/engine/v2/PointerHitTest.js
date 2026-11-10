/** World Engine V2: safe pointer fallback for visual overlays.
 * A position never grants identity: only the current server-authorized
 * roster may be picked, and local control is checked again before moving.
 */
import {canControlMapToken} from '../../MapSelection.js';
import {toolCanControl} from '../../CampaignTools.js';

const within=(point,x,y,w,h)=>
 point.x>=x&&point.y>=y&&point.x<x+w&&point.y<y+h;
export function pickAuthorizedWorldPiece({
 point,visiblePieces=[],tokens=[],toolPlacements=[],toolIssued=[],
 user,isDM=false,mapId
}={}){
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||
  !Array.isArray(visiblePieces)||!mapId)return null;
 const tokenMap=new Map(tokens.map(t=>[t.id,t]));
 const toolMap=new Map(toolPlacements.map(p=>[p.issue_id,p]));
 const issueMap=new Map(toolIssued.map(p=>[p.id,p]));
 // Tokens visually stack above placed tools; newest visible token wins
 // for overlapping footprints. Never consult an unauthorized row's position.
 for(const kind of ['token','tool']){
  for(let i=visiblePieces.length-1;i>=0;i--){
   const piece=visiblePieces[i];
   if(piece?.kind!==kind||!Number.isFinite(piece.x)||
    !Number.isFinite(piece.y))continue;
   const meta=kind==='token'?tokenMap.get(piece.id):toolMap.get(piece.id);
   if(!meta)continue;
   if(kind==='token'){
    if(!canControlMapToken(meta,user,isDM,mapId))continue;
   }else if(meta.map_id!==mapId||meta.held_by_token_id||
    !toolCanControl(issueMap.get(piece.id),user,isDM))continue;
   const w=Number(kind==='token'?meta.span_x??1:meta.span??1);
   const h=Number(kind==='token'?meta.span_y??1:meta.span??1);
   if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)continue;
   if(within(point,piece.x,piece.y,w,h))
    return {kind,id:piece.id};
  }
 }
 return null;
}
