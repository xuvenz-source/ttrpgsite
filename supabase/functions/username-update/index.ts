import {createClient} from 'npm:@supabase/supabase-js@2.113.0';

// Username changes update the existing synthetic login email for native
// username/password accounts, while preserving real social-account emails.
const BASE_ORIGINS=new Set([
 'https://ttrpgsite.vercel.app',
 'https://ttrpgsite-ttrpg-site.vercel.app',
 'http://localhost:5173'
]);
const PREVIEW=/^https:\/\/ttrpgsite-[a-z0-9-]+-ttrpg-site\.vercel\.app$/;
const USERNAME=/^[a-z][a-z0-9_]{2,23}$/;
const DOMAIN='accounts.tabletopforge.example.com';
function cors(origin:string){
 return {
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'
 };
}
function response(origin:string,status:number,data:Record<string,unknown>){
 return new Response(JSON.stringify(data),{status,headers:cors(origin)});
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 if(!BASE_ORIGINS.has(origin)&&!PREVIEW.test(origin))
  return new Response('Forbidden',{status:403});
 if(request.method==='OPTIONS')return response(origin,200,{ok:true});
 if(request.method!=='POST')return response(origin,405,{ok:false,error:'POST required'});
 const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!bearer)return response(origin,401,{ok:false,error:'Sign in first.'});
 const raw=await request.text();
 if(raw.length>512)return response(origin,413,{ok:false,error:'Request too large'});
 let payload;
 try{payload=JSON.parse(raw)}catch{return response(origin,400,{ok:false,error:'Invalid request.'})}
 const username=String(payload?.username||'').trim().toLowerCase();
 if(!USERNAME.test(username))
  return response(origin,400,{ok:false,error:'Usernames must be 3–24 characters, starting with a letter; use letters, numbers or underscores.'});
 const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||
  JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
 if(!url||!secret)return response(origin,503,{ok:false,error:'Account service unavailable.'});
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:identity,error:authError}=await admin.auth.getUser(bearer);
 if(authError||!identity?.user)
  return response(origin,401,{ok:false,error:'Your session has expired. Sign in again.'});
 const me=identity.user;
 // Username/display names are exclusive. Never authorize identity changes
 // from user-editable metadata; only the verified JWT identifies the user.
 const perPage=1000;
 let exhausted=false;
 for(let page=1;page<=100;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage});
  if(error)return response(origin,503,{ok:false,error:'Unable to verify username availability.'});
  for(const user of data?.users||[]){
   if(user.id===me.id)continue;
   const claimed=String(user.user_metadata?.username||'').trim().toLowerCase();
   const synthetic=String(user.email||'').toLowerCase().endsWith('@'+DOMAIN)?
    String(user.email).toLowerCase().split('@')[0]:'';
   if(claimed===username||synthetic===username)
    return response(origin,409,{ok:false,error:'That username is already in use.'});
  }
  if((data?.users||[]).length<perPage){exhausted=true;break}
 }
 if(!exhausted)return response(origin,503,{ok:false,error:'Username verification is temporarily unavailable.'});
 const native=String(me.email||'').toLowerCase().endsWith('@'+DOMAIN);
 const updates:{
  email?:string;
  email_confirm?:boolean;
  user_metadata:Record<string,unknown>;
 }={
  user_metadata:{...(me.user_metadata||{}),username,display_name:username,
   ...(native?{tabletop_username:true}:{})}
 };
 if(native){
  updates.email=username+'@'+DOMAIN;
  updates.email_confirm=true;
 }
 const {error}=await admin.auth.admin.updateUserById(me.id,updates);
 if(error){
  const conflict=/already|exists|registered|duplicate|unique/i.test(error.message||'');
  return response(origin,conflict?409:400,{ok:false,
   error:conflict?'That username is already taken.':error.message||'Could not update username.'});
 }
 return response(origin,200,{ok:true,username});
});
