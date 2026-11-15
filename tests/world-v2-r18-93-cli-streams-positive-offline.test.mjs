import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,chmodSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 collectR91CliOutput,executeR91Cli,R91_COMMANDS,captureR91ReadOnly
} from '../scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs';
import {
 inspectR49IsolatedFiles,validateR49LinkedWorkspace
} from '../scripts/release/validate-world-v2-r18-49-linked-workspace.mjs';
import {
 parseR51MigrationList,parseR51DryRun
} from '../scripts/release/validate-world-v2-r18-51-cli-evidence.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const historical=JSON.parse(read(
 'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'));
const narrow=JSON.parse(read(
 'staging/world-v2-b10-r18-48-narrow-pending/manifest.json'));
const filenames=[
 '20261111023204_world_v2_b10_integrated_motion.sql',
 ...narrow.pending.map(x=>x.filename)
];
const remote=historical.rows.map(x=>x.version);
const pending=filenames.map(x=>x.slice(0,14));
const listText=()=>[
 'Connecting to remote database...',
 'Local │ Remote │ Time (UTC)',
 '──────┼────────┼──────────',
 ...remote.map(v=>v+' │ '+v+' │ 2026-11-16 00:00:00'),
 ...pending.map(v=>v+' │  │ 2026-11-16 00:00:00')
].join('\n');
const dryText=()=>[
 'DRY RUN: The following migrations would be pushed:',
 ...filenames.map(x=>' • '+x),
 'Dry run complete; no migrations were pushed.'
].join('\n');
const fakeArgv={
 list:R91_COMMANDS[5],dry:R91_COMMANDS[6]
};
const collect=(args,stdout,stderr,status=0)=>collectR91CliOutput({
 args,stdout,stderr,status,signal:null,error:null
});

test('R93 accepts legitimate read-only CLI list/dry-run text carried entirely on stderr',()=>{
 assert.equal(remote.length,83);
 assert.equal(pending.length,8);
 const list=collect(fakeArgv.list,'',listText());
 assert.equal(list.status,0);
 const checked=parseR51MigrationList({
  text:list.stdout,remote,pending
 });
 assert.deepEqual(checked,{
  remoteCount:83,pendingCount:8,localCount:91,historyAligned:true
 });
 const dry=collect(fakeArgv.dry,'',dryText());
 const parsed=parseR51DryRun({text:dry.stdout,files:filenames});
 assert.deepEqual(parsed,{dryRunOnly:true,printedPendingFiles:8,unexpectedMigrations:0});
 // No writes, no migration apply and no remote authentication occurred.
});

test('R93 accepts mixed stdout+stderr informational output without changing row identity',()=>{
 const l=collect(fakeArgv.list,listText().split('\n').slice(1).join('\n'),
  'Connecting to remote database...');
 const p=parseR51MigrationList({text:l.stdout,remote,pending});
 assert.equal(p.historyAligned,true);
 const dry=collect(fakeArgv.dry,'DRY RUN: The following migrations would be pushed:\n'+
  filenames.map(x=>' • '+x).join('\n'),
  'Dry run complete; no migrations were pushed.');
 assert.equal(parseR51DryRun({text:dry.stdout,files:filenames}).printedPendingFiles,8);
});

test('R93 fails closed on wrong CLI argv, status, stdout+stderr secrets, injected history',()=>{
 const scenarios=[
  {args:['db','push','--linked'],stdout:'',stderr:dryText()},
  {args:fakeArgv.list,status:1,stdout:listText(),stderr:''},
  {args:fakeArgv.dry,signal:'SIGTERM',stdout:dryText(),stderr:''},
  {args:fakeArgv.dry,stdout:'',stderr:'SUPABASE_ACCESS_TOKEN=abc123'},
  {args:fakeArgv.dry,stdout:'',stderr:'postgresql://admin:secret@example.com/database'},
  {args:fakeArgv.dry,stdout:'',stderr:'\x1b[31mDRY RUN'},
  {args:fakeArgv.dry,stdout:'',stderr:''},
  {args:fakeArgv.dry,stdout:'x'.repeat(120001),stderr:''}
 ];
 for(const partial of scenarios)assert.throws(()=>
  collectR91CliOutput({args:fakeArgv.dry,status:0,stdout:'',stderr:'',...partial}),
  /R91 READONLY CLI NO-GO/);
 const fakeOther=listText().replace(pending[4]+' │  │',
  '20261113021015 │  │');
 assert.throws(()=>parseR51MigrationList({text:collect(fakeArgv.list,'',fakeOther).stdout,
  remote,pending}),/R51 CLI NO-GO/);
 const extra=dryText()+'\n • 20261113021015_unreviewed.sql';
 assert.throws(()=>parseR51DryRun({text:collect(fakeArgv.dry,'',extra).stdout,
  files:filenames}),/R51 CLI NO-GO/);
});

