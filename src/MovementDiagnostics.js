/** Bounded, data-free local performance counters for live stress testing.
 * Excludes coordinates, secrets, actor IDs, map IDs and message payloads.
 * No network/storage/React updates occur per drag event.
 */
export function createMovementDiagnostics({clock=()=>performance.now(),limit=128}={}){
 const stats=new Map(),counts=new Map();
 function record(name,duration){
  if(typeof name!=='string'||!Number.isFinite(duration)||duration<0)return;
  let a=stats.get(name);
  if(!a){a=[];stats.set(name,a)}
  a.push(duration);
  if(a.length>limit)a.splice(0,a.length-limit);
 }
 function count(name){
  if(typeof name!=='string'||!/^[a-z][a-zA-Z0-9-]{0,64}$/.test(name))return;
  counts.set(name,(counts.get(name)||0)+1);
 }
 function begin(name){
  const t=clock();
  return()=>record(name,clock()-t);
 }
 function snapshot(){
  const result={};
  for(const [name,values] of stats){
   const sorted=[...values].sort((a,b)=>a-b);
   const at=p=>Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]*10)/10;
   result[name]={samples:sorted.length,p50Ms:at(.5),p95Ms:at(.95),
    maxMs:at(1)};
  }
  if(counts.size)result.counts=Object.fromEntries(counts);
  return result;
 }
 return {record,begin,count,snapshot,clear:()=>{stats.clear();counts.clear()}};
}
export const movementDiagnostics=createMovementDiagnostics();
