import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR79Ledger} from '../scripts/release/validate-world-v2-r18-79-ledger-inventory.mjs';
import {validateR78ReleaseStatus} from '../scripts/release/validate-world-v2-r18-78-release-readiness.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const snapshot=JSON.parse(read('staging/world-v2-b10-r18-79-github-branch-inventory.json'));
const ledger=JSON.parse(read('staging/next-release-ledger.json'));
const source=read('scripts/release/validate-world-v2-r18-79-ledger-inventory.mjs');
const validate=(s=snapshot,l=ledger)=>validateR79Ledger({snapshot:s,ledger:l});
const err=/R79 LEDGER NO-GO/;
const badSnapshot=fn=>{
 const s=structuredClone(snapshot);fn(s);assert.throws(()=>validate(s),err);
};
const badLedger=fn=>{
 const l=structuredClone(ledger);fn(l);assert.throws(()=>validate(snapshot,l),err);
};
const row=n=>snapshot.newlyReconciled.find(x=>x.linkedPullRequest===n);

test('R79 all 179 GitHub branches, 177 PRs, 99 new entries reconcile exactly; no GO',()=>{
 const x=validate();
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.safeToRelease,false);
 assert.equal(x.snapshotOnly,true);
 assert.equal(x.authenticatedExternalProvenanceVerified,false);
 assert.equal(x.observedGitHubBranches,179);
 assert.equal(x.observedGitHubPullRequests,177);
 assert.equal(x.previouslyLedgered,66);
 assert.equal(x.newlyLedgered,99);
 assert.equal(x.totalLedgered,165);
 assert.equal(x.laterPRsRecorded,62);
 assert.equal(x.unmatchedPRBranches,2);
 assert.equal(x.outstandingReviewBranches,100);
 assert.equal(x.operatorApproved,false);
 assert.equal(x.linkedCli83Plus8Accepted,false);
 assert.equal(x.independentDmP1P2Accepted,false);
 assert.equal(x.freeTierRamUnderLoadAccepted,false);
});
test('R79 accurately records canonical LIVE unmerged versus closed rolled-back R18-36',()=>{
 assert.equal(row(139).status,'released');
 assert.equal(row(139).prMerged,false);
 assert.equal(row(139).classification,'CANONICAL_LIVE_UNMERGED');
 assert.equal(row(139).observedBranchSha,'5ca8c83bdef4a5d9870020b0f2b16723f7790e38');
 assert.equal(row(140).status,'superseded');
 assert.equal(row(140).pullRequestState,'closed');
 assert.equal(row(140).prMerged,false);
 assert.equal(row(140).classification,'REJECTED_ROLLED_BACK');
 assert.equal(row(140).observedBranchSha,'da078abe7e0e5f28dbb9eeaa5f26fa570fbc7c19');
 assert.equal(snapshot.exceptional.canonicalAlias,'ttrpgsite.vercel.app');
 badSnapshot(x=>x.exceptional.canonicalSha='da078abe7e0e5f28dbb9eeaa5f26fa570fbc7c19');
 badSnapshot(x=>x.newlyReconciled.find(b=>b.linkedPullRequest===140).status='released');
 badSnapshot(x=>x.newlyReconciled.find(b=>b.linkedPullRequest===139).prMerged=true);
});
test('R79 fails closed on failed DM QA and divergence of R18-40',()=>{
 assert.equal(row(144).status,'superseded');
 assert.equal(row(144).classification,'FAILED_SOLO_DM_QA_DIVERGED');
 badSnapshot(x=>x.newlyReconciled.find(b=>b.linkedPullRequest===144).classification='OPEN_UNMERGED_NOT_RELEASE_APPROVED');
 badLedger(x=>x.branches.find(b=>b.linkedPullRequest===144).status='staged');
});
test('R79 never reintroduces excluded R18-26/27 or optional uninstalled R18-57/77',()=>{
 for(const n of [130,131]){
  assert.equal(row(n).classification,'EXCLUDED_FROM_NARROW_SQL');
  assert.equal(row(n).releaseReady,false);
 }
 for(const n of [161,179]){
  assert.equal(row(n).classification,'OPTIONAL_SQL_NOT_INSTALLED');
  assert.equal(row(n).releaseReady,false);
 }
 assert.deepEqual(snapshot.exceptional.excludedNarrowSqlPrs,[130,131]);
 assert.deepEqual(snapshot.exceptional.uninstalledOptionalSqlPrs,[161,179]);
 badSnapshot(x=>x.exceptional.excludedNarrowSqlPrs=[130,131,179]);
 badLedger(x=>x.branches.find(b=>b.linkedPullRequest===179).releaseReady=true);
});
test('R79 preserves two unmatched feature branches as explicitly unreviewed',()=>{
 const noPr=snapshot.newlyReconciled.filter(x=>x.classification==='NO_PR_UNREVIEWED');
 assert.deepEqual(noPr.map(x=>x.name),[
  'feature/compact-tabletop-ui','feature/weapon-attack-cards'
 ]);
 assert.ok(noPr.every(x=>x.linkedPullRequest===null&&x.releaseReady===false));
 badSnapshot(x=>x.newlyReconciled.find(b=>b.name==='feature/compact-tabletop-ui').classification='OPEN_UNMERGED_NOT_RELEASE_APPROVED');
 badSnapshot(x=>x.scope.noMatchingPr=0);
});
test('R79 rejects forged pull request refs, duplicates, missing branches and revisions',()=>{
 badSnapshot(x=>x.scope.observedGithubPrCount=176);
 badSnapshot(x=>x.laterPrs[0].url='https://example.com/forged');
 badSnapshot(x=>x.laterPrs[0].headSha='a'.repeat(40));
 badSnapshot(x=>x.laterPrs.push(structuredClone(x.laterPrs[0])));
 badSnapshot(x=>x.laterPrs.find(p=>p.pr===181).pr=168);
 badSnapshot(x=>x.githubBranchSnapshot.pop());
 badSnapshot(x=>x.githubBranchSnapshot[1].name=x.githubBranchSnapshot[0].name);
 badSnapshot(x=>x.githubBranchSnapshot[4].sha='invalid');
 badLedger(x=>x.branches.pop());
 badLedger(x=>x.branches[0].name='untracked/bad');
});
test('R79 forbids false release approval, external CLI attestations and metadata leaks',()=>{
 badSnapshot(x=>x.releaseDecision='GO');
 badSnapshot(x=>x.safeToRelease=true);
 badSnapshot(x=>x.operatorApproved=true);
 badSnapshot(x=>x.migrationGate.officialLinkedCliDryRun='PASSED');
 badSnapshot(x=>x.migrationGate.signedMultiAccountQa='PASS');
 badSnapshot(x=>x.migrationGate.freeTierRamUnderLoad='PASSED');
 badLedger(x=>x.releaseReconciliation.independentlyAuthorized=true);
 badLedger(x=>x.releaseReconciliation.releaseCandidatesApproved=1);
 badLedger(x=>x.releaseReconciliation.officialSupabaseCliLinked83Plus8=true);
 badLedger(x=>x.releaseReconciliation.independentSignedDmP1P2Accepted=true);
 badLedger(x=>x.releaseReconciliation.freeTierPhysicalRamUnderLoadAccepted=true);
 badLedger(x=>x.releaseReconciliation.migrationsAppliedByThisStep=8);
 badLedger(x=>x.releaseReconciliation.frontendDeploymentsByThisStep=1);
});
test('R79 outstanding is a 100-branch audit queue, not an approved bulk merge',()=>{
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,100);
 assert.ok(ledger.upcomingRelease.stagePolicy.includes('NOT a bulk-merge queue'));
 assert.equal(ledger.releaseBranch,'stage/world-v2-b10-r18-79-release-ledger-reconciliation-2026-11-15');
 assert.equal(row(139).status,'released');
 assert.ok(!ledger.upcomingRelease.outstandingBranches.includes(row(139).name));
 assert.ok(!ledger.upcomingRelease.outstandingBranches.includes(row(140).name));
 assert.ok(!ledger.upcomingRelease.outstandingBranches.includes(row(144).name));
 badLedger(x=>x.upcomingRelease.outstandingBranches.push(row(140).name));
 badLedger(x=>x.upcomingRelease.outstandingBranches.pop());
 badLedger(x=>x.releaseBranch='main');
 badLedger(x=>x.upcomingRelease.stagePolicy='Release all immediately');
});
test('R79 prior release/feature/migration/Edge records are not rewritten or treated as latest',()=>{
 assert.equal(ledger.features.length,60);
 assert.equal(ledger.releaseHistory.length,9);
 assert.equal(ledger.databaseDependencies.length,28);
 assert.equal(ledger.edgeFunctionDependencies.length,1);
 assert.equal(ledger.lastRelease.productionCommit,'55d5d704c47c60f04100ce13fb81a5d4357b999e');
 assert.equal(ledger.productionBaseSha,'90df8c960e79e8d66c322095611427da7bb09de4');
 assert.equal(ledger.releaseReconciliation.currentCanonicalDeploymentSha,'5ca8c83bdef4a5d9870020b0f2b16723f7790e38');
 badLedger(x=>x.lastRelease.productionCommit='5ca8c83bdef4a5d9870020b0f2b16723f7790e38');
 badLedger(x=>x.features.pop());
 badLedger(x=>x.releaseHistory.pop());
 badLedger(x=>x.databaseDependencies.pop());
});
test('R79 next-release inventory is only public repository metadata, no captured player sight or SQL payload',()=>{
 for(const x of snapshot.laterPrs){
  assert.deepEqual(Object.keys(x).sort(),
   ['pr','url','title','headBranch','headSha','baseBranch','state','draft','merged','disposition'].sort());
 }
 for(const x of snapshot.githubBranchSnapshot)
  assert.deepEqual(Object.keys(x).sort(),['name','sha']);
 assert.doesNotMatch(JSON.stringify(snapshot),/"(?:jwt|tokenId|mapId|fogFrame|email|password|accessToken|authToken)"\s*:/i);
 assert.doesNotMatch(source,/child_process|execFile|spawn\(|writeFile|appendFile|unlinkSync|https\.request|http\.request|fetch\(/);
 assert.match(source,/decision:'NO_GO',safeToRelease:false/);
 assert.match(source,/R79 LEDGER NO-GO: review source inventory privately/);
});
test('R79 does not falsely rewrite frozen R18-78 snapshot; its older NO_GO validator accepts audited updated ledger',()=>{
 const old=JSON.parse(read('staging/world-v2-b10-r18-78-release-readiness.json'));
 assert.equal(old.releaseLedger.lastUpdated,'2026-11-12');
 assert.equal(old.releaseLedger.fullNextReleaseBundleReviewed,false);
 const result=validateR78ReleaseStatus({
  repoRoot:ROOT,now:new Date('2026-11-14T15:14:00.000Z')
 });
 assert.equal(result.decision,'NO_GO');
 assert.equal(result.safeToDeploy,false);
 assert.equal(result.nextReleaseLedgerReconciled,false);
 assert.equal(result.canonicalReceiptUiAvailable,false);
});
