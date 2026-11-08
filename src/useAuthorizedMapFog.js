import {useCallback,useEffect,useRef,useState} from 'react';
import {normalizeAuthorizedFogFrame,fogFrameDuringRefresh} from './MapFogModel.js';
import {createLeadingCoalescedRefresh} from './PerformanceScheduling.js';
import {isFreshVisibilityTick,retainFogSnapshot} from './FogVisibilityContinuity.js';
import {campaignResourceKey,createCampaignRefreshCoordinator} from './CampaignRefreshCoordinator.js';
import {canUseViewerFogProtocol,isMissingViewerFogRpc} from './ViewerFogProtocol.js';

/** RLS and RPC responses are authoritative; any invalid/unavailable frame
 * leaves the player map obscured until a valid server snapshot arrives. */
export default function useAuthorizedMapFog({db,campaignId,mapId,userId,isDM=false,refreshCoordinator}){
 const [frame,setFrame]=useState(null),[error,setError]=useState(''),
  [published,setPublished]=useState(null);
 const request=useRef(0),validated=useRef(null),pendingTick=useRef(null);
 // A v2 RPC proves the server supports private per-viewer revisions.
 // Older deployments stay on the global subscription and original RPC.
 const [scope,setScope]=useState('global');
 const viewerRpcSupported=useRef(null);
 const ownCoordinator=useRef(null);
 if(!ownCoordinator.current)ownCoordinator.current=createCampaignRefreshCoordinator();
 const coordinator=refreshCoordinator||ownCoordinator.current;
 const key=campaignId&&mapId&&userId?campaignResourceKey({campaignId,mapId,userId,
  resource:'authorized-fog'}):null;
 const refresh=useCallback(async(fresh=false)=>{
  if(!db||!campaignId||!mapId||!userId){
   validated.current=null;pendingTick.current=null;setFrame(null);setPublished(null);return;
  }
  const seq=++request.current;
  // Accepted observer previews and published scene changes can update sight
  // without a new visibility tick: they must bypass older in-flight frames.
  if(fresh===true)coordinator.invalidate(key);
  try{
   const response=await coordinator.request(key,async()=>{
    if(!isDM&&viewerRpcSupported.current!==false){
     const {data,error:viewerError}=await db.rpc('get_authorized_map_fog_v2',
      {p_map:mapId});
     if(!viewerError){
      // Never silently accept an unversioned result in the new protocol.
      if(!canUseViewerFogProtocol(data))throw Error('Invalid viewer fog protocol');
      return {data,viewer:true};
     }
     // Only an actually missing RPC may use the original safe protocol.
     // Unauthorized/failed v2 RPCs still fail closed.
     if(!isMissingViewerFogRpc(viewerError))throw viewerError;
     viewerRpcSupported.current=false;
    }
    const {data,error:rpcError}=await db.rpc('get_authorized_map_fog',{p_map:mapId});
    if(rpcError)throw rpcError;
    return {data,viewer:false};
   });
   // Visibility may have been revoked while this request was in flight.
   if(!response.current)return;
   const {data,viewer}=response.value;
   const safe=normalizeAuthorizedFogFrame(data,mapId);
   if(!safe)throw Error('Invalid map visibility response.');
   if(seq!==request.current)return;
   if(viewer)viewerRpcSupported.current=true;
   setScope(previous=>previous===(viewer?'viewer':'global')?
    previous:viewer?'viewer':'global');
   validated.current=safe;
   pendingTick.current=null;
   setFrame(previous=>retainFogSnapshot(previous,safe));
   setPublished(previous=>previous?.fog===!!data.enabled&&
    previous?.collision===!!data.collisionEnabled?
     previous:{fog:!!data.enabled,collision:!!data.collisionEnabled});
   setError('');
  }catch(cause){
   if(seq!==request.current)return;
   validated.current=null;
   pendingTick.current=null;
   setFrame(null);setPublished(null);setError(cause?.message||String(cause));
  }
 },[db,campaignId,mapId,userId,isDM,key,coordinator]);
 useEffect(()=>{
  validated.current=null;pendingTick.current=null;
  setFrame(null);setPublished(null);setError('');
  void refresh();
  if(!db||!campaignId||!mapId||!userId)return;
  // Invalidate in-flight RPCs before the 60ms batched refresh: a stale
  // pre-movement response must never reinstate old visibility permissions.
  // Keep previously explored cells dimmed instead of painting the map black.
  const invalidate=(event)=>{
   // A preview or newer RPC may already have fetched this exact revision.
   // Do not revoke and repaint all visible tokens for an older tick.
   const tick=event?.new;
   if(!isFreshVisibilityTick(tick,validated.current,mapId,
     pendingTick.current))return false;
   const revision=Number(tick?.revision);
   pendingTick.current=Number.isSafeInteger(revision)&&revision>=0&&
    typeof tick?.fog_enforced==='boolean'?
     {mapId,revision,fogEnforced:tick.fog_enforced}:null;
   ++request.current;
   coordinator.invalidate(key);
   // An authoritative fog-off revision never needs a temporary black mask.
   // If fog was enabled before this event, remain fail-closed until RPC.
   // Unknown/older revision payloads also fail closed.
   setFrame(previous=>
    event?.new?.fog_enforced===false&&previous?.enabled===false?
     previous:fogFrameDuringRefresh(previous,mapId));
   return true;
  };
  // Sight is already revoked by invalidate(). Do not add 60ms of avoidable
  // blank-token time before the first authorization request is sent.
  const changed=createLeadingCoalescedRefresh(()=>void refresh(),60);
  const viewerScope=scope==='viewer';
  const channel=db.channel('forge-visibility-'+mapId+'-'+userId+
    (viewerScope?'-viewer':''));
  const handleRevision=event=>{
   if(viewerScope&&event?.new&&
    (event.new.map_id!==mapId||event.new.user_id!==userId))return;
   // Hidden tabs revoke stale sight immediately, reauthorize on return.
   if(invalidate(event)&&document.visibilityState==='visible')changed.request();
  };
  if(viewerScope){
   // Realtime DELETE bypasses row-level authorization. Never subscribe to
   // DELETE on the private per-user revision table: INSERT and UPDATE alone
   // cover all supported revision invalidations; focus/reconnect revalidates.
   channel.on('postgres_changes',{event:'INSERT',schema:'public',
    table:'map_viewer_visibility_ticks',filter:'user_id=eq.'+userId},handleRevision)
    .on('postgres_changes',{event:'UPDATE',schema:'public',
     table:'map_viewer_visibility_ticks',filter:'user_id=eq.'+userId},handleRevision);
  }else{
   channel.on('postgres_changes',{event:'*',schema:'public',
    table:'map_visibility_ticks',filter:'map_id=eq.'+mapId},handleRevision);
  }
  channel.subscribe(state=>{
    if(state==='SUBSCRIBED'){
     // The initial/reconnected subscription could have missed a sight
     // change while the previous query was running. Never inherit that query
     // or trust an old permission frame during reconnect.
     ++request.current;
     coordinator.invalidate(key);
     setFrame(previous=>previous?fogFrameDuringRefresh(previous,mapId):previous);
     if(document.visibilityState==='visible')changed.request();
    }else if(viewerScope&&
     (state==='CHANNEL_ERROR'||state==='TIMED_OUT')){
     // Safe downgrade if the new publication is absent or a reconnect fails.
     // This never reuses stale sight; legacy global events remain authoritative.
     ++request.current;
     coordinator.invalidate(key);
     setFrame(previous=>previous?fogFrameDuringRefresh(previous,mapId):previous);
     viewerRpcSupported.current=false;
     setScope('global');
    }
   });
  const onVisibility=()=>{
   if(document.visibilityState==='visible'){invalidate();changed.flush()}
  };
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   ++request.current;pendingTick.current=null;coordinator.invalidate(key);changed.cancel();
   document.removeEventListener('visibilitychange',onVisibility);
   void db.removeChannel(channel);
  };
 },[db,campaignId,mapId,userId,refresh,key,coordinator,scope]);
 return {frame,error,published,refresh};
}
