/**
 * B10-R18-60 — Explicitly invoked, credential-free-in-source, official
 * Supabase CLI v2.81.3 linked 83+8 migration LIST + DRY-RUN evidence runner.
 *
 * Calls ONLY: --version, migration fetch --linked, migration list --linked,
 * db push --dry-run --linked. No SQL installation, repair, login or link.
 * Official CLI must ALREADY be authenticated and linked in a separate
 * disposable local workspace outside this repo. Raw CLI logs are NEVER
 * written, returned or printed.
 *
 * A passing runner is CLI-EVIDENCE-ONLY; independent signed multiplayer
 * acceptance and release approval remain NO_GO.
 */
import {spawnSync} from 'node:child_process';
import {
 readFileSync,copyFileSync,readdirSync,lstatSync,realpathSync,statSync,
 constants as fsConstants
} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectR18IsolatedWorkspace}
 from './rehearse-world-v2-r18-12-linked-cli.mjs';
import {validateR48NarrowPackage}
 from './validate-world-v2-r18-48-narrow-package.mjs';
import {validateR49LinkedWorkspace}
 from './validate-world-v2-r18-49-linked-workspace.mjs';
import {validateR50ReadOnlyReceipt}
 from './validate-world-v2-r18-50-readonly-evidence.mjs';
import {validateR51CliEvidence}
 from './validate-world-v2-r18-51-cli-evidence.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const REF='lwhwgqaunxbmvyndswze';
const VERSION='2.81.3';
const R05='20261111023204_world_v2_b10_integrated_motion.sql';
const MANIFEST='staging/world-v2-b10-r18-48-narrow-pending/manifest.json';
const HISTORY='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const fail=s=>{throw Error('R60 LINKED CLI NO-GO: '+s)};
const within=(p,dir)=>p===dir||p.startsWith(dir+sep);
const md5=bytes=>createHash('md5').update(bytes).digest('hex');

export const R60_CLI_ARGV=Object.freeze([
 Object.freeze(['--version']),
 Object.freeze(['migration','fetch','--linked']),
 Object.freeze(['migration','list','--linked']),
 Object.freeze(['db','push','--dry-run','--linked'])
]);

