import test from 'node:test';
import assert from 'node:assert/strict';
import {
 readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 runR60ReadOnlyLinkedCli,R60_CLI_ARGV
} from '../scripts/release/run-world-v2-r18-60-83-plus-8-linked-readonly.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const baseline=JSON.parse(read('staging/world-v2-b10-r18-08-remote-history-content-hashes.json'));
const authority=read('supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql');
const functionRows=Array.from(authority.matchAll(/\('([^']+)','([a-f0-9]{32})'\)/g),
 m=>({signature:m[1],present:true,source_md5:m[2]}));
const SRC=read('scripts/release/run-world-v2-r18-60-83-plus-8-linked-readonly.mjs');

function validReceipt(){
 return {
  schema:1,kind:'B10-R18-50-live-readonly',
  observed_at:new Date().toISOString(),
  migration_history:structuredClone(baseline.rows),
  authority_sources:structuredClone(functionRows),
  preinstall:{r05_installed:false,atomic_rpc_present:false,
   r05_backup_present:false,r20_campaign_guard_present:false,
   r05_observer_pending_present:false,active_motion_sessions:0},
  access:{anon_internal_schema_usage:false,authenticated_internal_schema_usage:false,
   anon_advance_execute:false,anon_commit_execute:false,
   authenticated_advance_execute:true,authenticated_commit_execute:true},
  point_in_time:{
   waiting_database_locks:0,database_sessions:7,configured_max_connections:60
  }
 };
}
function sandbox(t){
 const top=mkdtempSync(join(tmpdir(),'r60-operator-only-'));
 t.after(()=>rmSync(top,{recursive:true,force:true}));
 const workspace=join(top,'external');
 mkdirSync(join(workspace,'supabase','.temp'),{recursive:true});
 mkdirSync(join(workspace,'supabase','migrations'),{recursive:true});
 writeFileSync(join(workspace,'supabase','.temp','project-ref'),
  'lwhwgqaunxbmvyndswze\n');
 writeFileSync(join(workspace,'supabase','config.toml'),
  '[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n');
 const freshSqlDigestsFile=join(top,'fresh-83.json');
 const readOnlyReceiptFile=join(top,'r50-current.json');
 writeFileSync(freshSqlDigestsFile,JSON.stringify(baseline.rows));
 writeFileSync(readOnlyReceiptFile,JSON.stringify(validReceipt()));
 return {workspace,freshSqlDigestsFile,readOnlyReceiptFile,env:{}};
}
function fakeCli({workspace,log}){
 return (argv,base)=>{
  assert.equal(base,workspace);
  const op=argv.join(' ');
  log.push(op);
  if(op==='--version')return {status:0,stdout:'2.81.3\n',stderr:''};
  if(op==='migration fetch --linked'){
   for(const row of baseline.rows)
    writeFileSync(join(workspace,'supabase','migrations',
      row.version+'_'+row.name+'.sql'), '--synthetic source\n');
   return {status:0,stdout:'synthetic fetch\n',stderr:''};
  }
  return {status:0,stdout:'synthetic CLI output --dry-run\n',stderr:''};
 };
}
const sourceStub=(dir,rows)=>{
 assert.equal(rows.length,83);
 assert.equal(readdirSync(dir).length,83);
 return true; // Synthetic test ONLY; production defaults to real MD5.
};
const workspaceStub=({workspace,freshSqlDigests})=>{
 assert.equal(freshSqlDigests.length,83);
 assert.equal(readdirSync(join(workspace,'supabase','migrations')).length,91);
 return {decision:'DRY_RUN_ONLY',safeToApply:false,totalFilesChecked:91,
  historicalBodiesChecked:83,pendingChecked:8};
};
const evidenceStub=({migrationListText,dryRunText})=>{
 assert.match(migrationListText,/synthetic/);
 assert.match(dryRunText,/synthetic/);
 return {decision:'NO_GO',safeToApply:false,verifiedFileBodies:91,
  matchingHistory:83,pendingVersions:8,verifiedDryRunOutputShape:true};
};
test('R18-60 only four fixed official CLI read-only argv arrays exist',()=>{
 assert.deepEqual(R60_CLI_ARGV,[
  ['--version'],['migration','fetch','--linked'],
  ['migration','list','--linked'],
  ['db','push','--dry-run','--linked']]);
 assert.equal(R60_CLI_ARGV.filter(x=>x[0]==='db'&&x[1]==='push').length,1);
 assert.ok(R60_CLI_ARGV.every(x=>!x.includes('--include-all')&&!x.includes('--yes')));
 assert.doesNotMatch(SRC,/\['migration','repair'|\['db','reset'|\['db','push','--linked'/);
});
test('R18-60 synthetic full command sequence copies exact 83+8 but NEVER approves SQL',t=>{
 const opts=sandbox(t),calls=[];
 const r=runR60ReadOnlyLinkedCli({...opts,invoke:fakeCli({
  workspace:opts.workspace,log:calls}),
  verifyFetchedHistory:sourceStub,verifyWorkspace:workspaceStub,
  verifyEvidence:evidenceStub});
 assert.deepEqual(calls,R60_CLI_ARGV.map(x=>x.join(' ')));
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.safeToApply,false);
 assert.equal(r.sqlPushApproved,false);
 assert.equal(r.productionApproval,false);
 assert.equal(r.independentBrowserDmP1P2Accepted,false);
 assert.equal(r.historicalSqlBodiesValidated,0);
 assert.equal(r.reviewedPendingVersions,0);
 assert.equal(r.officialReadOnlyCliCommandsExecutedInThisProcess,false);
 assert.equal(r.linkedCliListAndDryRunValidated,false);
 assert.equal(r.linkedCliCommandCount,0);
 assert.equal(r.syntheticTestInputsUsed,true);
 const files=readdirSync(join(opts.workspace,'supabase','migrations'));
 assert.equal(files.length,91);
 assert.equal(files.some(x=>x.includes('step_bbox_prefilter')),false);
 assert.equal(files.some(x=>x.includes('commit_empty_work')),false);
 assert.equal(files.some(x=>x.startsWith('20261113024116')),true);
});
test('R18-60 refuses missing CLI link, unsafe DB environment and wrong project before network',t=>{
 const opts=sandbox(t);
 const original=opts.workspace;
 const badEnv=[
  {PGHOST:'other'}, {PGHOSTADDR:'10.0.0.1'},
  {DATABASE_URL:'postgres://unsafe'}, {SUPABASE_DB_URL:'postgres://unsafe'},
  {SUPABASE_YES:'1'}, {SUPABASE_PROJECT_ID:'wrong'}
 ];
 for(const env of badEnv){
  let calls=0;
  assert.throws(()=>runR60ReadOnlyLinkedCli({
   ...opts,env,invoke:()=>{calls++;throw Error('MUST_NOT_RUN');}
  }),/R60 LINKED CLI NO-GO:/);
  assert.equal(calls,0);
 }
 writeFileSync(join(original,'supabase','.temp','project-ref'),'wrong\n');
 assert.throws(()=>runR60ReadOnlyLinkedCli({
  ...opts,invoke:()=>{throw Error('MUST_NOT_RUN');}
 }),/linked CLI target/);
});
test('R18-60 rejects hidden seed, roles or external dotenv BEFORE remote fetch',t=>{
 const names=['supabase/seed.sql','supabase/roles.sql','supabase/.env',
  'supabase/.env.local','.env','.env.local'];
 for(const filename of names){
  const opts=sandbox(t);
  const base=join(opts.workspace,filename);
  writeFileSync(base,'SUPABASE_YES=1\n');
  let calls=0;
  assert.throws(()=>runR60ReadOnlyLinkedCli({
   ...opts,invoke:()=>{calls++;throw Error('MUST_NOT_RUN');}
  }),/isolation contains seed, roles or extra environment file/);
  assert.equal(calls,0);
 }
});
test('R18-60 missing private fresh receipts, stale R50 or corrupted history block first',t=>{
 const opts=sandbox(t),calls=[];
 const invoke=()=>{calls.push('wrong');return {status:0,stdout:'2.81.3',stderr:''}};
 writeFileSync(opts.readOnlyReceiptFile,JSON.stringify({
  ...validReceipt(),observed_at:'2020-01-01T00:00:00.000Z'
 }));
 assert.throws(()=>runR60ReadOnlyLinkedCli({...opts,invoke}),/stale/);
 assert.deepEqual(calls,[]);
 writeFileSync(opts.readOnlyReceiptFile,JSON.stringify(validReceipt()));
 writeFileSync(opts.freshSqlDigestsFile,JSON.stringify([{version:'wrong'}]));
 assert.throws(()=>runR60ReadOnlyLinkedCli({...opts,invoke}),
  /exact 83 source-digest baseline/);
 assert.deepEqual(calls,[]);
});
test('R18-60 refuses wrong CLI version before fetch or source-copy',t=>{
 const opts=sandbox(t),calls=[];
 const invoke=(argv)=>{
  calls.push(argv.join(' '));
  return {status:0,stdout:'3.0.0\n',stderr:''};
 };
 assert.throws(()=>runR60ReadOnlyLinkedCli({...opts,invoke}),/2\.81\.3/);
 assert.deepEqual(calls,['--version']);
 assert.deepEqual(readdirSync(join(opts.workspace,'supabase','migrations')),[]);
});
test('R18-60 exact fetched history fails before list or dry-run if bodies missing or forged',t=>{
 const opts=sandbox(t),calls=[];
 const invoke=fakeCli({workspace:opts.workspace,log:calls});
 assert.throws(()=>runR60ReadOnlyLinkedCli({...opts,invoke}),
  /fetched historical SQL body digest mismatch/);
 assert.deepEqual(calls,['--version','migration fetch --linked']);
 assert.equal(readdirSync(join(opts.workspace,'supabase','migrations')).length,83);
});
test('R18-60 hostile verification output cannot turn a NO_GO into a GO or run dry-run',t=>{
 const opts=sandbox(t),calls=[];
 const invoke=fakeCli({workspace:opts.workspace,log:calls});
 assert.throws(()=>runR60ReadOnlyLinkedCli({
  ...opts,invoke,verifyFetchedHistory:sourceStub,
  verifyWorkspace:()=>({decision:'GO',safeToApply:true,totalFilesChecked:91})
 }),/isolated versioned workspace did not validate/);
 assert.deepEqual(calls,['--version','migration fetch --linked']);
});
test('R18-60 transcript must validate exactly 8 pending after list and dry-run',t=>{
 const opts=sandbox(t),calls=[];
 const invoke=fakeCli({workspace:opts.workspace,log:calls});
 assert.throws(()=>runR60ReadOnlyLinkedCli({
  ...opts,invoke,verifyFetchedHistory:sourceStub,
  verifyWorkspace:workspaceStub,
  verifyEvidence:()=>({decision:'NO_GO',safeToApply:false,verifiedFileBodies:91,
   matchingHistory:83,pendingVersions:9,verifiedDryRunOutputShape:true})
 }),/transcript or current authority history did not validate/);
 assert.deepEqual(calls,R60_CLI_ARGV.map(x=>x.join(' ')));
});
test('R18-60 never prints CLI output/secrets, never invokes SQL or unsafe remote CLI',()=>{
 assert.match(SRC,/shell:false/);
 assert.match(SRC,/CI:'1',NO_COLOR:'1'/);
 assert.match(SRC,/fsConstants\.COPYFILE_EXCL/);
 assert.match(SRC,/validateR48NarrowPackage/);
 assert.match(SRC,/validateR49LinkedWorkspace/);
 assert.match(SRC,/validateR50ReadOnlyReceipt/);
 assert.match(SRC,/validateR51CliEvidence/);
 assert.match(SRC,/safeToApply:false,sqlPushApproved:false/);
 assert.match(SRC,/NO-GO: offline\/current linked-CLI evidence unavailable or rejected/);
 assert.doesNotMatch(SRC,/localStorage|sessionStorage|navigator|fetch\(|https\.request|execSync|eval\(/);
 assert.doesNotMatch(SRC,/apply_migration|migration repair|db reset|--include-all|--yes/);
});

test('R18-61 pre-dry-run freshness recheck blocks expired R50 after slow fetch',t=>{
 const opts=sandbox(t),calls=[];
 const late=()=>new Date(Date.now()+16*60000);
 assert.throws(()=>runR60ReadOnlyLinkedCli({
  ...opts,invoke:fakeCli({workspace:opts.workspace,log:calls}),
  verifyFetchedHistory:sourceStub,verifyWorkspace:workspaceStub,
  verifyEvidence:evidenceStub,completionClock:late
 }),/stale, future-dated or invalid read-only snapshot/);
 assert.deepEqual(calls,['--version','migration fetch --linked']);
});
test('R18-61 post-dry-run freshness recheck rejects stale completion evidence',t=>{
 const opts=sandbox(t),calls=[];let ticks=0;
 const clock=()=>new Date(Date.now()+(++ticks===1?0:16*60000));
 let evidenceCalls=0;
 assert.throws(()=>runR60ReadOnlyLinkedCli({
  ...opts,invoke:fakeCli({workspace:opts.workspace,log:calls}),
  verifyFetchedHistory:sourceStub,verifyWorkspace:workspaceStub,
  verifyEvidence:()=>{evidenceCalls++;return evidenceStub()},
  completionClock:clock
 }),/stale, future-dated or invalid read-only snapshot/);
 assert.deepEqual(calls,R60_CLI_ARGV.map(x=>x.join(' ')));
 assert.equal(evidenceCalls,0);
});
test('R18-61 refuse invalid or backward-moving source clock even when fixtures claim success',t=>{
 const opts=sandbox(t),calls=[];
 assert.throws(()=>runR60ReadOnlyLinkedCli({
  ...opts,invoke:fakeCli({workspace:opts.workspace,log:calls}),
  verifyFetchedHistory:sourceStub,verifyWorkspace:workspaceStub,
  verifyEvidence:evidenceStub,completionClock:()=>new Date('invalid')
 }),/invalid or regressed receipt clock/);
 assert.deepEqual(calls,['--version','migration fetch --linked']);
});
test('R18-61 no in-memory injected CLI/verifier can impersonate a real linked operator attestation',()=>{
 assert.match(SRC,/operatorEvidence=now===undefined && env===process\.env &&/);
 assert.match(SRC,/invoke===runOfficialCli/);
 assert.match(SRC,/verifyFetchedHistory===exactFetchedHistory/);
 assert.match(SRC,/verifyEvidence===validateR51CliEvidence/);
 assert.match(SRC,/completionClock===systemClock/);
 assert.match(SRC,/officialReadOnlyCliCommandsExecutedInThisProcess:operatorEvidence/);
 assert.match(SRC,/syntheticTestInputsUsed:!operatorEvidence/);
 assert.match(SRC,/const completedAt=checkCurrentAuthority/);
 assert.match(SRC,/now:completedAt/);
});
