import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {inventoryRows} from './InventoryMath.js';

const validUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
export const itemIdentity=row=>validUuid(row?._inventoryId)?row._inventoryId:null;
export const removeItemIdentity=row=>{
 const copy={...(row||{})};
 delete copy._inventoryId;
 return copy;
};
/** Atomic, per-item server claims are the sole authority. Optimistic snapshots
 * never become an authorization check, and only one item is patched per RPC. */
export default function useCampaignToolCollaboration({db,tool,userId,refresh}){
 const issueId=tool.id;
 const [claims,setClaims]=useState([]);
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
  issueRef.current=issueId;setClaims([]);setOptimistic({});
  owned.current.clear();writes.current.clear();claimsInFlight.current.clear();setError('');
  void refreshClaims().catch(e=>setError(e.message||String(e)));
  const channel=db.channel('forge-tool-item-claims-'+issueId+'-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_tool_item_leases',filter:'issue_id=eq.'+issueId},
    ()=>void refreshClaims().catch(e=>setError(e.message||String(e))))
   .subscribe();
  const interval=setInterval(()=>{
   const ids=[...owned.current];
   for(const id of ids){
    void db.rpc('claim_campaign_tool_item',{p_issue:issueId,p_item:id,p_takeover:false})
     .then(({error:e})=>{
      if(e){owned.current.delete(id);setError('Item claim expired: '+e.message)}
     });
   }
   void refreshClaims().catch(()=>{});
  },8000);
  return()=>{
   clearInterval(interval);
   const ids=[...owned.current];
   owned.current.clear();
   for(const id of ids)void db.rpc('release_campaign_tool_item',{
    p_issue:issueId,p_item:id}).then(()=>{},()=>{});
   void db.removeChannel(channel);
  };
 },[db,issueId,userId,refreshClaims]);
 const claim=useCallback((id,force=false)=>{
  if(!validUuid(id))return Promise.reject(Error('Inventory item identity is unavailable until the collaboration migration is applied.'));
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
  if(!validUuid(id))return;
  try{
   await (claimsInFlight.current.get(id)||Promise.resolve()).catch(()=>{});
   await (writes.current.get(id)||Promise.resolve()).catch(()=>{});
   if(!owned.current.has(id))return;
   if(!owned.current.has(id))return;
   owned.current.delete(id);
   const {error:releaseError}=await db.rpc('release_campaign_tool_item',
    {p_issue:issueId,p_item:id});
   if(releaseError)throw releaseError;
   setClaims(old=>old.filter(row=>row.item_id!==id||row.holder_id!==userId));
  }catch(e){setError(e.message||String(e))}
 },[db,issueId,userId]);
 const rows=useMemo(()=>{
  const base=inventoryRows(tool.state?.items);
  const found=new Set();
  const next=base.flatMap(row=>{
   const id=itemIdentity(row);
   if(!id)return [row];
   found.add(id);
   if(!Object.prototype.hasOwnProperty.call(optimistic,id))return [row];
   return optimistic[id]===null?[]:[optimistic[id]];
  });
  for(const [id,row] of Object.entries(optimistic))
   if(!found.has(id)&&row!==null)next.push(row);
  return next;
 },[tool.state?.items,optimistic]);
 const locks=useMemo(()=>Object.fromEntries(claims
  .filter(l=>Date.parse(l.expires_at)>Date.now())
  .map(l=>[l.item_id,l.holder_id])),[claims]);
 const mutate=useCallback((id,row,remove=false)=>{
  if(!validUuid(id))return Promise.reject(Error('Invalid inventory item.'));
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
  const current=rows;
  const currentById=new Map(current.map(row=>[itemIdentity(row),row]));
  const nextById=new Map();
  for(const incoming of nextRows){
   const id=itemIdentity(incoming)||crypto.randomUUID();
   const row={...incoming,_inventoryId:id};
   nextById.set(id,row);
  }
  const changes=[];
  for(const [id,row] of nextById)
   if(!currentById.has(id)||JSON.stringify(currentById.get(id))!==JSON.stringify(row))
    changes.push({id,row});
  for(const [id,row] of currentById)
   if(id&&!nextById.has(id))changes.push({id,row:null});
  if(!changes.length)return;
  setOptimistic(old=>{
   const next={...old};
   for(const item of changes)next[item.id]=item.row;
   return next;
  });
  for(const item of changes)void mutate(item.id,item.row,item.row===null);
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
 return {rows,locks,error,pending,claim,release,changeItems,saveDetails,
  owned:owned.current,refreshClaims};
}
