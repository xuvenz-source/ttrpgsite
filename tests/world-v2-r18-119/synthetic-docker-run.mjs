/**
 * CI synthetic-only smoke test of the SAME local no-network Docker harness
 * used for the private source-exact operator test.
 * NEVER includes or accesses original historical SQL or real invite codes.
 */
import assert from 'node:assert/strict';
import {runR119IsolatedFixtureWithDdl,r119CurrentSanitizedFailure}
 from '../../scripts/release/run-world-v2-r18-119-private-invite-fixture.mjs';

const synthetic=String.raw`
CREATE OR REPLACE FUNCTION public.join_campaign(p_invite_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $synthetic_ci$
DECLARE actor uuid := auth.uid();
target uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required';END IF;
 SELECT id INTO target FROM public.campaigns
  WHERE invite_code=lower(trim(p_invite_code)) FOR UPDATE;
 IF target IS NULL THEN RAISE EXCEPTION 'Invalid code';END IF;
 INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES(target,actor,'player') ON CONFLICT DO NOTHING;
 -- The live original join RPC also reads/inserts public.characters.
 -- Keep the synthetic smoke fixture honest about that table dependency.
 IF NOT EXISTS(
  SELECT 1 FROM public.characters ch
  WHERE ch.campaign_id=target AND ch.user_id=actor
 ) THEN
  INSERT INTO public.characters(campaign_id,user_id,name)
   VALUES(target,actor,'Synthetic character');
 END IF;
 RETURN target;
END;
$synthetic_ci$;
`;
const receipt=runR119IsolatedFixtureWithDdl(synthetic);
assert.equal(receipt.workPackage,'B10-R18-119');
assert.equal(receipt.decision,'NO_GO');
assert.equal(receipt.syntheticPg17NoNetworkContainer,true);
assert.equal(receipt.noHostBindMounts,true);
assert.equal(receipt.currentOriginalJoinSha256VerifiedLocally,false);
assert.deepEqual(receipt.outcomes,{
 firstJoinSucceeded:true,
 firstJoinIsPlayer:true,
 duplicateJoinPreservedPlayerRole:true,
 dmDuplicatePreservedDmRole:true,
 removedPlayerRejoinedWithUnchangedInvite:true,
 invalidInviteAddedMember:false,
 rotatedOldInviteAddedMember:false,
 rotatedNewInviteAddedMember:true,
 nullActorChangedMemberCount:false,
 anonymousJoinCallable:false,
 crossCampaignMembershipLeaked:false
});
assert.equal(receipt.productionReleaseAuthorized,false);
console.log('R119 SYNTHETIC DOCKER FIXTURE PASS: ephemeral PG17 joined, revoked and rejoined; NO hosted SQL, no original source, NO_GO.');

const rejectedSynthetic=synthetic.replace(
 ' SELECT id INTO target FROM public.campaigns',
 " RAISE EXCEPTION 'SYNTHETIC_ONLY_ERROR_DO_NOT_EXPORT';\n SELECT id INTO target FROM public.campaigns"
);
assert.notEqual(rejectedSynthetic,synthetic);
let rejected=false;
try{
 runR119IsolatedFixtureWithDdl(rejectedSynthetic);
}catch(error){
 rejected=true;
 assert.match(String(error),/R119 PRIVATE INVITATION FIXTURE NO-GO/);
}
assert.equal(rejected,true,'synthetic deliberately failing invite RPC must be rejected');
const diagnostic=r119CurrentSanitizedFailure();
assert.equal(diagnostic.decision,'NO_GO');
assert.equal(diagnostic.reportStatus,'ERROR');
assert.equal(diagnostic.safeFailureStage,'invitation_behavior_checks');
assert.equal(diagnostic.safeBehaviorStep,'first_join_rpc');
assert.equal(diagnostic.safeFailureCode,'first_join_rpc_failed');
assert.equal(diagnostic.safePostgresSqlstate,'P0001');
assert.equal(diagnostic.privateSqlExported,false);
assert.equal(diagnostic.originalOrQaSqlExecuted,false);
assert.doesNotMatch(JSON.stringify(diagnostic),/SYNTHETIC_ONLY_ERROR_DO_NOT_EXPORT/);
console.log('R119 SYNTHETIC DIAGNOSTICS PASS: expected user-function error reduced to safe stage and PostgreSQL SQLSTATE only.');

const missingRelationSynthetic=synthetic.replace(
 ' SELECT id INTO target FROM public.campaigns',
 ' PERFORM 1 FROM public.fixture_relation_deliberately_absent;\n SELECT id INTO target FROM public.campaigns'
);
assert.notEqual(missingRelationSynthetic,synthetic);
let missingRejected=false;
try{
 runR119IsolatedFixtureWithDdl(missingRelationSynthetic);
}catch(error){
 missingRejected=true;
 assert.match(String(error),/R119 PRIVATE INVITATION FIXTURE NO-GO/);
}
assert.equal(missingRejected,true);
const missingDiagnostic=r119CurrentSanitizedFailure();
assert.equal(missingDiagnostic.safeFailureStage,'invitation_behavior_checks');
assert.equal(missingDiagnostic.safeBehaviorStep,'first_join_rpc');
assert.equal(missingDiagnostic.safeFailureCode,'first_join_rpc_failed');
assert.equal(missingDiagnostic.safePostgresSqlstate,'42P01');
assert.doesNotMatch(JSON.stringify(missingDiagnostic),/fixture_relation_deliberately_absent/);
console.log('R119 SYNTHETIC MISSING-RELATION PASS: SQLSTATE 42P01 classified safely with no relation name or private SQL emitted.');

