import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,
  readdirSync,symlinkSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {
  inspectR18IsolatedWorkspace,rehearseR18LinkedCli,R18_READONLY_COMMANDS
} from '../scripts/release/rehearse-world-v2-r18-12-linked-cli.mjs';

const PROJECT='lwhwgqaunxbmvyndswze';
const TARGET='20261111023204_world_v2_b10_integrated_motion.sql';
const baseline=JSON.parse(readFileSync(new URL(
 '../staging/world-v2-b10-r18-08-remote-history-content-hashes.json',
 import.meta.url),'utf8')).rows;

function workspace(){
 const dir=mkdtempSync(join(tmpdir(),'ttrpg-b10-r18-12-'));
 const base=join(dir,'isolated'),supabase=join(base,'supabase');
 mkdirSync(join(supabase,'.temp'),{recursive:true});
 mkdirSync(join(supabase,'migrations'));
 writeFileSync(join(supabase,'.temp/project-ref'),PROJECT+'\n');
 writeFileSync(join(supabase,'config.toml'),
  '[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n');
 const fresh=join(dir,'fresh.json');
 writeFileSync(fresh,JSON.stringify(baseline));
 return {
  dir,base,supabase,fresh,
  cleanup(){rmSync(dir,{recursive:true,force:true})}
 };
}
function harness(){
 const w=workspace(),commands=[],events=[];
 const fake={
  invoke(args,cwd){
   commands.push([...args]);assert.equal(cwd,resolve(w.base));
   events.push('cli:'+args.join(' '));
   if(args[0]==='--version')
    return {stdout:'2.81.3\n',stderr:''};
   if(args[0]==='migration'&&args[1]==='fetch')
    return {stdout:'fetched remote history\n',stderr:''};
   if(args[0]==='migration'&&args[1]==='list')
    return {stdout:'synthetic list',stderr:''};
   if(args[0]==='db'&&args[1]==='push')
    return {stdout:'synthetic dry-run',stderr:''};
   throw Error('Unrecognized command');
  },
  validateHistory(options){
   events.push('history-validate');
   assert.equal(options.workspace,resolve(w.base));
   assert.equal(options.freshPayload.length,83);
   assert.equal(options.expectedProjectRef,PROJECT);
   assert.ok(readdirSync(join(w.supabase,'migrations')).includes(TARGET),
    'Only reviewed migration copied after the CLI history fetch');
   assert.equal(readFileSync(join(w.supabase,'migrations',TARGET),'utf8'),
    readFileSync(new URL('../supabase/migrations/'+TARGET,import.meta.url),'utf8'));
   return {decision:'DRY_RUN_ONLY',safeToApply:false,validatedRemoteSqlBodies:83};
  },
  validateTranscript(options){
   events.push('transcript-validate');
   assert.equal(options.cliVersion,'2.81.3');
   assert.match(options.migrationListOutput,/synthetic list/);
   assert.match(options.dryRunOutput,/synthetic dry-run/);
   return {decision:'NO_GO',safeToApply:false,matchedRemoteRows:83,
    expectedPendingMigrations:[TARGET]};
  }
 };
 return {w,commands,events,fake,
  run(overrides={}){
   return rehearseR18LinkedCli({
    workspace:w.base,freshSqlHashes:w.fresh,env:{},...fake,...overrides
   });
  }
 };
}
test('R18-12 runs only four fixed pinned and read-only CLI commands in safe order',()=>{
 const h=harness();
 try{
  const report=h.run();
  assert.deepEqual(h.commands,R18_READONLY_COMMANDS);
  assert.deepEqual(h.events,[
   'cli:--version','cli:migration fetch --linked','history-validate',
   'cli:migration list --linked','cli:db push --dry-run --linked',
   'transcript-validate'
  ]);
  assert.equal(report.decision,'NO_GO');
  assert.equal(report.safeToApply,false);
  assert.equal(report.sqlInstallationAuthorized,false);
  assert.equal(report.authenticatedThreeBrowserAcceptanceProven,false);
  assert.equal(report.onlyPendingMigration,TARGET);
  assert.equal(report.historicalSqlBodiesVerified,83);
  assert.equal(report.cliReadOnlyRehearsalExecutedInThisProcess,true);
  assert.deepEqual(readdirSync(join(h.w.supabase,'migrations')),[TARGET]);
 }finally{h.w.cleanup()}
});
test('R18-12 refuses a wrong CLI version before any remote fetch',()=>{
 const h=harness();
 try{
  assert.throws(()=>h.run({invoke:(args,cwd)=>{
   h.commands.push(args);return {stdout:'3.0.0\n',stderr:''}
  }}),/Pinned CLI 2\.81\.3/);
  assert.deepEqual(h.commands,[['--version']]);
  assert.deepEqual(readdirSync(join(h.w.supabase,'migrations')),[]);
 }finally{h.w.cleanup()}
});
test('R18-12 rejects missing, duplicate, or wrong remote project linkage',()=>{
 const h=harness();
 try{
  writeFileSync(join(h.w.supabase,'.temp/project-ref'),'wrong-project\n');
  assert.throws(()=>h.run(),/not the approved project/);
  assert.equal(h.commands.length,0);
  writeFileSync(join(h.w.supabase,'.temp/project-ref'),PROJECT+'\n');
  assert.throws(()=>h.run({env:{SUPABASE_PROJECT_ID:'wrong-project'}}),
   /Unexpected project reference/);
  assert.equal(h.commands.length,0);
 }finally{h.w.cleanup()}
});
test('R18-12 refuses dangerous database URL and PostgreSQL target overrides',()=>{
 const h=harness();
 try{
  for(const name of ['SUPABASE_DB_URL','DATABASE_URL','PGHOST','PGPORT',
   'PGDATABASE','PGSERVICE','PGSERVICEFILE']){
   assert.throws(()=>h.run({env:{[name]:'elsewhere'}}),
    /Ambiguous database URL/);
  }
  assert.equal(h.commands.length,0);
 }finally{h.w.cleanup()}
});
test('R18-12 never rehearses with seed enabled or migration disabled',()=>{
 const h=harness();
 try{
  writeFileSync(join(h.w.supabase,'config.toml'),
   '[db.migrations]\nenabled = false\n[db.seed]\nenabled = false\n');
  assert.throws(()=>h.run(),/enabled must equal true/);
  writeFileSync(join(h.w.supabase,'config.toml'),
   '[db.migrations]\nenabled = true\n[db.seed]\nenabled = true\n');
  assert.throws(()=>h.run(),/enabled must equal false/);
  assert.equal(h.commands.length,0);
 }finally{h.w.cleanup()}
});
test('R18-12 refuses nonempty migration directory and repository workspace',()=>{
 const h=harness();
 try{
  writeFileSync(join(h.w.supabase,'migrations','bad.sql'),'-- unexpected');
  assert.throws(()=>h.run(),/completely empty/);
  assert.throws(()=>inspectR18IsolatedWorkspace(
   resolve(new URL('../',import.meta.url).pathname),{env:{}}),
   /outside Git checkout/);
  assert.equal(h.commands.length,0);
 }finally{h.w.cleanup()}
});
test('R18-12 history-body validation blocks list and push dry run on failure',()=>{
 const h=harness();
 try{
  assert.throws(()=>h.run({validateHistory:()=>{
   throw Error('Remote SQL history drift');
  }}),/Remote SQL history drift/);
  assert.deepEqual(h.commands,[['--version'],['migration','fetch','--linked']]);
 }finally{h.w.cleanup()}
});
test('R18-12 a failed CLI list cannot reach the dry-run command',()=>{
 const h=harness();
 try{
  assert.throws(()=>h.run({invoke:(args,cwd)=>{
   const out=h.fake.invoke(args,cwd);
   if(args[1]==='list')throw Error('CLI list refused');
   return out;
  }}),/CLI list refused/);
  assert.deepEqual(h.commands,[
   ['--version'],['migration','fetch','--linked'],
   ['migration','list','--linked']
  ]);
 }finally{h.w.cleanup()}
});
test('R18-12 transcript mismatch still says NO-GO and cannot apply migrations',()=>{
 const h=harness();
 try{
  assert.throws(()=>h.run({validateTranscript:()=>{throw Error(
   'Second pending SQL migration refused'
  )}}),/Second pending SQL/);
  assert.equal(h.commands.at(-1).join(' '),'db push --dry-run --linked');
  assert.equal(h.commands.some(args=>args.includes('--yes')),false);
  assert.equal(h.commands.some(args=>
   args[0]==='db'&&args[1]==='push'&&!args.includes('--dry-run')),false);
 }finally{h.w.cleanup()}
});
test('R18-12 no credential or raw CLI logs are printed on failure',()=>{
 const h=harness();
 try{
  const secret='TEST_SECRET_NEVER_PRINT_THIS';
  assert.throws(()=>h.run({invoke:(args,cwd)=>{
   if(args[0]==='--version')return h.fake.invoke(args,cwd);
   throw Error('Synthetic CLI failure');
  }}),error=>{
   assert.equal(error.message.includes(secret),false);
   return true
  });
 }finally{h.w.cleanup()}
});
test('R18-12 operator CLI script requires explicit opt-in and has no installation path',()=>{
 const source=readFileSync(new URL(
  '../scripts/release/rehearse-world-v2-r18-12-linked-cli.mjs',import.meta.url),'utf8');
 assert.match(source,/--run-readonly-linked-rehearsal/);
 assert.match(source,/spawnSync\('supabase',args/);
 assert.match(source,/shell:false/);
 assert.match(source,/COPYFILE_EXCL/);
 assert.match(source,/db','push','--dry-run','--linked/);
 assert.doesNotMatch(source,/apply_migration|migration repair|--include-seed|--include-roles/);
 assert.equal(R18_READONLY_COMMANDS.length,4);
 for(const args of R18_READONLY_COMMANDS){
  assert.ok(args[0]==='--version'||args[0]==='migration'||
   args.join(' ')==='db push --dry-run --linked');
 }
});
