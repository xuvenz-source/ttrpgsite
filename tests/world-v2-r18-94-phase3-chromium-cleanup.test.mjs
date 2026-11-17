import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=x=>readFileSync(join(root,x),'utf8');

test('R94 Chromium Phase3 uses idempotent process-close cleanup on normal/error exit',()=>{
 const src=read('tests/world-v2-phase3-real-dom.test.mjs');
 assert.match(src,/const childClosed=new Promise\(resolve=>\{/);
 assert.match(src,/child\.once\('close',resolve\)/);
 assert.match(src,/child\.once\('error',resolve\)/);
 assert.match(src,/const shutdown=async\(\)=>\{/);
 assert.match(src,/if\(disposed\)return/);
 assert.match(src,/try\{ws\?\.close\(\)\}catch\{\}/);
 assert.match(src,/child\.kill\('SIGKILL'\)/);
 assert.match(src,/Promise\.race\(\[childClosed,delay\(2500\)\]\)/);
 assert.match(src,/rm\(dir,\{recursive:true,force:true,maxRetries:20,retryDelay:100\}\)/);
 assert.match(src,/return \{send,evaluate,close:shutdown\};/);
 assert.match(src,/catch\(error\)\{\s*await shutdown\(\);\s*throw error;/);
 assert.doesNotMatch(src,/child\.kill\('SIGKILL'\);await rm\(dir,/);
 assert.doesNotMatch(src,/child\.kill\('SIGKILL'\);\s*await rm\(dir,/);
});

test('R94 all player, DM, preview and locked editor mouse assertions are preserved',()=>{
 const src=read('tests/world-v2-phase3-real-dom.test.mjs');
 assert.match(src,/actual Chromium DOM pointer capture: player, DM unlocked, preview, locked editor/);
 assert.match(src,/for\(const mode of \['player','unlocked','preview'\]\)/);
 assert.match(src,/assert\.deepEqual\(result\.starts,/);
 assert.match(src,/assert\.ok\(result\.moves\.length>=1/);
 assert.match(src,/assert\.equal\(result\.ends,1/);
 assert.match(src,/assert\.equal\(result\.marquees,0/);
 assert.match(src,/assert\.ok\(result\.claims>=1/);
 assert.match(src,/assert\.ok\(result\.captures>=1/);
 assert.match(src,/assert\.deepEqual\(locked\.starts,\[\]/);
 assert.match(src,/assert\.ok\(locked\.editorDown>0/);
 assert.match(src,/assert\.ok\(nested\.statusClicks>=1/);
});

test('R94 isolated test cannot skip real Chromium nor run beyond bounded watchdog',()=>{
 const ci=read('.github/workflows/world-v2-r18-94-dom-capture-isolated.yml');
 assert.match(ci,/timeout-minutes: 6/);
 assert.match(ci,/command -v google-chrome \|\| command -v chromium/);
 assert.match(ci,/timeout --signal=TERM --kill-after=8s 140s/);
 assert.match(ci,/--test-reporter=tap/);
 assert.match(ci,/--test-concurrency=1/);
 assert.match(ci,/--test-name-pattern='actual Chromium DOM pointer capture: player, DM unlocked, preview, locked editor'/);
 assert.match(ci,/SUPABASE_ACCESS_TOKEN: ''/);
 assert.doesNotMatch(ci,/\$\{\{\s*secrets\./);
});

test('R94 R79 historical branch positions use fixed source-frozen indices, not cumulative successor offsets',()=>{
 const validator=read('scripts/release/validate-world-v2-r18-79-ledger-inventory.mjs');
 for(let index=165;index<=179;index++)
  assert.ok(validator.includes('l.branches['+index+']!==entry'), 'frozen index '+index+' must be checked');
 assert.doesNotMatch(validator,/l\.branches\.at\(/);
});

test('R94 release ledger and manifest are never permitted to authorize SQL or deployment',()=>{
 const l=JSON.parse(read('staging/next-release-ledger.json'));
 const m=JSON.parse(read('staging/world-v2-b10-r18-94-phase3-chromium/manifest.json'));
 assert.equal(l.branches.length,188);
 assert.equal(l.upcomingRelease.outstandingBranches.length,123);
 assert.equal(l.releaseBranch,'stage/world-v2-b10-r18-102-privileged-rpc-permissions-audit-2026-11-17');
 assert.equal(l.branches.at(-9).linkedPullRequest,196);
 assert.equal(l.branches.at(-8).linkedPullRequest,197);
 assert.equal(l.branches.at(-7).releaseReady,false);
 assert.equal(l.releasePhase3ChromeTeardown.decision,'NO_GO');
 assert.equal(l.releasePhase3ChromeTeardown.chromeChildCloseWaited,true);
 assert.equal(l.releasePhase3ChromeTeardown.testSkippedOrWeakened,false);
 assert.equal(l.releasePhase3ChromeTeardown.productionReleaseAuthorized,false);
 assert.equal(m.sourceParentPr,195);
 assert.equal(m.previousR93GeneralRun,43725949176);
 assert.equal(m.allExistingPointerCaptureAssertionsRetained,true);
 assert.equal(m.testSkippedOrRelaxed,false);
 assert.equal(m.movementRuntimeChanged,false);
 assert.equal(m.worldEngineSqlChanged,false);
 assert.equal(m.realAuthenticatedLinkedCliHistoryDryRun,false);
 assert.equal(m.combinedFogR57R77Installed,false);
 assert.equal(m.liveDatabaseSqlWritten,false);
 assert.equal(m.productionDeployed,false);
});
