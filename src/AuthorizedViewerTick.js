import {applyAuthorizedFogEnvelope} from './AuthorizedFogDelta.js';

/**
 * Postgres only publishes this field on each viewer's RLS-protected private
 * revision row. It contains no geometry or entity identifiers. Reject a
 * missing/broken/out-of-order packet; the fog hook fails closed and refetches.
 */
export function adoptVerifiedViewerTick(previous,tick,mapId,userId){
 if(!tick||tick.map_id!==mapId||tick.user_id!==userId||
  !Number.isSafeInteger(tick.revision)||tick.revision<0||
  typeof tick.fog_enforced!=='boolean'||
  !tick.authorized_frame||typeof tick.authorized_frame!=='object')
  return null;
 const accepted=applyAuthorizedFogEnvelope(previous,tick.authorized_frame,mapId);
 if(!accepted||accepted.protocolVersion!==2||
  accepted.revision!==tick.revision||
  accepted.enabled!==tick.fog_enforced||
  (previous?.mapId===mapId&&accepted.revision<previous.revision))
  return null;
 return accepted;
}
