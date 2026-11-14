/**
 * R18-62 — Browser-origin-only return address for Supabase Auth.
 *
 * Supabase's documented preview allowlist uses a URL path, often '/**'.
 * A bare location.origin has no trailing '/', and may not match it.
 * Preserve the same host (never production-hardcode or accept a query/
 * fragment) and canonicalize to the URL root for OAuth and email OTP.
 *
 * SECURITY: This helper cannot add the server-side Supabase Auth Redirect
 * URL allowlist entry. A preview host still requires an exact approved
 * redirect URL in the Auth dashboard. Do not broadly whitelist vercel.app.
 */
export function authReturnUrlForOrigin(currentOrigin){
 if(typeof currentOrigin!=='string'||currentOrigin.length>300)
  throw Error('Invalid browser origin for authentication');
 const origin=currentOrigin.endsWith('/')?
  currentOrigin.slice(0,-1):currentOrigin;
 let target;
 try{target=new URL(origin)}catch{
  throw Error('Invalid browser origin for authentication');
 }
 if(!target.hostname||target.origin!==origin||
    (target.protocol!=='https:'&&
     !(target.protocol==='http:'&&
       ['localhost','127.0.0.1','[::1]'].includes(target.hostname)))||
    target.username||target.password||target.pathname!=='/'||
    target.search||target.hash)
  throw Error('Invalid browser origin for authentication');
 return target.origin+'/';
}
