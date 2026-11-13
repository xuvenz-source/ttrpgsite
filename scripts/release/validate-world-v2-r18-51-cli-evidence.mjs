/**
 * B10-R18-51 — inert evidence inspection, NOT a CLI or production runner.
 * Strictly parse captured official Supabase CLI LIST and DRY-RUN output;
 * validate R49 immutable 83+8 workspace and R50 fresh read-only snapshot.
 * No subprocess, network, credentials, database SQL or write operations.
 */
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR49LinkedWorkspace} from './validate-world-v2-r18-49-linked-workspace.mjs';
import {validateR50ReadOnlyReceipt} from './validate-world-v2-r18-50-readonly-evidence.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const BASELINE='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const NARROW='staging/world-v2-b10-r18-48-narrow-pending/manifest.json';
const R05='20261111023204_world_v2_b10_integrated_motion.sql';
const PROJECT='lwhwgqaunxbmvyndswze';
const fail=s=>{throw Error('R51 CLI NO-GO: '+s);};
const lines=s=>s.replace(/\r\n/g,'\n').split('\n');
const ordered=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const bad=/(?:migration\s+repair|migration\s+up|db\s+reset|--include-all|history\s+mismatch|migration\s+history\s+out\s+of\s+sync|cannot\s+find|not\s+found\s+locally|\berror\b|\bfailed\b)/i;
function safeOutput(s,label){
 if(typeof s!=='string'||!s.trim()||s.length>120000||/[\0\x1b]/.test(s))
  fail(label+' output absent, unsafe or oversized');
 if(bad.test(s))fail(label+' output contains an error, repair or unsafe invocation');
 if(/(?:sb_secret_[a-z0-9]+|sbp_[a-f0-9]+|SUPABASE_ACCESS_TOKEN\s*=|(?:postgres|postgresql):\/\/)/i.test(s))
  fail(label+' output contains possible credentials; store privately and redact before inspection');
 return s;
}
function expectedVersions({baseline,manifest}){
 if(!Array.isArray(baseline?.rows)||baseline.rows.length!==83||
    baseline.originalMigrationVersionCount!==83||
    baseline.expectedNewestVersion!=='20261109171247')
  fail('frozen baseline must contain exactly 83 verified versions');
 if(manifest?.releaseDecision!=='NO_GO'||manifest.safeToApply!==false||
    manifest.expectedPendingTotalWithR05!==8||
    !Array.isArray(manifest.pending)||manifest.pending.length!==7)
  fail('R48 narrow NO-GO manifest drift');
 const remote=baseline.rows.map(x=>x.version);
 if(remote.some(x=>typeof x!=='string'||! /^\d{14}$/.test(x))||
    new Set(remote).size!==83||!ordered(remote,[...remote].sort()))
  fail('frozen history contains duplicate or unordered version');
 const files=[R05,...manifest.pending.map(x=>x.filename)];
 const pending=files.map(x=>{
  if(!/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(x))fail('invalid pending filename');
  return x.slice(0,14);
 });
 if(new Set(pending).size!==8||!ordered(pending,[...pending].sort())||
    pending[0]<='20261109171247')
  fail('pending migration order or identity drift');
 return {remote,pending,files};
}
/** Extracts actual table versions; never trusts prose summaries or inferred counts. */
export function parseR51MigrationList({text,remote,pending}={}){
 const output=safeOutput(text,'migration list');
 let header=false;
 const values=[];
 for(let line of lines(output)){
  let s=line.trim();
  // Supabase CLI 2.x formats migration list with Unicode box drawing:
  // LOCAL │ REMOTE │ TIME (UTC), and ───┼───┼─── dividers.
  // CI's old ASCII-only fixture used | and - instead. Both must be
  // accepted without ever discarding a blank local or remote column.
  if(!s||/^[\s|│\-+─━═┼┬┴┌┐└┘├┤╪╤╧╒╕╘╛╞╡]+$/.test(s))continue;
  if(s.includes('|')&&s.includes('│'))
   fail('mixed ASCII and Unicode table delimiters');
  const delimiter=s.includes('│')?'│':'|';
  const delimiterCount=s.split(delimiter).length-1;
  if(s.startsWith(delimiter)&&delimiterCount>=3)s=s.slice(1).trim();
  if(s.endsWith(delimiter)&&delimiterCount>=3)s=s.slice(0,-1).trim();
  const cols=s.split(delimiter).map(x=>x.trim());
  if(cols.length===3&&/^local$/i.test(cols[0])&&
     /^remote$/i.test(cols[1])&&/^time\s*\(utc\)$/i.test(cols[2])){
   if(header)fail('duplicate migration list header');
   header=true;continue;
  }
  if(cols.length===3&&/^(?:\d{14})?$/.test(cols[0])&&/^(?:\d{14})?$/.test(cols[1])&&
    (cols[0]||cols[1])){
   if(!header)fail('list rows precede CLI header');
   values.push({local:cols[0],remote:cols[1]});
   continue;
  }
  if(/\b\d{14}\b/.test(s))fail('unparsed or ambiguous CLI migration version');
 }
 if(!header||values.length!==91)
  fail('CLI list must contain exactly 83 registered plus 8 pending rows');
 const registered=values.filter(x=>x.remote).map(x=>x.remote);
 const local=values.filter(x=>x.local).map(x=>x.local);
 const extra=values.filter(x=>!x.remote).map(x=>x.local);
 if(values.some(x=>x.remote&&x.local!==x.remote)||
    !ordered(registered,remote)||!ordered(extra,pending)||
    !ordered(local,[...remote,...pending]))
  fail('migration list history mismatch, unexpected pending version or replay');
 return Object.freeze({remoteCount:83,pendingCount:8,localCount:91,historyAligned:true});
}
/**
 * Requires exactly eight printed file identities, in reviewed order, AND a
 * dry-run signal. This can validate an artifact but cannot attest that a CLI
 * actually executed, or that a malicious operator did not forge that artifact.
 */
