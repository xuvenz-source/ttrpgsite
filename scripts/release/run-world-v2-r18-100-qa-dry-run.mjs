/**
 * R18-100 strictly operator-local QA migration-list / db-push DRY RUN helper.
 * The ONLY mutating SQL command family is prohibited; db push requires
 * --dry-run and --linked. No app/backend deployment or production target.
 * Not called in CI and not run by ChatGPT without private recovered SQL.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 inspectR100QaWorkspaceSource,checkR100Environment
} from './validate-world-v2-r18-100-qa-workspace.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const QA='bgydsamxypjslergfpla';
const VERSION='2.81.3';
const fail=reason=>{throw Error('R100 QA DRY RUN NO-GO: '+reason)};
const ALLOW=Object.freeze([
 Object.freeze(['--version']),
 Object.freeze(['db','push','--help']),
 Object.freeze(['db','push','--dry-run','--linked'])
]);
const exact=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
export function runR100Cli({binary,cwd,args,env=process.env,runner=spawnSync}={}){
 checkR100Environment(env);
 if(!Array.isArray(args)||!ALLOW.some(x=>exact(x,args)))
  fail('forbidden CLI command or flags');
 const p=runner(binary,args,{
  cwd,env,encoding:'utf8',shell:false,windowsHide:true,
  timeout:120000,maxBuffer:131072,stdio:['ignore','pipe','pipe']
 });
 if(p.error||p.signal||p.status!==0||
  typeof p.stdout!=='string'||typeof p.stderr!=='string'||
  p.stdout.length>131072||p.stderr.length>131072)
  fail('pinned CLI unavailable or returned failure; examine privately');
 if(exact(args,ALLOW[2]))
  return Object.freeze({completed:true,outputDiscarded:true});
 return Object.freeze({completed:true,helpText:p.stdout+'\n'+p.stderr});
}
export function previewR100QaOnly({
 qaWorkspace,sourceWorkspace,capture,binary,env=process.env,
 checker=inspectR100QaWorkspaceSource,runner=spawnSync
}={}){
 checkR100Environment(env);
 const verified=checker({sourceWorkspace,qaWorkspace,capture,env});
 if(verified.decision!=='NO_GO'||verified.qaFilesMatchingPrivateOriginal!==83||
  verified.qaFilesSourceExact!==true||verified.qaLinkedRefVerified!==true||
  verified.qaProjectRef!==QA||verified.historicalSqlSecurityReviewed!==false||
  verified.operatorSessionIndependentlyAuthenticated!==false||
  verified.qaOnlyDryRunPerformed!==false||verified.qaSchemaApplied!==false||
  verified.productionReleaseAuthorized!==false)
  fail('source-exact QA project preparation is not proven');
 const version=runR100Cli({binary,cwd:qaWorkspace,args:ALLOW[0],env,runner});
 if(version.helpText?.trim()!==VERSION)fail('expected pinned CLI v2.81.3');
 const help=runR100Cli({binary,cwd:qaWorkspace,args:ALLOW[1],env,runner});
 if(!/(?:^|\s)--dry-run(?=\s|,|=|$)/m.test(help.helpText)||
  !/(?:^|\s)--linked(?=\s|,|=|$)/m.test(help.helpText))
  fail('pinned CLI does not advertise both required guards');
 const dry=runR100Cli({binary,cwd:qaWorkspace,args:ALLOW[2],env,runner});
 if(!dry.completed||!dry.outputDiscarded)fail('dry-run CLI evidence missing');
 // A CLI result is an operator-local observation, NOT proof of safe SQL or
 // a signed target. All QA migration/application approvals remain false.
 return Object.freeze({
  workPackage:'B10-R18-100',decision:'NO_GO',
  qaProjectRef:QA,sourceHistoryFiles:83,command:'db push --dry-run --linked',
  dryRunCliReturnedSuccess:true,cliOutputDiscarded:true,
  independentRemoteAttestation:false,
  original83SecurityReviewed:false,qaSchemaApplied:false,
  pendingEightApplied:false,productionSqlApplied:false,
  productionReleaseAuthorized:false
 });
}
function input(args,flag){
 const pref='--'+flag+'=';
 const matches=args.filter(x=>x.startsWith(pref));
 if(matches.length!==1||matches[0]===pref)fail('missing or ambiguous private '+flag);
 return matches[0].slice(pref.length);
}
function privateCapture(path){
 const x=resolve(path),root=realpathSync(ROOT);
 if(x===root||x.startsWith(root+sep)||root.startsWith(x+sep))
  fail('private receipt is within repository');
 const s=lstatSync(x);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||
  s.size<1||s.size>8192||realpathSync(x)!==x)
  fail('private receipt must be bounded, regular, not a symlink');
 return JSON.parse(readFileSync(x,'utf8'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==6||!args.every(x=>x.startsWith('--')&&x.includes('=')))
   fail('exact operator arguments required');
  const sourceWorkspace=input(args,'source-workspace');
  const qaWorkspace=input(args,'qa-workspace');
  const receipt=input(args,'r98-receipt');
  const cli=resolve(input(args,'cli'));
  if(input(args,'ack-qa')!==QA||
   input(args,'ack-no-writes')!=='DRY_RUN_ONLY')
   fail('QA project and no-write acknowledgment required');
  const s=lstatSync(cli);
  if(!s.isFile()||s.isSymbolicLink()||realpathSync(cli)!==cli)
   fail('explicit non-symlinked pinned executable required');
  const result=previewR100QaOnly({
   sourceWorkspace,qaWorkspace,capture:privateCapture(receipt),
   binary:cli
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R100 QA DRY RUN NO-GO: private QA preflight rejected.\n');
  process.exitCode=1;
 }
}
