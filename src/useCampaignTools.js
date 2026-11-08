import {useCallback,useEffect,useRef,useState} from 'react';
import {normaliseToolConfig,toolInitialState,toolCanControl,toolCanBeHeld,toolMapProjection} from './CampaignTools.js';
import {createCoalescedRefresh} from './PerformanceScheduling.js';
import {campaignResourceKey,createCampaignRefreshCoordinator} from './CampaignRefreshCoordinator.js';

/** Keep in-flight local placement authoritative until the server responds.
 * This hides network latency from dragging without altering permission checks. */
export function overlayToolPlacements(rows,pending,mapId){
 const found=new Map((rows||[]).map(p=>[p.issue_id,p]));
 for(const [id,entry] of pending||[]){
  if(entry?.row?.map_id===mapId)found.set(id,entry.row);
  else found.delete(id);
 }
 return [...found.values()];
}
/** RLS protects private issued sheets; public map tokens are in a separate table. */
export default function useCampaignTools({db,campaignId,mapId,userId,isDM,refreshCoordinator}){
 const [templates,setTemplates]=useState([]);
 const [issued,setIssued]=useState([]);
 const [placed,setPlaced]=useState([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const seq=useRef({templates:0,issued:0,placed:0});
 const ownCoordinator=useRef(null);
 if(!ownCoordinator.current)ownCoordinator.current=createCampaignRefreshCoordinator();
 const coordinator=refreshCoordinator||ownCoordinator.current;
 const pendingPositions=useRef(new Map()),writeChains=useRef(new Map());
 const moveSerial=useRef(0);
 useEffect(()=>{
  pendingPositions.current.clear();writeChains.current.clear();moveSerial.current=0;
 },[campaignId,mapId,userId]);
 /** A tool move should not reload every issued sheet or template.
  * Each resource has an independent sequence to avoid canceling an unrelated
  * response when several different Realtime tables change together.
  */
 const refresh=useCallback(async(kinds=['templates','issued','placed'],fresh=false)=>{
  if(!db||!userId||!campaignId){
   setTemplates([]);setIssued([]);setPlaced([]);return;
  }
  const resources=Array.isArray(kinds)?kinds:['templates','issued','placed'];
  const complete=resources.length===3;
  if(complete)setLoading(true);
  const generations=Object.fromEntries(resources.map(kind=>{
   if(!Object.hasOwn(seq.current,kind))throw Error('Unknown tool resource '+kind);
   return [kind,++seq.current[kind]];
  }));
  try{
   await Promise.all(resources.map(async kind=>{
    const key=campaignResourceKey({campaignId,mapId,userId,
     resource:'campaign-tools-'+kind,variant:isDM?'dm':'player'});
    // Realtime changes, permission changes and completed writes must not
    // inherit a query issued before the change was observed.
    if(fresh)coordinator.invalidate(key);
    const response=await coordinator.request(key,async()=>{
     let reply;
     if(kind==='templates'){
      reply=isDM?await db.from('campaign_tool_templates').select('*')
       .eq('campaign_id',campaignId).order('created_at',{ascending:true}):
       {data:[],error:null};
     }else if(kind==='issued'){
      reply=await db.from('campaign_tool_issues').select('*')
       .eq('campaign_id',campaignId).order('created_at',{ascending:true});
     }else{
      reply=mapId?await db.from('campaign_tool_map_tokens').select('*')
       .eq('campaign_id',campaignId).eq('map_id',mapId):
       {data:[],error:null};
     }
     if(reply.error)throw reply.error;
     return reply.data||[];
    });
    if(!response.current||seq.current[kind]!==generations[kind])return;
    if(kind==='templates')setTemplates(response.value);
    else if(kind==='issued')setIssued(response.value);
    else setPlaced(overlayToolPlacements(response.value,pendingPositions.current,mapId));
   }));
   if(resources.every(kind=>seq.current[kind]===generations[kind]))
    setError('');
  }catch(e){
   if(resources.some(kind=>seq.current[kind]===generations[kind]))
    setError(e?.message||String(e));
  }finally{
   if(complete&&resources.every(kind=>seq.current[kind]===generations[kind]))
    setLoading(false);
  }
 },[db,campaignId,mapId,userId,isDM,coordinator]);
 useEffect(()=>{
  void refresh();
  return()=>{
   for(const key of Object.keys(seq.current))++seq.current[key];
  };
 },[refresh]);
 // Subscribe once per campaign; changing map/viewer updates the callback,
 // not the entire subscription. The backend continues applying RLS per user.
 const latestRefresh=useRef(refresh);
 latestRefresh.current=refresh;
 useEffect(()=>{
  if(!db||!campaignId||!userId)return;
  let hidden=false;
  const issuesChanged=createCoalescedRefresh(
   ()=>void latestRefresh.current(['issued','placed'],true),100);
  const placementsChanged=createCoalescedRefresh(
   ()=>void latestRefresh.current(['placed'],true),100);
  const templatesChanged=createCoalescedRefresh(
   ()=>{if(isDM)void latestRefresh.current(['templates'],true)},100);
  const c=db.channel('forge-tools-'+campaignId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_issues',filter:'campaign_id=eq.'+campaignId},
    ()=>issuesChanged.request())
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_map_tokens',filter:'campaign_id=eq.'+campaignId},
    ()=>placementsChanged.request())
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_templates',filter:'campaign_id=eq.'+campaignId},
    ()=>templatesChanged.request())
   .subscribe(status=>{
    if(status==='SUBSCRIBED')
     void latestRefresh.current(['templates','issued','placed'],true);
   });
  const onVisibility=()=>{
   if(document.visibilityState==='hidden')hidden=true;
   else if(hidden){
    hidden=false;
    void latestRefresh.current(['templates','issued','placed'],true);
   }
  };
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   issuesChanged.cancel();placementsChanged.cancel();templatesChanged.cancel();
   document.removeEventListener('visibilitychange',onVisibility);
   void db.removeChannel(c);
  };
 },[db,campaignId,userId,isDM]);
 async function mutate(operation){
  if(!db||!campaignId||!userId)throw Error('Open a campaign first.');
  try{const value=await operation();await refresh(undefined,true);return value}
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
 // Position-only writes may follow one another before a prior revision arrives.
 // Serialize per issue and let the DB's RLS/validation enforce ownership.
 function inOrder(id,write){
  const before=writeChains.current.get(id)||Promise.resolve();
  const next=before.catch(()=>{}).then(write);
  writeChains.current.set(id,next);
  void next.finally(()=>{
   if(writeChains.current.get(id)===next)writeChains.current.delete(id);
  }).catch(()=>{});
  return next;
 }
 async function moveIssue(issue,targetMap,x,y){
  if(!db||!userId||!campaignId)throw Error('Open a campaign first.');
  if(!toolCanControl(issue,userId,isDM))throw Error('This tool was not issued to you.');
  if(issue.held_by_token_id)throw Error('Drop this held tool from the token quick-adjust menu first.');
  if(targetMap&&targetMap!==mapId)throw Error('Select an accessible map.');
  const stamp=++moveSerial.current;
  pendingPositions.current.set(issue.id,{
   stamp,row:targetMap?toolMapProjection(issue,targetMap,x,y):null
  });
  setPlaced(old=>overlayToolPlacements(old,pendingPositions.current,mapId));
  try{
   const updated=await inOrder(issue.id,()=>one(
    db.from('campaign_tool_issues').update({map_id:targetMap,x,y})
     .eq('id',issue.id).eq('campaign_id',campaignId)
     .is('held_by_token_id',null)
     .select('*').maybeSingle()));
   setIssued(old=>old.map(item=>item.id===updated.id?updated:item));
   if(pendingPositions.current.get(issue.id)?.stamp===stamp){
    pendingPositions.current.delete(issue.id);
    await refresh(['issued','placed'],true);
   }
   return updated;
  }catch(e){
   if(pendingPositions.current.get(issue.id)?.stamp===stamp){
    pendingPositions.current.delete(issue.id);
    await refresh(['issued','placed'],true);
   }
   setError(e?.message||String(e));throw e;
  }
 }
 async function hold(issue,token){
  if(!toolCanControl(issue,userId,isDM)||!toolCanBeHeld(issue))
   throw Error('This tool cannot be held by you.');
  if(issue.held_by_token_id)throw Error('This tool is already held.');
  if(!token||token.map_id!==mapId||token.campaign_id!==campaignId||
    (!isDM&&(token.owner_id!==userId||token.visible===false)))
   throw Error('You cannot attach a tool to that token.');
  return mutate(async()=>{
   const updated=await inOrder(issue.id,()=>one(
    db.from('campaign_tool_issues').update({
     held_by_token_id:token.id,map_id:mapId,
     x:Math.round(Number(token.x)),y:Math.round(Number(token.y))
    }).eq('id',issue.id).eq('campaign_id',campaignId)
     .is('held_by_token_id',null).select('*').maybeSingle()));
   setIssued(old=>old.map(item=>item.id===updated.id?updated:item));
   return updated;
  });
 }
 async function dropHeld(issue,token){
  if(!toolCanControl(issue,userId,isDM)||issue.held_by_token_id!==token?.id||
   token.map_id!==mapId||(!isDM&&token.owner_id!==userId))
   throw Error('This tool cannot be dropped from that token.');
  return mutate(async()=>{
   const updated=await inOrder(issue.id,()=>one(
    db.from('campaign_tool_issues').update({
     held_by_token_id:null,map_id:mapId,
     x:Math.round(Number(token.x)),y:Math.round(Number(token.y))
    }).eq('id',issue.id).eq('campaign_id',campaignId)
     .eq('held_by_token_id',token.id).select('*').maybeSingle()));
   setIssued(old=>old.map(item=>item.id===updated.id?updated:item));
   return updated;
  });
 }
 const place=(issue,targetMap,x,y)=>moveIssue(issue,targetMap,x,y);
 // Delete on the board means 'pick up', not removeIssued().
 const pickUp=issue=>moveIssue(issue,null,issue.x||0,issue.y||0);
 return {templates,issued,placed,loading,error,refresh,createTemplate,updateTemplate,
  deleteTemplate,issueTool,removeIssued,updateState,place,pickUp,hold,dropHeld};
}
