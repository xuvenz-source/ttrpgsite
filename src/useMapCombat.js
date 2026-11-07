import {useEffect,useRef,useState,useCallback} from 'react';
import {normalizeCombat} from './CombatInitiative.js';

/** Isolated multiplayer initiative lifecycle. The public table is sanitized;
 * only DMs can read private combat entry -> token mappings. All writes run
 * through server-authorized RPCs instead of browser-side table updates.
 */
export default function useMapCombat({db,campaignId,mapId,userId,isDM,onError,onRefreshChat,beforeRoll}){
 const [combat,setCombat]=useState(null);
 const [privateEntries,setPrivateEntries]=useState([]);
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const errorRef=useRef(onError),chatRef=useRef(onRefreshChat),beforeRollRef=useRef(beforeRoll);
 errorRef.current=onError;chatRef.current=onRefreshChat;beforeRollRef.current=beforeRoll;
 const request=useRef(0),refreshRef=useRef(null),busyRef=useRef(false);
 const lastEncounter=useRef(new Map());
 useEffect(()=>{
  const key=++request.current;
  setCombat(null);setPrivateEntries([]);setOpen(false);setStatus('');
  refreshRef.current=null;
  if(!db||!userId||!mapId||!campaignId){lastEncounter.current.clear();return;}
  let active=true,sequence=0;
  const refresh=async()=>{
   const number=++sequence;
   const [{data,error},secret]=await Promise.all([
    db.from('map_combats').select('map_id,campaign_id,encounter_id,active,round,current_entry_id,initiative_field,initiative_mode,participants,revision')
     .eq('map_id',mapId).eq('campaign_id',campaignId).maybeSingle(),
    isDM?db.from('map_combat_entries').select('entry_id,token_id').eq('map_id',mapId):
     Promise.resolve({data:[],error:null})
   ]);
   if(!active||key!==request.current||number!==sequence)return;
   if(error||secret.error){
    console.warn('Could not read initiative tracker',error||secret.error);
    setStatus('Combat database migration has not been applied, or permission is unavailable.');
    return;
   }
   const next=normalizeCombat(data);
   setCombat(next);setPrivateEntries(secret.data||[]);setStatus('');
   if(next?.active){
    const encounterKey=mapId+':'+next.encounterId;
    if(lastEncounter.current.get(mapId)!==encounterKey){
     lastEncounter.current.set(mapId,encounterKey);setOpen(true);
    }
   }else{
    lastEncounter.current.delete(mapId);setOpen(false);
   }
  };
  refreshRef.current=refresh;
  void refresh().catch(e=>{if(active&&key===request.current){
   console.warn('Initiative refresh failed',e);
   setStatus('Could not refresh combat status.');
  }});
  const channel=db.channel('initiative-'+mapId+'-'+userId)
   .on('postgres_changes',{
    event:'*',schema:'public',table:'map_combats',filter:'map_id=eq.'+mapId
   },()=>{void refresh().catch(e=>console.warn('Combat refresh failed',e))})
   .subscribe(state=>{if(state==='SUBSCRIBED'){
    void refresh().catch(e=>console.warn('Combat reconnect failed',e));
   }});
  return()=>{active=false;++request.current;refreshRef.current=null;
   void db.removeChannel(channel);
  };
 },[db,campaignId,mapId,userId,isDM]);
 const invoke=useCallback(async(name,args,rollEntry=null)=>{
  if(!db||!mapId||!campaignId||!userId||busyRef.current)return;
  busyRef.current=true;setBusy(true);
  try{
   if(rollEntry)await beforeRollRef.current?.(rollEntry);
   const {data,error}=await db.rpc(name,{p_map:mapId,...args});
   if(error)throw error;
   await refreshRef.current?.();
   if(name.includes('initiative')||name==='begin_map_combat'){
    void chatRef.current?.();
   }
   return data;
  }catch(e){errorRef.current?.(e);return null}
  finally{busyRef.current=false;setBusy(false)}
 },[db,campaignId,mapId,userId]);
 return {
  combat,privateEntries,open,setOpen,busy,status,
  begin:(tokenIds,fieldId,mode)=>invoke('begin_map_combat',{
   p_tokens:tokenIds,p_field:fieldId,p_mode:mode}),
  add:(tokenIds)=>invoke('add_map_combat_tokens',{p_tokens:tokenIds}),
  roll:(entryId)=>invoke('roll_map_combat_initiative',{p_entry:entryId},entryId),
  rollNpc:()=>invoke('roll_map_npc_initiative',{}),
  command:(action,entryId=null,score=null)=>invoke('command_map_combat',{
   p_action:action,p_entry:entryId,p_score:score}),
  refresh:()=>refreshRef.current?.()
 };
}
