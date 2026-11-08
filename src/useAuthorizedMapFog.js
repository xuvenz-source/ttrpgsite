import {useCallback,useEffect,useRef,useState} from 'react';
import {normalizeAuthorizedFogFrame,fogFrameDuringRefresh} from './MapFogModel.js';
import {createLeadingCoalescedRefresh} from './PerformanceScheduling.js';
import {isFreshVisibilityTick,retainFogSnapshot} from './FogVisibilityContinuity.js';
import {campaignResourceKey,createCampaignRefreshCoordinator} from './CampaignRefreshCoordinator.js';

/** RLS and RPC responses are authoritative; any invalid/unavailable frame
 * leaves the player map obscured until a valid server snapshot arrives. */
export default function useAuthorizedMapFog({db,campaignId,mapId,userId,refreshCoordinator}){
 const [frame,setFrame]=useState(null),[error,setError]=useState(''),
  [published,setPublished]=useState(null);
 const request=useRef(0),validated=useRef(null);
 const ownCoordinator=useRef(null);
 if(!ownCoordinator.current)ownCoordinator.current=createCampaignRefreshCoordinator();
 const coordinator=refreshCoordinator||ownCoordinator.current;
 const key=campaignId&&mapId&&userId?campaignResourceKey({campaignId,mapId,userId,
  resource:'authorized-fog'}):null;
 const refresh=useCallback(async()=>{
  if(!db||!campaignId||!mapId||!userId){
   validated.current=null;setFrame(null);setPublished(null);return;
  }
  const seq=++request.current;
  try{
   const response=await coordinator.request(key,async()=>{
    const {data,error:rpcError}=await db.rpc('get_authorized_map_fog',{p_map:mapId});
    if(rpcError)throw rpcError;
    return data;
   });
   // Visibility may have been revoked while this request was in flight.
   if(!response.current)return;
   const data=response.value;
   const safe=normalizeAuthorizedFogFrame(data,mapId);
   if(!safe)throw Error('Invalid map visibility response.');
   if(seq!==request.current)return;
   validated.current=safe;
   setFrame(previous=>retainFogSnapshot(previous,safe));
   setPublished(previous=>previous?.fog===!!data.enabled&&
    previous?.collision===!!data.collisionEnabled?
     previous:{fog:!!data.enabled,collision:!!data.collisionEnabled});
   setError('');
  }catch(cause){
   if(seq!==request.current)return;
   validated.current=null;
   setFrame(null);setPublished(null);setError(cause?.message||String(cause));
  }
 },[db,campaignId,mapId,userId,key,coordinator]);
 useEffect(()=>{
  validated.current=null;
  setFrame(null);setPublished(null);setError('');
  void refresh();
  if(!db||!campaignId||!mapId||!userId)return;
  // Invalidate in-flight RPCs before the 60ms batched refresh: a stale
  // pre-movement response must never reinstate old visibility permissions.
  // Keep previously explored cells dimmed instead of painting the map black.
  const invalidate=(event)=>{
   // A preview or newer RPC may already have fetched this exact revision.
   // Do not revoke and repaint all visible tokens for an older tick.
   if(!isFreshVisibilityTick(event?.new,validated.current,mapId))return false;
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
  const channel=db.channel('forge-visibility-'+mapId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'map_visibility_ticks',filter:'map_id=eq.'+mapId},event=>{
    if(invalidate(event))changed.request();
   }).subscribe(state=>{
    if(state==='SUBSCRIBED'){
     // The initial/reconnected subscription could have missed a sight
     // change while the previous query was running. Never inherit that query
     // or trust an old permission frame during reconnect.
     ++request.current;
     coordinator.invalidate(key);
     setFrame(previous=>previous?fogFrameDuringRefresh(previous,mapId):previous);
     changed.request();
    }
   });
  const onVisibility=()=>{
   if(document.visibilityState==='visible'){invalidate();changed.flush()}
  };
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   ++request.current;coordinator.invalidate(key);changed.cancel();
   document.removeEventListener('visibilitychange',onVisibility);
   void db.removeChannel(channel);
  };
 },[db,campaignId,mapId,userId,refresh,key,coordinator]);
 return {frame,error,published,refresh};
}
