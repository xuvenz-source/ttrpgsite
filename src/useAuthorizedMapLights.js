import {useEffect,useState} from 'react';
import {normalizeAuthorizedLightMasks} from './AuthorizedLightMasks.js';

/** Lighting is a view of published server terrain, not prepared DM geometry.
 * Any failed or stale RPC removes player light rather than showing unoccluded
 * radial gradients through walls. DM previews render from prepared geometry.
 */
export default function useAuthorizedMapLights({db,mapId,userId,revision,protocolVersion=1,refreshNonce,enabled=true}){
 const [result,setResult]=useState(null);
 useEffect(()=>{
  let cancelled=false;
  setResult(null);
  if(!enabled||!db||!mapId||!userId||!Number.isSafeInteger(revision))return;
  // Per-player fog revisions must only be compared against per-player light
  // revisions. Do not fall back from v2 on RPC errors: that could accept a
  // stale global-revision result and draw unauthorized lighting.
  const rpc=protocolVersion===2?
   'get_authorized_map_light_masks_v2':'get_authorized_map_light_masks';
  void db.rpc(rpc,{p_map:mapId})
   .then(({data,error})=>{
    if(error)throw error;
    const safe=normalizeAuthorizedLightMasks(data,mapId);
    if(cancelled)return;
    setResult(safe?.revision===revision?safe:null);
   }).catch(e=>{
    if(!cancelled){
     setResult(null);
     console.warn('Authorized light mask unavailable',e?.message||String(e));
    }
   });
  return()=>{cancelled=true};
 },[db,mapId,userId,revision,protocolVersion,refreshNonce,enabled]);
 return enabled&&result?.mapId===mapId&&result?.revision===revision?result:null;
}
