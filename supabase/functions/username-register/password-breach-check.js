/** Privacy-preserving check of passwords exposed in known data breaches.
 * HIBP receives only the first five hex digits of the SHA-1 hash; the
 * password and complete hash never leave this Edge Function.
 * SHA-1 is used only for HIBP's published k-anonymity lookup format,
 * NEVER for password storage (Supabase Auth stores passwords separately).
 */
export async function isCompromisedPassword(password,request=fetch) {
 if(typeof password!=='string'||!password.length)throw Error('Password required');
 const hashBuffer=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(password));
 const hash=Array.from(new Uint8Array(hashBuffer))
  .map(byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
 const prefix=hash.slice(0,5),suffix=hash.slice(5);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),3500);
 try {
  const response=await request('https://api.pwnedpasswords.com/range/'+prefix,{
   method:'GET',
   headers:{'Add-Padding':'true','User-Agent':'TabletopForge-Signup/1.0'},
   signal:controller.signal
  });
  if(!response.ok)throw Error('Password breach service unavailable');
  const body=await response.text();
  // A padded HIBP line with count 0 is not an exposed password.
  return body.split(/\r?\n/).some(line=>{
   const [found,count]=line.split(':',2);
   return found?.toUpperCase()===suffix && /^[1-9][0-9]*$/.test(count||'');
  });
 }finally{clearTimeout(timeout)}
}
