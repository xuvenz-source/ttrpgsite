/**
 * B10-R18-91. Operator-initiated linked CLI READ-ONLY capture.
 *
 * Only after a trusted operator independently links/fetches the original 83
 * versions and stages the R05 + 7 sealed pending files in a disjoint private
 * workspace, this gate verifies R50/R49/R90 before issuing TWO nonmutating
 * commands to the already pinned v2.81.3 binary:
 *   migration list --linked
 *   db push --linked --dry-run
 *
 * Never links, fetches, repairs, applies or deploys; never prints raw CLI
 * output, SQL, credentials, private sight, scene or user information.
 * Everything remains NO_GO even after a local SUCCESS.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {basename,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateR49LinkedWorkspace} from './validate-world-v2-r18-49-linked-workspace.mjs';
import {validateR50ReadOnlyReceipt} from './validate-world-v2-r18-50-readonly-evidence.mjs';
import {validateR51CliEvidence,parseR51MigrationList}
 from './validate-world-v2-r18-51-cli-evidence.mjs';
import {validateR90PinnedHelp}
 from './validate-world-v2-r18-90-pinned-cli-help.mjs';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const PROJECT='lwhwgqaunxbmvyndswze';
const VERSION='2.81.3';
const OUTPUT_CAP=120000;
export const R91_COMMANDS=Object.freeze([
 Object.freeze(['--version']),
 Object.freeze(['migration','fetch','--help']),
 Object.freeze(['migration','list','--help']),
 Object.freeze(['db','push','--help']),
 Object.freeze(['link','--help']),
 Object.freeze(['migration','list','--linked']),
 Object.freeze(['db','push','--linked','--dry-run'])
]);
const fail=message=>{throw Error('R91 READONLY CLI NO-GO: '+message)};
const contained=(base,other)=>other===base||other.startsWith(base+sep);
function regular(filename,max=250000){
 const resolved=resolve(filename);
 const stat=lstatSync(resolved);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||
  realpathSync(resolved)!==resolved)fail('regular, bounded non-symlink file required');
 return readFileSync(resolved,'utf8');
}
function extract(receipt){
 if(Array.isArray(receipt)){
  if(receipt.length!==1)fail('fresh R50 result must have one row');
  return receipt[0]?.release_receipt;
 }
 return receipt?.release_receipt??receipt;
}
function ensureNoTargetOverride(env=process.env){
 for(const key of ['DATABASE_URL','SUPABASE_DB_URL','PGHOST','PGHOSTADDR',
  'PGDATABASE','PGSERVICE','PGSERVICEFILE','PGPASSFILE']){
  if(env[key])fail('database connection override not allowed: '+key);
 }
 for(const key of ['SUPABASE_PROJECT_ID','PROJECT_ID']){
  if(env[key]&&env[key]!==PROJECT)fail('project identity override mismatch');
 }
 if(env.SUPABASE_YES==='true'||env.SUPABASE_YES==='1')
  fail('noninteractive yes override is prohibited');
}
/** Non-network offline gating: verifies canonical 83 + exactly eight staged,
 * a fresh SELECT-only full 10-function R50 receipt, and intended project.
 */
