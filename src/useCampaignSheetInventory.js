import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {inventoryRows} from './InventoryMath.js';
import {validInventoryItemId,removeItemIdentity,mergeInventoryRows,
 inventoryChangeSet,activeInventoryLocks} from './InventoryCollaborationCore.js';

const sources={
 character:{table:'characters',column:'field_values'},
 npc_template:{table:'npc_templates',column:'field_values'},
 npc_token:{table:'map_tokens',column:'npc_values'}
};
/** All sheet Inventory fields share the same lease and per-object write model.
 * The server checks campaign membership/DM role, Inventory field type, and
 * active lease before applying an atomic JSONB patch. */
export default function useCampaignSheetInventory({
 db,campaignId,sourceType,sourceId,fieldId,userId,isDM=false
}){
 const [serverRows,setServerRows]=useState([]);
 const [claims,setClaims]=useState([]),[optimistic,setOptimistic]=useState({});
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 const owned=useRef(new Set()),claimsInFlight=useRef(new Map()),writes=useRef(new Map());
 const scope=useRef('');
 const target=sources[sourceType];
 const args=useMemo(()=>({
  p_campaign:campaignId,p_source:sourceType,p_source_id:sourceId,p_field:fieldId
 }),[campaignId,sourceType,sourceId,fieldId]);
 const refreshRows=useCallback(async(prepare=false)=>{
  if(!target||!db||!sourceId)return;
  let data;
  if(prepare){
   const reply=await db.rpc('get_campaign_sheet_inventory',args);
   if(reply.error)throw reply.error;
   data=reply.data;
  }else{
   const reply=await db.from(target.table).select(target.column)
    .eq('campaign_id',campaignId).eq('id',sourceId).maybeSingle();
   if(reply.error)throw reply.error;
   if(!reply.data)throw Error('The character or NPC inventory is unavailable.');
   data=reply.data[target.column]?.[fieldId]||[];
  }
  if(scope.current===JSON.stringify(args))setServerRows(inventoryRows(data));
 },[db,campaignId,sourceId,fieldId,sourceType,args,target]);
 const refreshClaims=useCallback(async()=>{
  const {data,error:loadError}=await db.from('campaign_sheet_item_leases')
   .select('item_id,holder_id,expires_at')
   .eq('campaign_id',campaignId).eq('source_type',sourceType)
   .eq('source_id',sourceId).eq('field_id',fieldId);
  if(loadError)throw loadError;
  if(scope.current===JSON.stringify(args))setClaims(data||[]);
 },[db,campaignId,sourceType,sourceId,fieldId,args]);
 useEffect(()=>{
  if(!db||!target||!sourceId||!campaignId)return;
  const signature=JSON.stringify(args);
  scope.current=signature;setRowsReset();
  function setRowsReset(){
   setServerRows([]);setClaims([]);setOptimistic({});setReady(false);setError('');
   owned.current.clear();claimsInFlight.current.clear();writes.current.clear();
  }
  void Promise.all([refreshRows(true),refreshClaims()]).then(()=>{
   if(scope.current===signature)setReady(true);
  }).catch(e=>setError(e?.message||String(e)));
  let connected=false,reconciliations=0;
  const channel=db.channel('forge-sheet-grid-'+sourceId+'-'+fieldId+'-'+userId)
   .on('postgres_changes',{event:'UPDATE',schema:'public',
    table:target.table,filter:'id=eq.'+sourceId},
    ()=>void refreshRows(false).catch(e=>setError(e?.message||String(e))))
   .on('postgres_changes',{event:'*',schema:'public',
    table:'campaign_sheet_item_leases',filter:'source_id=eq.'+sourceId},
    ()=>void refreshClaims().catch(e=>setError(e?.message||String(e))))
   .subscribe(status=>{
    const wasConnected=connected;
    connected=status==='SUBSCRIBED';
    if(connected&&!wasConnected){
     void refreshRows(false).catch(e=>setError(e?.message||String(e)));
     void refreshClaims().catch(e=>setError(e?.message||String(e)));
    }
   });
  const interval=setInterval(()=>{
   for(const id of [...owned.current])
    void db.rpc('claim_campaign_sheet_item',{...args,p_item:id,p_takeover:false})
     .then(({error:e})=>{
      if(e){owned.current.delete(id);setError('Item claim expired: '+e.message)}
     });
   // Lease renewal remains every 8 seconds (18-second expiry). Healthy
   // Realtime uses a 64-second backstop; a disconnect restores 8-second reads.
   if(!connected||++reconciliations%8===0){
    void refreshRows(false).catch(()=>{});
    void refreshClaims().catch(()=>{});
   }
  },8000);
  return()=>{
   clearInterval(interval);
   // Preserve the final autosaved item edit when the editor is closed.
   const ids=new Set([...owned.current,...claimsInFlight.current.keys(),...writes.current.keys()]);
   for(const id of ids){
    const waiting=Promise.allSettled([
     claimsInFlight.current.get(id)||Promise.resolve(),
     writes.current.get(id)||Promise.resolve()
    ]);
    void waiting.then(async()=>{
     owned.current.delete(id);
     await db.rpc('release_campaign_sheet_item',{...args,p_item:id});
    }).catch(()=>{});
   }
   void db.removeChannel(channel);
   scope.current='';
  };
 },[db,campaignId,sourceType,sourceId,fieldId,userId,target,args,refreshRows,refreshClaims]);
 const claim=useCallback((id,force=false)=>{
  if(!validInventoryItemId(id))return Promise.reject(Error('Item identities have not loaded.'));
  if(owned.current.has(id)&&!force)return Promise.resolve();
  if(claimsInFlight.current.has(id)&&!force)return claimsInFlight.current.get(id);
  const work=(async()=>{
   const {error:claimError}=await db.rpc('claim_campaign_sheet_item',
    {...args,p_item:id,p_takeover:force});
   if(claimError)throw claimError;
   owned.current.add(id);
   setClaims(old=>[...old.filter(l=>l.item_id!==id),{
    item_id:id,holder_id:userId,expires_at:new Date(Date.now()+18000).toISOString()
   }]);
   setError('');
  })();
  claimsInFlight.current.set(id,work);
  void work.finally(()=>{
   if(claimsInFlight.current.get(id)===work)claimsInFlight.current.delete(id);
  }).catch(()=>{});
  return work;
 },[db,args,userId]);
 const release=useCallback(async id=>{
  if(!validInventoryItemId(id))return;
  try{
   await (claimsInFlight.current.get(id)||Promise.resolve()).catch(()=>{});
   await (writes.current.get(id)||Promise.resolve()).catch(()=>{});
   if(!owned.current.has(id))return;
   owned.current.delete(id);
   const {error:e}=await db.rpc('release_campaign_sheet_item',
    {...args,p_item:id});
   if(e)throw e;
   setClaims(old=>old.filter(l=>l.item_id!==id||l.holder_id!==userId));
  }catch(e){setError(e?.message||String(e))}
 },[db,args,userId]);
 const rows=useMemo(()=>mergeInventoryRows(serverRows,optimistic),[serverRows,optimistic]);
 const locks=useMemo(()=>activeInventoryLocks(claims),[claims]);
 const mutate=useCallback((id,row,remove)=>{
  const before=writes.current.get(id)||Promise.resolve();
  const work=before.catch(()=>{}).then(async()=>{
   await claim(id);
   const {error:e}=await db.rpc('mutate_campaign_sheet_item',
    {...args,p_item:id,p_row:remove?{}:removeItemIdentity(row),p_remove:remove});
   if(e)throw e;
   await refreshRows(false);
   setOptimistic(old=>{
    if(JSON.stringify(old[id])!==JSON.stringify(remove?null:row))return old;
    const next={...old};delete next[id];return next;
   });
  });
  writes.current.set(id,work);
  void work.catch(e=>{
   setError(e?.message||String(e));
   setOptimistic(old=>{
    if(JSON.stringify(old[id])!==JSON.stringify(remove?null:row))return old;
    const next={...old};delete next[id];return next;
   });
   void refreshRows(false);
  }).finally(()=>{if(writes.current.get(id)===work)writes.current.delete(id)});
  return work;
 },[db,args,claim,refreshRows]);
 const changeItems=useCallback(nextRows=>{
  if(!ready)return;
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
 },[rows,ready,mutate]);
 return {rows,locks,ready,error,claim,release,changeItems,isDM,userId,
  refresh:()=>refreshRows(false)};
}
