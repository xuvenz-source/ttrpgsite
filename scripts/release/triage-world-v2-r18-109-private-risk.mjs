/**
 * B10-R18-109: operator-only OFFLINE private SQL risk disambiguation.
 * No network, CLI, SQL execution, writes, filenames, SQL, snippets or tokens
 * in output. The report is heuristic triage, never approval to install SQL.
 */
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {reviewR108PrivateHistory}
 from './review-world-v2-r18-108-private-history.mjs';
import {validateR98Environment}
 from './validate-world-v2-r18-98-private-history.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGINAL='lwhwgqaunxbmvyndswze';
const MAX_BYTES=12*1024*1024;
const fail=()=>{throw Error('R109 PRIVATE RISK NO-GO: inspect locally')};
const inside=(a,b)=>a===b||b.startsWith(a+sep);
const PATTERNS=Object.freeze({
 // Do NOT return matched strings; role mentions are not credentials.
 serviceRoleIdentifier:/\bservice_role\b/i,
 candidateCredentialValue:/\bsb_secret_[A-Za-z0-9_-]{18,}\b|\bsbp_[A-Fa-f0-9]{20,}\b|\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,}\b/,
 definer:/\bsecurity\s+definer\b/i,
 explicitFunctionSearchPath:/\bset\s+search_path\s*(?:=|to)\s*(?:''|""|[a-z_][\w,\s]*)/i,
 directAuthUid:/\bauth\.uid\s*\(/i,
 publicExecuteGrant:/\bgrant\s+execute\s+on\s+(?:all\s+)?functions?\b[\s\S]{0,400}?\bto\s+public\b/i,
 authenticatedExecuteGrant:/\bgrant\s+execute\s+on\s+(?:all\s+)?functions?\b[\s\S]{0,400}?\bto\s+authenticated\b/i,
 publicExecuteRevoke:/\brevoke\s+execute\s+on\s+(?:all\s+)?functions?\b[\s\S]{0,400}?\bfrom\s+public\b/i,
 authIdentityWrite:/\b(?:insert\s+into|update|delete\s+from|copy)\s+auth\.(?:users|identities|sessions)\b/i,
 storageObjectWrite:/\b(?:insert\s+into|update|delete\s+from|copy)\s+storage\.(?:objects|buckets)\b/i,
 userEditableMetadata:/\b(?:raw_user_meta_data|user_metadata)\b/i,
 jwtAuthorizationReference:/\bauth\.jwt\s*\(/i,
 dynamicExecute:/\bexecute\s+(?:format\s*\(|'|[$]|sql\b)/i,
 realtimePublicationChange:/\b(?:alter|create)\s+publication\b|\breplica\s+identity\b/i,
 extensionOrRoleChange:/\b(?:create\s+extension|alter\s+role|create\s+role|alter\s+database)\b/i
});
export const R109_MARKERS=Object.freeze(Object.keys(PATTERNS));

export function classifyR109Sql(sql){
 if(typeof sql!=='string'||!sql||Buffer.byteLength(sql,'utf8')>MAX_BYTES)fail();
 const m=Object.fromEntries(R109_MARKERS.map(k=>[k,PATTERNS[k].test(sql)]));
 return Object.freeze({
  candidateCredentialValue:m.candidateCredentialValue,
  serviceRoleIdentifierWithoutCredential:m.serviceRoleIdentifier&&!m.candidateCredentialValue,
  publicExecuteGrant:m.publicExecuteGrant,
  authenticatedExecuteGrant:m.authenticatedExecuteGrant,
  publicExecuteRevoke:m.publicExecuteRevoke,
  securityDefinerWithoutSearchPathText:m.definer&&!m.explicitFunctionSearchPath,
  securityDefinerWithoutDirectAuthUidText:m.definer&&!m.directAuthUid,
  securityDefinerWithDynamicExecuteText:m.definer&&m.dynamicExecute,
  authIdentityWrite:m.authIdentityWrite,
  storageObjectWrite:m.storageObjectWrite,
  userEditableMetadata:m.userEditableMetadata,
  editableMetadataWithJwtReference:m.userEditableMetadata&&m.jwtAuthorizationReference,
  realtimePublicationChange:m.realtimePublicationChange,
  extensionOrRoleChange:m.extensionOrRoleChange,
  dynamicExecute:m.dynamicExecute
 });
}
export const R109_CATEGORIES=Object.freeze(Object.keys(classifyR109Sql('select 1;')));

function readPrivateReceipt(path){
 const p=resolve(path),root=realpathSync(ROOT);
 if(inside(root,p)||inside(p,root))fail();
 const s=lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||
    s.size<1||s.size>8192||realpathSync(p)!==p)fail();
 return JSON.parse(readFileSync(p,'utf8'));
}
export function triageR109PrivateHistory({
 workspace,r98Receipt,r99Receipt,r108Receipt,env=process.env
}={}){
 validateR98Environment(env);
 const base=reviewR108PrivateHistory({workspace,r98Receipt,r99Receipt,env});
 if(base.workPackage!=='B10-R18-108'||base.decision!=='NO_GO'||
    base.privateHistoricalFilesScanned!==83||
    base.privateSqlSecurityReviewComplete!==false||
    base.qaSqlApplied!==false||base.productionSqlApplied!==false)fail();
 const prev=readPrivateReceipt(r108Receipt);
 if(!isDeepStrictEqual(prev,base))fail();
 const history=JSON.parse(readFileSync(join(ROOT,
   'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
 if(history.rows?.length!==83||history.expectedNewestVersion!=='20261109171247')fail();
 const counts=Object.fromEntries(R109_CATEGORIES.map(k=>[k,0]));
 let priorityA=0,priorityB=0;
 const dir=join(resolve(workspace),'supabase','migrations');
 for(const row of history.rows){
  const path=join(dir,row.version+'_'+row.name+'.sql');
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
    stat.size<1||stat.size>MAX_BYTES||realpathSync(path)!==path)fail();
  const sql=readFileSync(path,'utf8');
  if(createHash('md5').update(sql,'utf8').digest('hex')!==row.fetched_sql_md5)fail();
  const f=classifyR109Sql(sql);
  for(const k of R109_CATEGORIES)if(f[k])counts[k]++;
  if(f.candidateCredentialValue||f.publicExecuteGrant||f.authIdentityWrite||
    f.editableMetadataWithJwtReference)priorityA++;
  else if(f.securityDefinerWithoutSearchPathText||
    f.securityDefinerWithDynamicExecuteText||f.storageObjectWrite||
    f.extensionOrRoleChange)priorityB++;
 }
 return Object.freeze({
  workPackage:'B10-R18-109',decision:'NO_GO',
  sourceProjectRef:ORIGINAL,privateHistoricalFilesClassified:83,
  r98R99R108FingerprintMatched:true,
  aggregateSha256:base.aggregateSha256,
  heuristicCategoryFileCounts:counts,
  urgentManualTriageFileCount:priorityA,
  additionalPrivilegePortabilityTriageFileCount:priorityB,
  countsAreOverlappingHeuristics:true,
  codeCommentsAndStringLiteralsMayTriggerFlags:true,
  perFunctionSecuritySemanticsReviewed:false,
  rawSqlOrFileNamesExported:false,
  operatorAuthenticationIndependentlyAttested:false,
  sqlSecurityReviewApproved:false,qaSchemaInstallApproved:false,
  qaSqlApplied:false,productionSqlApplied:false,
  productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const fields=['workspace','r98-receipt','r99-receipt','r108-receipt','ack-source'];
  const args=process.argv.slice(2);
  if(args.length!==fields.length||
     args.some((a,i)=>!a.startsWith('--'+fields[i]+'=')))fail();
  const a=args.map((v,i)=>v.slice(fields[i].length+3));
  if(a.some(x=>!x)||a[4]!==ORIGINAL)fail();
  process.stdout.write(JSON.stringify(triageR109PrivateHistory({
   workspace:a[0],r98Receipt:a[1],r99Receipt:a[2],r108Receipt:a[3]
  }),null,2)+'\n');
 }catch{
  process.stderr.write('R109 PRIVATE RISK NO-GO: inspect locally; never upload SQL or raw logs.\n');
  process.exitCode=1;
 }
}
