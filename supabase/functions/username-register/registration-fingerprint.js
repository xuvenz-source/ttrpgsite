/** Stable per-day, per-source abuse fingerprint.
 * The Turnstile secret stays server-side. HMAC import requires the hash
 * algorithm (Web Crypto HmacImportParams), not the bare string 'HMAC'.
 * Never log the secret, originating IP, or generated fingerprint.
 */
export async function registrationFingerprint(secret,source,at=new Date()){
 if(typeof secret!=='string'||!secret)throw Error('Registration secret unavailable');
 if(typeof source!=='string'||!source)throw Error('Registration source unavailable');
 const day=at.toISOString().slice(0,10);
 const key=await crypto.subtle.importKey('raw',
  new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const data=new TextEncoder().encode(source+'|'+day+'|tabletopforge-signup');
 const digest=await crypto.subtle.sign('HMAC',key,data);
 return Array.from(new Uint8Array(digest))
  .map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
