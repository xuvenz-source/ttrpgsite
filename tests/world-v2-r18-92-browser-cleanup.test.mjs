import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');

test('R92 real Chromium browser waits for actual child close then retries profile removal on all exits',()=>{
 const source=read('tests/world-v2-real-react-board-drag.test.mjs');
 assert.match(source,/const processClosed=new Promise\(resolve=>\{/);
 assert.match(source,/proc\.once\('close',resolve\)/);
 assert.match(source,/const shutdown=async\(\)=>\{/);
 assert.match(source,/if\(disposed\)return/);
 assert.match(source,/try\{ws\?\.close\(\)\}catch\{\}/);
 assert.match(source,/proc\.kill\('SIGKILL'\)/);
 assert.match(source,/Promise\.race\(\[processClosed,delay\(2500\)\]\)/);
 assert.match(source,/rm\(dir,\{recursive:true,force:true,maxRetries:20,retryDelay:100\}\)/);
 assert.match(source,/return \{send,evaluate,close:shutdown\};/);
 assert.match(source,/catch\(e\)\{\s*await shutdown\(\);\s*throw e;/);
 assert.doesNotMatch(source,/proc\.kill\('SIGKILL'\);await rm\(dir,/);
});

test('R92 isolated R12 React test cannot silently skip Chromium or hang the entire suite',()=>{
 const workflow=read('.github/workflows/world-v2-r18-92-regrab-isolated.yml');
 assert.match(workflow,/timeout-minutes: 6/);
 assert.match(workflow,/command -v google-chrome \|\| command -v chromium/);
 assert.match(workflow,/timeout --signal=TERM --kill-after=8s 140s/);
 assert.match(workflow,/--test-reporter=tap/);
 assert.match(workflow,/--test-name-pattern='R12 real React V2 player can drag again before lagged signed sight catches up'/);
 assert.match(workflow,/SUPABASE_ACCESS_TOKEN: ''/);
 assert.match(workflow,/SUPABASE_DB_PASSWORD: ''/);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\./);
 const source=read('tests/world-v2-real-react-board-drag.test.mjs');
 assert.match(source,/assert\.equal\(first\.committed,1/);
 assert.match(source,/assert\.equal\(second\.committed,2/);
 assert.match(source,/second\.trace\?\.counts\?\.\['movement\.rejected'\]/);
 assert.match(source,/second\.trace\?\.counts\?\.\['movement\.canonical-handoff'\]/);
 assert.match(source,/assert\.equal\(second\.spriteCount,1/);
 assert.match(source,/assert\.equal\(second\.canvasCount,1/);
});

test('R92 original sight/collision and pending 83+8 release gates remain NO_GO',()=>{
 const ledger=JSON.parse(read('staging/next-release-ledger.json'));
 const m=JSON.parse(read('staging/world-v2-b10-r18-92-regrab-ci-cleanup/manifest.json'));
 assert.equal(ledger.branches.length,182);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,117);
 assert.equal(ledger.releaseBranch,'stage/world-v2-b10-r18-96-free-qa-provisioning-2026-11-16');
 assert.equal(ledger.branches.at(-5).linkedPullRequest,194);
 assert.equal(ledger.branches.at(-4).linkedPullRequest,195);
 assert.equal(ledger.branches.at(-3).linkedPullRequest,196);
 assert.equal(ledger.branches.at(-2).linkedPullRequest,197);
 assert.equal(ledger.branches.at(-1).releaseReady,false);
 assert.equal(ledger.releaseReactRegrabHarnessRepair.workPackage,'B10-R18-92');
 assert.equal(ledger.releaseReactRegrabHarnessRepair.decision,'NO_GO');
 assert.equal(ledger.releaseReactRegrabHarnessRepair.productionReleaseAuthorized,false);
 assert.equal(m.r12RapidRegrabStillAsserted,true);
 assert.equal(m.noTestSkippedOrDisabled,true);
 assert.equal(m.noVisibilityOrCollisionBypass,true);
 assert.equal(m.runtimeFilesModified,false);
 assert.equal(m.rootMigrationsModified,false);
 assert.equal(m.databaseSqlWritten,false);
 assert.equal(m.linkedCli83Plus8DryRunVerified,false);
 assert.equal(m.combinedFogCandidateR57R77Installed,false);
 assert.equal(m.realIndependentDmP1P2Accepted,false);
 assert.equal(m.previewDeployed,false);
 assert.equal(m.productionDeployed,false);
});
