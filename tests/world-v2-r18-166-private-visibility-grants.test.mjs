import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-166-v2-visibility-private-grant-review/manifest.json','utf8'));
test('R166 source-only exact R165 parent and release NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-166');assert.equal(m.parentPr,273);assert.equal(m.parentSha,'1427f5bc5b0451491f9a5b972b0b7b62ef4bd68e');assert.equal(m.decision,'NO_GO');
 for(const k of ['sourceOnly','noRawOriginalSqlExport','noOriginalOrQaWrites','noVersionedMigrationChanges','noAppRuntimeChanges','noMerge','noDeploy','noPaidResources'])assert.equal(m[k],true,k);
 assert.ok(Object.values(m.negativeReleaseClaims).every(v=>v===false));
});
test('R166 current function chain fingerprints are pinned without raw SQL',()=>{
 const xs=m.liveSourceFingerprints;
 assert.equal(xs.length,12);assert.equal(new Set(xs.map(x=>x.name)).size,12);
 assert.equal(xs.filter(x=>x.name.startsWith('public.')).length,6);
 assert.equal(xs.filter(x=>x.name.startsWith('forge_world_v2.')).length,6);
 assert.ok(xs.every(x=>/^[a-f0-9]{32}$/.test(x.sourceMd5)&&x.bodyBytes>0&&x.sourceFinding==='INSPECTED_CONTROL_FLOW_NOT_SIGNED_QA'));
 assert.ok(xs.every(x=>x.anonymousExecute===false));
 assert.equal(xs.filter(x=>x.name.startsWith('forge_world_v2.')).every(x=>!x.authenticatedExecute),true);
 assert.equal(xs.filter(x=>x.name.startsWith('public.')).every(x=>x.authenticatedExecute),true);
 assert.ok(xs.every(x=>!('body' in x)&&!('sql' in x)&&!('prosrc' in x)));
});
test('R166 actor/map/motion boundaries preserve signed QA as unrun',()=>{
 const a=m.authorizationChains;
 assert.equal(a.selfVisibleFrame.viewerArgument,'auth.uid()');
 assert.equal(a.selfVisibleFrame.requiresCurrentMembershipInHelper,true);
 assert.equal(a.dmPreview.requiresCampaignDmAtEntry,true);assert.equal(a.dmPreview.explorationWriteArgument,false);
 assert.equal(a.motion.privateSessionValidReferencesCanViewCampaignMap,true);
 assert.equal(a.motion.requiresPermissionGenerationMatch,true);
 assert.ok(Object.values(a).every(x=>x.signedQa==='NOT_RUN'));
});
test('R166 definer private schema grants are latent not current anonymous accessibility',()=>{
 const p=m.privateSchemaAcl;
 assert.equal(p.forgeWorldV2.securityDefinerFunctions,24);assert.equal(p.forgeWorldV2.authenticatedFunctionExecuteGrants,0);
 assert.equal(p.forgeVisibility.securityDefinerFunctions,23);
 assert.equal(p.forgeVisibility.defaultAclPublicExecuteFunctions,11);
 assert.equal(p.forgeVisibility.ofDefaultGrantsSecurityDefiners,7);
 assert.equal(p.forgeVisibility.anonymousCanUseSchema,false);
 assert.equal(p.forgeVisibility.authenticatedCanUseSchema,false);
 assert.equal(p.forgeVisibility.canInvokeDirectlyNowViaOrdinaryRoles,false);
 assert.equal(p.forgeVisibility.latentGrantRiskIfSchemaUsageEnabled,true);
 assert.equal(p.forgeVisibility.hardeningAppliedToOriginal,false);
 assert.equal(p.forgeVisibility.hardeningIssue,275);
 assert.deepEqual(m.openSecurityIssues,[212,218,220,223,229,231]);
});
