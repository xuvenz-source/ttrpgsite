// B10-R18-122 SOURCE-ONLY CONTRACT. NOT CONNECTED TO LIVE TABLETOP UI.
// R18-120/121 privileged RPCs and this candidate have NOT been installed.
// The server, not this client guard, makes every authorization decision.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RPC=Object.freeze({
 remove:'dm_remove_campaign_player',
 reinstate:'dm_reinstate_campaign_player',
 leave:'leave_campaign',
 list:'dm_list_removed_campaign_players'
});
const fail=(code)=>Object.assign(new Error('Campaign membership management is unavailable. Refresh the campaign and try again.'),{code});
const validId=value=>typeof value==='string'&&UUID.test(value)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(value);
const own=(a,k)=>Object.prototype.hasOwnProperty.call(a,k);
const isOwnDm=(state)=>state.isDM===true&&
 Array.isArray(state.members)&&state.members.some(m=>m.user_id===state.userId&&m.role==='dm');
const isOwnPlayer=(state)=>state.isDM!==true&&
 Array.isArray(state.members)&&state.members.some(m=>m.user_id===state.userId&&m.role==='player');
const activePlayer=(state,id)=>Array.isArray(state.members)&&
 state.members.some(m=>m.user_id===id&&m.role==='player');

export const CAMPAIGN_MEMBER_ADMIN_RPC_NAMES=RPC;
export const CAMPAIGN_MEMBER_ADMIN_LIVE_ENABLED=false;

/**
 * A staging-only, per-view controller. Never call with service_role privileges.
 * No optimistic mutation, untrusted role claims, retry or direct table write.
 * A true RPC response authorizes *displaying* success only after a fresh
 * authoritative roster refresh, which the integration must supply.
 *
 * context(): {campaignId,userId,isDM,members}; isDM/members are UI hints ONLY.
 * onReconcile(): refresh original campaign/roster, and eject revoked viewers.
 */
export function createCampaignMemberAdminContract({db,context,onReconcile}){
 if(!db||typeof db.rpc!=='function'||typeof db.auth?.getUser!=='function'||
   typeof context!=='function'||typeof onReconcile!=='function')throw fail('invalid_setup');
 let busy=false;
 const current=()=>{const x=context();return x&&typeof x==='object'?x:null;};
 const same=(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.campaignId===b.campaignId;
 const reconcile=async anchor=>{
  if(!same(anchor,current()))return;
  try{await onReconcile()}catch{/* UI must separately report refresh failure; never fake updated roster. */}
 };
 async function act(kind,playerId){
  if(!own(RPC,kind))throw fail('invalid_action');
  if(busy)throw fail('already_pending');
  busy=true;
  let anchor=null;
  try{
   const c=current();
   if(!c||!validId(c.campaignId)||!validId(c.userId))throw fail('invalid_context');
   anchor={campaignId:c.campaignId,userId:c.userId};
   if(kind==='leave'){
    if(!isOwnPlayer(c))throw fail('wrong_role');
   }else if(!isOwnDm(c))throw fail('wrong_role');
   if(kind==='remove'){
    if(!validId(playerId)||playerId===c.userId||!activePlayer(c,playerId))
     throw fail('invalid_player');
   }else if(kind==='reinstate'){
    // A removed player is deliberately absent from the active roster.
    // The server checks its private tombstone; never enroll an arbitrary ID.
    if(!validId(playerId)||playerId===c.userId||
      (c.members||[]).some(m=>m.user_id===playerId))throw fail('invalid_player');
   }
   const identity=await db.auth.getUser();
   if(identity?.error||identity?.data?.user?.id!==c.userId)throw fail('identity_changed');
   if(!same(anchor,current()))throw fail('context_changed');
   const params=kind==='leave'||kind==='list'
    ?{p_campaign:c.campaignId}:{p_campaign:c.campaignId,p_player:playerId};
   let res;
   try{res=await db.rpc(RPC[kind],params)}
   catch{await reconcile(anchor);throw fail('unconfirmed');}
   if(res?.error){await reconcile(anchor);throw fail('unconfirmed');}
   if(!same(anchor,current())){
    // Server may have committed in the previous campaign; no UI success.
    throw fail('context_changed_after_call');
   }
   if(kind==='list'){
    if(!Array.isArray(res?.data)||res.data.length>100){
     throw fail('invalid_server_response');
    }
    const seen=new Set();
    const removed=res.data.map(row=>{
     if(!row||!validId(row.user_id)||seen.has(row.user_id)||
       typeof row.removed_at!=='string'||!Number.isFinite(Date.parse(row.removed_at))||
       (c.members||[]).some(m=>m.user_id===row.user_id))
       throw fail('invalid_server_response');
     seen.add(row.user_id);
     return Object.freeze({user_id:row.user_id,removed_at:row.removed_at});
    });
    return Object.freeze({status:'listed',removed:Object.freeze(removed)});
   }
   if(typeof res?.data!=='boolean') {
    await reconcile(anchor);
    throw fail('unconfirmed');
   }
   await reconcile(anchor);
   return Object.freeze({
    status:res.data===true?'server_confirmed':'stale',
    // The integration must not update cached map/fog/chat/sheet authority
    // until it has independently reconciled a current server membership.
    requiresReconciliation:true
   });
  }finally{busy=false;}
 }
 return Object.freeze({
  removePlayer:playerId=>act('remove',playerId),
  reinstatePlayer:playerId=>act('reinstate',playerId),
  leaveCampaign:()=>act('leave'),
  listRemovedPlayers:()=>act('list'),
  isBusy:()=>busy
 });
}
