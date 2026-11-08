/** Pure helpers for rendering only confirmed per-viewer fog revisions.
 * These checks never grant visibility or trust a client-authored sight frame. */
export function isFreshVisibilityTick(tick,confirmed,mapId,pending=null){
 // A repeated or older tick already queued for reauthorization must not
 // cancel that same in-flight request. A higher revision or fog-mode change
 // still fails closed immediately.
 const revision=Number(tick?.revision);
 const wellFormed=Number.isSafeInteger(revision)&&revision>=0&&
  typeof tick?.fog_enforced==='boolean';
 if(wellFormed&&pending?.mapId===mapId&&
    pending.fogEnforced===tick.fog_enforced&&
    revision<=pending.revision)return false;
 // Unknown/unversioned events fail closed just as before.
 if(!confirmed||confirmed.mapId!==mapId||!wellFormed)return true;
 // A matching or older tick already covered by a confirmed authorized RPC
 // cannot revoke sight again. A fog mode toggle always requires refresh.
 return tick.fog_enforced!==confirmed.enabled||
  revision>confirmed.revision;
}
const sameIndices=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
 a.length===b.length&&a.every((id,index)=>id===b[index]);
/** Avoid rebinding token art and fog canvases when a periodic RPC proves
 * exactly the same visibility. Pending frames must still be replaced by the
 * fresh server snapshot, even if their revision number matches. */
export function retainFogSnapshot(previous,next){
 if(!previous||!next||previous.mapId!==next.mapId||
  Object.hasOwn(previous,'displayVisibleDuringRefresh'))return next;
 return previous.revision===next.revision&&
  previous.protocolVersion===next.protocolVersion&&
  previous.deltaProtocolVersion===next.deltaProtocolVersion&&
  previous.epoch===next.epoch&&previous.sequence===next.sequence&&
  previous.enabled===next.enabled&&
  previous.partyShared===next.partyShared&&
  previous.collisionEnabled===next.collisionEnabled&&
  previous.navigationEnvironmentRevision===next.navigationEnvironmentRevision&&
  previous.width===next.width&&previous.height===next.height&&
  sameIndices(previous.visible,next.visible)&&
  sameIndices(previous.explored,next.explored)?previous:next;
}
