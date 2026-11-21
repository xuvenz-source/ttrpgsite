import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-165-actor-scoped-cleanup-and-name-visibility/manifest.json','utf8'));
test('R165 exact child and no hosted source or release changes',()=>{
 assert.equal(m.workPackage,'B10-R18-165');assert.equal(m.parentPr,272);assert.equal(m.parentSha,'5d266fe117b6fdc8307fde0c786bc59bd4dedb3d');assert.equal(m.decision,'NO_GO');
 assert.ok(Object.values(m.immutability).every(Boolean));assert.equal(m.all67SemanticallyApproved,false);assert.equal(m.realSignedQaPassed,false);assert.equal(m.r127OwnerProdReleaseApproved,false);
});
test('R165 all three source-fingerprinted cleanup paths are actor scoped and not signed accepted',()=>{
 assert.deepEqual(m.actorScopedCleanup.map(x=>x.name),['cancel_world_motion_v2','release_campaign_sheet_item','release_campaign_tool_item']);
 assert.deepEqual(m.actorScopedCleanup.map(x=>x.sourceMd5),['5196c60e4b300df07df2c564bb15e542','f7bc314718884312ce3e1ca48331429f','775ad6515c74f23367ce6e55513f8744']);
 for(const x of m.actorScopedCleanup){assert.equal(x.anonymousExecute,false);assert.equal(x.authenticatedExecute,true);assert.equal(x.boundSearchPath,true);assert.equal(x.operation,'DELETE');assert.equal(x.signedQa,'NOT_RUN');assert.ok(x.whereBindings.some(y=>/holder_id|actor_id/.test(y)));}
 assert.ok(m.actorScopedCleanup[0].whereBindings.includes('id=p_session'));assert.ok(m.actorScopedCleanup[1].whereBindings.includes('campaign_id=p_campaign'));assert.ok(m.actorScopedCleanup[2].whereBindings.includes('issue_id=p_issue'));
});
test('R165 account name reader uses member helper, with only display metadata, but not privacy signoff',()=>{
 const a=m.accountNameReader,h=m.memberHelper;
 assert.equal(a.sourceMd5,'be7693abffbc633383fab2ab15212dc3');assert.equal(h.sourceMd5,'de577e5030dbbb0b926a73ec9162224e');
 assert.equal(a.usesCurrentMembershipHelper,true);assert.equal(h.checksCurrentCampaignMemberRow,true);assert.equal(h.checksSignedActorUsingAuthUid,true);
 assert.deepEqual(a.metadataProjectionKeys,['username','display_name']);assert.equal(a.userMetadataUsedForAuthorization,false);
 assert.equal(a.emailReturned,false);assert.equal(a.memberListVisibleToAnyCurrentMember,true);assert.equal(a.signedQa,'NOT_RUN');assert.equal(h.hostedSignedBehavior,'NOT_RUN');
});
test('R165 keeps unresolved releases and source-only semantics',()=>{
 assert.deepEqual(m.blockedIssues,[212,218,220,223,229,231]);assert.equal(m.revisedPrivilegedFunctionReviewCount.sourcePredicateInspected,4);assert.equal(m.revisedPrivilegedFunctionReviewCount.semanticApprovedForRelease,0);assert.equal(m.revisedPrivilegedFunctionReviewCount.totalAuthenticatedCallableDefiners,67);
});
