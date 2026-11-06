import {useCallback,useEffect,useRef,useState} from 'react';
import {changeSidebarMenuState,normalizeSidebarMenuState,readSidebarMenuState,
 saveSidebarMenuState,sidebarMenuOpen,sidebarMenuStorageKey} from './SidebarMenuState.js';

const localStore=()=>{
 try{return typeof window!=='undefined'?window.localStorage:null}
 catch{return null}
};

/** Keep the left/right menu choices per authenticated player and campaign.
 * Local storage works even before the staged RLS migration is applied;
 * when the table exists, the same state syncs across the player's devices.
 */
export default function useSidebarMenus(db,user,campaignId){
 const key=sidebarMenuStorageKey(user,campaignId);
 const [expanded,setExpanded]=useState(()=>readSidebarMenuState(localStore(),key));
 const current=useRef(expanded),scope=useRef(key),version=useRef(0);
 const serverReady=useRef(false),writeQueue=useRef(Promise.resolve());
 const persist=useCallback((next,member,campaign,client)=>{
  if(!serverReady.current||!client||!member||!campaign)return;
  const payload={user_id:member,campaign_id:campaign,expanded:next,
   updated_at:new Date().toISOString()};
  writeQueue.current=writeQueue.current.catch(()=>{}).then(async()=>{
   const {error}=await client.from('tabletop_menu_preferences')
    .upsert(payload,{onConflict:'user_id,campaign_id'});
   if(error){
    console.warn('Could not sync sidebar menu preferences; local settings retained',error);
    serverReady.current=false;
   }
  });
 },[]);
 useEffect(()=>{
  scope.current=key;serverReady.current=false;
  ++version.current;
  const local=readSidebarMenuState(localStore(),key);
  current.current=local;setExpanded(local);
  if(!db||!user||!campaignId||!key)return;
  let active=true;
  const versionAtStart=version.current;
  void db.from('tabletop_menu_preferences').select('expanded')
   .eq('user_id',user).eq('campaign_id',campaignId).maybeSingle()
   .then(({data,error})=>{
    if(!active||scope.current!==key)return;
    if(error){
     // Migration may still be staged while using the preview; local choices
     // continue to work without disrupting any menus.
     serverReady.current=false;
     return;
    }
    serverReady.current=true;
    if(version.current===versionAtStart){
     const saved=data?normalizeSidebarMenuState(data.expanded):local;
     current.current=saved;setExpanded(saved);
     saveSidebarMenuState(localStore(),key,saved);
    }else{
     // A user expanded a menu before cloud preferences finished loading.
     // Preserve that interaction, and write the newest state to the server.
     persist(current.current,user,campaignId,db);
    }
   }).catch(()=>{serverReady.current=false});
  const onStorage=event=>{
   if(event.key!==key||scope.current!==key)return;
   const next=readSidebarMenuState(localStore(),key);
   ++version.current;current.current=next;setExpanded(next);
  };
  window.addEventListener('storage',onStorage);
  return()=>{active=false;window.removeEventListener('storage',onStorage)};
 },[db,user,campaignId,key,persist]);
 const toggle=useCallback((menuId,open)=>{
  if(!key||scope.current!==key)return;
  const next=changeSidebarMenuState(current.current,menuId,open);
  if(next===current.current)return;
  ++version.current;current.current=next;setExpanded(next);
  saveSidebarMenuState(localStore(),key,next);
  persist(next,user,campaignId,db);
 },[db,user,campaignId,key,persist]);
 return {expanded,isOpen:menuId=>sidebarMenuOpen(expanded,menuId),toggle};
}
