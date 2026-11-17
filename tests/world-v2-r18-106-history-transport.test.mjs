import test from 'node:test';
import assert from 'node:assert/strict';
import {
 mkdtempSync,readFileSync,readdirSync,statSync,existsSync,rmSync,chmodSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {
 validateR106TransportManifest,serializeR106SyntheticHistory
} from '../scripts/release/validate-world-v2-r18-106-history-transport.mjs';
import {prepareR106PrivateWorkspace}
 from '../scripts/release/prepare-world-v2-r18-106-private-workspace.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const P='staging/world-v2-b10-r18-106-private-history-transport/manifest.json';
const read=p=>JSON.parse(readFileSync(join(ROOT,p),'utf8'));
const model=()=>read(P);
const deny=fn=>{const m=model();fn(m);
 assert.throws(()=>validateR106TransportManifest(m),/R106 HISTORY TRANSPORT NO-GO/);};

test('R106 official v2.81.3 transport reconciles all 83 MD5 names and 710102 fetched bytes',()=>{
 const r=validateR106TransportManifest(model());
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.upstreamCliVersion,'2.81.3');
 assert.equal(r.originalHistoryRowsMatched,83);
 assert.equal(r.originalStoredSqlBytes,709936);
 assert.equal(r.expectedCliFetchedSqlBytes,710102);
 assert.equal(r.expectedTerminalBytesAdded,166);
 assert.equal(r.authenticatedOriginalSqlFilesRecovered,0);
 assert.equal(r.qaMigrationsInstalled,0);
 assert.equal(r.productionReleaseAuthorized,false);
});
test('R106 serializes same name and exact statement separator/terminator as official Go fetch',()=>{
 const row=serializeR106SyntheticHistory({
  version:'20261105110307',name:'tabletop_foundation',
  statements:['select 1','select E\\'héllo\\'','select 3']
 });
 assert.equal(row.filename,'20261105110307_tabletop_foundation.sql');
 assert.equal(row.body.toString('utf8'),"select 1;\nselect E\\'héllo\\';\nselect 3;\n");
 assert.equal(row.md5,createHash('md5').update(row.body).digest('hex'));
 assert.equal(row.body.at(-2),59); // semicolon
 assert.equal(row.body.at(-1),10); // LF
 assert.ok(row.body.length>row.body.toString().length-1); // UTF-8
});
test('R106 source contract refuses malformed SQL transport fields rather than normalizing',()=>{
 for(const row of [
  {version:'2026110511030',name:'valid',statements:['select 1']},
  {version:'20261105110307',name:'../../evil',statements:['select 1']},
  {version:'20261105110307',name:'valid',statements:[]},
  {version:'20261105110307',name:'valid',statements:[123]},
  {version:'20261105110307',name:'valid',statements:['']},
  {version:'20261105110307',name:'valid',statements:null}
 ])assert.throws(()=>serializeR106SyntheticHistory(row),/R106 HISTORY TRANSPORT NO-GO/);
});
test('R106 refuses altered original version, CLI SHA, reconstructed byte count or identity',()=>{
 deny(m=>m.cli.tag='v3');
 deny(m=>m.cli.commitSha='0'.repeat(40));
 deny(m=>m.cli.sourceBlobSha='0'.repeat(40));
 deny(m=>m.cli.outputName='bad.sql');
 deny(m=>m.cli.joinSeparator='\n');
 deny(m=>m.cli.finalTerminator='\n');
 deny(m=>m.cli.emptyDirectoryBeforeFetch=false);
 deny(m=>m.historical.expectedOriginalMigrations=82);
 deny(m=>m.historical.originalStoredSqlBytes=709935);
 deny(m=>m.historical.cliReconstructedSqlBytes=709936);
 deny(m=>m.historical.terminalBytesPerMigration=1);
 deny(m=>m.historical.frozenR08BlobSha='0'.repeat(40));
 deny(m=>m.historical.frozenR101BlobSha='0'.repeat(40));
 deny(m=>m.historical.originalSqlRetrievedInThisTask=true);
});
test('R106 cannot falsely approve private recovery, QA history SQL or original release',()=>{
 for(const k of Object.keys(model().gates))deny(m=>m.gates[k]=true);
 for(const k of Object.keys(model().unchanged))deny(m=>m.unchanged[k]=false);
 for(const k of Object.keys(model().safety))deny(m=>m.safety[k]=false);
 deny(m=>m.decision='GO');
 deny(m=>m.parentSha='0'.repeat(40));
});
test('R106 owner-only private workspace scaffolder creates no link or SQL',()=>{
 const parent=mkdtempSync(join(tmpdir(),'r106-private-parent-'));
 try{
  const target=join(parent,'r106-original-83-rehearsal');
  const result=prepareR106PrivateWorkspace({workspace:target,repoRoot:ROOT,env:{}});
  assert.equal(result.decision,'NO_GO');
  assert.equal(result.emptyPrivateMigrationsPrepared,true);
  assert.equal(result.migrationFilesPresent,0);
  assert.equal(result.operatorStillMustAuthenticateAndLinkOriginal,true);
  assert.equal(result.projectRefFileCreated,false);
  assert.equal(result.qaProjectRefUsed,false);
  assert.equal(result.historicalSqlFetched,false);
  assert.equal(result.qaSqlApplied,false);
  assert.equal(result.productionSqlApplied,false);
  assert.equal(statSync(target).mode&0o077,0);
  assert.equal(statSync(join(target,'supabase','config.toml')).mode&0o077,0);
  assert.equal(readdirSync(join(target,'supabase','migrations')).length,0);
  assert.equal(existsSync(join(target,'supabase','.temp','project-ref')),false);
  const c=readFileSync(join(target,'supabase','config.toml'),'utf8');
  assert.match(c,/project_id = "r106-private-recovery"/);
  assert.match(c,/\[db\.migrations\]\nenabled = true/);
  assert.match(c,/\[db\.seed\]\nenabled = false/);
  assert.throws(()=>prepareR106PrivateWorkspace({
   workspace:target,repoRoot:ROOT,env:{}
  }),/R106 PRIVATE WORKSPACE NO-GO/);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
test('R106 private scaffolder rejects unsafe parent permissions, incorrect target and CI',()=>{
 const parent=mkdtempSync(join(tmpdir(),'r106-private-deny-'));
 try{
  const p=join(parent,'r106-original-83-fixture');
  assert.throws(()=>prepareR106PrivateWorkspace({
   workspace:p,repoRoot:ROOT,env:{GITHUB_ACTIONS:'true'}
  }),/R98 PRIVATE HISTORY NO-GO|R106 PRIVATE WORKSPACE NO-GO/);
  assert.throws(()=>prepareR106PrivateWorkspace({
   workspace:p,repoRoot:ROOT,env:{SUPABASE_PROJECT_ID:'bgydsamxypjslergfpla'}
  }),/R98 PRIVATE HISTORY NO-GO|R106 PRIVATE WORKSPACE NO-GO/);
  assert.throws(()=>prepareR106PrivateWorkspace({
   workspace:join(parent,'wrong-naming'),repoRoot:ROOT,env:{}
  }),/R106 PRIVATE WORKSPACE NO-GO/);
  assert.throws(()=>prepareR106PrivateWorkspace({
   workspace:'relative/r106-original-83-fixture',repoRoot:ROOT,env:{}
  }),/R106 PRIVATE WORKSPACE NO-GO/);
  chmodSync(parent,0o755);
  assert.throws(()=>prepareR106PrivateWorkspace({
   workspace:p,repoRoot:ROOT,env:{}
  }),/R106 PRIVATE WORKSPACE NO-GO/);
  assert.equal(existsSync(p),false);
 }finally{chmodSync(parent,0o700);rmSync(parent,{recursive:true,force:true});}
});
test('R106 prevents making the source checkout an accidental recovery root',()=>{
 assert.throws(()=>prepareR106PrivateWorkspace({
  workspace:join(ROOT,'r106-original-83-test'),repoRoot:ROOT,env:{}
 }),/R106 PRIVATE WORKSPACE NO-GO/);
});
test('R106 source-only validator never executes CLI/SQL or opens a network channel',()=>{
 const files=[
  'scripts/release/validate-world-v2-r18-106-history-transport.mjs',
  'scripts/release/prepare-world-v2-r18-106-private-workspace.mjs'
 ];
 for(const p of files){
  const s=readFileSync(join(ROOT,p),'utf8');
  assert.doesNotMatch(s,/\b(?:fetch|spawn|execSync|apply_migration|execute_sql|connect)\s*\(/);
  assert.doesNotMatch(s,/\b(?:migration\s+repair|db\s+push\s+--yes)\b/);
 }
});
test('R106 release ledger adds 192nd private transport package and remains NO_GO',()=>{
 const l=read('staging/next-release-ledger.json');
 assert.equal(l.branches.length,192);
 assert.equal(l.upcomingRelease.outstandingBranches.length,127);
 assert.equal(l.branches.at(-2).linkedPullRequest,207);
 assert.equal(l.branches.at(-1).linkedPullRequest,208);
 assert.equal(l.branches.at(-1).releaseReady,false);
 assert.equal(l.releasePrivateHistoryTransport.decision,'NO_GO');
 assert.equal(l.releasePrivateHistoryTransport.cliVersion,'2.81.3');
 assert.equal(l.releasePrivateHistoryTransport.originalRowsReconciled,83);
 assert.equal(l.releasePrivateHistoryTransport.expectedFetchedSqlBytes,710102);
 assert.equal(l.releasePrivateHistoryTransport.original83PrivateFilesRecovered,false);
 assert.equal(l.releasePrivateHistoryTransport.qaRegisteredMigrations,0);
 assert.equal(l.releasePrivateHistoryTransport.productionReleaseAuthorized,false);
});
