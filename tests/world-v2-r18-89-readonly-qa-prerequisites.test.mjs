import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR89ReadOnlyPrerequisites} from '../scripts/release/validate-world-v2-r18-89-readonly-qa-prerequisites.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=x=>readFileSync(join(root,x),'utf8');
const snapshot=JSON.parse(file('staging/world-v2-b10-r18-89-readonly-qa-prerequisites/manifest.json'));
const plan=JSON.parse(file('staging/world-v2-b10-r18-89-readonly-qa-prerequisites/operator-cli-plan.json'));
const change=(fn)=>{const m=structuredClone(snapshot);fn(m);
 assert.throws(()=>validateR89ReadOnlyPrerequisites({repoRoot:root,manifest:m}),
 /R89 READONLY QA NO-GO/);};
const changePlan=(fn)=>{const p=structuredClone(plan);fn(p);
 assert.throws(()=>validateR89ReadOnlyPrerequisites({repoRoot:root,operatorPlan:p}),
 /R89 READONLY QA NO-GO/);};

test('R89 source-only historical SQL-body and private authority observation remain NO-GO',()=>{
 const x=validateR89ReadOnlyPrerequisites({repoRoot:root});
 assert.deepEqual(x,{
  workPackage:'B10-R18-89',decision:'NO_GO',safeToApply:false,
  sourceOnly:true,linkedProjectRef:'lwhwgqaunxbmvyndswze',
  frozenCatalogHistoricalMatches:83,frozenCatalogAuthorityMatches:10,
  currentCredentialedCliVerified:false,officialLinkedDryRunVerified:false,
  separateQaBackendVerified:false,protectedMultiplayerQaAccepted:false,
  freeTierRamLoadAccepted:false,sqlApplied:false,previewDeployed:false,
  productionDeployed:false,freshSuppliedReceiptValidated:false,
  receiptOriginIndependentlyAttested:false
 });
 assert.equal(snapshot.project.historicalVersionsMatchingFrozenNamesCountsAndSqlMd5,83);
 assert.equal(snapshot.project.criticalAuthorityFunctionsVerified,10);
 assert.equal(snapshot.project.liveDatabaseWritePerformed,false);
});

test('R89 rejects tampering with observed 83 of 83 source digests and movement ACL',()=>{
 change(x=>x.project.historicalVersionsRegistered=91);
 change(x=>x.project.historicalVersionsMatchingFrozenNamesCountsAndSqlMd5=82);
 change(x=>x.project.historicalVersionDriftCount=1);
 change(x=>x.project.criticalAuthorityFunctionsVerified=9);
 change(x=>x.project.criticalAuthorityFunctionDriftCount=1);
 change(x=>x.project.anonInternalSchemaUsage=true);
 change(x=>x.project.anonCommitExecute=true);
 change(x=>x.project.liveMigrationApplied=true);
 change(x=>x.project.latestVersion='20261113024116');
 change(x=>x.project.organizationPlan='pro');
});

test('R89 refuses falsely attested isolated QA backend on shared Supabase Free',()=>{
 change(x=>x.isolation.connectedAccessibleProjectCountAtObservation=2);
 change(x=>x.isolation.connectedVisibleBranches=['main','qa']);
 change(x=>x.isolation.verifiedSeparateQaDatabase=true);
 change(x=>x.isolation.qaIsolationReady=true);
 change(x=>x.isolation.permanentQaUrlIsIndependentBackend=true);
 change(x=>x.isolation.createdNewProject=true);
 change(x=>x.isolation.createdPaidBranch=true);
 change(x=>x.candidate.installedOnSharedBackend=true);
 change(x=>x.candidate.realPostCommitRollbackProven=true);
});

test('R89 cannot manufacture a credentialed CLI, 83+8 history, or QA release',()=>{
 for(const k of Object.keys(snapshot.cli).filter(k=>
  typeof snapshot.cli[k]==='boolean'&&snapshot.cli[k]===false))
  change(x=>x.cli[k]=true);
 change(x=>x.cli.officialPinnedVersion='3.0.0');
 change(x=>x.cli.pendingVersions.pop());
 change(x=>x.cli.pendingVersions[1]='20261113021015');
 change(x=>x.cli.requiredRemoteHistoryCount=91);
 for(const k of Object.keys(snapshot.releaseGates))
  change(x=>x.releaseGates[k]=true);
 for(const k of Object.keys(snapshot.operation).filter(k=>
   typeof snapshot.operation[k]==='boolean'&&snapshot.operation[k]===false))
  change(x=>x.operation[k]=true);
 change(x=>x.operation.catalogSelectOnly=false);
});

