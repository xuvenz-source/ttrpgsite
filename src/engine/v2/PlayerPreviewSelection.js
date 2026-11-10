/** DM preview must model a real campaign player, not a DM/unassigned actor.
 * Pure identity filtering; the runtime still enforces server-owned sight and
 * ownership when movement is requested.
 */
export function eligiblePlayerPreviewTokens({tokens=[],members=[],
 mapId,dmUserId}={}){
 if(typeof mapId!=='string'||typeof dmUserId!=='string'||
  !Array.isArray(tokens)||!Array.isArray(members))return [];
 const players=new Set(members.filter(member=>member?.role==='player')
  .map(member=>member.user_id)
  .filter(id=>typeof id==='string'&&id&&id!==dmUserId));
 return tokens.filter(token=>token?.map_id===mapId&&
  token.visible!==false&&players.has(token.owner_id));
}
export function chosenPlayerPreviewTokenId(tokens,requested){
 if(!Array.isArray(tokens))return '';
 return tokens.some(token=>token?.id===requested)?
  requested:tokens[0]?.id||'';
}
