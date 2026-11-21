import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const m=JSON.parse(readFileSync(join(root,
 'staging/world-v2-b10-r18-159-privileged-definer-routing/manifest.json'),'utf8'));
const doc=readFileSync(join(root,
 'docs/testing/world-v2-r18-159-privileged-definer-routing-2026-11-21.md'),'utf8');
const candidate=readFileSync(join(root,
 'staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql'),'utf8');

test('R159 preserves exact green R158 parent and zero hosted changes',()=>{
 assert.equal(m.workPackage,'B10-R18-159');
 assert.equal(m.parentPr,266);
 assert.equal(m.parentSha,'1b093aedc9180e6fd7d1fd6d3a5f108dbe882226');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.noOriginalOrQaWrites,true);
 assert.equal(m.noHistoricalMigrationChanges,true);
 assert.equal(m.noRuntimeSourceChanges,true);
 assert.equal(m.noBrowserGrants,true);
 assert.equal(m.noMerge,true);
 assert.equal(m.noDeploy,true);
 assert.equal(m.noPaidResources,true);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.equal(m.r127OwnerReleaseApproved,false);
 assert.deepEqual(m.openSecurityIssues,[212,220,223,229,231]);
});

test('R159 does not turn an indirect identity marker into security approval',()=>{
 const c=m.originalReadOnlySecurityDefinerCatalog;
 assert.equal(c.publicSchemaDefinerFunctions,85);
 assert.equal(c.authenticatedCallable,67);
 assert.equal(c.anonymousCallable,0);
 assert.equal(c.authenticatedCallableWithoutDirectAuthUidMarker,7);
 assert.equal(c.authenticatedCallableWithoutBoundSearchPath,0);
 assert.equal(c.authenticatedCallableWithPublicSearchPath,0);
 assert.equal(c.authenticatedCallableWithDynamicExecuteMarker,0);
 assert.equal(m.classifiedSeven.length,7);
 assert.deepEqual(m.classifiedSeven.map(x=>x.name),[
  'get_campaign_sheet_inventory','patch_campaign_sheet_noninventory',
  'get_dm_map_npc_values','get_npc_token_values',
  'is_map_fog_published','preview_map_motion','publish_map_environment'
 ]);
 assert.ok(m.classifiedSeven.every(x=>x.needsSignedQa));
 assert.equal(m.untestedOrUnresolved.remainingSixtyAuthenticatedDefinersSemanticallyReviewed,false);
 assert.equal(m.untestedOrUnresolved.sevenVerifiedWithRealSignedActors,false);
 assert.equal(m.untestedOrUnresolved.history83IndependentReviewPassed,false);
 assert.equal(m.untestedOrUnresolved.allOriginalPrivilegedFunctionsSignedQaPassed,false);
 assert.equal(m.untestedOrUnresolved.realtimeRevocationVerified,false);
 assert.equal(m.untestedOrUnresolved.issuedSignedUrlRevocationVerified,false);
 assert.equal(m.untestedOrUnresolved.oldInviteRevocationResolved,false);
});

test('R159 original revoked sheet owner flaw remains open, PR219 repair still unapplied',()=>{
 const h=m.helperAudit;
 assert.equal(h.canEditCampaignSheetLiveMd5,'5a8fed2bdc8427c884f89440c0eebe03');
 assert.equal(h.canEditCampaignSheetBodyBytes,790);
 assert.equal(h.memberCheckMissingFromOwnerBranch,true);
 assert.equal(h.helperDirectAuthenticatedExecute,false);
 assert.equal(h.helperAnonymousExecute,false);
 assert.equal(h.authenticatedDefinerWrappersReachHelper,true);
 assert.equal(h.charactersHaveDirectMembershipForeignKey,false);
 assert.equal(h.currentOwnedOrphanCharacterCount,0);
 assert.equal(h.defectReproducedInPriorIsolatedPostgres,true);
 assert.equal(h.candidateRepairPr,219);
 assert.equal(h.candidateRepairHeadSha,'920cd0801b098d3c5de4e8e36a1aa5dca82d1add');
 assert.equal(h.candidateRepairRequiresMembership,true);
 assert.equal(h.candidateRepairCiGreen,true);
 assert.equal(h.candidateRepairAppliedToOriginal,false);
 assert.equal(h.candidateRepairAppliedToQa,false);
 assert.match(candidate,/SOURCE-ONLY SECURITY CANDIDATE/);
 assert.match(candidate,/not exists\s*\(\s*select 1 from public\.campaign_members/i);
 assert.match(candidate,/m\.campaign_id=p_campaign and m\.user_id=actor/i);
 assert.match(candidate,/REVOKE ALL ON FUNCTION public\.can_edit_campaign_sheet/);
});
test('R159 fog metadata oracle remains unresolved for authenticated map callers',()=>{
 const x=m.fogOracle;
 assert.equal(x.functionName,'is_map_fog_published');
 assert.equal(x.authenticatedCallable,true);
 assert.equal(x.anonymousCallable,false);
 assert.equal(x.hasDirectIdentityGuard,false);
 assert.equal(x.knownIssue,212);
 assert.equal(x.securityApproved,false);
 assert.equal(m.classifiedSeven.find(x=>x.name==='is_map_fog_published').classification,
  'UNGUARDED_MAP_FOG_METADATA_ORACLE');
});

test('R159 docs preserve bug context and do not declare the history or signed sessions safe',()=>{
 for(const word of ['85','67','seven','NO_GO','SOURCE-ONLY',
  'PR #219','issue #220','issue #212','can_edit_campaign_sheet',
  'is_map_fog_published','R127','signed','83','Realtime']){
  assert.ok(doc.toLowerCase().includes(word.toLowerCase()),word);
 }
});
