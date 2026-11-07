import {useCallback,useEffect,useRef,useState} from 'react';
import {normaliseToolConfig,toolInitialState,toolCanControl} from './CampaignTools.js';

/** RLS protects private issued sheets; public map tokens are in a separate table. */
export default function useCampaignTools({db,campaignId,mapId,userId,isDM}){
 const [templates,setTemplates]=useState([]);
 const [issued,setIssued]=useState([]);
 const [placed,setPlaced]=useState([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const seq=useRef(0);
 const refresh=useCallback(async()=>{
  if(!db||!userId||!campaignId){
   setTemplates([]);setIssued([]);setPlaced([]);return;
  }
  const request=++seq.current;setLoading(true);
  try{
   const [templatesReply,issuesReply,placedReply]=await Promise.all([
    isDM?db.from('campaign_tool_templates').select('*').eq('campaign_id',campaignId)
     .order('created_at',{ascending:true}):Promise.resolve({data:[],error:null}),
    db.from('campaign_tool_issues').select('*').eq('campaign_id',campaignId)
     .order('created_at',{ascending:true}),
    mapId?db.from('campaign_tool_map_tokens').select('*')
     .eq('campaign_id',campaignId).eq('map_id',mapId):
     Promise.resolve({data:[],error:null})
   ]);
   if(templatesReply.error)throw templatesReply.error;
   if(issuesReply.error)throw issuesReply.error;
   if(placedReply.error)throw placedReply.error;
   if(seq.current!==request)return;
   setTemplates(templatesReply.data||[]);
   setIssued(issuesReply.data||[]);
   setPlaced(placedReply.data||[]);
   setError('');
  }catch(e){
   if(seq.current===request)setError(e?.message||String(e));
  }finally{if(seq.current===request)setLoading(false)}
 },[db,campaignId,mapId,userId,isDM]);
 useEffect(()=>{void refresh();return()=>{++seq.current}},[refresh]);
 useEffect(()=>{
  if(!db||!campaignId||!userId)return;
  let hidden=false;
  const c=db.channel('forge-tools-'+campaignId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_issues',filter:'campaign_id=eq.'+campaignId},()=>void refresh())
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_map_tokens',filter:'campaign_id=eq.'+campaignId},()=>void refresh())
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_templates',filter:'campaign_id=eq.'+campaignId},()=>{if(isDM)void refresh()})
   .subscribe();
  const onVisibility=()=>{
   if(document.visibilityState==='hidden')hidden=true;
   else if(hidden){hidden=false;void refresh()}
  };
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{document.removeEventListener('visibilitychange',onVisibility);void db.removeChannel(c)};
 },[db,campaignId,userId,isDM,refresh]);
 async function mutate(operation){
  if(!db||!campaignId||!userId)throw Error('Open a campaign first.');
  try{const value=await operation();await refresh();return value}
  catch(e){setError(e?.message||String(e));throw e}
 }
 const one=async query=>{
  const {data,error}=await query;
  if(error)throw error;
  if(!data)throw Error('That item has changed. Reopen it and try again.');
  return data;
 };
 const createTemplate=draft=>mutate(()=>one(db.from('campaign_tool_templates').insert({
  campaign_id:campaignId,name:draft.name.trim(),kind:draft.kind,
  icon:draft.icon,config:normaliseToolConfig(draft.kind,draft.config)
 }).select('*').single()));
 const updateTemplate=(original,draft)=>mutate(()=>one(
  db.from('campaign_tool_templates').update({name:draft.name.trim(),kind:draft.kind,
   icon:draft.icon,config:normaliseToolConfig(draft.kind,draft.config)})
   .eq('id',original.id).eq('campaign_id',campaignId).select('*').single()));
 const deleteTemplate=template=>mutate(async()=>{
  const {error}=await db.from('campaign_tool_templates').delete()
   .eq('id',template.id).eq('campaign_id',campaignId);
  if(error)throw error;
 });
 const issueTool=draft=>mutate(()=>one(db.from('campaign_tool_issues').insert({
  campaign_id:campaignId,template_id:draft.templateId||null,
  name:draft.name.trim(),icon:draft.icon,kind:draft.kind,
  config:normaliseToolConfig(draft.kind,draft.config),
  owner_id:draft.partyShared?null:draft.ownerId,
  party_shared:!!draft.partyShared,
  state:toolInitialState(draft.kind,draft.config)
 }).select('*').single()));
 const removeIssued=issue=>mutate(async()=>{
  const {error}=await db.from('campaign_tool_issues').delete()
   .eq('id',issue.id).eq('campaign_id',campaignId);
  if(error)throw error;
 });
 const updateState=(issue,newState)=>mutate(()=>one(
  db.from('campaign_tool_issues').update({state:newState})
   .eq('id',issue.id).eq('revision',issue.revision)
   .eq('campaign_id',campaignId).select('*').maybeSingle()));
 const place=(issue,targetMap,x,y)=>mutate(()=>{
  if(!toolCanControl(issue,userId,isDM))throw Error('This tool was not issued to you.');
  if(!targetMap||targetMap!==mapId)throw Error('Select an accessible map.');
  return one(db.from('campaign_tool_issues').update({map_id:targetMap,x,y})
   .eq('id',issue.id).eq('revision',issue.revision)
   .eq('campaign_id',campaignId).select('*').maybeSingle());
 });
 const pickUp=issue=>mutate(()=>one(
  db.from('campaign_tool_issues').update({map_id:null})
   .eq('id',issue.id).eq('revision',issue.revision)
   .eq('campaign_id',campaignId).select('*').maybeSingle()));
 return {templates,issued,placed,loading,error,refresh,createTemplate,updateTemplate,
  deleteTemplate,issueTool,removeIssued,updateState,place,pickUp};
}
