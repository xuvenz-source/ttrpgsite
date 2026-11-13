/**
 * B10-R18-53. Inert, offline-only verifier for a read-only production survey.
 * Confirms known source identities and cumulative telemetry shape; cannot
 * isolate per-trigger time, prove provenance, or authorize migrations.
 */
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const fail=s=>{throw Error('R53 FOG DIAGNOSTIC NO-GO: '+s);};
export const R53_FOG_DEPENDENCIES=Object.freeze({
 'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)':'f87014e7a967d1db1262dabe9e125552',
 'forge_visibility.tick_tokens()':'f6c2eef860141bff253024e0f6d8c7ba',
 'forge_visibility.viewers_affected_by_token_move(public.map_tokens,public.map_tokens)':'18ee8bd8e81d681dc22aecd50eb66425',
 'forge_visibility.bump_tick_scoped(uuid,uuid[])':'f75e231c06bef2912c9b013ea9735cdc',
 'forge_visibility.bump_viewer_ticks(uuid,uuid[])':'fead41e37dfd6e2fa30499829e24bd02',
 'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)':'ee3356af321fec1a3e167a75c6245e86',
 'forge_visibility.fog_cells_diff(jsonb,jsonb)':'0c477595f2fd916d3520a792bbe52cd7'
});
const triggerExpected=Object.freeze({
 forge_visibility_token_tick:'CREATE TRIGGER forge_visibility_token_tick AFTER INSERT OR DELETE OR UPDATE ON map_tokens FOR EACH ROW EXECUTE FUNCTION forge_visibility.tick_tokens()',
 forge_player_collision:'CREATE TRIGGER forge_player_collision BEFORE UPDATE OF x, y, span_x, span_y, map_id ON map_tokens FOR EACH ROW EXECUTE FUNCTION forge_visibility.enforce_collision()'
});
const intNonNegative=x=>Number.isSafeInteger(x)&&x>=0;
const numNonNegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function validateR53FogEvidence({receipt,now=new Date()}={}){
 if(Array.isArray(receipt)){
  if(receipt.length!==1)fail('expected one read-only SQL result');
  receipt=receipt[0]?.diagnostic_receipt;
 }else if(receipt?.diagnostic_receipt)receipt=receipt.diagnostic_receipt;
 if(!receipt||receipt.schema!==1||
    receipt.kind!=='B10-R18-53-fog-commit-dependency-readonly'||
    'decision' in receipt||'safeToApply' in receipt||
    'releaseApproved' in receipt||'productionApproval' in receipt||
    'deploymentApproved' in receipt||'releaseDecision' in receipt)
  fail('invalid or forged release receipt');
 const t=Date.parse(receipt.observed_at),tn=new Date(now).getTime();
 if(!Number.isFinite(t)||!Number.isFinite(tn)||t>tn+120000||tn-t>900000)
  fail('stale/future read-only snapshot');
 const h=receipt.history;
 if(!h||h.applied!==83||h.last_version!=='20261109171247'||
    h.r05_installed!==false)
  fail('live SQL history drift or R05 installed');
 const functions=receipt.function_hashes;
 const pairs=Object.entries(R53_FOG_DEPENDENCIES);
 if(!Array.isArray(functions)||functions.length!==pairs.length)
  fail('expected seven original function sources');
 const seen=new Set();
 for(const row of functions){
  if(!row||typeof row.signature!=='string'||seen.has(row.signature)||
     row.present!==true||typeof row.source_md5!=='string'||
     R53_FOG_DEPENDENCIES[row.signature]!==row.source_md5)
   fail('unexpected function source, missing identity or duplicate');
  seen.add(row.signature);
 }
 if(seen.size!==pairs.length)
  fail('one or more originals absent');
 const triggers=receipt.triggers;
 if(!Array.isArray(triggers)||triggers.length!==2)
  fail('expected precisely token collision and fog triggers');
 const names=new Set();
 for(const row of triggers){
  if(!row||typeof row.name!=='string'||names.has(row.name)||
     row.enabled!=='O'||triggerExpected[row.name]!==row.definition)
   fail('unexpected, disabled or missing token trigger');
  names.add(row.name);
 }
 if(names.size!==2)fail('missing canonical token triggers');
 const f=receipt.footprint;
 if(!f||!['tokens','fog_maps','viewer_snapshots','viewer_tick_rows']
  .every(key=>intNonNegative(f[key])))
  fail('invalid aggregate visibility footprint');
 const m=receipt.measurement;
 if(!m||m.scope!=='CUMULATIVE_PG_STAT_STATEMENTS_NOT_COMPONENT_TIME'||
    typeof m.track_functions!=='string'||!['none','pl','all'].includes(m.track_functions)||
    m.waiting_locks_at_snapshot!==0||
    !Number.isFinite(Date.parse(m.stats_reset))||Date.parse(m.stats_reset)>t||
    !Array.isArray(m.rpc_aggregates)||m.rpc_aggregates.length!==2)
  fail('missing or misleading historical telemetry');
 const phases=new Set();
 for(const row of m.rpc_aggregates){
  if(!['advance','commit'].includes(row?.phase)||phases.has(row.phase)||
     !intNonNegative(row.calls)||row.calls===0||
     !numNonNegative(row.mean_db_ms)||!numNonNegative(row.max_db_ms)||
     row.max_db_ms<row.mean_db_ms)
   fail('malformed cumulative RPC measurement');
  phases.add(row.phase);
 }
 if(phases.size!==2)fail('missing Advance/Commit aggregate');
 return Object.freeze({
  decision:'DIAGNOSTIC_ONLY',safeToApply:false,
  observedAt:new Date(t).toISOString(),historicalMigrations:83,
  exactOriginalFunctionHashes:7,enabledTokenTriggers:2,
  cumulativeMeasurementsOnly:true,
  measuredTriggerExclusiveLatency:false,isolatedFogContributionProven:false,
  signedDmP1P2QAPassed:false,productionApproval:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==1||!args[0].startsWith('--receipt=')||
     !args[0].slice('--receipt='.length))fail('one --receipt=... path required');
  const input=JSON.parse(readFileSync(resolve(args[0].slice('--receipt='.length)),'utf8'));
  process.stdout.write(JSON.stringify(validateR53FogEvidence({receipt:input}),null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
