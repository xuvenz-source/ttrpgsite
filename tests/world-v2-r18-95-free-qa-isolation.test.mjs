import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR95FreeQaIsolation}
 from '../scripts/release/validate-world-v2-r18-95-free-qa-isolation.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=()=>JSON.parse(readFileSync(join(ROOT,
 'staging/world-v2-b10-r18-95-free-qa-isolation/manifest.json'),'utf8'));
const mutate=fn=>{
 const manifest=source();fn(manifest);
 assert.throws(()=>validateR95FreeQaIsolation(manifest),/R95 FREE QA NO-GO/);
};

test('R95 genuine read-only Supabase cost and Vercel scope metadata prove current QA shares prod backend',()=>{
 const m=source(),r=validateR95FreeQaIsolation(m);
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.sourceOnly,true);
 assert.equal(r.observedActiveProjects,1);
 assert.equal(r.newProjectMonthlyCostUsd,0);
 assert.equal(r.paidBranchHourlyCostUsd,0.01344);
 assert.equal(r.productionPreviewShareSupabaseEnv,true);
 assert.equal(r.independentQaBackendCreated,false);
 assert.equal(r.hostedMovementQaPerformed,false);
 assert.equal(r.productionOrExistingPreviewChanged,false);
 assert.equal(m.organization.name,'Xuven');
 assert.equal(m.productionProject.region,'ap-northeast-1');
 assert.deepEqual(m.vercelProject.sharedSupabaseEnvKeys.map(x=>x.key),
  ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY']);
 for(const variable of m.vercelProject.sharedSupabaseEnvKeys)
  assert.deepEqual(variable.target,['production','preview','development']);
});

test('R95 aborts on wrong org, non-Free/third project or paid branch mislabeled free',()=>{
 mutate(m=>m.organization.id='other');
 mutate(m=>m.organization.plan='pro');
 mutate(m=>m.organization.activeVisibleProjectCount=2);
 mutate(m=>m.organization.ownerAdminLimitIndependentlyVerified=true);
 mutate(m=>m.pricing.freeProjectMonthlyUsd=10);
 mutate(m=>m.pricing.freeActiveProjectLimit=3);
 mutate(m=>m.pricing.branchHourlyUsd=0);
 mutate(m=>m.pricing.additionalCostAuthorized=true);
 mutate(m=>m.qaProposal.preferredOrganizationId='other');
 mutate(m=>m.qaProposal.preferredRegion='us-west-1');
});

test('R95 rejects any assertion that existing Preview has separate Supabase',()=>{
 mutate(m=>m.vercelProject.currentPreviewIsolatedBackendVerified=true);
 mutate(m=>m.vercelProject.sharedSupabaseEnvKeys[0].target=['preview']);
 mutate(m=>m.vercelProject.sharedSupabaseEnvKeys[1].target=['production']);
 mutate(m=>m.vercelProject.sharedSupabaseEnvKeys[0].value='secret');
 mutate(m=>m.vercelProject.sharedSupabaseEnvKeys[1].encryptedValue='secret');
 mutate(m=>m.vercelProject.sharedSupabaseEnvKeys[1].id='sensitive-var-id');
 mutate(m=>m.vercelProject.previewProtectionEnabled=false);
 mutate(m=>m.qaProposal.existingVercelSharedVarsWillChange=true);
 mutate(m=>m.qaProposal.route='REPOINT_EXISTING_VERCEL_GLOBAL_SUPABASE_URL');
});

test('R95 rejects fictitious new backend, auth/deploy/migration or source integrity',()=>{
 mutate(m=>m.qaProposal.newSupabaseProjectRef='lwhwgqaunxbmvyndswze');
 mutate(m=>m.qaProposal.newVercelProjectId='prj_fake');
 mutate(m=>m.qaProposal.newBackendCreated=true);
 mutate(m=>m.qaProposal.newFrontendCreated=true);
 mutate(m=>m.qaProposal.authRedirectsConfigured=true);
 mutate(m=>m.qaProposal.original83Bootstrapped=true);
 mutate(m=>m.qaProposal.pendingEightApplied=true);
 mutate(m=>m.qaProposal.candidateR57R77Installed=true);
 mutate(m=>m.qaProposal.testAccountsAreProductionAccounts=true);
 mutate(m=>m.qaProposal.operatorConfirmedOrganization=true);
 mutate(m=>m.qaProposal.operatorAuthorizedBackendCreate=true);
 mutate(m=>m.qaProposal.qaSourceShaDeployed=true);
 mutate(m=>m.qaProposal.independentDmP1P2Accepted=true);
 mutate(m=>m.qaProposal.physicalFreeMemoryAccepted=true);
 mutate(m=>m.qaProposal.productionTouched=true);
 mutate(m=>m.productionProject.registeredMigrations=91);
 mutate(m=>m.productionProject.fogFunctionMd5='fake');
});

test('R95 will not convert a read-only snapshot into release permission',()=>{
 mutate(m=>m.unverifiedGates.authenticatedOriginal83CliFetch=true);
 mutate(m=>m.unverifiedGates.linked83Plus8DryRun=true);
 mutate(m=>m.unverifiedGates.qaOnlyAuthRedirectAllowlist=true);
 mutate(m=>m.unverifiedGates.independentSupabaseUrlAndKey=true);
 mutate(m=>m.unverifiedGates.productionRelease=true);
 mutate(m=>m.decision='GO');
 mutate(m=>m.sourceOnly=false);
 mutate(m=>m.parentSha='bad');
 mutate(m=>m.extra='unreviewed');
});

test('R95 pure validator has no network, CLI execution, secret retrieval or side effects',()=>{
 const script=readFileSync(join(ROOT,
  'scripts/release/validate-world-v2-r18-95-free-qa-isolation.mjs'),'utf8');
 assert.doesNotMatch(script,/\b(?:fetch\(|spawn\(|execSync\(|create_project\(|create_branch\(|apply_migration\(|writeFileSync\(|update_project_env\()\b/);
 assert.match(script,/decision:'NO_GO'/);
 assert.match(script,/independentQaBackendCreated:false/);
 assert.match(script,/productionOrExistingPreviewChanged:false/);
});

test('R95 release ledger remains draft and original release NO-GO',()=>{
 const ledger=JSON.parse(readFileSync(join(ROOT,'staging/next-release-ledger.json')));
 assert.equal(ledger.branches.length,186);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,121);
 assert.equal(ledger.releaseBranch,
  'stage/world-v2-b10-r18-100-qa-baseline-workspace-preflight-2026-11-17');
 assert.equal(ledger.branches.at(-6).linkedPullRequest,197);
 assert.equal(ledger.branches.at(-5).releaseReady,false);
 assert.equal(ledger.releaseFreeQaIsolation.decision,'NO_GO');
 assert.equal(ledger.releaseFreeQaIsolation.costFreeProjectMonthlyUsd,0);
 assert.equal(ledger.releaseFreeQaIsolation.branchHourlyUsd,0.01344);
 assert.equal(ledger.releaseFreeQaIsolation.newSupabaseQaProjectCreated,false);
 assert.equal(ledger.releaseFreeQaIsolation.liveDatabaseSqlApplied,false);
 assert.equal(ledger.releaseFreeQaIsolation.qaPreviewRepointed,false);
 assert.equal(ledger.releaseFreeQaIsolation.productionReleaseAuthorized,false);
});
