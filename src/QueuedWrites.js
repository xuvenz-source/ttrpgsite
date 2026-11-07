/** Debounce rapid edits without losing write ordering.
 * Each dispatched snapshot retains its original target context. A newer
 * revision prevents an older write from reporting an outdated "Saved" state.
 */
export function createDebouncedSerialWriter(write,{
 delay=280,setTimer=setTimeout,clearTimer=clearTimeout,
 onSaved=()=>{},onError=()=>{}
}={}){
 let pending=null,timer=null,revision=0;
 let queue=Promise.resolve();
 function flush(){
  if(timer!==null){clearTimer(timer);timer=null}
  if(!pending)return queue;
  const job=pending;pending=null;
  const work=queue.catch(()=>{}).then(()=>write(job.value,job.context));
  queue=work;
  void work.then(()=>{
   if(job.revision===revision)onSaved(job);
  },error=>{
   if(job.revision===revision)onError(error,job);
  });
  return work;
 }
 function schedule(value,context,{immediate=false}={}){
  const job={value,context,revision:++revision};
  pending=job;
  if(timer!==null){clearTimer(timer);timer=null}
  if(immediate)void flush();
  else timer=setTimer(()=>{timer=null;void flush()},delay);
  return job.revision;
 }
 return {schedule,flush,get pending(){return !!pending},
  get revision(){return revision}};
}