export function preflightR91ReadOnly({workspace,readOnlyReceipt,repoRoot=ROOT,
 now=new Date(),env=process.env}={}){
 const root=realpathSync(resolve(repoRoot)),base=realpathSync(resolve(workspace));
 if(contained(root,base)||contained(base,root))
  fail('private CLI workspace and source checkout must be disjoint');
 ensureNoTargetOverride(env);
 const receipt=extract(readOnlyReceipt);
 const audit=validateR50ReadOnlyReceipt({receipt,repoRoot:root,now});
 if(audit.decision!=='NO_GO'||audit.safeToApply!==false||
   audit.matchedRemoteHistory!==83||audit.matchedAuthorityFunctions!==10)
  fail('fresh actual R50 private authority/body audit rejected');
 const files=validateR49LinkedWorkspace({
  workspace:base,repoRoot:root,freshSqlDigests:receipt.migration_history
 });
 if(files.decision!=='DRY_RUN_ONLY'||files.safeToApply!==false||
  files.totalFilesChecked!==91||files.historicalBodiesChecked!==83||
  files.pendingChecked!==8||files.projectIdentityChecked!==true)
  fail('83 fetched SQL files plus eight source-sealed pending not verified');
 return Object.freeze({workspace:base,repoRoot:root,receipt,
  sourceReady:true,remoteHistoryCount:83,pendingCount:8});
}
function versionRows(root){
 const baseline=JSON.parse(regular(resolve(root,
  'staging/world-v2-b10-r18-08-remote-history-content-hashes.json')));
 const manifest=JSON.parse(regular(resolve(root,
  'staging/world-v2-b10-r18-48-narrow-pending/manifest.json')));
 if(baseline.originalMigrationVersionCount!==83||
  manifest.expectedPendingTotalWithR05!==8||
  manifest.pending?.length!==7)fail('historical manifest drift');
 return Object.freeze({
  remote:baseline.rows.map(r=>r.version),
  pending:['20261111023204',...manifest.pending.map(r=>r.filename.slice(0,14))]
 });
}
/** The caller supplies a *trusted* binary and already-linked workspace.
 * Injectable executor is TEST-ONLY; outputs can never authorize a release.
 */
export function captureR91ReadOnly({preflight,cliVersion,cliHelp,
 commandRunner}={}){
 if(!preflight?.sourceReady||preflight.remoteHistoryCount!==83||
  preflight.pendingCount!==8)fail('unverified offline prerequisites');
 if(typeof commandRunner!=='function')fail('CLI command runner required');
 const help=validateR90PinnedHelp({version:cliVersion,...cliHelp});
 if(help.decision!=='NO_GO'||help.originalLinkedTargetSyntaxPresent!==true||
   help.dryRunFlagPresent!==true)fail('original v2 command flags missing');
 const versions=versionRows(preflight.repoRoot);
 // A malformed/mis-targeted migration list must STOP before db push,
 // even when its intended invocation includes --dry-run.
 const list=commandRunner(R91_COMMANDS[5]);
 if(list?.status!==0||typeof list.stdout!=='string')
  fail('migration list --linked failed; raw output is private');
 parseR51MigrationList({
  text:list.stdout,remote:versions.remote,pending:versions.pending
 });
 const dry=commandRunner(R91_COMMANDS[6]);
 if(dry?.status!==0||typeof dry.stdout!=='string')
  fail('db push --linked --dry-run failed; raw output is private');
 const verified=validateR51CliEvidence({
  workspace:preflight.workspace,repoRoot:preflight.repoRoot,
  freshSqlDigests:preflight.receipt.migration_history,
  readOnlyReceipt:preflight.receipt,
  migrationListText:list.stdout,dryRunText:dry.stdout,
  cliVersion:VERSION,listExitCode:list.status,dryRunExitCode:dry.status
 });
 if(verified.decision!=='NO_GO'||verified.safeToApply!==false||
  verified.verifiedFileBodies!==91||verified.verifiedDryRunOutputShape!==true||
  verified.actualLinkedCliInvocationIndependentlyAttested!==false)
  fail('strict R49/R50/R51 evidence did not pass');
 return Object.freeze({
  workPackage:'B10-R18-91',decision:'NO_GO',safeToApply:false,
  operatorLocalCliReadOnlyCapture:true,
  linkedProjectIdentityChecked:true,exactPinnedCliVersion:VERSION,
  historicalFetchedFilesLocallyVerified:83,
  pendingSourceFilesLocallyVerified:8,
  verifiedCliListRows:91,verifiedOnlyEightDryRunFiles:true,
  rawEvidencePersisted:false,credentialsPrinted:false,
  independentOperatorProvenanceAttested:false,
  authenticatedLinkedCliIndependentlyVerifiedByChatGPT:false,
  explicitSqlOperatorApproval:false,productionReleaseAuthorized:false
 });
}
/** Collect a SUCCESSFUL pinned CLI command's public text channels.
 * Supabase CLI uses stderr for some informational output. Reading only
 * stdout could falsely reject its authentic read-only dry-run. We require
 * both streams to be bounded and safe, with no raw output ever printed.
 * This does NOT prove that a source-frozen or authenticated CLI ran.
 */
