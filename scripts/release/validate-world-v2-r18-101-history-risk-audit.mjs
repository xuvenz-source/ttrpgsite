/**
 * R18-101 — offline, fail-closed validation of READ-ONLY historical SQL
 * metadata risk index and live advisory category observations.
 * This does NOT inspect SQL semantics, execute SQL or certify portability.
 */
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR100Source} from './validate-world-v2-r18-100-source.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const MANIFEST='staging/world-v2-b10-r18-101-history-risk-audit/manifest.json';
const INDEX='staging/world-v2-b10-r18-101-history-risk-audit/metadata-index.json';
const PREV='staging/world-v2-b10-r18-100-qa-only-preflight/manifest.json';
const HISTORY='staging/world-v2-b10-r18-08-remote-history-content-hashes.json';
const fail=x=>{throw Error('R101 HISTORICAL SQL NO-GO: '+x)};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const exact=(a,b)=>fields(a,Object.keys(b))&&eq(a,b);
const FLAGS=[
 'auth_refs','data_dml','security_definer','storage_realtime',
 'access_control','environment_change','hardcoded_endpoint','auth_calls',
 'routine_execute_acl','user_metadata_token','schema_qualified_inserts'
];
const EXPECT={
 auth_refs:12,data_dml:51,security_definer:66,storage_realtime:30,
 access_control:65,environment_change:4,hardcoded_endpoint:0,
 auth_calls:63,routine_execute_acl:43,user_metadata_token:1,
 schema_qualified_inserts:24
};
const original={
 projectRef:'lwhwgqaunxbmvyndswze',status:'ACTIVE_HEALTHY',
 registeredHistory:83,bodyMd5MatchesFrozenBaseline:83,
 rawSqlReturned:false,sqlOrDataChanged:false
};
const qa={
 projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
 registeredMigrations:0,publicApplicationTables:0,sqlOrDataChanged:false
};
const security={
 rlsEnabledNoPolicy:{
  level:'INFO',count:15,
  url:'https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy'
 },
 authenticatedDefinerExecutable:{
  level:'WARN',count:67,
  url:'https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable'
 },
 leakedPasswordProtection:{
  level:'WARN',count:1,
  url:'https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection'
 },
 validatedAsVulnerabilities:false
};
const releaseKeys=[
 'original83PrivateSqlRecovered','sourceSessionAuthenticatedIndependently',
 'historicalPrivilegedFunctionsReviewed','historicalDataBackfillsReviewed',
 'authStorageRealtimePortabilityReviewed','qaOnlySchemaSecurityReviewPassed',
 'qaLinkedDryRunCompleted','qa83MigrationsInstalled','pendingEightInstalled',
 'qaVercelDeployed','independentSignedGameplayAccepted',
 'productionReleaseAuthorized'
];
const unchangedKeys=[
 'originalSqlUnchanged','qaSqlUnchanged','productionVercelUnchanged',
 'qaVercelUndeployed','noRawSqlCommitted','noSecretsCommitted',
 'noPaidResources','noMerge','noProductionDeploy'
];
function read(root,path){return JSON.parse(readFileSync(join(root,path),'utf8'));}
export function validateR101HistoricalRiskAudit(m,index,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(!fields(m,['schema','workPackage','decision','parentPr','parentSha',
   'observedDateLocal','scope','original','qa','metadataIndex',
   'originalSecurityAdvisors','qaSecurityAdvisors','releaseGates','unchanged'])||
   m.schema!==1||m.workPackage!=='B10-R18-101'||m.decision!=='NO_GO'||
   m.parentPr!==202||
   m.parentSha!=='7e40da1dec18fd2d2f2558e0b0ace24dc74a8239'||
   m.observedDateLocal!=='2026-11-17'||
   m.scope!=='ORIGINAL_83_STORED_SQL_METADATA_ONLY_PORTABILITY_AND_SECURITY_TRIAGE')
  fail('parent source history and NO_GO boundary changed');
 if(!exact(m.original,original)||!exact(m.qa,qa)||
   !exact(m.originalSecurityAdvisors,security)||
   !exact(m.qaSecurityAdvisors,{lintCategories:0,securityApprovalGranted:false})||
   !fields(m.releaseGates,releaseKeys)||
   releaseKeys.some(k=>m.releaseGates[k]!==false)||
   !fields(m.unchanged,unchangedKeys)||
   unchangedKeys.some(k=>m.unchanged[k]!==true))
  fail('historical project, advisory or release gate misrepresented');
 const mi={
  path:INDEX,entries:83,storedSqlBytes:709936,largestSqlBytes:48527,
  flagCounts:EXPECT,classificationIsHeuristic:true,originalSqlBodiesInGit:false
 };
 if(!fields(m.metadataIndex,Object.keys(mi))||
  Object.keys(mi).some(k=>!eq(m.metadataIndex[k],mi[k])))
  fail('source-only index manifest mismatch');
 if(!fields(index,['schema','workPackage','kind','provenance',
   'interpretation','metrics','flags','entries'])||
   index.schema!==1||index.workPackage!=='B10-R18-101'||
   index.kind!=='HISTORICAL_SQL_METADATA_ONLY_REGEX_FLAGS'||
   !exact(index.provenance,{
    project_ref:'lwhwgqaunxbmvyndswze',
    observed_date:'2026-11-17',baseline:HISTORY,
    query_mode:'READ_ONLY_AGGREGATE_ON_DATABASE_SERVER_NO_RAW_SQL_RETURNED',
    manual_security_review_performed:false
   })||
   index.interpretation!==
    'Per-migration regex presence in stored SQL bodies, not executed effects, vulnerabilities or proof of safe replay; categories overlap; no original SQL text is included'||
   !eq(index.flags,FLAGS)||!Array.isArray(index.entries)||index.entries.length!==83)
  fail('83-row metadata evidence identity or provenance changed');
 const frozen=read(root,HISTORY);
 if(frozen.originalMigrationVersionCount!==83||
  frozen.expectedNewestVersion!=='20261109171247'||
  frozen.productionBaseSha!=='90df8c960e79e8d66c322095611427da7bb09de4'||
  frozen.rows?.length!==83)fail('original frozen history drift');
 let total=0,max=0;
 const counts=Object.fromEntries(FLAGS.map(f=>[f,0]));
 for(let i=0;i<83;i++){
  const x=index.entries[i],frozenRow=frozen.rows[i];
  if(!fields(x,['version','name','sql_bytes','body_md5','flags'])||
   x.version!==frozenRow.version||x.name!==frozenRow.name||
   x.body_md5!==frozenRow.fetched_sql_md5||
   !Number.isSafeInteger(x.sql_bytes)||x.sql_bytes<1||
   !fields(x.flags,FLAGS))fail('stored metadata row or frozen digest changed');
  total+=x.sql_bytes;
  max=Math.max(max,x.sql_bytes);
  for(const flag of FLAGS){
   if(typeof x.flags[flag]!=='boolean')fail('risk flag is not boolean');
   if(x.flags[flag])counts[flag]++;
  }
 }
 if(!exact(index.metrics,{
   history_count:83,total_sql_bytes:709936,largest_sql_bytes:48527,
   flagged_file_counts:EXPECT
  })||total!==709936||max!==48527||!eq(counts,EXPECT))
  fail('risk classification aggregate does not match 83-source sample');
 const previous=read(root,PREV);
 const prior=validateR100Source(previous,{repoRoot:root});
 if(prior.decision!=='NO_GO'||prior.privateHistoricalRecoveryPerformed!==false||
  prior.qaHistoryCount!==0||previous.gates.qaDryRunPerformed!==false)
  fail('previous R100 strict QA empty/dry-run NO_GO no longer valid');
 return Object.freeze({
  workPackage:'B10-R18-101',decision:'NO_GO',historicalFilesChecked:83,
  storedSqlMetadataBytes:total,
  definerContainingFiles:counts.security_definer,
  dataDmlContainingFiles:counts.data_dml,
  originalAuthenticatedDefinerAdvisorWarnings:67,
  sourceSqlBodiesFetched:false,securityPortabilityReviewed:false,
  qaSqlInstalled:false,productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('offline-only; no arguments');
  const result=validateR101HistoricalRiskAudit(
   read(ROOT,MANIFEST),read(ROOT,INDEX));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  process.stderr.write('R101 HISTORICAL SQL NO-GO: source metadata review failed.\n');
  process.exitCode=1;
 }
}
