/**
 * B10-R18-175: UNMOUNTED SYNTHETIC-ONLY prototype for per-request
 * authorized private image delivery. No Supabase adapter, private key,
 * deployed Edge Function, or live route is included.
 *
 * authenticate(token) MUST verify the currently signed-in user via
 * Supabase Auth getUser, never untrusted JWT metadata or cached client role.
 * resolveForCurrentUser MUST query current server-side membership, map,
 * token observation and ownership for the actual resource on every request;
 * it returns its trusted private Storage bucket and path or null.
 * loadPrivateBlob MUST fetch authorized private bytes only from the backend,
 * and must never return a bearer signed URL or redirect.
 * In-flight responses and previously downloaded bytes are not revocable.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_BUCKET=Object.freeze({
  'map-image':'battlemap-assets',
  'campaign-token-art':'tabletop-artwork',
  'personal-token-art':'personal-token-art'
});
const ALLOWED_VARIANTS=Object.freeze({
  'map-image':Object.freeze(['map']),
  'campaign-token-art':Object.freeze(['portrait','token']),
  'personal-token-art':Object.freeze(['portrait','token'])
});
const MIME=Object.freeze(new Set(['image/png','image/jpeg','image/webp','image/gif']));
const DENY_HEADERS=Object.freeze({
  'Cache-Control':'private, no-store, max-age=0, must-revalidate',
  'Pragma':'no-cache',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Vary':'Origin, Authorization'
});
const isFunction=x=>typeof x==='function';
const validUuid=x=>typeof x==='string'&&UUID.test(x);
const validPath=x=>typeof x==='string'&&x.length<=512&&x.length>0&&
  !x.startsWith('/')&&!x.endsWith('/')&&/^[a-zA-Z0-9_.\/-]+$/.test(x)&&
  x.split('/').every(segment=>segment.length>0&&segment!=='.'&&segment!=='..');
const mimeMatch=(bytes,mime)=>{
  const b=[...bytes];
  if(mime==='image/png')return b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
  if(mime==='image/jpeg')return b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;
  if(mime==='image/gif')return b.length>=6&&String.fromCharCode(...b.slice(0,6)) in {'GIF87a':1,'GIF89a':1};
  if(mime==='image/webp')return b.length>=12&&
    String.fromCharCode(...b.slice(0,4))==='RIFF'&&
    String.fromCharCode(...b.slice(8,12))==='WEBP';
  return false;
};
async function readJsonWithin(request,maxBytes){
  const len=request.headers.get('content-length');
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>maxBytes))return {kind:'large'};
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))
    return {kind:'invalid'};
  if(!request.body)return {kind:'invalid'};
  const reader=request.body.getReader();
  let size=0,chunks=[];
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){void reader.cancel().catch(()=>{});return {kind:'large'};}
      chunks.push(value);
    }
  }catch{return {kind:'invalid'};}
  finally{try{reader.releaseLock();}catch{}}
  const all=new Uint8Array(size);let cursor=0;
  for(const c of chunks){all.set(c,cursor);cursor+=c.byteLength;}
  let parsed;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}
  catch{return {kind:'invalid'};}
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||
     Object.keys(parsed).sort().join(',')!=='kind,resourceId,variant'||
     !Object.hasOwn(EXPECTED_BUCKET,parsed.kind)||
     !validUuid(parsed.resourceId)||
     !ALLOWED_VARIANTS[parsed.kind].includes(parsed.variant))return {kind:'invalid'};
  return {kind:'ok',payload:parsed};
}
export function createCampaignPrivateMediaGateway({
  authenticate,resolveForCurrentUser,loadPrivateBlob,
  allowedOrigins=[],maxRequestBytes=1024,maxImageBytes=8*1024*1024
}={}){
  if(![authenticate,resolveForCurrentUser,loadPrivateBlob].every(isFunction)||
     !Array.isArray(allowedOrigins)||!allowedOrigins.every(o=>typeof o==='string'&&/^https:\/\/[^\s/]+$/.test(o))||
     !Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<64||maxRequestBytes>4096||
     !Number.isSafeInteger(maxImageBytes)||maxImageBytes<=0||maxImageBytes>32*1024*1024)
    throw new TypeError('Invalid private media prototype configuration');
  const origins=new Set(allowedOrigins);
  return async function handle(request){
    const origin=request.headers.get('origin');
    const originAllowed=origin===null||origins.has(origin);
    const h=new Headers(DENY_HEADERS);
    if(origin!==null&&originAllowed){
      h.set('Access-Control-Allow-Origin',origin);
      h.set('Access-Control-Allow-Methods','POST, OPTIONS');
      h.set('Access-Control-Allow-Headers','authorization, apikey, content-type');
    }
    const fail=(status)=>new Response(null,{status,headers:h});
    if(!originAllowed)return fail(403);
    if(request.method==='OPTIONS')return fail(204);
    if(request.method!=='POST'){h.set('Allow','POST, OPTIONS');return fail(405);}
    // No asset authorization/data access before a fresh identity check.
    const header=request.headers.get('authorization')||'';
    const match=/^Bearer ([A-Za-z0-9._~-]{12,8192})$/.exec(header);
    if(!match)return fail(401);
    let user;
    try{user=await authenticate(match[1]);}
    catch{return fail(401);}
    if(!validUuid(user?.id))return fail(401);
    const parsed=await readJsonWithin(request,maxRequestBytes);
    if(parsed.kind!=='ok')return fail(parsed.kind==='large'?413:400);
    const {kind,resourceId,variant}=parsed.payload;
    let asset;
    try{
      // MUST use live server authorization per resource, never stale client role.
      asset=await resolveForCurrentUser({userId:user.id,kind,resourceId,variant});
    }catch{return fail(503);}
    if(!asset)return fail(404);
    if(asset.bucket!==EXPECTED_BUCKET[kind]||!validPath(asset.path))return fail(503);
    let blob;
    try{blob=await loadPrivateBlob({bucket:asset.bucket,path:asset.path});}
    catch{return fail(503);}
    // No signed URL, HTML, SVG, arbitrary redirect or over-cap output.
    if(!(blob instanceof Blob)||blob.size===0||blob.size>maxImageBytes||
       !MIME.has(blob.type))return fail(503);
    let headerBytes;
    try{headerBytes=new Uint8Array(await blob.slice(0,16).arrayBuffer());}
    catch{return fail(503);}
    if(!mimeMatch(headerBytes,blob.type))return fail(503);
    h.set('Content-Type',blob.type);
    h.set('Content-Length',String(blob.size));
    // No full second copy; actual Storage SDK allocations require QA profiling.
    return new Response(blob.stream(),{status:200,headers:h});
  };
}
export const R175_LIVE_ENABLED=false;