export function collectR91CliOutput({args,status,stdout,stderr,error,signal}={}){
 if(!Array.isArray(args)||!R91_COMMANDS.some(item=>item.length===args.length&&
   item.every((part,i)=>part===args[i])))
  fail('unapproved CLI command');
 if(error||signal||status!==0||
  typeof stdout!=='string'||typeof stderr!=='string'||
  stdout.length>OUTPUT_CAP||stderr.length>OUTPUT_CAP)
  fail('pinned read-only CLI command failed; inspect privately on operator machine');
 const chunks=[stdout,stderr].filter(x=>x.trim());
 const combined=chunks.join('\n').replace(/\r\n/g,'\n');
 if(!combined.trim()||combined.length>OUTPUT_CAP||
  /[\0\x1b]/.test(combined)||
  /(?:sb_secret_[a-z0-9]+|sbp_[a-f0-9]+|SUPABASE_ACCESS_TOKEN\s*=|(?:postgres|postgresql):\/\/)/i.test(combined))
  fail('pinned CLI returned unsafe or missing captured text');
 return Object.freeze({status:0,stdout:combined});
}
export function executeR91Cli(binary,args,cwd,env=process.env){
 if(!R91_COMMANDS.some(item=>item.length===args.length&&
   item.every((part,i)=>part===args[i])))fail('unapproved CLI command');
 const p=spawnSync(binary,args,{
  cwd,env,encoding:'utf8',shell:false,windowsHide:true,
  timeout:90000,maxBuffer:OUTPUT_CAP+4096,stdio:['ignore','pipe','pipe']
 });
 return collectR91CliOutput({args,...p});
}
function input(k,args){
 const vals=args.filter(x=>x.startsWith('--'+k+'='));
 if(vals.length!==1||vals[0].length<=k.length+3)
  fail('required single --'+k+'=... operator argument');
 return vals[0].slice(k.length+3);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  const allowed=['workspace','receipt','cli','ack-target'];
  if(args.length!==allowed.length||args.some(x=>
   !allowed.some(k=>x.startsWith('--'+k+'='))))fail('exact four operator arguments required');
  if(input('ack-target',args)!==PROJECT)
   fail('explicit readonly target acknowledgment must equal the pinned project ref');
  const workspace=input('workspace',args);
  const receiptPath=resolve(input('receipt',args)),root=realpathSync(ROOT);
  if(contained(root,receiptPath))
   fail('private receipt must not live in repository checkout');
  const cliPath=realpathSync(resolve(input('cli',args)));
  if(basename(cliPath)==='node'||!lstatSync(cliPath).isFile())
   fail('path to pinned Supabase binary required');
  const receipt=JSON.parse(regular(receiptPath));
  const preflight=preflightR91ReadOnly({workspace,readOnlyReceipt:receipt});
  const run=argv=>executeR91Cli(cliPath,argv,preflight.workspace);
  const cliVersion=run(R91_COMMANDS[0]).stdout;
  const [fetchHelp,listHelp,pushHelp,linkHelp]=[
   R91_COMMANDS[1],R91_COMMANDS[2],R91_COMMANDS[3],R91_COMMANDS[4]
  ].map(argv=>run(argv).stdout);
  const result=captureR91ReadOnly({preflight,cliVersion,
   cliHelp:{fetchHelp,listHelp,pushHelp,linkHelp},commandRunner:run});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(e){
  // Never echo exception paths/SQL/authentication/CLI stdout or stderr.
  process.stderr.write('R91 READONLY CLI NO-GO: operator check blocked; inspect local files and source privately.\n');
  process.exitCode=1;
 }
}