test('R93 actual spawnSync of harmless local CLI captures stderr-only 83+8 and refuses mutated args',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r93-cli-io-'));
 try{
  writeFileSync(join(dir,'list.txt'),listText());
  writeFileSync(join(dir,'dry.txt'),dryText());
  const stub=join(dir,'offline-test-only-cli');
  writeFileSync(stub,
   '#!/usr/bin/env node\n'+
   'const {readFileSync}=require("node:fs");\n'+
   'const {join}=require("node:path");\n'+
   'const isList=process.argv.slice(2).join(" ")==="migration list --linked";\n'+
   'process.stderr.write(readFileSync(join(process.cwd(),isList?"list.txt":"dry.txt")));\n');
  chmodSync(stub,0o700);
  const list=executeR91Cli(stub,fakeArgv.list,dir);
  const dry=executeR91Cli(stub,fakeArgv.dry,dir);
  assert.equal(parseR51MigrationList({text:list.stdout,remote,pending}).localCount,91);
  assert.equal(parseR51DryRun({text:dry.stdout,files:filenames}).printedPendingFiles,8);
  assert.throws(()=>executeR91Cli(stub,['db','push','--linked'],dir),
   /R91 READONLY CLI NO-GO/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('R93 91-file POSITIVE local synthetic R49 inspection and real source seal still rejects synthetic',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r93-91-file-positive-'));
 try{
  const folder=join(dir,'supabase/migrations');
  mkdirSync(folder,{recursive:true});
  mkdirSync(join(dir,'supabase/.temp'),{recursive:true});
  const fake=[];
  for(let i=0;i<historical.rows.length;i++){
   const h=historical.rows[i];
   const sql='SELECT '+i+';\\n';
   const digest=createHash('md5').update(sql).digest('hex');
   fake.push({...h,statement_count:1,fetched_sql_md5:digest});
   writeFileSync(join(folder,h.version+'_'+h.name+'.sql'),sql);
  }
  for(const name of filenames){
   const from=name===filenames[0]?
    join(ROOT,'supabase/migrations',name):
    join(ROOT,narrow.stagedMigrationDirectory,name);
   writeFileSync(join(folder,name),readFileSync(from));
  }
  writeFileSync(join(dir,'supabase/config.toml'),
   '[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n');
  writeFileSync(join(dir,'supabase/.temp/project-ref'),
   'lwhwgqaunxbmvyndswze\n');
  const result=inspectR49IsolatedFiles({
   workspace:dir,repoRoot:ROOT,historical:fake,
   freshSqlDigests:fake,manifest:narrow
  });
  assert.deepEqual(result,{
   historicalBodiesChecked:83,pendingChecked:8,
   totalFilesChecked:91,projectIdentityChecked:true
  });
  assert.throws(()=>validateR49LinkedWorkspace({
   workspace:dir,freshSqlDigests:fake,repoRoot:ROOT
  }),/R49 LINKED NO-GO/);
  // A fake, internally consistent fixture can NEVER be mistaken for
  // independently authenticated live original source evidence.
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('R93 does not report a full manual authenticated CLI receipt from fabricated test input',()=>{
 assert.throws(()=>captureR91ReadOnly({
  preflight:{sourceReady:true,remoteHistoryCount:83,pendingCount:8,
   repoRoot:ROOT,workspace:'/unverified',receipt:{migration_history:[]}},
  cliVersion:'2.81.3',
  cliHelp:{
   fetchHelp:'Usage:\n  supabase migration fetch [flags]\n--linked',
   listHelp:'Usage:\n  supabase migration list [flags]\n--linked',
   pushHelp:'Usage:\n  supabase db push [flags]\n--linked\n--dry-run',
   linkHelp:'Usage:\n  supabase link [flags]\n--project-ref'
  },
  commandRunner:args=>({status:0,stdout:args.includes('list')?listText():dryText()})
 }),/R49 LINKED NO-GO|ENOENT/);
});
