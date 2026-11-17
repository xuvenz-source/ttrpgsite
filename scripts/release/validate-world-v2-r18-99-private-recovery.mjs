/**
 * B10-R18-99. OPERATOR-LOCAL OFFLINE cross-check of the R18-98 capture
 * against private file bytes and the frozen, independently compared MD5s.
 * Never executes the CLI, connects to Supabase, writes or applies SQL.
 * The capture is an operator-origin claim, NOT signed remote authentication.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 inspectR98PrivateHistorySource,validateR98Environment
} from './validate-world-v2-r18-98-private-history.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ORIGINAL='lwhwgqaunxbmvyndswze';
const fail=x=>{throw Error('R99 PRIVATE RECOVERY NO-GO: '+x)};
const inside=(root,path)=>path===root||path.startsWith(root+sep);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const CAPTURE_KEYS=[
 'workPackage','decision','originalProjectRef','historicalSqlFilesLocallyVerified',
 'aggregateSha256','reviewMarkerFiles',
 'actualAuthenticatedLinkedSessionIndependentlyAttested',
 'cliSessionAcceptedAsIndependentProof','recoveredBodiesLeftInPrivateWorkspace',
 'qaTargetUsed','qaSchemaModified','productionSchemaModified',
 'installApproved','productionReleaseAuthorized'
];
export function verifyR99OperatorCapture({
 workspace,capture,env=process.env,
 inspector=inspectR98PrivateHistorySource
}={}){
 validateR98Environment(env);
 if(!exact(capture,CAPTURE_KEYS)||capture.workPackage!=='B10-R18-98'||
  capture.decision!=='NO_GO'||capture.originalProjectRef!==ORIGINAL||
  capture.historicalSqlFilesLocallyVerified!==83||
  !/^[0-9a-f]{64}$/.test(capture.aggregateSha256)||
  !Number.isSafeInteger(capture.reviewMarkerFiles)||
  capture.reviewMarkerFiles<0||capture.reviewMarkerFiles>83||
  capture.actualAuthenticatedLinkedSessionIndependentlyAttested!==false||
  capture.cliSessionAcceptedAsIndependentProof!==false||
  capture.recoveredBodiesLeftInPrivateWorkspace!==true||
  capture.qaTargetUsed!==false||capture.qaSchemaModified!==false||
  capture.productionSchemaModified!==false||capture.installApproved!==false||
  capture.productionReleaseAuthorized!==false)
  fail('operator capture is absent, modified, forged or claims unwarranted authority');
 const fresh=inspector({workspace,phase:'fetched',env});
 if(fresh?.decision!=='NO_GO'||fresh.phase!=='fetched'||
  fresh.historicalFilesVerified!==83||
  fresh.exactHistoricalBytesVerified!==true||
  fresh.originalRefVerified!==true||
  fresh.aggregateSha256!==capture.aggregateSha256||
  fresh.reviewMarkerFiles!==capture.reviewMarkerFiles||
  fresh.qaInstallApproved!==false||fresh.sqlApplied!==false||
  fresh.releaseAuthorized!==false||
  fresh.privateDataAndPortabilityReviewCompleted!==false)
  fail('private 83-file aggregate/source/parity did not match operator receipt');
 return Object.freeze({
  workPackage:'B10-R18-99',decision:'NO_GO',
  sourceProjectRef:ORIGINAL,historicalFilesCrossChecked:83,
  privateBodyFingerprintMatch:true,aggregateSha256:fresh.aggregateSha256,
  reviewMarkerFiles:fresh.reviewMarkerFiles,
  operatorCaptureMatchedPrivateBytes:true,
  operatorSessionAuthenticatedIndependently:false,
  historicalSqlSecurityReviewed:false,
  qaOnlyDryRunPerformed:false,qaBootstrapApproved:false,
  qaSqlApplied:false,productionSqlApplied:false,
  productionReleaseAuthorized:false
 });
}
function privateFile(path){
 const x=resolve(path),root=realpathSync(ROOT);
 if(inside(root,x)||inside(x,root))fail('receipt must remain outside repository');
 const st=lstatSync(x);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
   st.size<1||st.size>8192||realpathSync(x)!==x)
  fail('receipt must be bounded regular private file');
 return readFileSync(x,'utf8');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const argv=process.argv.slice(2);
  if(argv.length!==3||!argv[0].startsWith('--workspace=')||
    !argv[1].startsWith('--r98-receipt=')||
    argv[2]!=='--ack-source='+ORIGINAL)
    fail('explicit private workspace, receipt, original project acknowledgment required');
  const workspace=argv[0].slice('--workspace='.length);
  const receipt=argv[1].slice('--r98-receipt='.length);
  if(!workspace||!receipt)fail('missing workspace or receipt path');
  const result=verifyR99OperatorCapture({
   workspace,capture:JSON.parse(privateFile(receipt))
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R99 PRIVATE RECOVERY NO-GO: inspect private evidence and filesystem locally.\n');
  process.exitCode=1;
 }
}
