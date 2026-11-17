/**
 * R18-98. Explicit OPERATOR-LOCAL source-only migration recovery runner.
 * This program is intentionally not used in GitHub Actions. It NEVER links,
 * pushes, repairs, resets, runs SQL, or points at the QA project. The sole
 * remote command is migration fetch --linked against the pre-linked original.
 * It only writes the original SQL body files into the operator's private cwd.
 *
 * Successful recovery is NO_GO for both QA bootstrap and production release.
 */
import {spawnSync} from 'node:child_process';
import {lstatSync,realpathSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 inspectR98PrivateHistorySource,
 validateR98Environment
} from './validate-world-v2-r18-98-private-history.mjs';

const ORIGINAL='lwhwgqaunxbmvyndswze';
const VERSION='2.81.3';
export const R98_COMMANDS=Object.freeze([
 Object.freeze(['--version']),
 Object.freeze(['migration','fetch','--help']),
 Object.freeze(['migration','fetch','--linked'])
]);
const fail=s=>{throw Error('R98 PRIVATE FETCH NO-GO: '+s)};
const allowed=args=>R98_COMMANDS.some(x=>
 x.length===args?.length&&x.every((s,i)=>args[i]===s));

/** Intentionally bounded and unlogged CLI output, never written to Git. */
export function runR98Command({binary,args,cwd,env=process.env,runner=spawnSync}={}){
 if(!allowed(args))fail('not an approved source-only CLI command');
 validateR98Environment(env);
 const p=runner(binary,args,{
  cwd,env,encoding:'utf8',shell:false,windowsHide:true,
  timeout:120000,maxBuffer:131072,stdio:['ignore','pipe','pipe']
 });
 if(p.error||p.signal||p.status!==0||
  typeof p.stdout!=='string'||typeof p.stderr!=='string'||
  p.stdout.length>131072||p.stderr.length>131072)
  fail('pinned read-only fetch failed; inspect output only on the operator machine');
 // Deliberately discard fetched command text and all CLI stderr:
 // filenames, identifiers, credentials and SQL must never appear in a receipt.
 if(args[0]==='migration'&&args[1]==='fetch'&&args[2]==='--linked')
  return Object.freeze({ok:true,outputDiscarded:true});
 return Object.freeze({ok:true,text:p.stdout+'\n'+p.stderr});
}
export function captureR98History({workspace,binary,env=process.env,
 runner=spawnSync,inspector=inspectR98PrivateHistorySource}={}){
 validateR98Environment(env);
 const initial=inspector({workspace,phase:'before',env});
 if(initial.decision!=='NO_GO'||!initial.originalRefVerified||
  initial.recoveredHistoricalFiles!==0)fail('source-isolated empty workspace required');
 const version=runR98Command({binary,args:R98_COMMANDS[0],cwd:workspace,env,runner});
 if(version.text.trim()!==VERSION)fail('untrusted CLI version; use exact 2.81.3');
 const help=runR98Command({binary,args:R98_COMMANDS[1],cwd:workspace,env,runner});
 if(!/(?:^|\n)\s*supabase\s+migration\s+fetch\b/i.test(help.text)||
  !/(?:^|\s)--linked(?=\s|,|=|$)/m.test(help.text))
  fail('pinned CLI must advertise migration fetch --linked');
 const response=runR98Command({binary,args:R98_COMMANDS[2],cwd:workspace,env,runner});
 if(!response.outputDiscarded)fail('unsafe output handling');
 const finished=inspector({workspace,phase:'fetched',env});
 if(finished.decision!=='NO_GO'||finished.historicalFilesVerified!==83||
  !finished.exactHistoricalBytesVerified||!finished.originalRefVerified||
  finished.releaseAuthorized!==false)fail('source-locked recovered 83-body audit rejected');
 return Object.freeze({
  workPackage:'B10-R18-98',decision:'NO_GO',
  originalProjectRef:ORIGINAL,historicalSqlFilesLocallyVerified:83,
  aggregateSha256:finished.aggregateSha256,
  reviewMarkerFiles:finished.reviewMarkerFiles,
  actualAuthenticatedLinkedSessionIndependentlyAttested:false,
  cliSessionAcceptedAsIndependentProof:false,
  recoveredBodiesLeftInPrivateWorkspace:true,
  qaTargetUsed:false,qaSchemaModified:false,productionSchemaModified:false,
  installApproved:false,productionReleaseAuthorized:false
 });
}
function argument(name,args){
 const pref='--'+name+'=';
 const x=args.filter(v=>v.startsWith(pref));
 if(x.length!==1||x[0].length===pref.length)fail('one '+name+' argument required');
 return x[0].slice(pref.length);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==4||args.some(x=>![
   'workspace','cli','ack-source','ack-private-only'
  ].some(k=>x.startsWith('--'+k+'='))))
   fail('exactly four explicit operator arguments required');
  if(argument('ack-source',args)!==ORIGINAL||
   argument('ack-private-only',args)!=='NO_UPLOAD_NO_SQL')
   fail('explicit source-only and private-only acknowledgment required');
  const workspace=resolve(argument('workspace',args));
  const cliPath=resolve(argument('cli',args));
  const real=realpathSync(cliPath);
  if(!lstatSync(real).isFile()||basename(real)==='node')
   fail('explicit executable CLI binary required');
  // The preflight inspects the exact workspace path, not a replacement cwd.
  const result=captureR98History({workspace,binary:real});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R98 PRIVATE FETCH NO-GO: operator-local source-only check blocked; inspect privately.\n');
  process.exitCode=1;
 }
}
