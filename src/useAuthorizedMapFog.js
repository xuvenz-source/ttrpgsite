import {useCallback,useEffect,useRef,useState} from 'react';
import {normalizeAuthorizedFogFrame,fogFrameDuringRefresh} from './MapFogModel.js';
import {createCoalescedRefresh} from './PerformanceScheduling.js';

/** RLS and RPC responses are authoritative; any invalid/unavailable frame
 * leaves the player map obscured until a valid server snapshot arrives. */
export default function useAuthorizedMapFog({db,campaignId,mapId,userId}){
 const [frame,setFrame]=useState(null),[error,setError]=useState(''),
  [published,setPublished]=useState(null);
 const request=useRef(0);
 const refresh=useCallback(async()=>{
  if(!db||!campaignId||!mapId||!userId){
   setFrame(null);setPublished(null);return;
  }
  const seq=++request.current;
  try{
   const {data,error:rpcError}=await db.rpc('get_authorized_map_fog',{p_map:mapId});
   if(rpcError)throw rpcError;
   const safe=normalizeAuthorizedFogFrame(data,mapId);
   if(!safe)throw Error('Invalid map visibility response.');
   if(seq!==request.current)return;
   setFrame(safe);
   setPublished({fog:!!data.enabled,collision:!!data.collisionEnabled});
   setError('');
  }catch(cause){
   if(seq!==request.current)return;
   setFrame(null);setPublished(null);setError(cause?.message||String(cause));
  }
 },[db,campaignId,mapId,userId]);
 useEffect(()=>{
  setFrame(null);setPublished(null);setError('');
  void refresh();
  if(!db||!campaignId||!mapId||!userId)return;
  // Invalidate in-flight RPCs before the 60ms batched refresh: a stale
  // pre-movement response must never reinstate old visibility permissions.
  // Keep previously explored cells dimmed instead of painting the map black.
  const invalidate=(event)=>{
   ++request.current;
   // An authoritative fog-off revision never needs a temporary black mask.
   // If fog was enabled before this event, remain fail-closed until RPC.
   // Unknown/older revision payloads also fail closed.
   setFrame(previous=>
    event?.new?.fog_enforced===false&&previous?.enabled===false?
     previous:fogFrameDuringRefresh(previous,mapId));
  };
  const changed=createCoalescedRefresh(()=>void refresh(),60);
  const channel=db.channel('forge-visibility-'+mapId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'map_visibility_ticks',filter:'map_id=eq.'+mapId},event=>{
    invalidate(event);changed.request();
   }).subscribe(state=>{
    if(state==='SUBSCRIBED')changed.request();
   });
  const onVisibility=()=>{
   if(document.visibilityState==='visible'){invalidate();changed.flush()}
  };
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   ++request.current;changed.cancel();
   document.removeEventListener('visibilitychange',onVisibility);
   void db.removeChannel(channel);
  };
 },[db,campaignId,mapId,userId,refresh]);
 return {frame,error,published,refresh};
}
