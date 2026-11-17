/**
 * B10-R18-99 — source-only NO_GO receipt. Validates frozen provenance and
 * never treats local synthetic tests as a live authenticated migration fetch.
 */
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR98Source} from './validate-world-v2-r18-98-source.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const MANIFEST='staging/world-v2-b10-r18-99-private-attestation/manifest.json';
const OLD='staging/world-v2-b10-r18-98-private-history/manifest.json';
const fail=s=>{throw Error('R99 SOURCE NO-GO: '+s)};
const exact=(o,x)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===Object.keys(x).length&&
 Object.keys(x).every(k=>Object.hasOwn(o,k)&&o[k]===x[k]);
export function validateR99Source(m,{repoRoot=ROOT}={}){
 if(!m||Object.keys(m).sort().join(',')!==
  'decision,evidence,observedDateLocal,parentPr,parentSha,qa,safeguards,schema,source,workPackage'||
  m.schema!==1||m.workPackage!=='B10-R18-99'||m.decision!=='NO_GO'||
  m.parentPr!==200||
  m.parentSha!=='8405f928644bd2c0dc03ddf0c43417dc63d8425e'||
  m.observedDateLocal!=='2026-11-17')
  fail('source package is not direct immutable R98 successor');
 const original={projectRef:'lwhwgqaunxbmvyndswze',
  status:'ACTIVE_HEALTHY',registeredMigrations:83,
  readOnlyHistoricalDigestMatches:83,readOnlyMismatchCount:0,
  sqlBodiesReturnedToChat:false};
 const qa={projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
  registeredMigrations:0,bootstrapApplied:false};
 const evidence={
  previousManifest:'staging/world-v2-b10-r18-98-private-history/manifest.json',
  offlineVerifier:'scripts/release/validate-world-v2-r18-99-private-recovery.mjs',
  sourceVerifier:'scripts/release/validate-world-v2-r18-99-source.mjs',
  operatorReceiptCaptured:false,private83BodyAuditExecutedByOperator:false,
  verifiedOperatorSessionProvenance:false,actualAuthCliFetchCompleted:false,
  qaOnlyDryRunPerformed:false};
 const safeguards={approvedCliVersion:'2.81.3',requiredHistoricalFiles:83,
  pendingEightExcluded:true,rawSqlCommitted:false,credentialsCommitted:false,
  paidResourceCreated:false,productionOrQaSqlModified:false,
  originalVercelModified:false,qaVercelDeployed:false,merged:false,
  productionReleaseAuthorized:false};
 if(!exact(m.source,original)||!exact(m.qa,qa)||!exact(m.evidence,evidence)||
  !exact(m.safeguards,safeguards))
  fail('source, QA, operator authentication or release evidence forged');
 const old=JSON.parse(readFileSync(join(resolve(repoRoot),OLD),'utf8'));
 const x=validateR98Source(old,{repoRoot:resolve(repoRoot)});
 if(x.decision!=='NO_GO'||x.originalSourceMd5RowsMatched!==83||
  old.gates.operatorAuthenticatedCliFetchCompleted!==false||
  old.gates.original83PrivateFilesMD5Verified!==false||
  old.qa.registeredMigrations!==0||
  old.source.projectRef!==m.source.projectRef)
  fail('historical unfetched R98 state changed');
 return Object.freeze({
  workPackage:'B10-R18-99',decision:'NO_GO',
  baselineHistoryMatched:83,privateReceiptGenerated:false,
  authenticatedHistoricalFetchVerified:false,qaSchemaInstalled:false,
  productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('no CLI arguments permitted');
  const m=JSON.parse(readFileSync(join(ROOT,MANIFEST),'utf8'));
  process.stdout.write(JSON.stringify(validateR99Source(m),null,2)+'\n');
 }catch{
  process.stderr.write('R99 SOURCE NO-GO: source receipt validation failed.\n');
  process.exitCode=1;
 }
}
