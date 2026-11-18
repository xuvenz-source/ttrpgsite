/**
 * CI synthetic-only smoke test of the SAME local no-network Docker harness
 * used for the private source-exact operator test.
 * NEVER includes or accesses original historical SQL or real invite codes.
 */
import assert from 'node:assert/strict';
import {runR119IsolatedFixtureWithDdl}
 from '../../scripts/release/run-world-v2-r18-119-private-invite-fixture.mjs';

const synthetic=String.raw`
CREATE OR REPLACE FUNCTION public.join_campaign(p_invite_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $synthetic_ci$
DECLARE actor uuid := auth.uid();
DECLARE target uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required';END IF;
 SELECT id INTO target FROM public.campaigns
  WHERE lower(invite_code)=lower(trim(p_invite_code)) FOR UPDATE;
 IF target IS NULL THEN RAISE EXCEPTION 'Invalid code';END IF;
 INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES(target,actor,'player') ON CONFLICT DO NOTHING;
 RETURN target;
END;
$synthetic_ci$;
`;
const receipt=runR119IsolatedFixtureWithDdl(synthetic);
assert.equal(receipt.workPackage,'B10-R18-119');
assert.equal(receipt.decision,'NO_GO');
assert.equal(receipt.syntheticPg17NoNetworkContainer,true);
assert.equal(receipt.noHostBindMounts,true);
assert.equal(receipt.currentOriginalJoinSha256VerifiedLocally,true);
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
