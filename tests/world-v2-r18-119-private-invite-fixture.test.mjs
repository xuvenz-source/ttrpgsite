import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 extractR119PrivateJoinDefinitions,boundR119PrivateJoinDdl,sanitizedR119Receipt
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
test('R119 source must match the latest of 2 recovered function definitions',()=>{
 const original=DDL('old','BEGIN\nRETURN NULL;\nEND;\n');
 const latest=DDL('latest',body);
 const definitions=extractR119PrivateJoinDefinitions(original+latest);
 assert.equal(definitions.length,2);
 assert.equal(boundR119PrivateJoinDdl({definitions,live:expected}),
  latest.trim());
 assert.notEqual(definitions[0].body,definitions[1].body);
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
