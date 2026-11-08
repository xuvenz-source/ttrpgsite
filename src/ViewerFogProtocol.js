/** No browser visibility calculation is authorized by this module.
 * A per-viewer stream may be selected only after a server-owned v2 RPC
 * returns a full sanitized frame with its own monotonic viewer revision. */
export function canUseViewerFogProtocol(frame){
 return frame!==null&&typeof frame==='object'&&
  !Array.isArray(frame)&&frame.protocolVersion===2&&
  Number.isSafeInteger(frame.revision)&&frame.revision>=0&&
  typeof frame.enabled==='boolean'&&typeof frame.partyShared==='boolean';
}

/** Missing v2 endpoints are expected while older server deployments exist.
 * NEVER downgrade on authorization, RLS, network, malformed responses or
 * other errors: those must keep the viewer's fog closed. */
export function isMissingViewerFogRpc(error){
 return error?.code==='PGRST202'||error?.code==='42883';
}
