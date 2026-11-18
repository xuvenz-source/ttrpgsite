/**
 * R18-108 — OFFLINE private history triage. No network, SQL execution,
 * CLI invocation, path/filename/SQL/match/secret output or release approval.
 * Matches are heuristic flags only; an expert SQL review is still required.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectR98PrivateHistorySource,validateR98Environment}
 from './validate-world-v2-r18-98-private-history.mjs';
import {verifyR99OperatorCapture}
 from './validate-world-v2-r18-99-private-recovery.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGINAL='lwhwgqaunxbmvyndswze';
const fail=()=>{throw Error('R108 PRIVATE SQL REVIEW NO-GO: inspect privately')};
const within=(parent,p)=>p===parent||p.startsWith(parent+sep);
const RULES=Object.freeze({
 securityDefiner:/\bsecurity\s+definer\b/i,
 rlsPolicy:/\bcreate\s+policy\b|\brow\s+level\s+security\b/i,
 privilegedGrants:/\b(?:grant|revoke)\s+(?:all|execute|usage|select|insert|update|delete)\b/i,
 publicRoleGrants:/\bgrant\s+[\s\S]{0,150}?\bto\s+(?:public|anon|authenticated)\b/i,
 dataWriteStatements:/\b(?:insert\s+into|update\s+[a-z_][a-z_0-9.]*\s+set|delete\s+from|copy\s+[a-z_]|truncate\s+(?:table\s+)?[a-z_])\b/i,
 authDependencies:/\bauth\.(?:users|identities|sessions|uid|jwt|role)\b/i,
 storageDependencies:/\bstorage\./i,
 realtimeDependencies:/\brealtime\.|\bpublication\b|\breplica\s+identity\b/i,
 environmentChanges:/\b(?:create\s+extension|alter\s+role|alter\s+database|create\s+role|create\s+publication|create\s+event\s+trigger)\b/i,
 dynamicSql:/\bexecute\s+(?:format\s*\(|'|\$|sql\b)/i,
 hardcodedEndpoints:/\b(?:https?:\/\/[^\s'"\x60]+\.supabase\.co|postgres(?:ql)?:\/\/|lwhwgqaunxbmvyndswze|bgydsamxypjslergfpla)\b/i,
 secretMaterialMarkers:/\b(?:sb_secret_[A-Za-z0-9_-]+|sbp_[A-Za-z0-9]+|service_role|private_key)\b/i,
 userControlledAuthMetadata:/\b(?:raw_user_meta_data|user_metadata)\b/i
});
export const R108_RULE_NAMES=Object.freeze(Object.keys(RULES));
export function classifyR108Sql(value){
 if(typeof value!=='string'||!value||Buffer.byteLength(value,'utf8')>12*1024*1024)fail();
 return Object.fromEntries(R108_RULE_NAMES.map(k=>[k,RULES[k].test(value)]));
}
function privateJson(path){
 const p=resolve(path),root=realpathSync(ROOT);
 if(within(root,p)||within(p,root))fail();
 const st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
  st.size<1||st.size>8192||realpathSync(p)!==p)fail();
 return JSON.parse(readFileSync(p,'utf8'));
}
function checkedR99(capture,verified){
 if(!capture||Object.keys(capture).length!==15||
   capture.workPackage!=='B10-R18-99'||capture.decision!=='NO_GO'||
   capture.sourceProjectRef!==ORIGINAL||capture.historicalFilesCrossChecked!==83||
   capture.privateBodyFingerprintMatch!==true||
   capture.operatorCaptureMatchedPrivateBytes!==true||
   capture.aggregateSha256!==verified.aggregateSha256||
   capture.reviewMarkerFiles!==verified.reviewMarkerFiles||
   capture.operatorSessionAuthenticatedIndependently!==false||
   capture.historicalSqlSecurityReviewed!==false||
   capture.qaOnlyDryRunPerformed!==false||capture.qaBootstrapApproved!==false||
   capture.qaSqlApplied!==false||capture.productionSqlApplied!==false||
   capture.productionReleaseAuthorized!==false)fail();
}
export function reviewR108PrivateHistory({workspace,r98Receipt,r99Receipt,env=process.env}={}){
 validateR98Environment(env);
 const previous=privateJson(r98Receipt),crossCheck=privateJson(r99Receipt);
 const verified=verifyR99OperatorCapture({workspace,capture:previous,env});
 checkedR99(crossCheck,verified);
 if(verified.decision!=='NO_GO'||verified.historicalFilesCrossChecked!==83)fail();
 const again=inspectR98PrivateHistorySource({workspace,phase:'fetched',env});
 if(again.aggregateSha256!==crossCheck.aggregateSha256)fail();
 const history=JSON.parse(readFileSync(join(ROOT,
   'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
 if(history.rows?.length!==83)fail();
 const counts=Object.fromEntries(R108_RULE_NAMES.map(k=>[k,0]));
 for(const row of history.rows){
  const sql=readFileSync(join(resolve(workspace),'supabase','migrations',
   row.version+'_'+row.name+'.sql'),'utf8');
  const flags=classifyR108Sql(sql);
  for(const key of R108_RULE_NAMES)if(flags[key])counts[key]++;
 }
 return Object.freeze({
  workPackage:'B10-R18-108',decision:'NO_GO',
  originalProjectRef:ORIGINAL,privateHistoricalFilesScanned:83,
  r98AndR99FingerprintMatched:true,aggregateSha256:verified.aggregateSha256,
  priorReviewMarkerFiles:verified.reviewMarkerFiles,heuristicFileCounts:counts,
  heuristicOnly:true,privateSqlExposedOutsideWorkspace:false,
  independentOperatorAuthenticationAttested:false,
  privateSqlSecurityReviewComplete:false,portabilityReviewComplete:false,
  qaSqlApplied:false,productionSqlApplied:false,releaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  const fields=['workspace','r98-receipt','r99-receipt','ack-source'];
  if(args.length!==fields.length||args.some((v,i)=>!v.startsWith('--'+fields[i]+'=')))fail();
  const values=args.map((x,i)=>x.slice(('--'+fields[i]+'=').length));
  if(values.some(x=>!x)||values[3]!==ORIGINAL)fail();
  process.stdout.write(JSON.stringify(reviewR108PrivateHistory({
   workspace:values[0],r98Receipt:values[1],r99Receipt:values[2]
  }),null,2)+'\n');
 }catch{
  process.stderr.write('R108 PRIVATE SQL REVIEW NO-GO: inspect private files locally; do not upload SQL, credentials or logs.\n');
  process.exitCode=1;
 }
}
