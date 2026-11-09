/**
 * Pure decision: should a new RLS-authorized token snapshot invalidate the
 * independent monitor and encumbrance RPCs?
 *
 * Position changes do not affect either resource. A new/removed token or a
 * change to the token metadata controlling access/monitor visibility does.
 * This is NOT an authorization check: only server RLS-filtered rows may be
 * passed as 'current'. Never synthesize rows from a movement preview.
 */
const derivedFields=['map_id','character_id','owner_id','visible','npc_bars_public'];
/** Do NOT treat movement, status or artwork changes as a reason to recompute
 * character-derived HUD stats. Missing/revoked RLS rows and NPC values
 * always invalidate conservatively. Never grant visibility from this helper. */
export function tokenEventMayAffectDerivedResources(event,rows,mapId){
 if(event?.eventType!=='UPDATE'||!Array.isArray(rows)||!mapId)return true;
 const next=event.new;
 if(!next||next.map_id!==mapId||typeof next.id!=='string')return true;
 const prior=rows.find(row=>row?.id===next.id&&row.map_id===mapId);
 if(!prior)return true;
 for(const field of ['map_id','campaign_id','character_id','owner_id',
  'visible','npc_bars_public']){
  if(!Object.hasOwn(next,field)||!Object.hasOwn(prior,field))return true;
  if(JSON.stringify(next[field])!==JSON.stringify(prior[field]))return true;
 }
 if(next.character_id===null){
  if(!Object.hasOwn(next,'npc_values')||
     !Object.hasOwn(prior,'npc_values'))return true;
  if(JSON.stringify(next.npc_values)!==JSON.stringify(prior.npc_values))
   return true;
 }
 return false;
}

export function authorizedTokenDerivedInputsChanged(previous,current,mapId){
 if(!Array.isArray(previous)||!Array.isArray(current)||!mapId)return true;
 const before=new Map();
 for(const token of previous){
  if(!token||typeof token.id!=='string'||token.map_id!==mapId)return true;
  before.set(token.id,token);
 }
 if(before.size!==previous.length||before.size!==current.length)return true;
 const seen=new Set();
 for(const token of current){
  if(!token||typeof token.id!=='string'||token.map_id!==mapId||
    seen.has(token.id))return true;
  seen.add(token.id);
  const old=before.get(token.id);
  if(!old||derivedFields.some(key=>old[key]!==token[key]))return true;
 }
 return false;
}
