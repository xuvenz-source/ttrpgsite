import {useCallback,useEffect,useRef,useState} from 'react';
import {createCoalescedRefresh} from './PerformanceScheduling.js';

/**
 * DM-only editing, RLS-scoped public library and visible-map-pin read access.
 * Never use a client-side visible flag as a substitute for server authorization.
 */
export default function useCampaignHandouts({db,campaignId,mapId,userId,isDM}){
 const [folders,setFolders]=useState([]);
 const [handouts,setHandouts]=useState([]);
 const [pins,setPins]=useState([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const request=useRef(0);
 const refresh=useCallback(async()=>{
  if(!db||!campaignId||!userId){
   setFolders([]);setHandouts([]);setPins([]);setError('');return;
  }
  const id=++request.current;setLoading(true);
  const filesQuery=db.from('campaign_handouts')
   .select('*').eq('campaign_id',campaignId)
   .order('created_at',{ascending:false});
  const [folderResponse,notesResponse,pinsResponse]=await Promise.all([
   db.from('campaign_handout_folders').select('*')
    .eq('campaign_id',campaignId).order('name'),
   isDM?filesQuery:filesQuery.eq('revealed',true),
   mapId?db.from('campaign_map_pins').select('*')
    .eq('campaign_id',campaignId).eq('map_id',mapId):
    Promise.resolve({data:[],error:null})
  ]);
  if(request.current!==id)return;
  const failure=folderResponse.error||notesResponse.error||pinsResponse.error;
  if(failure){
   setError(failure.message||String(failure));
   setFolders([]);setHandouts([]);setPins([]);
  }else{
   setFolders(folderResponse.data||[]);
   setHandouts(notesResponse.data||[]);
   setPins(pinsResponse.data||[]);
   setError('');
  }
  setLoading(false);
 },[db,campaignId,mapId,userId,isDM]);
 useEffect(()=>{void refresh();return()=>{++request.current}},[refresh]);
 useEffect(()=>{
  if(!db||!campaignId||!userId)return;
  let hidden=false;
  const changed=createCoalescedRefresh(()=>void refresh(),100);
  // Only publish a campaign-scoped revision tick. Never broadcast note text
  // or hidden pin coordinates in Realtime payloads.
  const channel=db.channel('forge-handouts-'+campaignId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_handout_events',filter:'campaign_id=eq.'+campaignId},
    ()=>changed.request())
   .subscribe(status=>{if(status==='SUBSCRIBED')changed.request()});
  const resume=()=>{
   if(document.visibilityState==='hidden')hidden=true;
   else if(hidden){hidden=false;void refresh()}
  };
  document.addEventListener('visibilitychange',resume);
  return()=>{
   changed.cancel();document.removeEventListener('visibilitychange',resume);
   void db.removeChannel(channel);
  };
 },[db,campaignId,userId,refresh]);
 const mutation=async fn=>{
  if(!db||!campaignId||!userId)throw Error('Open a campaign first.');
  const result=await fn();if(result.error)throw result.error;
  await refresh();return result.data;
 };
 const createFolder=name=>mutation(()=>db.from('campaign_handout_folders')
  .insert({campaign_id:campaignId,name:name.trim()}).select('*').single());
 const renameFolder=(folder,name)=>mutation(()=>db.from('campaign_handout_folders')
  .update({name:name.trim()}).eq('id',folder.id)
  .eq('campaign_id',campaignId).select('*').single());
 const deleteFolder=folder=>mutation(()=>db.from('campaign_handout_folders')
  .delete().eq('id',folder.id).eq('campaign_id',campaignId));
 const createHandout=draft=>mutation(()=>db.from('campaign_handouts')
  .insert({campaign_id:campaignId,title:draft.title.trim(),body:draft.body,
   folder_id:draft.folderId||null,revealed:!!draft.revealed})
  .select('*').single());
 const updateHandout=(note,patch)=>mutation(()=>db.from('campaign_handouts')
  .update(patch).eq('id',note.id).eq('campaign_id',campaignId)
  .select('*').single());
 const deleteHandout=note=>mutation(()=>db.from('campaign_handouts')
  .delete().eq('id',note.id).eq('campaign_id',campaignId));
 const createPin=({handoutId,kind='note',x,y})=>mutation(()=>db.from('campaign_map_pins')
  .insert({campaign_id:campaignId,map_id:mapId,handout_id:handoutId,
   kind,x,y,visible:false,collectable:true}).select('*').single());
 const updatePin=(pin,patch)=>mutation(()=>db.from('campaign_map_pins')
  .update(patch).eq('id',pin.id).eq('campaign_id',campaignId).select('*').single());
 const deletePin=pin=>mutation(()=>db.from('campaign_map_pins')
  .delete().eq('id',pin.id).eq('campaign_id',campaignId));
 const collectPin=pin=>mutation(()=>db.rpc('collect_campaign_map_pin',{p_pin:pin.id}));
 const readPinNote=async pin=>{
  if(!db||!pin||!pins.some(p=>p.id===pin.id))return null;
  const {data,error:fetchError}=await db.from('campaign_handouts')
   .select('id,title,body,revealed,collected,folder_id')
   .eq('campaign_id',campaignId).eq('id',pin.handout_id).maybeSingle();
  if(fetchError)throw fetchError;
  return data;
 };
 return {folders,handouts,pins,loading,error,refresh,createFolder,renameFolder,deleteFolder,
  createHandout,updateHandout,deleteHandout,createPin,updatePin,deletePin,collectPin,readPinNote};
}
