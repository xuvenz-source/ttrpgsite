/** R18-180. Unmounted user-JWT Supabase client factory. No secrets or deployment. */
import {createCampaignPrivateMediaGateway} from '../world-v2-b10-r18-175-private-media-gateway-prototype/CampaignPrivateMediaGateway.mjs';
import {createUserScopedMediaAdapters} from '../world-v2-b10-r18-176-user-rls-media-resolver/UserScopedMediaAdapters.mjs';
export const R180_LIVE_ENABLED=false;
function valid({createClient,projectUrl,publishableKey}){
 if(typeof createClient!=='function'||typeof publishableKey!=='string'||
  !/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(publishableKey))return false;
 let u;try{u=new URL(projectUrl)}catch{return false}
 return u.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)&&
  u.username===''&&u.password===''&&u.pathname==='/'&&u.search===''&&u.hash==='';
}
export function createRequestIsolatedMediaHandler({
 createClient,projectUrl,publishableKey,allowedOrigins,maxRequestBytes,maxImageBytes
}={}){
 if(!valid({createClient,projectUrl,publishableKey}))
  throw new TypeError('A publishable key and HTTPS Supabase URL are required');
 return async function handle(request){
  // Never put a user, JWT or Supabase client in a module/global closure.
  let adapters=null;
  const gateway=createCampaignPrivateMediaGateway({
   allowedOrigins,maxRequestBytes,maxImageBytes,
   authenticate:async token=>{
    try{
     const db=createClient(projectUrl,publishableKey,{
      global:{headers:{Authorization:'Bearer '+token}},
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
     });
     if(typeof db?.auth?.getUser!=='function')return null;
     const {data,error}=await db.auth.getUser(token);
     if(error||!data?.user?.id)return null;
     adapters=createUserScopedMediaAdapters({db,verifiedUserId:data.user.id});
     return {id:data.user.id};
    }catch{return null}
   },
   resolveForCurrentUser:params=>adapters?adapters.resolveForCurrentUser(params):null,
   loadPrivateBlob:params=>{
    if(!adapters)throw new Error('No verified per-request user');
    return adapters.loadPrivateBlob(params);
   }
  });
  return gateway(request);
 };
}
