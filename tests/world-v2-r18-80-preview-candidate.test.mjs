import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR80QaCandidate} from '../scripts/release/validate-world-v2-r18-80-preview-candidate.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const manifest=JSON.parse(read('staging/world-v2-b10-r18-80-qa-preview-candidate.json'));
const validator=read('scripts/release/validate-world-v2-r18-80-preview-candidate.mjs');
const fail=/R80 PREVIEW NO-GO/;
const validate=(record=manifest)=>validateR80QaCandidate({record,repoRoot:ROOT});
const bad=update=>{
 const r=structuredClone(manifest);update(r);
 assert.throws(()=>validate(r),fail);
};
test('R80 pins entire byte-exact R18-62 frontend source tree and build files with NO_GO',()=>{
 const r=validate();
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.productionSafeToDeploy,false);
 assert.equal(r.safeToDeployPreviewWithoutApproval,false);
 assert.equal(r.candidateSourceGitSha,'380e31bda9e20638c3e1f660a2cdf001b8e37c0d');
 assert.equal(r.candidateSourceIdenticalToLatestStageAtAudit,true,
  'the original R18-80 point-in-time Vercel comparison must be preserved');
 assert.equal(r.currentCheckoutIdenticalToR18_62,false,
  'the R18-82 branch is NOT identical to the deployed R18-62 frontend');
 assert.equal(r.currentCheckoutReviewedR18_82Amendment,true,
  'only the exact source-reviewed R18-82 controller tree may replace the old checked-out tree');
 assert.equal(r.activePreviewV2BuildVerified,false);
 assert.equal(r.needsApprovedPreviewRebuild,true);
 assert.equal(r.needsScopedPreviewFlagConfiguration,true);
 assert.equal(r.preMigration83Only,true);
 assert.equal(r.noOfficialLinkedCliDryRunYet,true);
 assert.equal(r.noIndependentMultiplayerAcceptanceYet,true);
});
test('R80 compares whole src tree and immutable build blob pins, not just filenames',()=>{
 assert.match(validator,/treeDigest\(join\(root,'src'\)\)\.toString\('hex'\)/);
 assert.match(validator,/gitDigest\('blob',readFileSync\(absolute\)\)/);
 assert.match(validator,/gitDigest\('tree',Buffer\.concat\(parts\)\)/);
 assert.match(validator,/gitBlobOid\(readFileSync\(join\(root,path\)\)\)/);
 assert.match(validator,/546cfbaca75a16a447f740a24d1ef59e0a489f59/);
 assert.match(validator,/f5fe610d80b604897aad6fdc4020ab8cf8797844/);
 assert.match(validator,/ae4dfd43bef0f5b06e42c72c10848d0637c48252/);
 bad(x=>x.candidate.sourceParity.srcTreeSha='a'.repeat(40));
 bad(x=>x.candidate.sourceParity.packageJsonBlobSha='a'.repeat(40));
 bad(x=>x.candidate.sourceParity.viteConfigBlobSha='b'.repeat(40));
 bad(x=>x.candidate.sourceParity.frontendSourcePathsChangedSinceR18_62=1);
 bad(x=>x.candidate.sourceParity.migrationsChangedSinceR18_62=1);
});
test('R80 distinguishes actual ready existing R18-62 preview from future V2-active deployment',()=>{
 assert.equal(manifest.candidate.deploymentState,'READY');
 assert.equal(manifest.candidate.deploymentTarget,'preview');
 assert.equal(manifest.candidate.existingDeploymentSupportsV2Qa,
  'NOT_ATTESTED_V2_INACTIVE_BY_ENV_SCOPE');
 assert.equal(manifest.qa.actualNewDeploymentId,'NOT_CREATED');
 bad(x=>x.candidate.deployedPreviewId='dpl_2pd2zZqMT5SMHj53WHuLw7MhWGUa');
 bad(x=>x.candidate.previewSourceSha='1b33da9bb60252e7964700e9d97b1d05ea452392');
 bad(x=>x.candidate.existingDeploymentSupportsV2Qa='VERIFIED');
 bad(x=>x.qa.actualNewBuildSha=x.candidate.previewSourceSha);
 bad(x=>x.previewV2AcceptanceAlreadyValid=true);
});
test('R80 requires strict two flags only on exact branch-scoped preview, not project-wide or production',()=>{
 const flags=manifest.activation.conditionRequires;
 assert.deepEqual(flags.map(x=>[x.name,x.value,x.scope]),[
  ['VITE_WORLD_ENGINE_V2','integrated','preview:R18_62_ONLY'],
  ['VITE_WORLD_ENGINE_V2_READY','true','preview:R18_62_ONLY']
 ]);
 assert.match(read('src/TabletopApp.jsx'),/VITE_WORLD_ENGINE_V2==='integrated'\s*&&\s*import\.meta\.env\.VITE_WORLD_ENGINE_V2_READY==='true'/);
 assert.deepEqual(manifest.activation.remainAbsentOrOff,[
  'VITE_WORLD_V2_ATOMIC_FINALIZE','VITE_WORLD_V2_ATOMIC_FINALIZE_READY',
  'VITE_WORLD_V2_OBSERVER_RECOVERY','VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY'
 ]);
 bad(x=>x.activation.conditionRequires[1].scope='preview:ALL');
 bad(x=>x.activation.conditionRequires[0].value='true');
 bad(x=>x.activation.currentProjectEnvNamesContainBranchSpecificR18_62V2=true);
 bad(x=>x.activation.genericPreviewV2FlagsConfigured=true);
 bad(x=>x.activation.noProductionFlagChange=false);
 bad(x=>x.activation.currentGitDeploymentEnabledForStageBranch=true);
 bad(x=>x.activation.remainAbsentOrOff.pop());
});
test('R80 forbids turning on missing atomic RPC/observer recovery or promoting failed R18-40',()=>{
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 for(const flag of manifest.activation.remainAbsentOrOff)assert.ok(runtime.includes(flag),flag);
 assert.equal(manifest.currentDeployment.useOldFailedPreview,false);
 assert.equal(manifest.currentDeployment.oldFailedV2PreviewSha,
  '1b33da9bb60252e7964700e9d97b1d05ea452392');
 bad(x=>x.currentDeployment.useOldFailedPreview=true);
 bad(x=>x.currentDeployment.canonicalSourceSha=x.candidate.previewSourceSha);
 bad(x=>x.currentDeployment.productionUnchanged=false);
 bad(x=>x.currentDeployment.currentSupabaseRegisteredMigrations=91);
});
test('R80 separately requires QA panel optin, protected preview and real independent people',()=>{
 assert.match(read('src/engine/v2/WorldTraceCapturePanel.jsx'),/R18-58 multiplayer acceptance/);
 assert.match(read('src/engine/v2/WorldTraceCapturePanel.jsx'),/worldV2Trace\.enabled/);
 assert.match(read('src/engine/v2/WorldV2QaReceipt.js'),/previewMode:dmPreview/);
 assert.equal(manifest.currentDeployment.previewDeploymentProtection,
  'VERCEL_AUTHENTICATION_ENABLED_PREVIEW');
 assert.equal(manifest.qa.current83BackendTestScope,'PRE_MIGRATION_DIAGNOSTIC_ONLY');
 bad(x=>x.qa.independentSignedP1='PASS');
 bad(x=>x.qa.independentSignedP2='PASS');
 bad(x=>x.qa.trueCollisionAndImmediateRegrab='PASS');
 bad(x=>x.qa.integrated91BackendAcceptance='PASS');
 bad(x=>x.qa.physicalFreeTierRamAndLocksUnderLoad='PASSED');
 bad(x=>x.currentDeployment.previewDeploymentProtection='DISABLED');
});
test('R80 requires separate explicit operator preview authorization and exact deployed SHA',()=>{
 assert.equal(manifest.approvals.explicitBranchPreviewChange,'NOT_GIVEN_FOR_R18_80');
 assert.equal(manifest.approvals.publicProductionPromotion,'PROHIBITED');
 assert.equal(manifest.candidate.deployedPreviewHost,
  'ttrpgsite-git-stage-world-v2-b10-r18-62-previ-4f1679-ttrpg-site.vercel.app');
 bad(x=>x.previewDeploymentAuthorized=true);
 bad(x=>x.productionDeploymentAuthorized=true);
 bad(x=>x.remoteChangesMade=true);
 bad(x=>x.approvals.explicitBranchPreviewChange='GRANTED');
 bad(x=>x.approvals.officialPinnedSupabaseCli83Plus8='PASS');
 bad(x=>x.approvals.publicProductionPromotion='ALLOW');
});
test('R80 follows explicit Git build-time preview setting and rejects ephemeral build SHA guesses',()=>{
 const v=JSON.parse(read('vercel.json'));
 assert.equal(v.git.deploymentEnabled['**'],false);
 assert.equal(v.git.deploymentEnabled.main,true);
 assert.match(read('vite.config.js'),/VERCEL_GIT_COMMIT_SHA/);
 assert.match(read('vite.config.js'),/VITE_WORLD_V2_QA_BUILD_SHA/);
 assert.match(read('src/AuthRedirect.js'),/return target\.origin\+'\/';/);
 assert.equal(manifest.qa.actualNewBuildSha,'NOT_ATTESTED');
 bad(x=>x.qa.actualNewDeploymentId='dpl_any');
 bad(x=>x.qa.actualNewBuildSha=x.candidate.stage79ParentSha);
});
test('R80 can never call Vercel/Supabase, change env config, produce GO or write secrets',()=>{
 assert.doesNotMatch(validator,/fetch\(|https\.request|http\.request|child_process|execFile\(|spawn\(|writeFile|appendFile|unlinkSync/);
 assert.match(validator,/decision:'NO_GO'/);
 assert.match(validator,/safeToDeployPreviewWithoutApproval:false/);
 assert.match(validator,/productionSafeToDeploy:false/);
 assert.match(validator,/R80 PREVIEW NO-GO: inspect source and preview state privately/);
 assert.doesNotMatch(JSON.stringify(manifest),/"(?:jwt|accessToken|refreshToken|oauthCode|password|apiKey|serviceKey|playerId|mapId|privateSight)"\s*:/);
});
