import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {
 R91_COMMANDS,preflightR91ReadOnly,captureR91ReadOnly,executeR91Cli
} from '../scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const linked=[
 ['--version'],['migration','fetch','--help'],['migration','list','--help'],
 ['db','push','--help'],['link','--help'],
 ['migration','list','--linked'],['db','push','--linked','--dry-run']
];
const help={
 cliVersion:'2.81.3',
 cliHelp:{
  fetchHelp:'Usage:\n  supabase migration fetch [flags]\nFlags:\n --linked\tproject\n',
  listHelp:'Usage:\n  supabase migration list [flags]\nFlags:\n --linked\tproject\n',
  pushHelp:'Usage:\n  supabase db push [flags]\nFlags:\n --linked\tproject\n --dry-run\tno application\n',
  linkHelp:'Usage:\n  supabase link [flags]\nFlags:\n --project-ref\tproject\n'
 }
};
const fakePreflight={sourceReady:true,remoteHistoryCount:83,pendingCount:8,
 repoRoot:root,workspace:'/tmp/r91-should-never-touch',receipt:{migration_history:[]}};

test('R91 has exactly 5 offline read flags plus TWO remote read-only commands',()=>{
 assert.deepEqual(R91_COMMANDS,linked);
 assert.ok(Object.isFrozen(R91_COMMANDS));
 assert.ok(R91_COMMANDS.every(Object.isFrozen));
 const script=read('scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs');
 assert.match(script,/validateR49LinkedWorkspace/);
 assert.match(script,/validateR50ReadOnlyReceipt/);
 assert.match(script,/validateR51CliEvidence/);
 assert.match(script,/parseR51MigrationList/);
 assert.match(script,/validateR90PinnedHelp/);
 assert.match(script,/shell:false/);
 assert.match(script,/stdio:\['ignore','pipe','pipe'\]/);
 assert.match(script,/const list=commandRunner\(R91_COMMANDS\[5\]\)/);
 assert.match(script,/parseR51MigrationList\(/);
 assert.match(script,/const dry=commandRunner\(R91_COMMANDS\[6\]\)/);
 assert.match(script,/independentOperatorProvenanceAttested:false/);
 assert.match(script,/productionReleaseAuthorized:false/);
 assert.doesNotMatch(script,/\b(?:writeFileSync|mkdirSync|unlinkSync|rmSync|fetch\(|execSync|execFileSync)\b/);
});

test('R91 refuses every remote mutating CLI variant even before spawn',()=>{
 const disallowed=[
  ['db','push'],['db','push','--linked'],['db','push','--remote'],
  ['db','push','--linked','--yes'],['db','push','--include-all'],
  ['migration','repair'],['migration','up'],['migration','fetch','--linked'],
  ['migration','list','--remote'],['db','reset'],['link','--project-ref',
   'lwhwgqaunxbmvyndswze'],['login'],['db','push','--dry-run']
 ];
 for(const args of disallowed)assert.throws(()=>
  executeR91Cli('/bin/false',args,'/tmp'),/R91 READONLY CLI NO-GO/);
});

test('R91 gates any remote list on exact offline R49/R50 and forbids wrong CLI target overrides',()=>{
 const privateDir=mkdtempSync(join(tmpdir(),'r91-negative-'));
 try{
  for(const env of [
   {DATABASE_URL:'postgresql://wrong'}, {SUPABASE_DB_URL:'postgresql://wrong'},
   {PGHOST:'wrong'}, {PGHOSTADDR:'127.0.0.1'}, {PGDATABASE:'other'},
   {PGSERVICE:'other'}, {SUPABASE_PROJECT_ID:'some-other-project'},
   {PROJECT_ID:'other'}, {SUPABASE_YES:'true'}
  ])assert.throws(()=>preflightR91ReadOnly({
   workspace:privateDir,repoRoot:root,readOnlyReceipt:{},
   env
  }),/R91 READONLY CLI NO-GO/);
  assert.throws(()=>preflightR91ReadOnly({
   workspace:root,repoRoot:root,readOnlyReceipt:{},env:{}
  }),/R91 READONLY CLI NO-GO/);
  assert.throws(()=>preflightR91ReadOnly({
   workspace:privateDir,repoRoot:root,readOnlyReceipt:{},
   env:{SUPABASE_PROJECT_ID:'lwhwgqaunxbmvyndswze'}
  }),/R50 READONLY NO-GO/);
 }finally{rmSync(privateDir,{recursive:true,force:true});}
});

test('R91 blocks dry-run if even one migration list record is missing',()=>{
 let calls=0;
 assert.throws(()=>captureR91ReadOnly({
  preflight:fakePreflight,...help,
  commandRunner:args=>{
   calls++;
   assert.deepEqual(args,linked[5]);
   return {status:0,stdout:'LOCAL | REMOTE | TIME (UTC)\n'};
  }
 }),/R51 CLI NO-GO/);
 assert.equal(calls,1,'no db push --dry-run on unverified migration list');
});

test('R91 list-only phase permits exactly 83+8 matching rows before dry-run',()=>{
 const historic=JSON.parse(read(
  'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'));
 const narrow=JSON.parse(read(
  'staging/world-v2-b10-r18-48-narrow-pending/manifest.json'));
 const pending=['20261111023204',
  ...narrow.pending.map(x=>x.filename.slice(0,14))];
 const list=['LOCAL | REMOTE | TIME (UTC)',...historic.rows.map(x=>
  [x.version,x.version,''].join(' | ')),...pending.map(x=>
   [x,'',''].join(' | '))].join('\n');
 const calls=[];
 assert.throws(()=>captureR91ReadOnly({
  preflight:fakePreflight,...help,
  commandRunner:args=>{
   calls.push([...args]);
   return args.includes('list')?
    {status:0,stdout:list}:{status:1,stdout:'dry-run command failed safely'};
  }
 }),/R91 READONLY CLI NO-GO/);
 assert.deepEqual(calls,[linked[5],linked[6]]);
 // Failure of the second approved command cannot become an approval.
});

test('R91 rejects CLI v3/wrong flags before invoking even migration list',()=>{
 for(const changed of [
  {cliVersion:'3.0.0'},
  {cliHelp:{...help.cliHelp,pushHelp:help.cliHelp.pushHelp.replace('--dry-run','--yes')}},
  {cliHelp:{...help.cliHelp,listHelp:help.cliHelp.listHelp.replace('--linked','--remote')}}
 ]){
  let calls=0;
  assert.throws(()=>captureR91ReadOnly({
   preflight:fakePreflight,...help,...changed,
   commandRunner:()=>{calls++;return {status:0,stdout:''};}
  }),/R90 CLI HELP NO-GO/);
  assert.equal(calls,0);
 }
});

test('R91 requires operator-only arguments, does not run on GitHub PR CI, and preserves NO-GO release ledger',()=>{
 const script=read('scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs');
 assert.match(script,/ack-target/);
 assert.match(script,/fresh R50/);
 assert.match(script,/operator check blocked; inspect local files and source privately/);
 assert.doesNotMatch(read('.github/workflows/world-v2-r18-90-cli-offline.yml'),
  /run-world-v2-r18-91-linked-cli-readonly\.mjs/);
 const l=JSON.parse(read('staging/next-release-ledger.json'));
 const m=JSON.parse(read('staging/world-v2-b10-r18-91-operator-capture/manifest.json'));
 assert.equal(l.branches.length,182);
 assert.equal(l.upcomingRelease.outstandingBranches.length,117);
 assert.equal(l.branches.at(-6).linkedPullRequest,193);
 assert.equal(l.branches.at(-5).linkedPullRequest,194);
 assert.equal(l.branches.at(-4).linkedPullRequest,195);
 assert.equal(l.branches.at(-3).linkedPullRequest,196);
 assert.equal(l.branches.at(-2).linkedPullRequest,197);
 assert.equal(l.branches.at(-1).releaseReady,false);
 assert.equal(l.releaseBranch,
  'stage/world-v2-b10-r18-96-free-qa-provisioning-2026-11-16');
 assert.equal(l.releaseLinkedCliOperatorCapture.workPackage,'B10-R18-91');
 assert.equal(l.releaseLinkedCliOperatorCapture.decision,'NO_GO');
 assert.equal(l.releaseLinkedCliOperatorCapture.authenticatedLinkedCliExecutedByChatGPT,false);
 assert.equal(l.releaseLinkedCliOperatorCapture.liveSqlWritten,false);
 assert.equal(l.releaseLinkedCliOperatorCapture.productionReleaseAuthorized,false);
 assert.equal(m.operatorReadOnlyRunnerStaged,true);
 assert.equal(m.operatorRunnerExecutedAgainstLive,false);
 assert.equal(m.linkedCliDryRunAttested,false);
 assert.equal(m.productionDeployed,false);
});
