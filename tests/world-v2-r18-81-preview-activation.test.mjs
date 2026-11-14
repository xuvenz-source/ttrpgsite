import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR81PreviewActivation} from
 '../scripts/release/validate-world-v2-r18-81-preview-activation.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const original=JSON.parse(read('staging/world-v2-b10-r18-81-preview-activation-record.json'));
const validator=read('scripts/release/validate-world-v2-r18-81-preview-activation.mjs');
const check=x=>validateR81PreviewActivation({record:x??original,repoRoot:ROOT});
function deny(change){
 const copy=structuredClone(original);change(copy);
 assert.throws(()=>check(copy),/R81 PREVIEW NO-GO/);
}
test('R81 exact READY preview and source SHA still fails closed for production',()=>{
 const r=check();
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.safeToPromote,false);
 assert.equal(r.deployedPreviewId,'dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F');
 assert.equal(r.deployedSourceSha,'380e31bda9e20638c3e1f660a2cdf001b8e37c0d');
 assert.equal(r.previewReadyReported,true);
 assert.equal(r.aliasToNewPreviewVerified,true);
 assert.equal(r.productionCanonicalReportedUnchanged,true);
 assert.equal(r.liveBrowserActivationIndependentlyVerified,false);
 assert.equal(r.threeIndependentlySignedTestersVerified,false);
 assert.equal(r.officialLinkedCli83Plus8Verified,false);
});
test('R81 only authorizes two exact build-time keys on one preview branch',()=>{
 assert.deepEqual(original.environment.createdBranchScopedPreview.map(x=>[x.key,x.value]),[
  ['VITE_WORLD_ENGINE_V2','integrated'],['VITE_WORLD_ENGINE_V2_READY','true']
 ]);
 assert.deepEqual(original.environment.target,['preview']);
 assert.equal(original.environment.globalPreviewV2ActivationCount,0);
 deny(x=>x.environment.target=['preview','production']);
 deny(x=>x.environment.gitBranch='main');
 deny(x=>x.environment.createdBranchScopedPreview[0].value='true');
 deny(x=>x.environment.createdBranchScopedPreview[0].key='VITE_WORLD_V2_ATOMIC_FINALIZE');
 deny(x=>x.environment.createdBranchScopedPreview[1].id='wrong');
 deny(x=>x.environment.globalPreviewV2ActivationCount=2);
 deny(x=>x.environment.existingProductionV2KeyCount=0);
 deny(x=>x.environment.branchScopedOptionalAtomicObserverExtras=1);
});
test('R81 rejects implicit atomic finalize and guarded observer recovery activation',()=>{
 assert.deepEqual(original.environment.disabledOrAbsent,[
  'VITE_WORLD_V2_ATOMIC_FINALIZE','VITE_WORLD_V2_ATOMIC_FINALIZE_READY',
  'VITE_WORLD_V2_OBSERVER_RECOVERY','VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY'
 ]);
 deny(x=>x.environment.disabledOrAbsent.pop());
 deny(x=>x.environment.disabledOrAbsent.push('VITE_SOME_EXTRA'));
 deny(x=>x.environment.noGlobalPreviewMutation=false);
 deny(x=>x.environment.noProductionEnvMutation=false);
});
test('R81 refuses wrong preview source, alias, READY state or false served browser proof',()=>{
 deny(x=>x.deployment.gitSha=x.scope.r81EngineeringParentSha);
 deny(x=>x.deployment.gitBranch='stage/world-v2-b10-r18-40-blocked-lateral-rebase-2026-11-13');
 deny(x=>x.deployment.id='dpl_Pk7zo5VLppWs6hjc6WKsp4bMH2ZC');
 deny(x=>x.deployment.state='BUILDING');
 deny(x=>x.deployment.target='production');
 deny(x=>x.deployment.aliasResolvedToNewId=false);
 deny(x=>x.deployment.previewV2RenderedInSignedBrowser=true);
 deny(x=>x.deployment.oauthCallbackNewHostVerified=true);
 deny(x=>x.deployment.builtWorldV2ChunkNotProofOfRuntimeSelection=false);
});
test('R81 does not accidentally certify old OAuth login or DM player preview as P1/P2',()=>{
 assert.equal(original.protection.sameOriginGoogleOnThisNewBuildNotYetTested,true);
 assert.equal(original.deployment.independentDmP1P2Verification,false);
 assert.equal(original.protection.vercelSsoPreviewEnabled,true);
 deny(x=>x.protection.sameOriginGoogleOnThisNewBuildNotYetTested=false);
 deny(x=>x.protection.vercelSsoPreviewEnabled=false);
 deny(x=>x.deployment.independentDmP1P2Verification=true);
 deny(x=>x.releaseGates.independentlyAuthenticatedP1='VERIFIED');
 deny(x=>x.releaseGates.independentlyAuthenticatedPassiveP2='VERIFIED');
});
test('R81 forbids production alias move or unreviewed 91-migration assertion',()=>{
 assert.equal(original.production.migrationsObserved,83);
 assert.equal(original.production.canonicalDomain,'ttrpgsite.vercel.app');
 deny(x=>x.production.sourceSha=x.scope.previewSourceSha);
 deny(x=>x.production.canonicalAliasReassigned=true);
 deny(x=>x.production.migrationsAppliedThisStep=8);
 deny(x=>x.production.migrationsObserved=91);
 deny(x=>x.production.optionalFogOrRaySqlInstalled=true);
 deny(x=>x.approvedAction.prodDeploymentAllowed=true);
 deny(x=>x.approvedAction.databaseWritesAllowed=true);
 deny(x=>x.releaseDecision='GO');
 deny(x=>x.safeToPromote=true);
});
test('R81 keeps all independent real-player collision fog/Free RAM and CLI gates open',()=>{
 for(const [k,v] of Object.entries(original.releaseGates)){
  if(k==='pendingIntegratedBackendMigrations')continue;
  assert.ok(v==='NOT_VERIFIED'||v==='NOT_MEASURED'||v===false,k);
 }
 deny(x=>x.releaseGates.officialLinkedSupabaseCli83Plus8DryRun='PASSED');
 deny(x=>x.releaseGates.trueImmediateCollisionAndRegrab='PASSED');
 deny(x=>x.releaseGates.browserInputAckP95='70MS');
 deny(x=>x.releaseGates.fogRevocationAndNoLeaks='PASSED');
 deny(x=>x.releaseGates.freePhysicalRamSwapLocksUnderLoad='PASSED');
 deny(x=>x.releaseGates.productionReleaseAuthorization=true);
});
test('R81 offline gate validates actual R80 pinned source and never communicates or writes',()=>{
 assert.match(validator,/validateR80QaCandidate\(\{repoRoot:root\}\)/);
 assert.match(validator,/decision:'NO_GO',safeToPromote:false/);
 assert.doesNotMatch(validator,/child_process|spawn\(|execFile\(|fetch\(|https\.request|http\.request|writeFile|appendFile|unlinkSync/);
 assert.doesNotMatch(JSON.stringify(original),
  /"(?:jwt|oauthCode|accessToken|refreshToken|password|userId|mapId|hiddenSight)"\s*:/i);
});
