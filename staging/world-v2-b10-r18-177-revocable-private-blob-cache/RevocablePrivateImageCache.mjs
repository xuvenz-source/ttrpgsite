/**
 * B10-R18-177 — Dormant browser cache for server-authorized image blobs.
 * No bearer URLs or user tokens. Local UI hygiene only, NOT server auth
 * and NOT a way to erase copies or already downloaded bytes.
 * authorize() must be called only after a FRESH signed R123 membership proof.
 * revoke() synchronously hides URLs when the campaign is no longer allowed.
 */
export const R177_LIVE_ENABLED=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const variants={
  'map-image':['map'],
  'campaign-token-art':['portrait','token'],
  'personal-token-art':['portrait','token']
};
const valid=x=>typeof x==='string'&&UUID.test(x);
const wanted=(kind,id,variant)=>Object.hasOwn(variants,kind)&&valid(id)&&variants[kind].includes(variant);
export function createRevocablePrivateImageCache({loadBlob,createUrl,revokeUrl,maxEntries=250}={}){
  if(typeof loadBlob!=='function'||typeof createUrl!=='function'||typeof revokeUrl!=='function'||
     !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>1000)
    throw new TypeError('Invalid private image cache configuration');
  let phase='closed',context=null,revision=0;
  const entries=new Map();
  function revokeEntry(e){
    try{e.abort?.abort();}catch{}
    if(e.url){try{revokeUrl(e.url)}catch{}}
    e.url='';e.promise=null;
    for(const fn of e.listeners){try{fn('')}catch{}}
    e.listeners.clear();
  }
  function purge(){
    ++revision;
    for(const e of entries.values())revokeEntry(e);
    entries.clear();
  }
  function revoke(){
    if(phase==='disposed')return false;
    phase='revoked';context=null;
    purge(); // synchronous visible URL mask and pending-load invalidation
    return true;
  }
  function authorize({userId,campaignId,freshProof}={}){
    if(phase==='disposed'||!valid(userId)||!valid(campaignId)||freshProof!==true)
      return false;
    // No reuse across campaign switches, accounts or membership epochs.
    purge();context=Object.freeze({userId,campaignId});phase='authorized';
    return true;
  }
  function makeKey(kind,id,variant){return JSON.stringify([kind,id,variant]);}
  function getEntry(kind,id,variant){
    if(phase!=='authorized'||!wanted(kind,id,variant))return null;
    const key=makeKey(kind,id,variant);
    const existing=entries.get(key);
    if(existing){entries.delete(key);entries.set(key,existing);return existing;}
    while(entries.size>=maxEntries){
      const oldest=[...entries].find(([_,e])=>e.listeners.size===0);
      if(!oldest)return null; // hard bound; do not discard displayed URLs
      revokeEntry(oldest[1]);entries.delete(oldest[0]);
    }
    const e={kind,id,variant,listeners:new Set(),url:'',promise:null,abort:null};
    entries.set(key,e);return e;
  }
  async function load(e){
    if(phase!=='authorized'||!e)return '';
    if(e.url)return e.url;
    if(e.promise)return e.promise;
    const epoch=revision,expected=context,abort=new AbortController();
    e.abort=abort;
    const promise=(async()=>{
      try{
        // Backend must independently check every resource; local proof
        // alone never grants server-side bytes.
        const blob=await loadBlob({kind:e.kind,resourceId:e.id,variant:e.variant,
          context:expected,signal:abort.signal});
        if(phase!=='authorized'||revision!==epoch||context!==expected||abort.signal.aborted||
           !(blob instanceof Blob)||blob.size<=0)return '';
        const url=createUrl(blob);
        if(typeof url!=='string'||!url.startsWith('blob:')){
          if(typeof url==='string'&&url){try{revokeUrl(url)}catch{}}
          return '';
        }
        if(phase!=='authorized'||revision!==epoch||abort.signal.aborted){
          try{revokeUrl(url)}catch{};return '';
        }
        e.url=url;
        for(const fn of e.listeners){try{fn(url)}catch{}}
        return url;
      }catch{return ''}
    })();
    e.promise=promise;
    try{return await promise}finally{
      if(e.promise===promise)e.promise=null;
      if(e.abort===abort)e.abort=null;
    }
  }
  function subscribe(kind,id,variant,notify){
    if(typeof notify!=='function')throw new TypeError('Subscriber required');
    notify(''); // never show a previous campaign asset
    const e=getEntry(kind,id,variant);
    if(!e)return ()=>{};
    e.listeners.add(notify);
    if(e.url)notify(e.url);else void load(e);
    return ()=>{
      if(!e.listeners.delete(notify))return;
      if(e.listeners.size===0&&entries.get(makeKey(kind,id,variant))===e){
        revokeEntry(e);entries.delete(makeKey(kind,id,variant));
      }
    };
  }
  function peek(kind,id,variant){
    if(phase!=='authorized'||!wanted(kind,id,variant))return '';
    return entries.get(makeKey(kind,id,variant))?.url||'';
  }
  async function get(kind,id,variant){return load(getEntry(kind,id,variant));}
  function dispose(){if(phase==='disposed')return;revoke();phase='disposed';}
  return Object.freeze({authorize,revoke,subscribe,peek,get,dispose,
    stats:()=>Object.freeze({phase,entries:entries.size,
      activeSubscribers:[...entries.values()].reduce((n,e)=>n+e.listeners.size,0)})});
}
