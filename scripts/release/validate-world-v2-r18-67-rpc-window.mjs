/**
 * R18-67 — offline paired delta validator for the four safe read-only
 * authenticated movement RPC snapshots. NOT a live CLI, performance approval,
 * p95 measurement or migration authorization.
 *
 * Only explicitly allowlisted counters leave this module. No arbitrary SQL,
 * coordinates, user IDs, token IDs, or credentials in reports/errors.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const fail=()=>{throw Error('R18-67 NO-GO: invalid, stale or incomparable RPC counter snapshots')};
export const R67_FAMILIES=Object.freeze(['begin','advance','commit','visibility']);
const KIND='B10-R18-67-world-v2-authenticated-rpc-counter-snapshot';
const ROOT_FIELDS=['schema','kind','observed_at','stats_reset','track_mode','db_role','families'];
const ROW_FIELDS=['family','variants','calls','totalExecMs','historicalMaxExecMs','sharedHits','sharedReads'];
const exactKeys=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const round3=x=>Math.round((x+Number.EPSILON)*1000)/1000;
const within=(p,dir)=>p===dir||p.startsWith(dir+sep);

export function validateR67Snapshot(value){
 const s=Array.isArray(value)&&value.length===1?
  value[0]?.world_v2_performance_snapshot:
  value?.world_v2_performance_snapshot??value;
 if(!exactKeys(s,ROOT_FIELDS)||s.schema!==1||s.kind!==KIND||
    s.db_role!=='authenticated'||s.track_mode!=='top'||
    typeof s.observed_at!=='string'||typeof s.stats_reset!=='string')
  fail();
 const captured=Date.parse(s.observed_at),reset=Date.parse(s.stats_reset);
 if(!Number.isFinite(captured)||!Number.isFinite(reset)||
    captured<reset||!Array.isArray(s.families)||
    s.families.length!==R67_FAMILIES.length)
  fail();
 const safe=[];
 for(let i=0;i<R67_FAMILIES.length;i++){
  const r=s.families[i];
  if(!exactKeys(r,ROW_FIELDS)||r.family!==R67_FAMILIES[i]||
    !integer(r.variants)||!integer(r.calls)||
    !numeric(r.totalExecMs)||!numeric(r.historicalMaxExecMs)||
    !integer(r.sharedHits)||!integer(r.sharedReads)||
    (r.calls===0&&(r.totalExecMs!==0||r.historicalMaxExecMs!==0||r.variants!==0))||
    (r.calls>0&&(r.variants===0||r.historicalMaxExecMs>r.totalExecMs+0.01)))
   fail();
  safe.push(Object.freeze({
   family:r.family,variants:r.variants,calls:r.calls,
   totalExecMs:r.totalExecMs,historicalMaxExecMs:r.historicalMaxExecMs,
   sharedHits:r.sharedHits,sharedReads:r.sharedReads
  }));
 }
 return Object.freeze({observedAt:captured,statsReset:reset,
  families:Object.freeze(safe)});
}

export function analyzeR67RpcWindow({before,after}={}){
 const a=validateR67Snapshot(before),b=validateR67Snapshot(after);
 const elapsed=b.observedAt-a.observedAt;
 if(a.statsReset!==b.statsReset||elapsed<=0||elapsed>6*60*60*1000)
  fail();
 const results=[];
 for(let i=0;i<R67_FAMILIES.length;i++){
  const x=a.families[i],y=b.families[i];
  if(y.calls<x.calls||y.totalExecMs+0.01<x.totalExecMs||
     y.sharedHits<x.sharedHits||y.sharedReads<x.sharedReads||
     y.historicalMaxExecMs+0.01<x.historicalMaxExecMs)
   fail();
  const deltaCalls=y.calls-x.calls;
  const deltaTotalMs=Math.max(0,y.totalExecMs-x.totalExecMs);
  if(deltaCalls===0&&deltaTotalMs>0.01)fail();
  results.push(Object.freeze({
   family:x.family,newCalls:deltaCalls,
   newDatabaseExecMs:round3(deltaTotalMs),
   meanDatabaseExecMs:deltaCalls?round3(deltaTotalMs/deltaCalls):null,
   status:deltaCalls>0?'MEASURED':'NO_SAMPLE',
   p95DatabaseMs:null,
   browserRttP95Ms:null,
   historicalMaxDatabaseExecMs:y.historicalMaxExecMs
  }));
 }
 return Object.freeze({
  schema:1,kind:'B10-R18-67-world-v2-rpc-delta',
  decision:'NO_GO',safeToDeploy:false,safeToApplySql:false,
  operatorAuthenticatedCliVerified:false,
  independentDmP1P2Verified:false,
  userIdsRecorded:false,sqlTextRecorded:false,
  sampleWindowMs:elapsed,
  statsResetUnchanged:true,
  statsResetAt:new Date(a.statsReset).toISOString(),
  measurements:Object.freeze(results)
 });
}

function privateInput(path){
 if(typeof path!=='string'||!path.trim())fail();
 const p=resolve(path),root=realpathSync(ROOT);
 if(within(p,root)||!lstatSync(p).isFile()||
    realpathSync(p)!==p||lstatSync(p).size>30000)fail();
 return JSON.parse(readFileSync(p,'utf8'));
}
function flag(name){
 const q='--'+name+'=';
 const hits=process.argv.slice(2).filter(x=>x.startsWith(q));
 if(hits.length!==1||!hits[0].slice(q.length))fail();
 return hits[0].slice(q.length);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.slice(2).length!==2||
     process.argv.slice(2).some(x=>
      !x.startsWith('--before=')&&!x.startsWith('--after=')))
   fail();
  const result=analyzeR67RpcWindow({
   before:privateInput(flag('before')),after:privateInput(flag('after'))
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R18-67 NO-GO: counter snapshots missing, unsafe or not comparable.\n');
  process.exitCode=1;
 }
}
