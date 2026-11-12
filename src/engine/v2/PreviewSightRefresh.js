/**
 * R18-14: local DM preview requests a player-effective sight RPC ONLY
 * when the collision-approved virtual token identity/position changes.
 *
 * A blocked movement ACK may include an accepted prefix: never infer
 * "blocked" means "no movement". Compare the approved endpoint instead.
 * The runtime still performs an explicit final preview sight refresh
 * on commit and all existing permission/scene revocation paths remain.
 *
 * Preview positioning is purely local. This helper does not authorize
 * pieces, alter fog data or call a player movement RPC.
 */
export function previewApprovedPositionChanged(previous,tokenId,approved){
 if(typeof tokenId!=='string'||!tokenId||
  !Number.isSafeInteger(approved?.x)||
  !Number.isSafeInteger(approved?.y))
  throw Error('Invalid approved preview pose');
 return !previous||previous.tokenId!==tokenId||
  previous.x!==approved.x||previous.y!==approved.y;
}
