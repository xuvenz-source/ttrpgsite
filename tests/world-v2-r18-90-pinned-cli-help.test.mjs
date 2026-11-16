import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR90PinnedHelp} from '../scripts/release/validate-world-v2-r18-90-pinned-cli-help.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=x=>readFileSync(join(root,x),'utf8');
const outputs={
 version:'2.81.3\n',
 fetchHelp:'Usage:\n  supabase migration fetch [flags]\nFlags:\n      --linked    Fetch from the linked project\n',
 listHelp:'Usage:\n  supabase migration list [flags]\nFlags:\n      --linked    Lists the linked project\n',
 pushHelp:'Usage:\n  supabase db push [flags]\nFlags:\n      --linked    Target linked project\n      --dry-run   Print only, do not execute\n',
 linkHelp:'Usage:\n  supabase link [flags]\nFlags:\n      --project-ref string    Link to a project\n'
};
const invalid=(edit)=>{
 const x={...outputs};edit(x);
 assert.throws(()=>validateR90PinnedHelp(x),/R90 CLI HELP NO-GO/);
};

test('R90 genuine pinned v2.81.3 --help parser reports NO-GO even with every flag',()=>{
 assert.deepEqual(validateR90PinnedHelp(outputs),{
  workPackage:'B10-R18-90',decision:'NO_GO',
  testedVersion:'2.81.3',helpSurfacesChecked:4,
  originalLinkedTargetSyntaxPresent:true,dryRunFlagPresent:true,
  readOnlyCliHelpValidated:true,authenticatedLinkedCliExecuted:false,
  historicalSqlBodiesFetched:false,original83Plus8OfficialDryRunPerformed:false,
  qaBackendIndependentlyIsolated:false,productionReleaseAuthorized:false
 });
 invalid(x=>x.version='3.0.0');
 invalid(x=>x.version='2.81.4');
 invalid(x=>x.version='latest');
 invalid(x=>x.version='2.81.3\n3.0.0');
 invalid(x=>x.version='Supabase CLI 2.81.3');
});

test('R90 fails on missing --linked, --dry-run and wrong command or target help',()=>{
 invalid(x=>x.fetchHelp=x.fetchHelp.replace('--linked','--remote'));
 invalid(x=>x.listHelp=x.listHelp.replace('--linked','--local'));
 invalid(x=>x.pushHelp=x.pushHelp.replace('--dry-run','--yes'));
 invalid(x=>x.pushHelp=x.pushHelp.replace('--linked','--remote'));
 invalid(x=>x.linkHelp=x.linkHelp.replace('--project-ref','--remote'));
 invalid(x=>x.fetchHelp=x.fetchHelp.replace('supabase migration fetch','supabase migration repair'));
 invalid(x=>x.listHelp=x.listHelp.replace('supabase migration list','supabase db reset'));
 invalid(x=>x.pushHelp=x.pushHelp.replace('supabase db push','supabase db pull'));
});

test('R90 rejects empty, ANSI-colored, oversized or possible secret-bearing help capture',()=>{
 invalid(x=>x.fetchHelp='');
 invalid(x=>x.listHelp=x.listHelp.replace('Usage:','\u001b[31mUsage:'));
 invalid(x=>x.pushHelp+='x'.repeat(32001));
 invalid(x=>x.linkHelp+='postgresql://inappropriate:secret@host/db');
 invalid(x=>x.fetchHelp+='SUPABASE_ACCESS_TOKEN = secret');
 invalid(x=>x.version='2.81.3\0');
});

test('R90 executable workflow has no remote SQL, operator secrets, or live credentials',()=>{
 const yml=read('.github/workflows/world-v2-r18-90-cli-offline.yml');
 const checks=read('scripts/release/validate-world-v2-r18-90-pinned-cli-help.mjs');
 assert.match(yml,/supabase@2\.81\.3/);
 assert.match(yml,/SUPABASE_ACCESS_TOKEN: ''/);
 assert.match(yml,/SUPABASE_DB_PASSWORD: ''/);
 assert.match(yml,/test ! -e "\$HOME\/\.supabase\/access-token"/);
 assert.match(yml,/test ! -e "\$GITHUB_WORKSPACE\/supabase\/\.temp\/project-ref"/);
 assert.match(yml,/npm install --prefix "\$CLI_ROOT" --no-save/);
 assert.match(yml,/migration fetch --help/);
 assert.match(yml,/migration list --help/);
 assert.match(yml,/db push --help/);
 assert.match(yml,/link --help/);
 assert.match(yml,/validate-world-v2-r18-90-pinned-cli-help\.mjs/);
 assert.doesNotMatch(yml,/\b(?:migration (?:fetch|repair|up|list)|db push|link)\s+--linked\b(?!.*--help)/);
 assert.doesNotMatch(yml,/\b(?:SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD):\s*\$\{\{\s*secrets\./);
 assert.doesNotMatch(yml,/\b(?:psql|supabase start|supabase db reset|supabase migration repair)\b/);
 assert.doesNotMatch(checks,/\b(?:fetch\(|child_process|spawnSync|execSync|writeFile|apply_migration)\b/);
});

test('R90 NO-GO proof keeps official CLI and signed multiplayer gates blocked',()=>{
 const ledger=JSON.parse(read('staging/next-release-ledger.json'));
 const manifest=JSON.parse(read('staging/world-v2-b10-r18-90-cli-help/manifest.json'));
 assert.equal(ledger.branches.length,183);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,118);
 assert.equal(ledger.branches.at(-8).linkedPullRequest,192);
 assert.equal(ledger.branches.at(-7).linkedPullRequest,193);
 assert.equal(ledger.branches.at(-6).linkedPullRequest,194);
 assert.equal(ledger.branches.at(-5).linkedPullRequest,195);
 assert.equal(ledger.branches.at(-4).linkedPullRequest,196);
 assert.equal(ledger.branches.at(-3).linkedPullRequest,197);
 assert.equal(ledger.branches.at(-2).releaseReady,false);
 assert.equal(ledger.releaseBranch,'stage/world-v2-b10-r18-97-qa-schema-bootstrap-preflight-2026-11-16');
 assert.equal(ledger.releasePinnedCliOfflineHelp.decision,'NO_GO');
 assert.equal(ledger.releasePinnedCliOfflineHelp.authenticationUsed,false);
 assert.equal(ledger.releasePinnedCliOfflineHelp.officialLinkedCliDryRunVerified,false);
 assert.equal(ledger.releasePinnedCliOfflineHelp.productionReleaseAuthorized,false);
 assert.equal(manifest.sourceParentPr,191);
 assert.equal(manifest.cliVersion,'2.81.3');
 assert.equal(manifest.readOnlyHelpOnly,true);
 assert.equal(manifest.officialLinkedMigrationFetchListDryRunVerified,false);
 assert.equal(manifest.qaBackendIndependentlyVerified,false);
 assert.equal(manifest.sqlApplied,false);
 assert.equal(manifest.previewDeployed,false);
 assert.equal(manifest.productionDeployed,false);
});
