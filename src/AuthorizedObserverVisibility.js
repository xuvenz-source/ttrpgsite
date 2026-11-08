import {tokenObservedByFogFrame} from './MapFogModel.js';

/** Private observer hide markers are authorization revocations, never timers.
 * A newer server-authorized fog snapshot and a newly fetched RLS roster must
 * BOTH grant the entity before a stationary token may return.
 */
export function clearVerifiedHiddenTokens(hidden,rows,frame,viewerId){
 if(!frame||frame.displayVisibleDuringRefresh||!Number.isSafeInteger(frame.revision)||
    !Array.isArray(rows))return hidden;
 const byId=new Map(rows.map(row=>[row.id,row]));
 let changed=false;
 const next={...hidden};
 for(const [id,marker] of Object.entries(hidden||{})){
  if(!marker?.hidden||marker.kind==='tool')continue;
  // A response that predates the hide cannot be used to reverse it.
  if(!Number.isSafeInteger(marker.fogRevision)||
     frame.revision<=marker.fogRevision)continue;
  const token=byId.get(id);
  // A later fresh RLS roster omitting this entity proves there is no sprite
  // to uncover. Retire the marker so large maps don't retain dead hide state.
  if(!token){delete next[id];changed=true;continue}
  if(token.map_id!==frame.mapId||token.visible!==true||
     !tokenObservedByFogFrame(token,frame,viewerId))continue;
  delete next[id];changed=true;
 }
 return changed?next:hidden;
}

/** Placed tools use their independently RLS-filtered read. A new revision
 * cannot be inferred from a local timeout or an old React state snapshot. */
export function clearVerifiedHiddenTools(hidden,rows,frame){
 if(!frame||frame.displayVisibleDuringRefresh||!Number.isSafeInteger(frame.revision)||
    !Array.isArray(rows))return hidden;
 let changed=false;
 const next={...hidden};
 for(const [id,marker] of Object.entries(hidden||{})){
  if(!marker?.hidden||!Number.isSafeInteger(marker.fogRevision)||
     frame.revision<=marker.fogRevision)continue;
  // Missing from a post-revision RLS result is safe to forget; available
  // tools only become visible when the newly returned row authorizes them.
  delete next[id];changed=true;
 }
 return changed?next:hidden;
}