function privateJson(path,{repoRoot=ROOT,maxBytes=150000}={}){
 if(typeof path!=='string'||!path)fail('fresh, explicitly supplied private JSON file required');
 const p=resolve(path);
 if(within(p,repoRoot)||!lstatSync(p).isFile()||realpathSync(p)!==p||
    statSync(p).size>maxBytes)
  fail('receipt must be an ordinary bounded file OUTSIDE source repository');
 return JSON.parse(readFileSync(p,'utf8'));
}
function safeEnv(env){
 if(!env||typeof env!=='object')fail('explicit nonambiguous CLI environment required');
 const barred=['DATABASE_URL','SUPABASE_DB_URL','PGHOST','PGHOSTADDR',
  'PGPORT','PGDATABASE','PGSERVICE','PGSERVICEFILE','SUPABASE_YES',
  'SUPABASE_CONFIRM'];
 for(const name of barred){
  if(Object.hasOwn(env,name))fail('ambiguous CLI target or confirmation override '+name);
 }
 for(const name of ['SUPABASE_PROJECT_ID','PROJECT_ID']){
  if(env[name]&&env[name]!==REF)
   fail('unexpected project identifier override');
 }
 if((env.SUPABASE_LOG_LEVEL||'').toLowerCase()==='debug')
  fail('verbose authentication logging forbidden');
}
function realRegular(path){
 const name=resolve(path);
 if(!lstatSync(name).isFile()||realpathSync(name)!==name)
  fail('symlink or missing regular migration file');
 return name;
}
function runOfficialCli(argv,base,env){
 const r=spawnSync('supabase',argv,{
  cwd:base,encoding:'utf8',shell:false,timeout:180000,
  maxBuffer:180000,windowsHide:true,env:{...env,CI:'1',NO_COLOR:'1'}
 });
 if(r.error||r.status!==0||r.signal)
  fail('official CLI step failed: '+argv[0]);
 if(typeof r.stdout!=='string'||typeof r.stderr!=='string')
  fail('official CLI returned invalid output');
 // Logs stay only in process memory, where the source validators inspect
 // their shape. Never include them in an error or final report.
 return {stdout:r.stdout,stderr:r.stderr,status:0};
}
function exactFetchedHistory(dir,rows){
 if(!Array.isArray(rows)||rows.length!==83)
  fail('exactly 83 fresh historical SQL digest rows required');
 const expected=new Map();
 for(const row of rows){
  if(!row||typeof row.version!=='string'||! /^\d{14}$/.test(row.version)||
     typeof row.name!=='string'||!/^[a-zA-Z0-9_-]+$/.test(row.name)||
     typeof row.fetched_sql_md5!=='string'||
     !/^[a-f0-9]{32}$/.test(row.fetched_sql_md5))
   fail('invalid independent historical fingerprint');
  const filename=row.version+'_'+row.name+'.sql';
  if(expected.has(filename))fail('duplicate historical version or name');
  expected.set(filename,row.fetched_sql_md5);
 }
 const names=readdirSync(dir,{withFileTypes:true});
 if(names.length!==83||names.some(x=>!x.isFile()||!expected.has(x.name)))
  fail('CLI fetch did not produce the exact 83 original history files');
 for(const filename of expected.keys()){
  const bytes=readFileSync(realRegular(join(dir,filename)));
  if(md5(bytes)!==expected.get(filename))
   fail('fetched historical SQL body digest mismatch '+filename.slice(0,14));
 }
 return expected;
}
function copyPending(root,dir){
 const manifest=JSON.parse(readFileSync(join(root,MANIFEST),'utf8'));
 const frozen=validateR48NarrowPackage({repoRoot:root});
 if(frozen.safeToApply!==false||frozen.pendingWithR05!==8||
    manifest.expectedPendingTotalWithR05!==8||manifest.pending?.length!==7)
  fail('reviewed R18-48 NO-GO package or narrow pending sources drift');
 const sourcePaths=[join(root,'supabase/migrations',R05),
  ...manifest.pending.map(m=>join(root,manifest.stagedMigrationDirectory,m.filename))];
 const expected=[R05,...manifest.pending.map(m=>m.filename)];
 // Copy only pre-reviewed sources; fail on existing file, symlink or name.
 for(let i=0;i<sourcePaths.length;i++){
  realRegular(sourcePaths[i]);
  copyFileSync(sourcePaths[i],join(dir,expected[i]),fsConstants.COPYFILE_EXCL);
 }
 const contents=readdirSync(dir);
 if(contents.length!==91)fail('expected exactly 91 isolated migration files after copy');
 return expected;
}

