/**
 * R146 synthetic PostgreSQL17 lock-order interleavings.
 * Must run after R145 isolated fixture, NEVER hosted Supabase.
 * Reproduces the old inverse-order risk and checks new protocol completion.
 * Not an original 83-migration or real signed-client concurrency test.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const env=process.env;
const required={GITHUB_ACTIONS:'true',R138_ISOLATED:'yes',R140_ISOLATED:'yes',
 R142_ISOLATED:'yes',R143_ISOLATED:'yes',R145_ISOLATED:'yes',
 R146_ISOLATED:'yes',PGHOST:'127.0.0.1',PGPORT:'5432',
 PGUSER:'postgres',PGDATABASE:'world_v2_r18_138',PGPASSWORD:'r138_disposable_only'};
for(const [key,value] of Object.entries(required))
 assert.equal(env[key],value,'R146 refuses any non-disposable database '+key);
for(const key of ['DATABASE_URL','DIRECT_URL','SUPABASE_URL','SUPABASE_DB_URL',
 'SUPABASE_DATABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY',
 'PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS'])
 assert.equal(env[key]||'','', 'R146 hosted env forbidden '+key);
const args=['-X','-qAt','-v','ON_ERROR_STOP=1'];
function sql(query){
 const r=spawnSync('psql',[...args,'-c',query],{encoding:'utf8',env,
  timeout:15000,maxBuffer:1024*1024});
 if(r.error)throw r.error;
 if(r.status!==0)throw Error('R146 SQL setup failed '+r.stderr.slice(0,1500));
 return r.stdout.trim();
}
const connections=new Set();
function transaction(name,query){
 const proc=spawn('psql',[...args,'-c',query],{
  env:{...env,PGAPPNAME:name},stdio:['ignore','pipe','pipe']});
 connections.add(proc);
 let stdout='',stderr='';
 proc.stdout.on('data',s=>{stdout+=String(s)});
 proc.stderr.on('data',s=>{stderr+=String(s)});
 const timer=setTimeout(()=>proc.kill('SIGKILL'),14000);
 const completed=new Promise((resolve,reject)=>{
  proc.on('error',reject);
  proc.on('close',code=>{
   clearTimeout(timer);connections.delete(proc);
   resolve({name,code,stdout,stderr});
  });
 });
 return {proc,completed};
}
async function waitLock(name,relation){
 const query="SELECT count(*) FROM pg_stat_activity a JOIN pg_locks l "+
  "ON l.pid=a.pid WHERE a.application_name='"+name+"' AND "+
  "l.relation='"+relation+"'::regclass AND l.mode='RowShareLock' AND l.granted";
 for(let i=0;i<45;i++){
  if(Number(sql(query))>=1)return;
  await delay(65);
 }
 throw Error('R146 failed to observe controlled lock '+name+' '+relation);
}
const campaign="'00000000-0000-4000-8000-000000000101'";
const p1="'00000000-0000-4000-8000-000000000303'";
const dm="'00000000-0000-4000-8000-000000000301'";
const map="'00000000-0000-4000-8000-000000000201'";
const note="'00000000-0000-4000-8000-000000000603'";
const pin="'00000000-0000-4000-8000-000000000611'";
function reset(){
 sql("UPDATE public.campaign_handouts SET revealed=true,collected=false "+
  "WHERE id="+note+"; UPDATE public.campaign_map_pins SET visible=true WHERE id="+pin);
}
function ok(out,label){
 if(out.code!==0)throw Error(label+' '+out.name+' exit='+out.code+' '+out.stderr.slice(0,850));
}
try{
 sql("INSERT INTO public.campaign_members(campaign_id,user_id,role) "+
  "VALUES("+campaign+","+p1+",'player') ON CONFLICT DO NOTHING;"+
  "INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id) "+
  "VALUES("+campaign+","+p1+","+map+") "+
  "ON CONFLICT(campaign_id,user_id) DO UPDATE SET map_id=excluded.map_id;"+
  "UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only' WHERE singleton=true");
 // Scenario 1: DM handout row locked first, then hides pin. New collector
 // waits on handout, checks pin after wake, and fails closed without deadlock.
 reset();
 const dmFirst=transaction('r146_dm_hides_pin',
  "BEGIN;SELECT pg_catalog.set_config('request.jwt.claim.sub',"+dm+",true);"+
  "SELECT id FROM public.campaign_handouts WHERE id="+note+" FOR UPDATE;"+
  "SELECT pg_sleep(2);"+
  "UPDATE public.campaign_handouts SET revealed=false WHERE id="+note+";COMMIT;");
 await waitLock('r146_dm_hides_pin','public.campaign_handouts');
 const collectorSecond=transaction('r146_new_collector_waits',
  "BEGIN;SELECT pg_catalog.set_config('request.jwt.claim.sub',"+p1+",true);"+
  "SELECT coalesce(forge_v3_api.collect_authorized_pin_once_v3("+pin+")::text,'NULL');"+
  "COMMIT;");
 const [a,b]=await Promise.all([dmFirst.completed,collectorSecond.completed]);
 ok(a,'DM first');
 ok(b,'V3 collector after DM');
 assert.match(b.stdout,/\bNULL\b/,'hidden pin should be denied after lock wait');
 assert.equal(sql("SELECT visible::text FROM public.campaign_map_pins WHERE id="+pin),'false');
 // Scenario 2: collector holds handout before DM hides pin. The DM waits;
 // both finish (not an inverse row-lock cycle) then visible pin is hidden.
 reset();
 const p1First=transaction('r146_new_collector_first',
  "BEGIN;SELECT pg_catalog.set_config('request.jwt.claim.sub',"+p1+",true);"+
  "SELECT id FROM public.campaign_handouts WHERE id="+note+" FOR UPDATE;"+
  "SELECT pg_sleep(2);"+
  "SELECT forge_v3_api.collect_authorized_pin_once_v3("+pin+");COMMIT;");
 await waitLock('r146_new_collector_first','public.campaign_handouts');
 const dmSecond=transaction('r146_dm_hides_after_collect',
  "BEGIN;SELECT pg_catalog.set_config('request.jwt.claim.sub',"+dm+",true);"+
  "UPDATE public.campaign_handouts SET revealed=false WHERE id="+note+";COMMIT;");
 const [c,d]=await Promise.all([p1First.completed,dmSecond.completed]);
 ok(c,'V3 collector first');
 ok(d,'DM second');
 assert.match(c.stdout,/"result": "collected"|"result":"collected"/);
 assert.equal(sql("SELECT visible::text FROM public.campaign_map_pins WHERE id="+pin),'false');
 // Scenario 3: intentionally force the OLD collector PIN->HANDOUT against
 // DM concealment HANDOUT->PIN. At least one should be aborted by PG deadlock
 // detection; this demonstrates the hazard, not a live production result.
 reset();
 const oldFirst=transaction('r146_old_collector_pin_first',
  "BEGIN;SELECT pg_catalog.set_config('request.jwt.claim.sub',"+p1+",true);"+
  "SELECT id FROM public.campaign_map_pins WHERE id="+pin+" FOR UPDATE;"+
  "SELECT pg_sleep(2);"+
  "SELECT public.collect_campaign_map_pin("+pin+");COMMIT;");
 await waitLock('r146_old_collector_pin_first','public.campaign_map_pins');
 const dmOld=transaction('r146_dm_old_inverse_order',
  "BEGIN;SELECT pg_catalog.set_config('request.jwt.claim.sub',"+dm+",true);"+
  "SELECT id FROM public.campaign_handouts WHERE id="+note+" FOR UPDATE;"+
  "SELECT pg_sleep(1);"+
  "UPDATE public.campaign_handouts SET revealed=false WHERE id="+note+";COMMIT;");
 await waitLock('r146_dm_old_inverse_order','public.campaign_handouts');
 const [e,f]=await Promise.all([oldFirst.completed,dmOld.completed]);
 const failures=[e,f].filter(x=>x.code!==0);
 assert.ok(failures.some(x=>/deadlock detected/i.test(x.stderr)),
  'R146 expected original inverse-order deadlock; results '+JSON.stringify([e,f]).slice(0,1500));
 console.log(JSON.stringify({
  workPackage:'B10-R18-146',fixture:'DISPOSABLE_SYNTHETIC_PG17',
  newCollectorDmFirst:'NO_DEADLOCK_HIDDEN_PIN_DENIED',
  newCollectorPlayerFirst:'NO_DEADLOCK_DM_HIDES_AFTER_COLLECTION',
  legacyInverseOrder:'EXPECTED_DEADLOCK_DETECTED',
  originalSupabaseDatabaseTested:false,signedPlayersTested:false,
  productionRelease:'NO_GO'
 }));
}finally{
 for(const proc of connections)if(proc.exitCode===null)proc.kill('SIGKILL');
 try{sql("UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced' WHERE singleton=true")}catch{}
}
