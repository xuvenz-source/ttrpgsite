/**
 * B10-R18-111 — OPERATOR-LOCAL review docket only; no SQL replay.
 * Creates an exclusive mode-0600 docket beside the private source workspace.
 * Docket never contains SQL bodies; stdout never contains names, paths,
 * snippets, secrets, connection strings, or reviewer attestation.
 */
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync,openSync,writeFileSync,closeSync} from 'node:fs';
import {resolve,dirname,join,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {triageR109PrivateHistory,classifyR109Sql}
 from './triage-world-v2-r18-109-private-risk.mjs';
import {classifyR108Sql}
 from './review-world-v2-r18-108-private-history.mjs';
import {validateR98Environment}
 from './validate-world-v2-r18-98-private-history.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGINAL='lwhwgqaunxbmvyndswze';
const TARGET_FILE='r111-private-review-docket.json';
const MAX_SQL=12*1024*1024;
const fail=()=>{throw Error('R111 PRIVATE REVIEW NO-GO: inspect private source locally')};
const inside=(a,b)=>a===b||b.startsWith(a+sep);
const digest=(algorithm,s)=>createHash(algorithm).update(s).digest('hex');

const TASKS=Object.freeze([
 'source_integrity_and_dependencies',
 'security_definer_identity_role_acl_search_path',
 'rls_and_cross_campaign_authorization',
 'dml_backfill_replay_and_data_separation',
 'auth_storage_realtime_and_environment_portability',
 'secret_material_and_sensitive_data',
 'rollback_and_qa_only_validation'
]);
export function buildR111Docket({rows,readBody,expectedAggregate}={}){
 if(!Array.isArray(rows)||rows.length!==83||
    typeof readBody!=='function'||!/^[0-9a-f]{64}$/.test(expectedAggregate??''))fail();
 const sha=createHash('sha256');
 const records=[];
 let urgent=0,additional=0;
 const seen=new Set();
 for(const item of rows){
  if(!item||!/^[0-9]{14}$/.test(item.version??'')||
     !/^[A-Za-z0-9_-]+$/.test(item.name??'')||
     !/^[0-9a-f]{32}$/.test(item.fetched_sql_md5??'')||
     seen.has(item.version))fail();
  seen.add(item.version);
  const name=item.version+'_'+item.name+'.sql';
  const body=readBody(item);
  if(typeof body!=='string'||!body||
     Buffer.byteLength(body,'utf8')>MAX_SQL||
     digest('md5',body)!==item.fetched_sql_md5)fail();
  const bodySha256=digest('sha256',body);
  sha.update(name+'\0'+bodySha256+'\n');
  const markers=classifyR109Sql(body);
  const broad=classifyR108Sql(body);
  const isUrgent=Boolean(markers.candidateCredentialValue||
    markers.publicExecuteGrant||markers.authIdentityWrite||
    markers.editableMetadataWithJwtReference);
  const isAdditional=Boolean(!isUrgent&&(
    markers.securityDefinerWithoutSearchPathText||
    markers.securityDefinerWithDynamicExecuteText||
    markers.storageObjectWrite||markers.extensionOrRoleChange));
  if(isUrgent)urgent++;
  if(isAdditional)additional++;
  records.push({
   filename:name,
   sourceBodySha256:bodySha256,
   priority:isUrgent?'URGENT':isAdditional?'ADDITIONAL':'STANDARD',
   heuristicMarkers:{...markers},
   broadMarkers:{...broad},
   reviewStatus:'PENDING',
   reviewChecklist:Object.fromEntries(TASKS.map(key=>[key,'PENDING'])),
   reviewerAttestation:null,
   securityApproved:false,
   notes:null
  });
 }
 if(sha.digest('hex')!==expectedAggregate)fail();
 const order={URGENT:0,ADDITIONAL:1,STANDARD:2};
 records.sort((a,b)=>order[a.priority]-order[b.priority]||
   a.filename.localeCompare(b.filename));
 return Object.freeze({
  schema:1,workPackage:'B10-R18-111',
  decision:'NO_GO',originalProjectRef:ORIGINAL,
  sourceFingerprintSha256:expectedAggregate,
  privateSqlCopiedIntoDocket:false,rawSqlBodiesExported:false,
  reviewItems:records,itemsNeedingReview:83,
  urgencyMarkerFiles:urgent,additionalMarkerFiles:additional,
  allReviewerDecisionsPending:true,
  reviewIsNotAnAutomatedSecurityApproval:true,
  signedQaAcceptanceComplete:false,
  qaInstallApproved:false,productionReleaseAuthorized:false
 });
}
function privateReceipt(path){
 const f=resolve(path),root=realpathSync(ROOT);
 if(inside(root,f)||inside(f,root))fail();
 const s=lstatSync(f);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||
    s.size<1||s.size>8192||realpathSync(f)!==f)fail();
 return JSON.parse(readFileSync(f,'utf8'));
}
function checkedFile(path){
 const p=resolve(path),s=lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||
   s.size<1||s.size>MAX_SQL||realpathSync(p)!==p)fail();
 return readFileSync(p,'utf8');
}
export function prepareR111PrivateDocket({
 workspace,r98Receipt,r99Receipt,r108Receipt,r109Receipt,
 env=process.env,writeExclusive=true
}={}){
 validateR98Environment(env);
 const verified=triageR109PrivateHistory({
  workspace,r98Receipt,r99Receipt,r108Receipt,env
 });
 const r109=privateReceipt(r109Receipt);
 if(!isDeepStrictEqual(verified,r109)||verified.decision!=='NO_GO'||
    verified.privateHistoricalFilesClassified!==83||
    verified.qaSchemaInstallApproved!==false||
    verified.sqlSecurityReviewApproved!==false)fail();
 const source=resolve(workspace),parent=dirname(source),root=realpathSync(ROOT);
 if(inside(root,parent)||inside(parent,root)||
    basename(source)!=='r106-original-83-recovery')fail();
 const pst=lstatSync(parent);
 if(!pst.isDirectory()||pst.isSymbolicLink()||
    realpathSync(parent)!==parent||(pst.mode&0o077)!==0)fail();
 const frozen=JSON.parse(readFileSync(join(ROOT,
  'staging/world-v2-b10-r18-08-remote-history-content-hashes.json'),'utf8'));
 if(frozen.originalMigrationVersionCount!==83||
    frozen.expectedNewestVersion!=='20261109171247')fail();
 const migrations=join(source,'supabase','migrations');
 const docket=buildR111Docket({
  rows:frozen.rows,
  readBody:row=>checkedFile(join(migrations,row.version+'_'+row.name+'.sql')),
  expectedAggregate:verified.aggregateSha256
 });
 if(docket.urgencyMarkerFiles!==verified.urgentManualTriageFileCount||
    docket.additionalMarkerFiles!==verified.additionalPrivilegePortabilityTriageFileCount||
    docket.reviewItems.length!==83)fail();
 const dest=join(parent,TARGET_FILE);
 if(writeExclusive){
  // Exclusive O_EXCL creation: never silently overwrite a reviewed docket.
  // Contents are strictly filenames, digests and flags (not SQL).
  const fd=openSync(dest,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(docket,null,2)+'\n',{encoding:'utf8'});}
  finally{closeSync(fd);}
 }
 return Object.freeze({
  workPackage:'B10-R18-111',decision:'NO_GO',
  originalProjectRef:ORIGINAL,privateReviewFilesPrepared:83,
  sourceFingerprintSha256:verified.aggregateSha256,
  r98R99R108R109ReceiptsVerified:true,
  privateReviewDocketCreated:writeExclusive,
  docketContainsSqlBodies:false,
  privateDocketNotUploaded:true,
  urgentHeuristicFiles:docket.urgencyMarkerFiles,
  additionalHeuristicFiles:docket.additionalMarkerFiles,
  humanSecurityReviewCompleted:false,
  operatorSessionIndependentlyAttested:false,
  qaDryRunAuthorized:false,qaSchemaInstalled:false,
  productionSqlChanged:false,releaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const keys=['workspace','r98-receipt','r99-receipt','r108-receipt','r109-receipt','ack-source'];
  const args=process.argv.slice(2);
  if(args.length!==keys.length||
     args.some((x,i)=>!x.startsWith('--'+keys[i]+'=')))fail();
  const values=args.map((x,i)=>x.slice(keys[i].length+3));
  if(values.some(x=>!x)||values[5]!==ORIGINAL)fail();
  const result=prepareR111PrivateDocket({
   workspace:values[0],r98Receipt:values[1],
   r99Receipt:values[2],r108Receipt:values[3],r109Receipt:values[4]
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R111 PRIVATE REVIEW NO-GO: local check failed; do not upload SQL, the private docket, or raw logs.\n');
  process.exitCode=1;
 }
}