export function runR60ReadOnlyLinkedCli({
 workspace,freshSqlDigestsFile,readOnlyReceiptFile,now=new Date(),
 env=process.env,invoke=runOfficialCli,
 verifyFetchedHistory=exactFetchedHistory,
 verifyWorkspace=validateR49LinkedWorkspace,
 verifyEvidence=validateR51CliEvidence
}={}){
 safeEnv(env);
 const scope=inspectR18IsolatedWorkspace(workspace,{env});
 const root=realpathSync(ROOT);
 const historical=privateJson(freshSqlDigestsFile,{repoRoot:root,maxBytes:65000});
 const rows=Array.isArray(historical)?historical:historical?.rows;
 const receipt=privateJson(readOnlyReceiptFile,{repoRoot:root,maxBytes:150000});
 // This MUST run before any linked CLI command and is only valid for 15m.
 const r50=validateR50ReadOnlyReceipt({receipt,now,repoRoot:root});
 if(r50?.decision!=='NO_GO'||r50?.safeToApply!==false||
    r50.matchedRemoteHistory!==83||r50.matchedAuthorityFunctions!==10)
  fail('fresh current 83-history authority receipt unavailable');
 const baseline=JSON.parse(readFileSync(join(root,HISTORY),'utf8'));
 if(!Array.isArray(baseline.rows)||baseline.rows.length!==83||
    !Array.isArray(rows)||rows.length!==83)
  fail('no exact 83 source-digest baseline available');
 const localResult=(index)=>{
  const argv=R60_CLI_ARGV[index];
  const result=invoke([...argv],scope.base,env);
  if(!result||result.status!==0||typeof result.stdout!=='string'||
     typeof result.stderr!=='string')
   fail('nonzero/invalid official CLI result at step '+index);
  return result.stdout+'\n'+result.stderr;
 };
 const cliVersion=localResult(0).trim().split(/\r?\n/,1)[0];
 if(cliVersion!==VERSION)fail('only pinned official CLI 2.81.3 is accepted');
 localResult(1); // linked FETCH writes to operator-local isolated folder only.
 verifyFetchedHistory(scope.migrationDir,rows);
 copyPending(root,scope.migrationDir);
 const checked=verifyWorkspace({
  workspace:scope.base,freshSqlDigests:rows,repoRoot:root
 });
 if(checked?.decision!=='DRY_RUN_ONLY'||checked.safeToApply!==false||
    checked.totalFilesChecked!==91||checked.historicalBodiesChecked!==83||
    checked.pendingChecked!==8)
  fail('exact 83+8 isolated versioned workspace did not validate');
 const list=localResult(2);
 const dry=localResult(3); // LITERAL --dry-run, no argument substitution.
 const report=verifyEvidence({
  workspace:scope.base,freshSqlDigests:rows,readOnlyReceipt:receipt,
  migrationListText:list,dryRunText:dry,cliVersion:VERSION,
  listExitCode:0,dryRunExitCode:0,repoRoot:root,now
 });
 if(report?.decision!=='NO_GO'||report.safeToApply!==false||
    report.verifiedFileBodies!==91||report.matchingHistory!==83||
    report.pendingVersions!==8||report.verifiedDryRunOutputShape!==true)
  fail('official CLI transcript or current authority history did not validate');
 return Object.freeze({
  decision:'NO_GO',safeToApply:false,sqlPushApproved:false,
  linkedProject:REF,pinnedCliVersion:VERSION,
  officialReadOnlyCliCommandsExecutedInThisProcess:true,
  linkedCliCommandCount:4,historicalSqlBodiesValidated:83,
  reviewedPendingVersions:8,linkedCliListAndDryRunValidated:true,
  sourceWorkspaceOutsideRepo:true,
  independentBrowserDmP1P2Accepted:false,
  freeTierPerformanceAccepted:false,
  productionApproval:false
 });
}

function value(name){
 const starts='--'+name+'=';
 const matches=process.argv.slice(2).filter(x=>x.startsWith(starts));
 if(matches.length!==1||!matches[0].slice(starts.length))
  fail('required exact --'+name+'=private-path argument');
 return matches[0].slice(starts.length);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const names=['workspace','fresh-sql-digests','read-only-receipt'];
  if(process.argv.slice(2).filter(x=>x==='--operator-run-linked-read-only').length!==1||
     process.argv.slice(2).some(x=>
      x!=='--operator-run-linked-read-only'&&
      !names.some(k=>x.startsWith('--'+k+'='))))
   fail('explicit --operator-run-linked-read-only and three private paths required');
  const out=runR60ReadOnlyLinkedCli({
   workspace:value('workspace'),
   freshSqlDigestsFile:value('fresh-sql-digests'),
   readOnlyReceiptFile:value('read-only-receipt')
  });
  process.stdout.write(JSON.stringify(out,null,2)+'\n');
 }catch{
  // NEVER print CLI stdout/stderr, credentials, private JSON, stack, path,
  // or SQL bodies; a failure is always NO-GO with a static safe message.
  process.stderr.write('R60 LINKED CLI NO-GO: offline/current linked-CLI evidence unavailable or rejected; review privately.\n');
  process.exitCode=1;
 }
}