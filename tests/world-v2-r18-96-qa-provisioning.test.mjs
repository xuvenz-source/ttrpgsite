import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR96QaProvisioning}
 from '../scripts/release/validate-world-v2-r18-96-qa-provisioning.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(ROOT,path),'utf8');
const snapshot=()=>JSON.parse(read('staging/world-v2-b10-r18-96-free-qa-provisioning/manifest.json'));
const reject=mutate=>{
 const m=snapshot();mutate(m);
 assert.throws(()=>validateR96QaProvisioning(m),/R96 QA NO-GO/);
};

test('R96 records two distinct, healthy projects and a blank newly provisioned QA backend',()=>{
 const m=snapshot(),x=validateR96QaProvisioning(m);
 assert.equal(x.workPackage,'B10-R18-96');
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.isolatedBackendProvisioned,true);
 assert.equal(x.qaSchemasInstalled,false);
 assert.equal(x.qaFrontendDeployed,false);
 assert.equal(x.hostedMovementAcceptanceVerified,false);
 assert.equal(x.productionReleaseAuthorized,false);
 assert.notEqual(m.production.supabaseRef,m.qaSupabase.projectRef);
 assert.notEqual(m.production.vercelProjectId,m.qaVercel.projectId);
 assert.equal(m.cost.supabaseProjectMonthlyUsd,0);
 assert.equal(m.qaSupabase.registeredMigrations,0);
 assert.equal(m.qaVercel.deploymentCount,0);
});
test('R96 rejects cost, org, forged project, and false production integrity',()=>{
 reject(m=>m.decision='GO');
 reject(m=>m.parentSha='0'.repeat(40));
 reject(m=>m.authorization.organizationId='other');
 reject(m=>m.authorization.organizationExplicitlyConfirmed=false);
 reject(m=>m.cost.supabaseProjectMonthlyUsd=1);
 reject(m=>m.cost.paidBranchCreated=true);
 reject(m=>m.cost.vercelAdditionalProjectMonthlyPriceVerified=true);
 reject(m=>m.production.supabaseRef=m.qaSupabase.projectRef);
 reject(m=>m.production.supabasePostflightStatus='DOWN');
 reject(m=>m.production.existingVercelEnvironmentVariablesEdited=true);
 reject(m=>m.production.existingQaAliasRepointed=true);
 reject(m=>m.production.productionSqlApplied=true);
 reject(m=>m.production.productionDeploymentCreated=true);
});
test('R96 rejects premature migration, production user copy and wrong QA URL',()=>{
 reject(m=>m.qaSupabase.projectRef=m.production.supabaseRef);
 reject(m=>m.qaSupabase.region='us-east-1');
 reject(m=>m.qaSupabase.status='INITIALIZING');
 reject(m=>m.qaSupabase.apiUrl='https://lwhwgqaunxbmvyndswze.supabase.co');
 reject(m=>m.qaSupabase.registeredMigrations=83);
 reject(m=>m.qaSupabase.keyValueRecorded=true);
 reject(m=>m.qaSupabase.productionUserOrCampaignDataCopied=true);
 reject(m=>m.qaSupabase.api_key='private');
});
test('R96 rejects shared Vercel vars, deployment, unprotected access and secrets',()=>{
 reject(m=>m.qaVercel.projectId=m.production.vercelProjectId);
 reject(m=>m.qaVercel.linkedGitRepository=true);
 reject(m=>m.qaVercel.live=true);
 reject(m=>m.qaVercel.deploymentCount=1);
 reject(m=>m.qaVercel.protectedByVercelAuthentication=false);
 reject(m=>m.qaVercel.productionTargetVariablesSet=true);
 reject(m=>m.qaVercel.serviceRoleOrSecretKeyConfigured=true);
 reject(m=>m.qaVercel.environmentMetadata[0].target=['production','preview']);
 reject(m=>m.qaVercel.environmentMetadata[1].value='sb_publishable_fake');
 reject(m=>m.qaVercel.environmentMetadata[0].type='plain');
 reject(m=>m.qaVercel.environmentMetadata.reverse());
});
test('R96 rejects fictional hosted gameplay readiness or release authorization',()=>{
 const names=Object.keys(snapshot().unverifiedGates);
 for(const key of names)reject(m=>m.unverifiedGates[key]=true);
 reject(m=>m.unverifiedGates.newUnapproved=true);
 reject(m=>m.unverifiedGates.productionReleaseAuthorized='false');
});
test('R96 validator stays offline and has no write or provider operation',()=>{
 const source=read('scripts/release/validate-world-v2-r18-96-qa-provisioning.mjs');
 assert.doesNotMatch(source,/\b(?:fetch|spawn|execSync|create_project|apply_migration|deploy|writeFileSync|update_project_env)\s*\(/);
 assert.match(source,/decision:'NO_GO'/);
 assert.match(source,/productionReleaseAuthorized:false/);
});
test('R96 historical preflight remains unchanged; new ledger is staged and NO_GO',()=>{
 const before=JSON.parse(read('staging/world-v2-b10-r18-95-free-qa-isolation/manifest.json'));
 const l=JSON.parse(read('staging/next-release-ledger.json'));
 assert.equal(before.qaProposal.newBackendCreated,false);
 assert.equal(before.qaProposal.operatorConfirmedOrganization,false);
 assert.equal(l.branches.length,184);
 assert.equal(l.releaseBranch,'stage/world-v2-b10-r18-98-private-history-recovery-2026-11-17');
 assert.equal(l.branches[180].linkedPullRequest,197);
 assert.equal(l.branches[181].linkedPullRequest,198);
 assert.equal(l.branches[181].releaseReady,false);
 assert.equal(l.releaseFreeQaIsolation.decision,'NO_GO');
 assert.equal(l.releaseQaProvisioning.decision,'NO_GO');
 assert.equal(l.releaseQaProvisioning.qaRegisteredMigrations,0);
 assert.equal(l.releaseQaProvisioning.productionReleaseAuthorized,false);
 assert.equal(l.upcomingRelease.outstandingBranches.length,119);
});
