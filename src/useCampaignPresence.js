import {useEffect,useState} from 'react';
import {campaignPresenceKey,onlineMemberIds} from './CampaignRealtime.js';
import {createCoalescedRefresh} from './PerformanceScheduling.js';

/** Campaign-scoped, pseudonymous online presence and roster hash mapping.
 * This hook owns exactly one channel, never broadcasts user IDs, and always
 * tears down its channel when the campaign/account changes.
 */
export default function useCampaignPresence({db,campaignId,userId,members,rosterRefreshRef}){
 const [onlinePresenceKeys,setOnlinePresenceKeys]=useState([]);
 const [memberPresenceHashes,setMemberPresenceHashes]=useState({});
 useEffect(()=>{
  let alive=true;
  setOnlinePresenceKeys([]);
  if(!db||!campaignId||!userId)return;
  let channel=null,lastSignature=null;
  const rosterUpdates=createCoalescedRefresh(
   ()=>void rosterRefreshRef.current?.(),150);
  void campaignPresenceKey(campaignId,userId).then(key=>{
   if(!alive||!key)return;
   channel=db.channel('vtt-presence-'+campaignId,{
    config:{presence:{key}}
   });
   const sync=()=>{
    if(!alive)return;
    const keys=Object.keys(channel.presenceState()).sort();
    const signature=JSON.stringify(keys);
    setOnlinePresenceKeys(previous=>previous.length===keys.length&&
     previous.every((item,index)=>item===keys[index])?previous:keys);
    if(signature!==lastSignature){
     lastSignature=signature;rosterUpdates.request();
    }
   };
   channel.on('presence',{event:'sync'},sync)
    .subscribe(async status=>{
     if(!alive)return;
     if(status==='SUBSCRIBED'){
      try{await channel.track({online:true})}
      catch(error){console.warn('Could not publish online status',error)}
     }else if(status==='CHANNEL_ERROR'){
      setOnlinePresenceKeys([]);
      console.warn('Player presence will retry',campaignId);
     }
    });
  }).catch(error=>console.warn('Player presence unavailable',error));
  return()=>{
   alive=false;rosterUpdates.cancel();setOnlinePresenceKeys([]);
   if(channel)void db.removeChannel(channel);
  };
 },[db,campaignId,userId,rosterRefreshRef]);
 useEffect(()=>{
  let alive=true;
  void Promise.all((members||[]).map(async member=>[
   member.user_id,await campaignPresenceKey(campaignId,member.user_id)
  ])).then(entries=>{if(alive)setMemberPresenceHashes(Object.fromEntries(entries))})
   .catch(error=>console.warn('Could not map party presence',error));
  return()=>{alive=false};
 },[campaignId,members]);
 return onlineMemberIds(members,memberPresenceHashes,onlinePresenceKeys);
}
