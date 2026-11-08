/** One expiring, bounded signed-asset cache for character art and map images.
 * Signed URLs are bearer links: invalidate it on auth identity transitions.
 * A single timer refreshes active subscribers instead of one timer per image.
 */
export function createSignedAssetStore({
 ttlMs=54*60*1000,maxEntries=250,now=()=>Date.now(),
 setTimer=setTimeout,clearTimer=clearTimeout,
 sign=(db,bucket,path)=>db.storage.from(bucket).createSignedUrl(path,3600)
}={}){
 const entries=new Map();
 let timer=null,epoch=0;
 const keyFor=(bucket,path)=>JSON.stringify([bucket,path]);
 function schedule(){
  if(timer!==null){clearTimer(timer);timer=null}
  let earliest=Infinity;
  for(const e of entries.values())
   if(e.listeners.size>0&&!e.promise)
    earliest=Math.min(earliest,e.expires);
  if(earliest===Infinity)return;
  timer=setTimer(()=>{
   timer=null;
   for(const e of entries.values()){
    if(e.listeners.size>0&&!e.promise&&e.expires<=now()+1000)
     void load(e);
   }
   schedule();
  },Math.max(1000,earliest-now()));
 }
 function entry(db,bucket,path){
  const key=keyFor(bucket,path);
  let e=entries.get(key);
  if(!e){
   e={key,db,bucket,path,url:'',expires:0,promise:null,listeners:new Set()};
   entries.set(key,e);
  }else{
   e.db=db;
   // Move most-recently-used entries to the end for bounded eviction.
   entries.delete(key);entries.set(key,e);
  }
  if(entries.size>maxEntries){
   for(const [id,item] of entries){
    if(entries.size<=maxEntries)break;
    if(item.listeners.size===0&&!item.promise)entries.delete(id);
   }
  }
  return e;
 }
 async function load(e){
  if(e.promise)return e.promise;
  if(e.url&&e.expires>now()+15000)return e.url;
  const version=epoch;
  const work=(async()=>{
   try{
    const {data,error}=await sign(e.db,e.bucket,e.path);
    if(error)throw error;
    const url=data?.signedUrl||'';
    if(version!==epoch)return '';
    e.url=url;
    e.expires=now()+(url?ttlMs:60000);
    for(const notify of e.listeners)notify(url);
    return url;
   }catch(error){
    if(version===epoch){
     e.expires=now()+60000;
     console.warn('Signed artwork URL unavailable',error);
    }
    return '';
   }
  })();
  e.promise=work;
  try{return await work}finally{
   if(e.promise===work)e.promise=null;
   if(version===epoch)schedule();
  }
 }
 function subscribe(db,bucket,path,notify){
  if(!db||!path){notify('');return()=>{}}
  const e=entry(db,bucket,path);
  e.listeners.add(notify);
  if(e.url&&e.expires>now()+15000)notify(e.url);
  else void load(e);
  schedule();
  return()=>{
   e.listeners.delete(notify);
   if(e.listeners.size===0&&e.expires<now())entries.delete(e.key);
   schedule();
  };
 }
 function clear(){
  epoch++;
  if(timer!==null){clearTimer(timer);timer=null}
  // Active components keep their subscriptions. Invalidating rather than
  // deleting them prevents images going blank after a same-tab auth change.
  for(const [key,e] of entries){
   e.url='';e.expires=0;e.promise=null;
   for(const notify of e.listeners)notify('');
   if(e.listeners.size>0)void load(e);
   else entries.delete(key);
  }
  schedule();
 }
 return {subscribe,clear,
  // Reuse a still-valid signed image synchronously across temporary token
  // unmount/remount cycles (e.g. visibility revisions). Never cache beyond
  // its expiry or across auth identity changes.
  peek:(db,bucket,path)=>{
   if(!db||!path)return '';
   const cached=entries.get(keyFor(bucket,path));
   return cached&&cached.url&&cached.expires>now()+15000?cached.url:'';
  },
  get:(db,bucket,path)=>!db||!path?
  Promise.resolve(''):load(entry(db,bucket,path)),
  stats:()=>({entries:entries.size,subscribers:[...entries.values()].reduce((n,e)=>n+e.listeners.size,0)})};
}
export const signedAssetStore=createSignedAssetStore();