export function parseR51DryRun({text,files}={}){
 const output=safeOutput(text,'db push dry-run');
 if(!/\bdry[\s-]*run\b/i.test(output)||
    /\b(?:applying|applied|executing|executed)\s+(?:migration|sql)\b/i.test(output))
  fail('missing explicit dry-run or evidence of actual migration execution');
 const observed=[...output.matchAll(/\b\d{14}_[a-zA-Z0-9_-]+\.sql\b/g)].map(x=>x[0]);
 if(!Array.isArray(files)||files.length!==8||!ordered(observed,files))
  fail('dry-run migration identities must be exactly eight reviewed versions, in order');
 const versions=[...output.matchAll(/\b\d{14}\b/g)].map(x=>x[0]);
 const allowed=new Set(files.map(x=>x.slice(0,14)));
 if(versions.some(x=>!allowed.has(x)))
  fail('dry-run mentions an unexpected migration version');
 return Object.freeze({dryRunOnly:true,printedPendingFiles:8,unexpectedMigrations:0});
}
/**
 * This verifier does not execute the linked CLI. A passing result is still
 * NO_GO; a separate operator must attest actual invocation and reviewer QA.
 */
export function validateR51CliEvidence({workspace,freshSqlDigests,readOnlyReceipt,
  migrationListText,dryRunText,cliVersion,listExitCode,dryRunExitCode,
  repoRoot=ROOT,now=new Date()}={}){
 if(cliVersion!=='2.81.3'||listExitCode!==0||dryRunExitCode!==0)
  fail('actual pinned CLI version and zero process exit statuses required');
 const base=realpathSync(resolve(repoRoot));
 const baseline=JSON.parse(readFileSync(join(base,BASELINE),'utf8'));
 const manifest=JSON.parse(readFileSync(join(base,NARROW),'utf8'));
 const versions=expectedVersions({baseline,manifest});
 const history=validateR49LinkedWorkspace({workspace,freshSqlDigests,repoRoot:base});
 if(history.decision!=='DRY_RUN_ONLY'||history.safeToApply!==false||
    history.totalFilesChecked!==91)
  fail('R49 source-exact workspace check did not pass');
 const receipt=validateR50ReadOnlyReceipt({receipt:readOnlyReceipt,repoRoot:base,now});
 if(receipt.decision!=='NO_GO'||receipt.safeToApply!==false||
    receipt.matchedRemoteHistory!==83||receipt.matchedAuthorityFunctions!==10)
  fail('fresh R50 authority snapshot failed');
 const list=parseR51MigrationList({text:migrationListText,
  remote:versions.remote,pending:versions.pending});
 const dryRun=parseR51DryRun({text:dryRunText,files:versions.files});
 if(!list.historyAligned||!dryRun.dryRunOnly)fail('missing CLI terminal evidence');
 return Object.freeze({
  decision:'NO_GO',safeToApply:false,verifiedFileBodies:91,
  matchingHistory:83,pendingVersions:8,verifiedDryRunOutputShape:true,
  actualLinkedCliInvocationIndependentlyAttested:false,
  independentDmP1P2Accepted:false,freeTierLoadAccepted:false,
  productionApproval:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=k=>{
  const matches=process.argv.slice(2).filter(v=>v.startsWith('--'+k+'='));
  if(matches.length!==1||!matches[0].slice(k.length+3))
   fail('exactly one --'+k+'=... argument required');
  return matches[0].slice(k.length+3);
 };
 try{
  const allowed=['workspace','fresh-sql-digests','receipt','migration-list','dry-run-output','cli-version','list-exit','dry-run-exit'];
  if(process.argv.slice(2).some(s=>!allowed.some(k=>s.startsWith('--'+k+'='))))
   fail('unexpected argument');
  const read=k=>readFileSync(resolve(arg(k)),'utf8');
  const fingerprint=JSON.parse(read('fresh-sql-digests'));
  const result=validateR51CliEvidence({
   workspace:arg('workspace'),
   freshSqlDigests:Array.isArray(fingerprint)?fingerprint:fingerprint.rows,
   readOnlyReceipt:JSON.parse(read('receipt')),
   migrationListText:read('migration-list'),dryRunText:read('dry-run-output'),
   cliVersion:arg('cli-version'),
   listExitCode:Number(arg('list-exit')),dryRunExitCode:Number(arg('dry-run-exit'))
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