test('R89 exact original CLI plan forbids v3 mis-targeting and remote mutating commands',()=>{
 assert.equal(plan.isExecutable,false);
 assert.equal(plan.executedAgainstRemote,false);
 const steps=plan.cli.commands;
 assert.equal(steps.length,10);
 assert.deepEqual(steps.filter(x=>x.network).map(x=>x.order),[5,6,8,9]);
 assert.ok(steps.every(x=>x.writesRemote===false));
 assert.equal(steps[8].command,'supabase db push --linked --dry-run');
 assert.ok(plan.forbidden.includes('supabase migration repair'));
 assert.ok(plan.forbidden.includes('supabase db push --linked --yes'));
 changePlan(x=>x.cli.version='3.0.0');
 changePlan(x=>x.cli.projectRef='another-project');
 changePlan(x=>x.cli.commands[8].command='supabase db push --linked');
 changePlan(x=>x.cli.commands[8].command='supabase db push --linked --yes');
 changePlan(x=>x.cli.commands[5].command='supabase migration repair --linked');
 changePlan(x=>x.cli.commands[0].network=true);
 changePlan(x=>x.cli.commands[8].writesRemote=true);
 changePlan(x=>x.cli.commands.splice(6,1));
 changePlan(x=>x.conditions.officialAuthenticatedCliExecuted=true);
});

test('R89 continues to use original R49/R50/R51 evidence validators and R48 narrow migration seal',()=>{
 for(const path of [
  'scripts/release/validate-world-v2-r18-49-linked-workspace.mjs',
  'scripts/release/validate-world-v2-r18-50-readonly-evidence.mjs',
  'scripts/release/validate-world-v2-r18-51-cli-evidence.mjs',
  'staging/world-v2-b10-r18-48-narrow-pending/manifest.json'
 ]) assert.ok(file(path).length>1000,path);
 const s=file('scripts/release/validate-world-v2-r18-89-readonly-qa-prerequisites.mjs');
 assert.match(s,/validateR88CombinedQa/);
 assert.match(s,/validateR50ReadOnlyReceipt/);
 assert.match(s,/freshR50Receipt!==undefined/);
 assert.match(s,/receiptOriginIndependentlyAttested=false/);
 assert.doesNotMatch(s,/spawn|child_process|fetch\(|https?\.request|writeFile|unlink|execSync|apply_migration/);
 const l=JSON.parse(file('staging/next-release-ledger.json'));
 assert.equal(l.branches.length,189);
 assert.equal(l.upcomingRelease.outstandingBranches.length,124);
 assert.equal(l.branches.at(-15).linkedPullRequest,191);
 assert.equal(l.branches.at(-14).linkedPullRequest,192);
 assert.equal(l.branches.at(-13).linkedPullRequest,193);
 assert.equal(l.branches.at(-12).linkedPullRequest,194);
 assert.equal(l.branches.at(-11).linkedPullRequest,195);
 assert.equal(l.branches.at(-10).linkedPullRequest,196);
 assert.equal(l.branches.at(-9).linkedPullRequest,197);
 assert.equal(l.branches.at(-8).releaseReady,false);
 assert.equal(l.releaseBranch,'stage/world-v2-b10-r18-103-live-rpc-source-parity-2026-11-17');
 assert.equal(l.releaseLinkedCliQaAttestation.decision,'NO_GO');
 assert.equal(l.releaseLinkedCliQaAttestation.historicalSqlDigestsReadOnlyMatched,83);
 assert.equal(l.releaseLinkedCliQaAttestation.criticalAuthoritySourceMd5Matched,10);
 assert.equal(l.releaseLinkedCliQaAttestation.officialAuthenticatedCliExecuted,false);
 assert.equal(l.releaseLinkedCliQaAttestation.isolatedQaBackendVerified,false);
 assert.equal(l.releaseLinkedCliQaAttestation.previewDeployed,false);
 assert.equal(l.releaseLinkedCliQaAttestation.productionReleaseAuthorized,false);
});
