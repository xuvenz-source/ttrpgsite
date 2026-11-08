/**
 * Keep only sprites that this viewer has actually been allowed to see.
 * A fog invalidation may revoke visibility immediately, but must not destroy
 * artwork nodes and reload EVERY token image when the next frame arrives.
 *
 * Rows omitted by the latest RLS response are removed immediately; previously
 * unseen NPCs are never instantiated or preloaded while behind fog.
 */
export function stableTokenPresentation(rows,authorized,previousSeen,mapId){
 const allowed=new Set((authorized||[]).map(token=>token.id));
 const seen=new Set(previousSeen||[]);
 const existing=new Set();
 for(const token of rows||[])
  if(token?.map_id===mapId&&token.visible!==false)existing.add(token.id);
 for(const id of seen)if(!existing.has(id))seen.delete(id);
 for(const id of allowed)if(existing.has(id))seen.add(id);
 const displayed=(rows||[]).filter(token=>seen.has(token.id)&&
  token.map_id===mapId&&token.visible!==false);
 const concealed=new Set(displayed.filter(token=>!allowed.has(token.id))
  .map(token=>token.id));
 return {displayed,concealed,seen};
}
