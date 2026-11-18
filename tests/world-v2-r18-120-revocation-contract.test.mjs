import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const json=()=>JSON.parse(read('staging/world-v2-b10-r18-120-revocation-contract/manifest.json'));
const sql=read('staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql');
const suite=read('tests/world-v2-r18-120-postgres/verify-contract.sql');
const fixture=read('tests/world-v2-r18-120-postgres/setup.sql');
const runner=read('tests/world-v2-r18-120-postgres/run.sh');

test('R120 explicitly remains unapproved, uninstalled, nonversioned source-only prototype',()=>{
 const m=json();
 assert.equal(m.workPackage,'B10-R18-120');
 assert.equal(m.parentPr,225);
 assert.equal(m.parentSha,'61efecebdb135da3bdb522e446a52fdc92e4a6f3');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceEvidence.removedPlayerRejoinedViaUnchangedInvite,true);
 assert.equal(m.sourceEvidence.realSignedHostedUsersTested,false);
 assert.equal(m.prototype.type,'UNAPPLIED_SCRATCH_ONLY_NOT_VERSIONED_MIGRATION');
 assert.equal(m.prototype.syntheticJoinFunctionIsOriginalCurrentLiveBody,false);
 assert.equal(m.originalSqlModified,false);
 assert.equal(m.qaSqlModified,false);
 assert.equal(m.noMerge,true);
 assert.equal(m.noPaidInfrastructure,true);
 assert.equal(m.noProductionDeployment,true);
 assert.ok(Object.values(m.releaseGates).every(x=>x===false));
});
test('R120 revocation record is private, RLS-enabled, non-client-writable',()=>{
 assert.match(sql,/CREATE SCHEMA forge_security/);
 assert.match(sql,/REVOKE ALL ON SCHEMA forge_security FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/CREATE TABLE forge_security\.campaign_member_revocations/);
 assert.match(sql,/ALTER TABLE forge_security\.campaign_member_revocations ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON forge_security\.campaign_member_revocations FROM PUBLIC,anon,authenticated/);
 assert.equal((sql.match(/CREATE TRIGGER v2_campaign_member_/g)||[]).length,2);
 assert.match(sql,/BEFORE DELETE ON public\.campaign_members/);
 assert.match(sql,/BEFORE INSERT ON public\.campaign_members/);
 assert.match(sql,/RAISE EXCEPTION 'DM reinstatement required' USING ERRCODE='42501'/);
 assert.match(sql,/ON CONFLICT \(campaign_id,user_id\)\s*DO UPDATE SET removed_at=/);
 assert.doesNotMatch(sql,/\bGRANT (?:SELECT|INSERT|UPDATE|DELETE) ON forge_security\.campaign_member_revocations TO (?:PUBLIC|anon|authenticated)/i);
});
test('R120 controlled RPCs check live DM membership and cannot reset arbitrary revocations',()=>{
 for(const name of ['leave_campaign','dm_remove_campaign_player','dm_reinstate_campaign_player']){
  assert.match(sql,new RegExp('CREATE FUNCTION public\\.'+name+'\\('));
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+name+'\\('));
  assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'\\('));
 }
 assert.equal((sql.match(/LANGUAGE plpgsql SECURITY DEFINER SET search_path=''/g)||[]).length,5);
 assert.match(sql,/m\.campaign_id=p_campaign AND m\.user_id=actor AND m\.role='dm'/);
 assert.match(sql,/m\.campaign_id=p_campaign AND m\.user_id=p_player AND m\.role='player'/);
 assert.match(sql,/m\.campaign_id=p_campaign AND m\.user_id=actor AND m\.role='player'/);
 assert.match(sql,/IF changed_count<>1 THEN\s+RETURN false/);
 assert.match(sql,/INSERT INTO public\.campaign_members\(campaign_id,user_id,role\)\s+VALUES\(p_campaign,p_player,'player'\)/);
 assert.doesNotMatch(sql,/\b(?:user_metadata|raw_user_meta_data|auth\.jwt)\b/i);
});
test('R120 35 independent source-only permission/leave/reinstate scenarios',()=>{
 const labels=[...suite.matchAll(/-- R120_CASE \d{2} ([A-Z0-9_]+)/g)].map(x=>x[1]);
 assert.equal(labels.length,35);
 assert.equal(new Set(labels).size,35);
 assert.equal(json().prototype.scratchScenarioStatements,35);
 for(const name of [
  'DM_REMOVES_PLAYER','REVOKED_MARKER_PERSISTS',
  'REVOKED_OLD_INVITE_DENIED','REVOKED_CANNOT_VOLUNTARILY_CLEAR',
  'VOLUNTARY_LEAVE_CLEARS_MARKER','VOLUNTARY_LEAVER_REJOINS',
  'FOREIGN_DM_CANNOT_REMOVE_A_PLAYER','PLAYER_CANNOT_REMOVE_MEMBER',
  'DM_REINSTATES_REVOKED_PLAYER','DM_REINSTATE_CLEARS_MARKER',
  'DM_CANNOT_CREATE_ARBITRARY_MEMBER','PLAYER_CANNOT_REINSTATE_OTHER',
  'REMOVED_P1_DENIED_EVEN_NEW_CODE','NEVER_MEMBER_P4_USES_ROTATED_CODE',
  'DIRECT_ADMIN_DELETE_P2_STAMPS_MARKER','ADMIN_DIRECT_DELETE_TOMBSTONE',
  'ADMIN_REMOVED_P2_CANNOT_REJOIN','DM_REINSTATES_ADMIN_REMOVED_PLAYER'
 ]) assert.ok(labels.includes(name),name);
 assert.match(suite,/WHEN SQLSTATE '42501'/);
 assert.match(suite,/R120 PG17 CONTRACT PASS: 35\/35/);
});
test('R120 checks fixture only; never uses original private SQL or hosted Supabase connection',()=>{
 assert.match(fixture,/CREATE FUNCTION public\.join_campaign/);
 assert.match(fixture,/Minimal schema models receipt-confirmed join_campaign/);
 assert.match(fixture,/not original source/i);
 assert.match(runner,/GITHUB_ACTIONS/);
 assert.match(runner,/R120_ISOLATED/);
 assert.match(runner,/127\.0\.0\.1/);
 assert.match(runner,/world_v2_r18_120/);
 assert.match(runner,/DATABASE_URL DIRECT_URL SUPABASE_URL/);
 assert.equal((runner.match(/^deny "/gm)||[]).length,9);
 assert.match(runner,/R120 NO_GO/);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:link|db push|migration repair|db reset)\b/i);
});
