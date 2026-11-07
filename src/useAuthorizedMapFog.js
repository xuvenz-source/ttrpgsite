import {useCallback,useEffect,useRef,useState} from 'react';
import {normalizeAuthorizedFogFrame} from './MapFogModel.js';
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
  // Always obscure the previous frame immediately on a revision; batch only
  // the expensive authorized RPC, never the security invalidation.
  const changed=createCoalescedRefresh(()=>void refresh(),60);
  const channel=db.channel('forge-visibility-'+mapId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'map_visibility_ticks',filter:'map_id=eq.'+mapId},()=>{
    setFrame(null);changed.request();
   }).subscribe(state=>{
    if(state==='SUBSCRIBED')changed.request();
   });
  const onVisibility=()=>{
   if(document.visibilityState==='visible'){setFrame(null);changed.flush()}
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
