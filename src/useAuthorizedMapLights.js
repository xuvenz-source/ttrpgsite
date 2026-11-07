import {useEffect,useState} from 'react';
import {normalizeAuthorizedLightMasks} from './AuthorizedLightMasks.js';

/** Lighting is a view of published server terrain, not prepared DM geometry.
 * Any failed or stale RPC removes player light rather than showing unoccluded
 * radial gradients through walls. DM previews render from prepared geometry.
 */
export default function useAuthorizedMapLights({db,mapId,userId,revision}){
 const [result,setResult]=useState(null);
 useEffect(()=>{
  let cancelled=false;
  setResult(null);
  if(!db||!mapId||!userId||!Number.isSafeInteger(revision))return;
  void db.rpc('get_authorized_map_light_masks',{p_map:mapId})
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
 },[db,mapId,userId,revision]);
 return result?.mapId===mapId&&result?.revision===revision?result:null;
}
