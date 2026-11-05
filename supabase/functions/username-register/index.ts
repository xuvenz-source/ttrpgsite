import {createClient} from 'npm:@supabase/supabase-js@2.113.0';

const ACCEPTED_ORIGINS=new Set([
 'https://ttrpgsite.vercel.app',
 'https://ttrpgsite-ttrpg-site.vercel.app',
 'http://localhost:5173'
]);
const USERNAME=/^[a-z][a-z0-9_]{2,23}$/;
const domain='accounts.tabletopforge.example.com';
function respond(origin,status,payload){
 return new Response(JSON.stringify(payload),{
  status,headers:{
   'Content-Type':'application/json',
   'Cache-Control':'no-store',
   'Access-Control-Allow-Origin':origin,
   'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
   'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Vary':'Origin'
  }
 });
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(!ACCEPTED_ORIGINS.has(origin))return new Response('Forbidden',{status:403});
 if(req.method==='OPTIONS')return respond(origin,200,{ok:true});
 if(req.method!=='POST')return respond(origin,405,{ok:false,error:'POST required'});
 const raw=await req.text();
 if(raw.length>2000)return respond(origin,413,{ok:false,error:'Request too large'});
 let payload;
 try{payload=JSON.parse(raw)}catch{return respond(origin,400,{ok:false,error:'Invalid request'})}
 const username=String(payload?.username||'').trim().toLowerCase();
 const password=typeof payload?.password==='string'?payload.password:'';
 if(!USERNAME.test(username))return respond(origin,400,{ok:false,error:'Use a username 3–24 characters long, starting with a letter and using only letters, numbers or underscores.'});
 if(password.length<10||password.length>128||password.toLowerCase().includes(username)){
  return respond(origin,400,{ok:false,error:'Choose a password of 10–128 characters that does not contain your username.'});
 }
 const url=Deno.env.get('SUPABASE_URL');
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||
   JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
 if(!url||!secret)return respond(origin,503,{ok:false,error:'Account creation is temporarily unavailable'});
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const source=(req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||
   req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim();
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
   source+'|'+new Date().toISOString().slice(0,10)+'|tabletopforge-signup'));
 const fingerprint=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
 const {data:allowed,error:limitError}=await admin.rpc('claim_tabletop_registration_slot',{p_fingerprint:fingerprint});
 if(limitError||allowed!==true)return respond(origin,429,{ok:false,error:'Too many account registrations. Try again tomorrow.'});
 const {error}=await admin.auth.admin.createUser({
  email:username+'@'+domain,password,email_confirm:true,
  user_metadata:{username,display_name:username,tabletop_username:true}
 });
 if(error){
  const duplicate=/already|registered|exists|unique|duplicate/i.test(error.message||'');
  return respond(origin,duplicate?409:400,{ok:false,
   error:duplicate?'That username is already taken.':error.message||'Could not create account.'});
 }
 return respond(origin,201,{ok:true});
});
