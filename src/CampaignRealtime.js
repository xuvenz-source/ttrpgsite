/** Public Realtime Presence conveys only an opaque, campaign-scoped key.
 * Never put account IDs, emails, names or tokens in presence payloads.
 * Viewers resolve those keys only against RLS-authorised campaign members.
 */
export async function campaignPresenceKey(campaignId,userId){
 if(!campaignId||!userId)return '';
 const bytes=new TextEncoder().encode('tabletop-presence-v1:'+campaignId+':'+userId);
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function onlineMemberIds(members,keyByMember,presenceKeys){
 const online=new Set(presenceKeys||[]);
 return (members||[]).filter(member=>
  !!keyByMember?.[member.user_id]&&online.has(keyByMember[member.user_id]))
  .map(member=>member.user_id);
}
export function chatRowsForMap(rows,mapId){
 return (rows||[]).filter(row=>(row.map_id||null)===(mapId||null));
}
