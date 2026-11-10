/** 
 * A valid private observer frame may discover a piece that the viewer's last
 * certified roster did not yet include. Re-authorize the roster without
 * blacking out the *already-authorized* static map. This is NOT a permission
 * grant: the unknown piece is never rendered until a fresh server sight RPC.
 *
 * Unknown-piece is the only soft recovery reason. Gap, invalid packet,
 * disconnect, role/map/scene revisions and permission changes all fail closed.
 */
export function mayRetainCertifiedSightOnObserverRecovery({
 reason,scene,frame,painted,rendererAuthorized,sceneStale=false
}={}){
 return reason==='unknown-piece'&&sceneStale===false&&
  rendererAuthorized===true&&!!scene&&!!frame&&!!painted&&
  frame.mapId===scene.mapId&&painted.mapId===scene.mapId&&
  frame.viewerId===painted.viewerId&&
  frame.scope===painted.scope&&
  frame.environmentRevision===scene.revision&&
  painted.environmentRevision===scene.revision&&
  frame.sceneGeneration===scene.sceneGeneration&&
  painted.sceneGeneration===scene.sceneGeneration&&
  frame.permissionGeneration===painted.permissionGeneration&&
  frame.visionEpoch===painted.visionEpoch;
}
