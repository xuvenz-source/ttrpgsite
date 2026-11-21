/**
 * R18-176: DORMANT user-JWT-scoped DB+Storage adapters for R175 gateway.
 * db MUST be a fresh per-request Supabase publishable client configured
 * with the same caller's verified Authorization JWT. DO NOT pass an admin,
 * service-role, secret-key or globally shared client.
 * All DB SELECT/RPC and private Storage download calls are subject to the
 * signed user's current RLS. This code is not connected to a deployed app.
 */
export const R176_LIVE_ENABLED=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid=x=>typeof x==='string'&&UUID.test(x);
const invalid=()=>new Error('Private media access unavailable');

export function createUserScopedMediaAdapters({db,verifiedUserId}={}){
  if(!validUuid(verifiedUserId)||!db||typeof db.from!=='function'||
     typeof db.rpc!=='function'||typeof db.storage?.from!=='function')
    throw new TypeError('A verified actor and user-JWT-scoped client are required');
  const current=verifiedUserId;
  async function one(table,columns,conditions){
    let query=db.from(table).select(columns);
    for(const [k,v] of conditions)query=query.eq(k,v);
    const {data,error}=await query.maybeSingle();
    if(error)throw invalid();
    return data||null;
  }
  async function yes(name,args){
    const {data,error}=await db.rpc(name,args);
    if(error)throw invalid();
    return data===true;
  }
  const asset=(bucket,path)=>typeof path==='string'&&path.length>0?
    {bucket,path}:null;
  async function resolveForCurrentUser({userId,kind,resourceId,variant}={}){
    if(userId!==current||!validUuid(resourceId))return null;
    if(kind==='map-image'){
      if(variant!=='map')return null;
      const map=await one('battle_maps','id,campaign_id,storage_path',[['id',resourceId]]);
      if(!map||map.id!==resourceId||!validUuid(map.campaign_id))return null;
      if(!await yes('can_view_campaign_map',{p_campaign:map.campaign_id,p_map:map.id}))return null;
      return asset('battlemap-assets',map.storage_path);
    }
    if(kind==='personal-token-art'){
      if(!['portrait','token'].includes(variant))return null;
      const owned=await one('personal_tokens','id,owner_id,portrait_path,token_path',[
        ['id',resourceId],['owner_id',current]
      ]);
      if(!owned||owned.id!==resourceId||owned.owner_id!==current)return null;
      return asset('personal-token-art',variant==='portrait'?owned.portrait_path:owned.token_path);
    }
    if(kind!=='campaign-token-art'||!['portrait','token'].includes(variant))return null;
    const token=await one('map_tokens',
      'id,campaign_id,map_id,owner_id,character_id,npc_template_id,image_path',
      [['id',resourceId]]);
    if(!token||token.id!==resourceId||!validUuid(token.campaign_id)||!validUuid(token.map_id))return null;
    if(!await yes('can_view_campaign_map',{p_campaign:token.campaign_id,p_map:token.map_id}))return null;
    if(!await yes('can_observe_map_token',{p_token:token.id}))return null;
    if(variant==='token')return asset('tabletop-artwork',token.image_path);
    // Visible token is not permission to read a full owner sheet or NPC.
    const isDm=await yes('is_campaign_dm',{c:token.campaign_id});
    const isOwner=token.owner_id===current;
    if(!isDm&&!isOwner)return null;
    if(!!token.character_id===!!token.npc_template_id)return null;
    if(validUuid(token.character_id)){
      const character=await one('characters','id,campaign_id,user_id,portrait_path',[
        ['id',token.character_id],['campaign_id',token.campaign_id]
      ]);
      if(!character||character.id!==token.character_id||character.campaign_id!==token.campaign_id||
         (!isDm&&character.user_id!==current))return null;
      return asset('tabletop-artwork',character.portrait_path);
    }
    if(!isDm||!validUuid(token.npc_template_id))return null;
    const npc=await one('npc_templates','id,campaign_id,portrait_path',[
      ['id',token.npc_template_id],['campaign_id',token.campaign_id]
    ]);
    if(!npc||npc.id!==token.npc_template_id||npc.campaign_id!==token.campaign_id)return null;
    return asset('tabletop-artwork',npc.portrait_path);
  }
  async function loadPrivateBlob({bucket,path}={}){
    // Same signed user's Storage client: Storage RLS checks permission AGAIN
    // after the resource lookup. No service-role deputy or signed URL minted.
    if(!['battlemap-assets','tabletop-artwork','personal-token-art'].includes(bucket)||
       typeof path!=='string'||!path)return Promise.reject(invalid());
    const {data,error}=await db.storage.from(bucket).download(path);
    if(error||!(data instanceof Blob))throw invalid();
    return data;
  }
  return Object.freeze({resolveForCurrentUser,loadPrivateBlob});
}
