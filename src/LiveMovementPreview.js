/** Validate only the shared packet envelope. Membership and permission
 * decisions still belong to each token/tool receiver and the server.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validMapMovementPacket(payload,mapId,viewerId){
 return !!payload&&payload.mapId===mapId&&payload.actor!==viewerId&&
  UUID.test(String(payload.id||''))&&UUID.test(String(payload.actor||''))&&
  Number.isSafeInteger(payload.seq)&&payload.seq>=0&&
  Number.isInteger(payload.x)&&Number.isInteger(payload.y)&&
  payload.x>=0&&payload.y>=0&&payload.x<=10000&&payload.y<=10000;
}
