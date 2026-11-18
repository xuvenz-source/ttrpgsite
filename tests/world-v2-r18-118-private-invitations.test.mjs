import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 R118_TARGETS,classifyR118InvitationBody,
 extractR118FunctionDefinitions,summarizeR118InvitationDefinition
} from '../scripts/release/inspect-world-v2-r18-118-private-invitations.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hash=(algorithm,value)=>createHash(algorithm).update(value,'utf8').digest('hex');
const JOIN=[
 ' declare actor uuid;',
 ' begin',
 ' actor:=auth.uid();',
 " if actor is null then raise exception 'Sign in required';end if;",
 ' insert into public.campaign_members(campaign_id,user_id,role)',
 " values('00000000-0000-4000-8000-000000000101',actor,'player')",
 ' on conflict do nothing;',
 ' end;'
].join('\n')+'\n';
const CREATE=[
 ' begin',
 ' insert into public.campaign_members(campaign_id,user_id,role)',
 " values('00000000-0000-4000-8000-000000000101',auth.uid(),'dm');",
 ' end;'
].join('\n')+'\n';
const build=(name,argument,tag,body)=>
 '-- synthetic test, not original SQL\nCREATE OR REPLACE FUNCTION public.'+name+
 '('+argument+" text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $"+tag+'$\n'+body+'$'+tag+'$;\n';
const spec=(name,argument,body)=>({
 name,argument,liveBytes:Buffer.byteLength(body,'utf8'),
 liveMd5:hash('md5',body),liveSha256:hash('sha256',body)
});
test('R118 pins current original SHA256 and MD5 plus exact sizes, not only weak MD5',()=>{
 assert.deepEqual(R118_TARGETS.map(x=>({
  name:x.name,bytes:x.liveBytes,sha256:x.liveSha256,md5:x.liveMd5
 })),[
  {name:'create_campaign',bytes:475,
   sha256:'0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f',
   md5:'9a12043761641127b6f60304eea876c5'},
  {name:'join_campaign',bytes:742,
   sha256:'5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655',
   md5:'9fd65eca8e3160acd7a674931aad51c5'}
 ]);
});
test('R118 source parser extracts only allowable named function bodies and picks latest',()=>{
 const old=JOIN.replace('on conflict do nothing','on conflict do update set role=excluded.role');
 const content=build('join_campaign','p_invite_code','old',old)+
  build('create_campaign','p_name','create',CREATE)+
  build('join_campaign','p_invite_code','latest',JOIN);
 const target={name:'join_campaign',argument:'p_invite_code'};
 const bodies=extractR118FunctionDefinitions(content,target);
 assert.equal(bodies.length,2);
 assert.equal(bodies.at(-1),'\n'+JOIN);
 const ex=spec('join_campaign','p_invite_code','\n'+JOIN);
 const report=summarizeR118InvitationDefinition({name:'join_campaign',definitions:bodies,expected:ex});
 assert.equal(report.latestHistoricalDefinitionMatchesCurrentLiveSha256,true);
 assert.equal(report.historicalDefinitionsFound,2);
 assert.equal(report.markersFromExactMatchedBodyOnly.onConflictDoNothing,true);
 assert.equal(report.markersFromExactMatchedBodyOnly.onConflictDoUpdate,false);
 assert.equal(report.markersFromExactMatchedBodyOnly.playerRoleLiteral,true);
 assert.equal(report.markersFromExactMatchedBodyOnly.dmRoleLiteral,false);
 assert.equal(report.sourceFingerprintIsNotSecurityApproval,true);
 assert.doesNotMatch(JSON.stringify(report),/Sign in required|insert into|00000000-0000/);
});
test('R118 denies false provenance from wrong body, missing source, comments, broken quotes, oversized input',()=>{
 const target={name:'join_campaign',argument:'p_invite_code'};
 const def=build('join_campaign','p_invite_code','t',JOIN);
 const actual=extractR118FunctionDefinitions(def,target);
 const ex=spec('join_campaign','p_invite_code','\n'+JOIN);
 assert.equal(summarizeR118InvitationDefinition({
  name:'join_campaign',definitions:actual,expected:{...ex,liveSha256:'f'.repeat(64)}
 }).latestHistoricalDefinitionMatchesCurrentLiveSha256,false);
 assert.equal(summarizeR118InvitationDefinition({
  name:'join_campaign',definitions:[],expected:ex
 }).markersFromExactMatchedBodyOnly,null);
 assert.deepEqual(extractR118FunctionDefinitions(
  '-- CREATE OR REPLACE FUNCTION public.join_campaign(p_invite_code text) AS $t$ fake',
  target
 ),[]);
 assert.deepEqual(extractR118FunctionDefinitions(
  build('join_campaign','p_name','t',JOIN),target
 ),[]);
 assert.throws(()=>extractR118FunctionDefinitions('x'.repeat(12*1024*1024+1),target),
  /R118 PRIVATE INVITATION SOURCE NO-GO/);
 assert.throws(()=>summarizeR118InvitationDefinition({
  name:'join_campaign',definitions:['x'.repeat(12*1024*1024+1)],expected:ex
 }),/R118 PRIVATE INVITATION SOURCE NO-GO/);
});
test('R118 marker classification does not equate absent markers with proof of safe revocation',()=>{
 const source=classifyR118InvitationBody(JOIN);
 assert.equal(source.directAuthIdentity,true);
 assert.equal(source.insertsCampaignMembership,true);
 assert.equal(source.onConflictDoNothing,true);
 assert.equal(source.onConflictDoUpdate,false);
 assert.equal(source.separateRevocationTable,false);
 assert.equal(source.revokedOrBannedVocabulary,false);
 const m=JSON.parse(read('staging/world-v2-b10-r18-118-invitation-source/manifest.json'));
 assert.equal(m.sourceBodyDownloadedFromOriginal,false);
 assert.equal(m.inviteCodesOrUserRowsRead,false);
 assert.equal(m.originalRegisteredMigrations,83);
 assert.equal(m.qaRegisteredMigrations,0);
 assert.equal(m.decision,'NO_GO');
 assert.ok(Object.values(m.releaseGates).every(v=>v===false));
 assert.equal(m.authorizedQaSqlWrites,false);
 assert.equal(m.authorizedProductionWrites,false);
});
test('R118 operator-only scanner never emits private SQL, paths, user rows or executes external calls',()=>{
 const s=read('scripts/release/inspect-world-v2-r18-118-private-invitations.mjs');
 assert.match(s,/inspectR98PrivateHistorySource/);
 assert.match(s,/verifyR118PrivateDocket/);
 assert.match(s,/r111-private-review-docket\.json/);
 assert.match(s,/originalHistoryAggregateSha256/);
 assert.match(s,/liveSha256Pinned/);
 assert.match(s,/qaHistoricalSqlInstallAuthorized:false/);
 assert.match(s,/private83SqlSecurityReviewApproved:false/);
 assert.doesNotMatch(s,/\b(?:fetch|spawnSync|execSync|writeFileSync|eval|apply_migration)\s*\(/);
 assert.doesNotMatch(s,/\b(?:supabase\s+db|psql\s+-|service_role\s*key)\b/);
});
