import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 extractR119PrivateJoinDefinitions,boundR119PrivateJoinDdl,sanitizedR119Receipt,r119SanitizedFailureReceipt,r119ValidateSyntheticInviteFormats
} from '../scripts/release/run-world-v2-r18-119-private-invite-fixture.mjs';

const source=readFileSync(new URL('../scripts/release/run-world-v2-r18-119-private-invite-fixture.mjs',import.meta.url),'utf8');
const body="BEGIN\nIF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required';END IF;\nINSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000101',auth.uid(),'player') ON CONFLICT DO NOTHING;\nRETURN '00000000-0000-4000-8000-000000000101';\nEND;\n";
const DDL=(tag,sql)=>"CREATE OR REPLACE FUNCTION public.join_campaign(p_invite_code text) RETURNS uuid\nLANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $"+tag+"$\n"+sql+"$"+tag+"$;\n";
const expected={
 name:'join_campaign',liveBytes:Buffer.byteLength('\n'+body),
 liveMd5:createHash('md5').update('\n'+body).digest('hex'),
 liveSha256:createHash('sha256').update('\n'+body).digest('hex')
};
const outcomes=Object.fromEntries([
 'firstJoinSucceeded','firstJoinIsPlayer','duplicateJoinPreservedPlayerRole',
 'dmDuplicatePreservedDmRole','removedPlayerRejoinedWithUnchangedInvite',
 'invalidInviteAddedMember','rotatedOldInviteAddedMember',
 'rotatedNewInviteAddedMember','nullActorChangedMemberCount',
 'anonymousJoinCallable','crossCampaignMembershipLeaked'
].map(k=>[k,false]));
test('R119 actual-join-compatible invite data uses 8 lowercase random bytes as hex',()=>{
 const good={
  inviteA:'a1b2c3d4e5f60708',inviteB:'b1c2d3e4f5a60708',
  newInviteA:'c1d2e3f4a5b60708',invalid:'f0e0d0c0b0a00000'
 };
 assert.equal(r119ValidateSyntheticInviteFormats(good),true);
 assert.equal(r119ValidateSyntheticInviteFormats({...good,inviteA:'A1B2C3D4E5F60708'}),false);
 assert.equal(r119ValidateSyntheticInviteFormats({...good,inviteB:good.inviteA}),false);
 assert.equal(r119ValidateSyntheticInviteFormats({...good,inviteA:'too-short'}),false);
 assert.equal(r119ValidateSyntheticInviteFormats({...good,inviteA:'g1b2c3d4e5f60708'}),false);
 const fixture=readFileSync(new URL('../tests/world-v2-r18-119/synthetic-docker-run.mjs',import.meta.url),'utf8');
 assert.match(fixture,/WHERE invite_code=lower\(trim\(p_invite_code\)\) FOR UPDATE/);
 assert.doesNotMatch(fixture,/lower\(invite_code\)=lower\(trim\(p_invite_code\)\)/);
 assert.match(source,/if\(!r119ValidateSyntheticInviteFormats\(V\)\)fail\(\)/);
});
test('R119 source must match the latest of 2 recovered function definitions',()=>{
 const original=DDL('old','BEGIN\nRETURN NULL;\nEND;\n');
 const latest=DDL('latest',body);
 const definitions=extractR119PrivateJoinDefinitions(original+latest);
 assert.equal(definitions.length,2);
 assert.equal(boundR119PrivateJoinDdl({definitions,live:expected}),
  latest.trim());
 assert.notEqual(definitions[0].body,definitions[1].body);
});
test('R119 accepts either safe PostgreSQL empty search_path form but rejects nonempty search_path',()=>{
 const latest=DDL('latest',body);
 const canonical=latest.replace("SET search_path=''","SET search_path TO ''");
 const list=extractR119PrivateJoinDefinitions(DDL('previous','BEGIN RETURN NULL; END;')+canonical);
 assert.equal(list.length,2);
 assert.equal(boundR119PrivateJoinDdl({definitions:list,live:expected}),canonical.trim());
 const insecure=latest.replace("SET search_path=''","SET search_path TO public");
 const bad=extractR119PrivateJoinDefinitions(DDL('previous','BEGIN RETURN NULL; END;')+insecure);
 assert.throws(()=>boundR119PrivateJoinDdl({definitions:bad,live:expected}),
   /R119 PRIVATE INVITATION FIXTURE NO-GO/);
});
test('R119 failed private runs produce only non-empty safe stage indicators, not raw errors',()=>{
 assert.match(source,/r119SanitizedFailureReceipt\(/);
 assert.match(source,/sourceDetailsIncluded:false,privateSqlExported:false/);
 assert.match(source,/safeStage='source_history_integrity'/);
 assert.match(source,/safeStage='source_function_definition'/);
 assert.match(source,/safeStage='docker_launch'/);
 assert.match(source,/safeStage='postgres_ready'/);
 assert.match(source,/safeStage='synthetic_schema_setup'/);
 assert.match(source,/safeStage='source_function_install'/);
 assert.match(source,/safeStage='invitation_behavior_checks'/);
 assert.doesNotMatch(source,/process\.stderr\.write\(.*(?:\.stack|\.message|JSON\.stringify\(.*?error)/);
});
test('R119 refuses missing/changed SHA, wrong source signature, old-only history and invalid DDL',()=>{
 const definitions=extractR119PrivateJoinDefinitions(DDL('latest',body));
 assert.equal(definitions.length,1);
 assert.throws(()=>boundR119PrivateJoinDdl({definitions,live:expected}),/R119 PRIVATE INVITATION FIXTURE NO-GO/);
 assert.throws(()=>boundR119PrivateJoinDdl({definitions:[definitions[0],definitions[0]],live:{...expected,liveSha256:'f'.repeat(64)}}),/R119 PRIVATE INVITATION FIXTURE NO-GO/);
 const wrong=DDL('bad',body).replace('SECURITY DEFINER','SECURITY INVOKER');
 const defs=extractR119PrivateJoinDefinitions(wrong+DDL('last',body));
 assert.equal(defs.length,2);
 assert.throws(()=>boundR119PrivateJoinDdl({definitions:[defs[1],defs[0]],live:expected}),/R119 PRIVATE INVITATION FIXTURE NO-GO/);
 assert.deepEqual(extractR119PrivateJoinDefinitions(
  'CREATE OR REPLACE FUNCTION public.join_campaign(p_name text) RETURNS uuid AS $x$'+body+'$x$;'),[]);
 assert.throws(()=>extractR119PrivateJoinDefinitions('z'.repeat(12*1024*1024+1)),/R119 PRIVATE INVITATION FIXTURE NO-GO/);
});
test('R119 synthetic evidence is sanitized and always NO_GO, even if source-exact call indicates rejoin',()=>{
 const a=sanitizedR119Receipt({...outcomes,removedPlayerRejoinedWithUnchangedInvite:true});
 assert.equal(a.schema,1);
 assert.equal(a.decision,'NO_GO');
 assert.equal(a.workPackage,'B10-R18-119');
 assert.equal(a.syntheticPg17NoNetworkContainer,true);
 assert.equal(a.noHostBindMounts,true);
 assert.equal(a.realSignedSupabaseAuthExercised,false);
 assert.equal(a.revokedPlayerInviteReuseObservedInSyntheticSourceExactTest,true);
 assert.equal(a.qaSqlApplied,false);
 assert.equal(a.originalSqlApplied,false);
 assert.equal(a.productionReleaseAuthorized,false);
 assert.doesNotMatch(JSON.stringify(a),/00000000-0000-4000-8000-000000000301|A1B2C3D4E5F60708|CREATE\s+OR\s+REPLACE\s+FUNCTION/);
 const b=sanitizedR119Receipt({...outcomes,removedPlayerRejoinedWithUnchangedInvite:false});
 assert.equal(b.decision,'NO_GO');
 assert.equal(b.revokedPlayerInviteReuseObservedInSyntheticSourceExactTest,false);
 assert.throws(()=>sanitizedR119Receipt({...outcomes,removedPlayerRejoinedWithUnchangedInvite:'YES'}),/R119 PRIVATE INVITATION FIXTURE NO-GO/);
});
test('R119 sanitized Docker failure classifications reveal no raw source or local paths',()=>{
 for(const code of ['docker_cli_unavailable','docker_local_daemon_unavailable_or_denied',
   'docker_postgres17_image_missing','docker_container_launch_rejected']){
  const r=r119SanitizedFailureReceipt('docker_preflight',code);
  assert.equal(r.reportStatus,'ERROR');
  assert.equal(r.decision,'NO_GO');
  assert.equal(r.safeFailureCode,code);
  assert.equal(r.privateSqlExported,false);
  assert.equal(r.originalOrQaSqlExecuted,false);
  assert.equal(r.productionReleaseAuthorized,false);
  assert.doesNotMatch(JSON.stringify(r),/password|sqlBody|docker\.sock|privateHistory|A1B2C3D4E5F60708/);
 }
 assert.equal(r119SanitizedFailureReceipt('anythingFromRawStderr','api-key').safeFailureCode,
  'not_classified');
 assert.equal(r119SanitizedFailureReceipt('anythingFromRawStderr','api-key').safeFailureStage,
  'initial_checks');
 const sourcePreflight=source.indexOf('preflightLocalDocker();');
 const sourceLoad=source.indexOf('const source=originalJoinDdl(workspace);');
 assert.ok(sourcePreflight>0 && sourceLoad>sourcePreflight);
 assert.match(source,/docker\(\['image','inspect','postgres:17'\]\)/);
 assert.match(source,/docker\(\['info','--format','\{\{\.ServerVersion\}\}'\]\)/);
 assert.match(source,/\['run','--pull=never','-d','--rm','--network','none'/);
});
test('R119 invitation failure report isolates step and SQLSTATE with no raw message leakage',()=>{
 const details={behaviorStep:'first_join_rpc',sqlstate:'P0001',
  path:'/private/secret.sql',rawSql:'do not reveal'};
 const r=r119SanitizedFailureReceipt('invitation_behavior_checks',
  'first_join_rpc_failed',details);
 assert.equal(r.safeFailureStage,'invitation_behavior_checks');
 assert.equal(r.safeBehaviorStep,'first_join_rpc');
 assert.equal(r.safeFailureCode,'first_join_rpc_failed');
 assert.equal(r.safePostgresSqlstate,'P0001');
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.privateSqlExported,false);
 assert.equal(r.originalOrQaSqlExecuted,false);
 assert.equal(r.productionReleaseAuthorized,false);
 assert.doesNotMatch(JSON.stringify(r),/secret|do not reveal|rawSql|sneaky/);
 const tampered=r119SanitizedFailureReceipt('invitation_behavior_checks',
  'reason:/private/secret',{behaviorStep:'sneaky/path',sqlstate:'P0001 ERROR private'});
 assert.equal(tampered.safeFailureCode,'not_classified');
 assert.equal(tampered.safeBehaviorStep,'not_started');
 assert.equal(tampered.safePostgresSqlstate,'unavailable');
 const prior=r119SanitizedFailureReceipt('docker_launch',
  'docker_container_launch_rejected',{behaviorStep:'first_join_rpc',sqlstate:'42501'});
 assert.equal(Object.hasOwn(prior,'safePostgresSqlstate'),false);
 assert.equal(Object.hasOwn(prior,'safeBehaviorStep'),false);
 assert.match(source,/VERBOSITY=sqlstate/);
 assert.match(source,/safeBehaviorStep='first_join_rpc'/);
 assert.match(source,/first_join_membership_missing/);
 assert.match(source,/first_join_role_not_player/);
 assert.match(source,/r119CurrentSanitizedFailure/);
});
test('R119 local scratch runner prohibits hosted DB target, network, ports, host mounts, release',()=>{
 for(const phrase of [
  "inspectR118PrivateInvitations({workspace})",
  "digest('sha256',latest.body)",
  "'--network','none'","'--read-only'","'--user','999:999'",
  "'--cap-drop=ALL'","'--security-opt=no-new-privileges'",
  "'--pids-limit','96'","'--memory','384m'","'--cpus','1'",
  "DOCKER_HOST","DATABASE_URL","SUPABASE_URL","PGOPTIONS",
  "noHostBindMounts:true","--ack-disposable-postgres-only=yes",
  "sourceSqlOutputOrLogsExported:false",
  "productionReleaseAuthorized:false"
 ])assert.ok(source.includes(phrase),phrase);
 assert.doesNotMatch(source,/\b(?:supabase\s+db|apply_migration|db push|migration repair)\b/i);
 const start=source.indexOf("const started=docker(['run'");
 const end=source.indexOf("{timeout:120000}",start);
 assert.ok(start>0&&end>start);
 const dockerRun=source.slice(start,end);
 assert.doesNotMatch(dockerRun,/['"]-p['"]|['"]--publish['"]|['"]-v['"]|['"]--volume['"]|['"]--mount['"]/);
 assert.match(source,/docker\(\['rm','-f',name\]/);
});
