/**
 * B10-R18-50. Offline-only release baseline verifier.
 * Verifies one read-only SQL result and frozen source files; it does not
 * independently attest who collected the result. It cannot authorize SQL.
 */
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR48NarrowPackage} from './validate-world-v2-r18-48-narrow-package.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const HISTORY='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const md5s=new Map([
 ['forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4145e4a7b1eee062196e91fffd052be1'],
 ['public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4b38b5e7116a3ff9abc8a99f58755126'],
 ['public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','f87014e7a967d1db1262dabe9e125552'],
 ['forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)','129d3d872050dd44da989fc5c36a816e'],
 ['forge_world_v2.observer_path_status(forge_world_v2.motion_sessions,uuid,text,uuid,jsonb,jsonb,integer,integer,integer)','fe246c2a813edb77179dfa6c3632face'],
 ['forge_world_v2.viewer_on_map(uuid,uuid,uuid)','d31f0c5cf2be78374b348f12c4e756a5'],
 ['public.get_world_visibility_v2(uuid)','88f8da7421b36f5375aa26e798a4a08b'],
 ['forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)','6dcd75ce4719cd0bf6173f77f75fdf32'],
 ['forge_visibility.enforce_collision()','7e652f0f2334980ccc724e1748d334ba'],
 ['forge_visibility.enforce_tool_collision()','771ea1716498a43210661532f9c24977']
]);
const fail=s=>{throw Error('R50 READONLY NO-GO: '+s);};
const validHex32=s=>typeof s==='string'&&/^[0-9a-f]{32}$/.test(s);
const exactBool=(o,key,want)=>o?.[key]===want;
export function validateR50ReadOnlyReceipt({receipt,repoRoot=ROOT,now=new Date()}={}){
 const root=realpathSync(resolve(repoRoot));
 const source=validateR48NarrowPackage({repoRoot:root});
 if(source.decision!=='NO_GO'||source.safeToApply!==false||
    source.pendingWithR05!==8||!source.originalStepValidatorPreserved)
  fail('upstream R18-48 source narrow seal not approved for audit');
 const raw=receipt;
 if(Array.isArray(raw)){
  if(raw.length!==1)fail('expected exactly one result row');
  receipt=raw[0]?.release_receipt;
 }else if(raw&&typeof raw==='object'&&raw.release_receipt){
  receipt=raw.release_receipt;
 }
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||
    receipt.schema!==1||receipt.kind!=='B10-R18-50-live-readonly'||
    'safeToApply' in receipt||'deploymentApproved' in receipt||
    'releaseDecision' in receipt)
  fail('invalid read-only receipt or forged release decision');
 const recorded=Date.parse(receipt.observed_at),nowMs=new Date(now).getTime();
 if(!Number.isFinite(recorded)||!Number.isFinite(nowMs)||
    recorded>nowMs+120000||nowMs-recorded>15*60000)
  fail('stale, future-dated or invalid read-only snapshot');
 const baseline=JSON.parse(readFileSync(join(root,HISTORY),'utf8'));
 if(baseline.originalMigrationVersionCount!==83||
    baseline.expectedNewestVersion!=='20261109171247'||
    !Array.isArray(baseline.rows)||baseline.rows.length!==83)
  fail('frozen R18-08 history baseline drift');
 const history=receipt.migration_history;
 if(!Array.isArray(history)||history.length!==83)
  fail('exact 83 historical SQL fingerprints required');
 const pinned=new Map(baseline.rows.map(x=>[x.version,x])),observed=new Set();
 for(const x of history){
  if(!x||!(/^\d{14}$/.test(x.version))||observed.has(x.version)||
     !validHex32(x.fetched_sql_md5)||!Number.isSafeInteger(x.statement_count))
   fail('duplicate, malformed or invalid SQL-body history record');
  observed.add(x.version);
  const target=pinned.get(x.version);
  if(!target||target.name!==x.name||
     target.statement_count!==x.statement_count||
     target.fetched_sql_md5!==x.fetched_sql_md5)
   fail('83-history version/name/count/SQL-body drift at '+x.version);
 }
 if(!observed.has('20261109171247')||observed.has('20261111023204'))
  fail('incorrect pre-R05 final history');
 const functions=receipt.authority_sources;
 if(!Array.isArray(functions)||functions.length!==md5s.size)
  fail('expected exactly ten authority fingerprints');
 const seen=new Set();
 for(const f of functions){
  if(!f||typeof f.signature!=='string'||seen.has(f.signature)||
     f.present!==true||!validHex32(f.source_md5))
   fail('missing or malformed critical authority function');
  seen.add(f.signature);
  if(md5s.get(f.signature)!==f.source_md5)
   fail('live authority source hash drift '+f.signature);
 }
 if(seen.size!==md5s.size)fail('missing critical authority source');
 const p=receipt.preinstall;
 if(!p||!exactBool(p,'r05_installed',false)||
    !exactBool(p,'atomic_rpc_present',false)||
    !exactBool(p,'r05_backup_present',false)||
    !exactBool(p,'r20_campaign_guard_present',false)||
    !exactBool(p,'r05_observer_pending_present',false)||
    p.active_motion_sessions!==0)
  fail('unexpected R05/R18 partial installation or active movement');
 const a=receipt.access;
 if(!a||!exactBool(a,'anon_internal_schema_usage',false)||
    !exactBool(a,'authenticated_internal_schema_usage',false)||
    !exactBool(a,'anon_advance_execute',false)||
    !exactBool(a,'anon_commit_execute',false)||
    !exactBool(a,'authenticated_advance_execute',true)||
    !exactBool(a,'authenticated_commit_execute',true))
  fail('V2 authority ACL drift');
 const metrics=receipt.point_in_time;
 if(!metrics||metrics.waiting_database_locks!==0||
    !Number.isSafeInteger(metrics.database_sessions)||metrics.database_sessions<0||
    !Number.isSafeInteger(metrics.configured_max_connections)||
    metrics.configured_max_connections<1)
  fail('unexpected instantaneous lock or database configuration');
 return Object.freeze({
  decision:'NO_GO',
  audit:'READ_ONLY_POINT_IN_TIME',
  safeToApply:false,
  matchedRemoteHistory:83,
  matchedAuthorityFunctions:10,
  unappliedNarrowMigrations:8,
  observedAt:new Date(recorded).toISOString(),
  waitingLocksAtSnapshot:0,
  independentRemoteProvenanceAttested:false,
  executedLinkedCliDryRun:false,
  independentlySignedDmP1P2Passed:false,
  liveFreeTierLoadTestPassed:false,
  productionApproval:false
 });
}
function argument(key){
 const matches=process.argv.slice(2).filter(x=>x.startsWith('--'+key+'='));
 if(matches.length!==1||!matches[0].slice(key.length+3))
  fail('required single --'+key+'=... argument');
 return matches[0].slice(key.length+3);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const other=process.argv.slice(2).filter(x=>!x.startsWith('--receipt='));
  if(other.length)fail('unexpected command-line arguments');
  const path=resolve(argument('receipt'));
  const report=validateR50ReadOnlyReceipt({receipt:JSON.parse(readFileSync(path,'utf8'))});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
