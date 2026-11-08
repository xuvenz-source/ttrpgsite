// Client reads only permitted map-token columns; npc_values remains private.
export const MAP_TOKEN_SAFE_PROJECTION=
 'id,campaign_id,map_id,owner_id,name,color,x,y,visible,updated_at,npc_template_id,character_id,image_path,span_x,span_y,npc_bars_public,status_effects';

// The server returns private attributes only to a verified campaign DM.
// Keep player snapshots untouched; never synthesize these fields for players.
export function mergeDmNpcValues(safeRows,privateRows){
 const byId=new Map((privateRows||[])
  .filter(row=>row&&typeof row.token_id==='string')
  .map(row=>[row.token_id,row.npc_values??{}]));
 return (safeRows||[]).map(token=>({
  ...token,npc_values:byId.get(token.id)??{}
 }));
}
