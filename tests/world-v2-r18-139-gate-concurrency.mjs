/**
 * R139 disposable-PG17 concurrency demonstration.
 * Must run only AFTER the R138 fictional fixture has installed R132's gate.
 * Measures synthetic SQL overhead only. No hosted or free-tier performance claim.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const env=process.env;
const required={
 GITHUB_ACTIONS:'true',R138_ISOLATED:'yes',R139_ISOLATED:'yes',
 PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'world_v2_r18_138',
 PGUSER:'postgres',PGPASSWORD:'r138_disposable_only'
};
for(const [key,value] of Object.entries(required))
 assert.equal(env[key],value,'R139 rejects non-disposable Postgres: '+key);
for(const key of ['DATABASE_URL','DIRECT_URL','SUPABASE_URL','SUPABASE_DB_URL',
 'SUPABASE_DATABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY',
 'PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS'])
 assert.equal(env[key]||'','', 'R139 rejects hosted credential: '+key);
const args=['-X','-qAt','-v','ON_ERROR_STOP=1'];
function sql(query,{allowError=false}={}){
 const result=spawnSync('psql',[...args,'-c',query],{
  encoding:'utf8',env,timeout:15000,maxBuffer:1024*1024
 });
 if(result.error)throw result.error;
 if(!allowError&&result.status!==0)
  throw Error('R139 SQL failed: '+String(result.stderr).slice(0,1500));
 return result;
}
function holder(name){
 const query='BEGIN; SELECT forge_scene_drain.scene_v3_publish_allowed();'+
  ' SELECT pg_sleep(4); COMMIT;';
 const proc=spawn('psql',[...args,'-c',query],{
  env:{...env,PGAPPNAME:name},stdio:['ignore','pipe','pipe']
 });
 let error='';
 proc.stderr.on('data',d=>{error+=String(d)});
 const ended=new Promise((resolve,reject)=>{
  proc.on('error',reject);
  proc.on('close',code=>code===0?resolve():reject(Error(name+': '+error)));
 });
 return {proc,ended};
}
async function countHolders(){
 const query="SELECT count(DISTINCT a.pid) "+
  "FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid "+
  "WHERE a.application_name IN ('r139_gate_a','r139_gate_b') "+
  "AND l.relation='forge_scene_drain.scene_publication_gate'::regclass "+
  "AND l.mode='RowShareLock' AND l.granted";
 return Number(sql(query).stdout.trim());
}
function explainMs(query){
 const r=sql('EXPLAIN (ANALYZE, FORMAT JSON) '+query);
 const parsed=JSON.parse(r.stdout.trim());
 const n=parsed?.[0]?.['Execution Time'];
 if(typeof n!=='number'||!Number.isFinite(n)||n<0)
  throw Error('R139 expected finite synthetic execution time');
 return n;
}
assert.equal(sql("SELECT mode FROM forge_scene_drain.scene_publication_gate").stdout.trim(),'fenced');
assert.equal(sql('SELECT forge_scene_drain.scene_v3_publish_allowed()').stdout.trim(),'f');
const a=holder('r139_gate_a'),b=holder('r139_gate_b');
try{
 let shared=0;
 for(let i=0;i<40;i++){
  shared=await countHolders();
  if(shared===2)break;
  await delay(75);
 }
 assert.equal(shared,2,'Both signed-equivalent trusted gate reads must coexist');
 const blocked=sql("SET lock_timeout='350ms'; UPDATE "+
  "forge_scene_drain.scene_publication_gate SET mode='fenced' WHERE singleton=true",
  {allowError:true});
 assert.notEqual(blocked.status,0,
  'Fence writer unexpectedly passed while shared readers held the row');
 assert.match(blocked.stderr,/lock timeout/i);
 await Promise.all([a.ended,b.ended]);
 assert.equal(sql("SELECT mode FROM forge_scene_drain.scene_publication_gate").stdout.trim(),'fenced');
 const baseline=explainMs('SELECT g FROM generate_series(1,500) AS g');
 const gated=explainMs('SELECT forge_scene_drain.scene_v3_publish_allowed() FROM generate_series(1,500)');
 // No latency threshold: this fictional, local, unloaded fixture is not the
 // actual 83-migration collision/LOS runtime or nano/free-tier workload.
 console.log(JSON.stringify({
  workPackage:'B10-R18-139',isolation:'DISPOSABLE_PG17',
  concurrentShareGateReaders:2,fenceUpdateBlockedUntilReadersExit:true,
  simulatedGateCalls:500,baselineExplainExecutionMs:baseline,
  gatedExplainExecutionMs:gated,
  signedQa:false,freeTierBenchmark:false,productionDecision:'NO_GO'
 }));
}finally{
 for(const h of [a,b])if(h.proc.exitCode===null)h.proc.kill('SIGTERM');
 await Promise.allSettled([a.ended,b.ended]);
}
