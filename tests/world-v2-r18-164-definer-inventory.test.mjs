import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-164-definer-inventory-and-parity/manifest.json','utf8'));
test('R164 has exact R163 parent and NO_GO safety gates',()=>{
 assert.equal(m.workPackage,'B10-R18-164');assert.equal(m.parentPr,271);assert.equal(m.parentSha,'e04df51e38d0a26d9c33c53317679d347a3005e3');
 assert.equal(m.decision,'NO_GO');assert.equal(m.sourceOnly,true);assert.equal(m.originalSupabaseReadOnly,true);
 assert.ok(Object.values(m.immutability).every(x=>x===true));
 assert.equal(m.all67Reviewed,false);assert.equal(m.original83SemanticallyApproved,false);
 assert.equal(m.realSignedQaPassed,false);assert.equal(m.productionReleaseAuthorized,false);
});
test('R164 records 67 functions and no automatic security approval',()=>{
 const s=m.summary;
 assert.equal(s.total,67);assert.equal(s.directActor,60);assert.equal(s.delegatedOrNoDirectActor,7);
 assert.equal(s.knownAuthorizationHelper,50);assert.equal(s.directMembership,12);
 assert.equal(s.privateDispatch,25);assert.equal(s.writeMarkers,42);assert.equal(s.dynamicExecuteHint,0);
 assert.equal(m.functionInventory.length,67);
 assert.equal(new Set(m.functionInventory.map(x=>x.name+'('+x.arguments+')')).size,67);
 assert.ok(m.functionInventory.every(x=>x.semanticReview==='NOT_YET_COMPLETE'));
 assert.deepEqual(m.candidateThreeWritePaths.map(x=>x.name),['cancel_world_motion_v2','release_campaign_sheet_item','release_campaign_tool_item']);
 assert.ok(m.candidateThreeWritePaths.every(x=>!x.signedActorVerified&&!x.semanticApproval));
});
test('R164 preserves strict source parity without semantic overclaim',()=>{
 const h=m.historyGitParity;
 assert.deepEqual([h.exactByteMatches,h.quotePreservingNormalizedMatches,h.originalOnly,h.gitOnlyUnapplied],[47,14,22,1]);
 assert.equal(h.normalizedMatchesAreSemanticApprovals,false);
 assert.deepEqual(m.knownOpenSecurityIssues,[212,218,220,223,229,231]);
 assert.equal(m.privilegedAccountNamesFunction.semanticApproval,false);
});
