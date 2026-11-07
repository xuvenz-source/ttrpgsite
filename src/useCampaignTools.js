import {useCallback,useEffect,useRef,useState} from 'react';
import {normaliseToolConfig,toolInitialState,toolCanControl} from './CampaignTools.js';

/** RLS protects private issued sheets; public map tokens are in a separate table. */
export default function useCampaignTools({db,campaignId,mapId,userId,isDM}){
 const [templates,setTemplates]=useState([]);
 const [issued,setIssued]=useState([]);
 const [placed,setPlaced]=useState([]);
 const pendingMoves=useRef(new Map());
 const [localMoves,setLocalMoves]=useState({});
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
   const server=placedReply.data||[];
   setPlaced(server);
   const settled=[];
   for(const [id,pending] of pendingMoves.current){
    const row=server.find(p=>p.issue_id===id);
    if(pending.confirmed&&row&&Number(row.x)===pending.x&&
       Number(row.y)===pending.y){
     pendingMoves.current.delete(id);settled.push(id);
    }
   }
   if(settled.length)setLocalMoves(old=>{
    const next={...old};for(const id of settled)delete next[id];return next;
   });
   setError('');
  }catch(e){
   if(seq.current===request)setError(e?.message||String(e));
  }finally{if(seq.current===request)setLoading(false)}
 },[db,campaignId,mapId,userId,isDM]);
 useEffect(()=>{void refresh();return()=>{++seq.current}},[refresh]);
 useEffect(()=>{pendingMoves.current.clear();setLocalMoves({})},[campaignId,mapId,userId]);
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
 /** Optimistic, per-tool serialized coordinate writes. The revision changes
  * on every tool update, so movement never submits an old full state snapshot.
  * Keep the local destination visible until the projection confirms it. */
 function movePlaced(issueId,x,y){
  const issue=issued.find(t=>t.id===issueId);
  const position=placed.find(p=>p.issue_id===issueId);
  if(!issue||!position||position.map_id!==mapId||
     !toolCanControl(issue,userId,isDM))
   return Promise.reject(Error('You cannot move this issued tool.'));
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0)
   return Promise.reject(Error('Invalid tool position.'));
  let pending=pendingMoves.current.get(issueId);
  if(!pending||pending.mapId!==mapId||pending.campaignId!==campaignId){
   pending={campaignId,mapId,x,y,confirmed:false,promise:null};
   pendingMoves.current.set(issueId,pending);
  }
  pending.x=x;pending.y=y;pending.confirmed=false;
  setLocalMoves(old=>({...old,[issueId]:{x,y,mapId}}));
  if(pending.promise)return pending.promise;
  const run=(async()=>{
   try{
    while(pendingMoves.current.get(issueId)===pending){
     const nextX=pending.x,nextY=pending.y;
     const {data,error:writeError}=await db.from('campaign_tool_issues')
      .update({x:nextX,y:nextY})
      .eq('id',issueId).eq('campaign_id',pending.campaignId)
      .eq('map_id',pending.mapId).select('id,x,y').maybeSingle();
     if(writeError)throw writeError;
     if(!data)throw Error('Tool movement was rejected by the server.');
     if(pending.x!==nextX||pending.y!==nextY)continue;
     pending.confirmed=true;
     await refresh();
     break;
    }
   }catch(e){
    if(pendingMoves.current.get(issueId)===pending){
     pendingMoves.current.delete(issueId);
     setLocalMoves(old=>{const next={...old};delete next[issueId];return next});
     setError(e?.message||String(e));
     void refresh();
    }
    throw e;
   }finally{pending.promise=null}
  })();
  pending.promise=run;
  return run;
 }
 const pickUp=issue=>mutate(()=>one(
  db.from('campaign_tool_issues').update({map_id:null})
   .eq('id',issue.id).eq('revision',issue.revision)
   .eq('campaign_id',campaignId).select('*').maybeSingle()));
 const displayedPlacements=placed.map(p=>{
  const location=localMoves[p.issue_id];
  return location?.mapId===mapId?{...p,x:location.x,y:location.y}:p;
 });
 return {templates,issued,placed:displayedPlacements,loading,error,refresh,createTemplate,updateTemplate,
  deleteTemplate,issueTool,removeIssued,updateState,place,movePlaced,pickUp};
}
