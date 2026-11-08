import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {validInventoryItemId,removeItemIdentity,mergeInventoryRows,
 inventoryChangeSet,activeInventoryLocks} from './InventoryCollaborationCore.js';
// Keep existing imports/tests compatible while sharing the canonical rules.
export {itemIdentity,removeItemIdentity} from './InventoryCollaborationCore.js';
/** Atomic, per-item server claims are the sole authority. Optimistic snapshots
 * never become an authorization check, and only one item is patched per RPC. */
export default function useCampaignToolCollaboration({db,tool,userId,refresh}){
 const issueId=tool.id;
 const [claims,setClaims]=useState([]),[ready,setReady]=useState(false);
 const [optimistic,setOptimistic]=useState({});
 const [error,setError]=useState('');
 const [pending,setPending]=useState(false);
 const owned=useRef(new Set()),writes=useRef(new Map()),claimsInFlight=useRef(new Map());
 const issueRef=useRef(issueId);
 const refreshClaims=useCallback(async()=>{
  const {data,error:loadError}=await db.from('campaign_tool_item_leases')
   .select('item_id,holder_id,expires_at').eq('issue_id',issueId);
  if(loadError)throw loadError;
  if(issueRef.current===issueId)setClaims(data||[]);
 },[db,issueId]);
 useEffect(()=>{
  let active=true;
  issueRef.current=issueId;setClaims([]);setOptimistic({});setReady(false);
  owned.current.clear();writes.current.clear();claimsInFlight.current.clear();setError('');
  void refreshClaims().then(()=>{
   if(active&&issueRef.current===issueId)setReady(true);
  }).catch(e=>{if(active)setError(e?.message||String(e))});
  let connected=false,reconciliations=0;
  const channel=db.channel('forge-tool-item-claims-'+issueId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_item_leases',filter:'issue_id=eq.'+issueId},
    ()=>void refreshClaims().catch(e=>setError(e.message||String(e))))
   .subscribe(status=>{
    const wasConnected=connected;
    connected=status==='SUBSCRIBED';
    if(connected&&!wasConnected)
     void refreshClaims().catch(e=>setError(e.message||String(e)));
   });
  const interval=setInterval(()=>{
   const ids=[...owned.current];
   for(const id of ids){
    void db.rpc('claim_campaign_tool_item',{p_issue:issueId,p_item:id,p_takeover:false})
     .then(({error:e})=>{
      if(e){owned.current.delete(id);setError('Item claim expired: '+e.message)}
     });
   }
   if(!connected||++reconciliations%8===0)
    void refreshClaims().catch(()=>{});
  },8000);
  return()=>{
   active=false;
   clearInterval(interval);
   // Always let in-flight claims and writes settle before releasing, otherwise
   // closing the sheet immediately after a drag can reject its last edit.
   const ids=new Set([...owned.current,...claimsInFlight.current.keys(),...writes.current.keys()]);
   for(const id of ids){
    const waiting=Promise.allSettled([
     claimsInFlight.current.get(id)||Promise.resolve(),
     writes.current.get(id)||Promise.resolve()
    ]);
    void waiting.then(async()=>{
     owned.current.delete(id);
     await db.rpc('release_campaign_tool_item',{p_issue:issueId,p_item:id});
    }).catch(()=>{});
   }
   void db.removeChannel(channel);
  };
 },[db,issueId,userId,refreshClaims]);
 const claim=useCallback((id,force=false)=>{
  if(!validInventoryItemId(id))return Promise.reject(Error('Inventory item identity is unavailable until the collaboration migration is applied.'));
  if(owned.current.has(id)&&!force)return Promise.resolve();
  if(claimsInFlight.current.has(id)&&!force)return claimsInFlight.current.get(id);
  const op=(async()=>{
   const {error:claimError}=await db.rpc('claim_campaign_tool_item',{
    p_issue:issueId,p_item:id,p_takeover:force});
   if(claimError)throw claimError;
   owned.current.add(id);
   setClaims(old=>[...old.filter(l=>l.item_id!==id),
    {item_id:id,holder_id:userId,expires_at:new Date(Date.now()+18000).toISOString()}]);
   setError('');
  })();
  claimsInFlight.current.set(id,op);
  void op.finally(()=>{if(claimsInFlight.current.get(id)===op)claimsInFlight.current.delete(id)})
   .catch(()=>{});
  return op;
 },[db,issueId,userId]);
 const release=useCallback(async id=>{
  if(!validInventoryItemId(id))return;
  try{
   await (claimsInFlight.current.get(id)||Promise.resolve()).catch(()=>{});
   await (writes.current.get(id)||Promise.resolve()).catch(()=>{});
   if(!owned.current.has(id))return;
   owned.current.delete(id);
   const {error:releaseError}=await db.rpc('release_campaign_tool_item',
    {p_issue:issueId,p_item:id});
   if(releaseError)throw releaseError;
   setClaims(old=>old.filter(row=>row.item_id!==id||row.holder_id!==userId));
  }catch(e){setError(e.message||String(e))}
 },[db,issueId,userId]);
 const rows=useMemo(()=>mergeInventoryRows(tool.state?.items,optimistic),
  [tool.state?.items,optimistic]);
 const locks=useMemo(()=>activeInventoryLocks(claims),[claims]);
 const mutate=useCallback((id,row,remove=false)=>{
  if(!validInventoryItemId(id))return Promise.reject(Error('Invalid inventory item.'));
  const before=writes.current.get(id)||Promise.resolve();
  const next=before.catch(()=>{}).then(async()=>{
   await claim(id);
   const {error:changeError}=await db.rpc('mutate_campaign_tool_item',{
    p_issue:issueId,p_item:id,
    p_row:remove?{}:removeItemIdentity(row),p_remove:remove});
   if(changeError)throw changeError;
   await refresh();
   setOptimistic(old=>{
    if(JSON.stringify(old[id])!==JSON.stringify(remove?null:row))return old;
    const copy={...old};delete copy[id];return copy;
   });
  });
  writes.current.set(id,next);
  void next.catch(e=>{
   setOptimistic(old=>{
    if(JSON.stringify(old[id])!==JSON.stringify(remove?null:row))return old;
    const copy={...old};delete copy[id];return copy;
   });
   setError(e.message||String(e));void refresh();
  }).finally(()=>{if(writes.current.get(id)===next)writes.current.delete(id)});
  return next;
 },[db,issueId,claim,refresh]);
 /** Infer exactly which object a grid/list gesture changed. Never send a
  * whole inventory array, preventing unrelated item lost-update races. */
 const changeItems=useCallback(nextRows=>{
  const changes=inventoryChangeSet(rows,nextRows);
  if(!changes.length)return;
  setOptimistic(old=>{
   const next={...old};
   for(const item of changes)next[item.id]=item.row;
   return next;
  });
  // The editor can only confirm a save once every affected server write
  // acknowledges; optimistic updates remain visible while the RPCs run.
  return Promise.all(changes.map(item=>mutate(item.id,item.row,item.row===null)));
 },[rows,mutate]);
 const saveDetails=useCallback(async(lit=null,attrs=null)=>{
  setPending(true);setError('');
  try{
   const {error:detailsError}=await db.rpc('patch_campaign_tool_details',{
    p_issue:issueId,p_lit:lit,p_attrs:attrs});
   if(detailsError)throw detailsError;
   await refresh();
  }catch(e){setError(e.message||String(e));throw e}
  finally{setPending(false)}
 },[db,issueId,refresh]);
 return {rows,locks,ready,error,pending,claim,release,changeItems,saveDetails,
  owned:owned.current,refreshClaims,refresh};
}
