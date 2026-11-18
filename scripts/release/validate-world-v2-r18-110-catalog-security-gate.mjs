/**
 * B10-R18-110 — OFFLINE source-only security gate reconciliation.
 * Checks a frozen read-only catalog observation and prior source evidence.
 * It does not contact Supabase, access original SQL, authorize replay,
 * authenticate the operator, or execute SQL.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const DIR='staging/world-v2-b10-r18-110-live-security-gate/';
const R102='staging/world-v2-b10-r18-102-privileged-rpc-audit/';
const R104='staging/world-v2-b10-r18-104-fog-guard/';
const R105='staging/world-v2-b10-r18-105-isolated-fog-test/';
const SOURCE='lwhwgqaunxbmvyndswze';
const QA='bgydsamxypjslergfpla';
const SHA='fe31759c142602047c1813d8ba1868f734138b8f94c773f7f1b6106b5b6bb783';
const NAMES=[
 'get_campaign_sheet_inventory','get_dm_map_npc_values',
 'get_npc_token_values','is_map_fog_published',
 'patch_campaign_sheet_noninventory','preview_map_motion',
 'publish_map_environment'
];
const PRIVATE_NAMES=[
 'enforce_collision','enforce_tool_collision','is_lit','point_visible',
 'tick_combat','tick_tokens','tick_tools'
];
const fail=()=>{throw Error('R110 CATALOG SECURITY NO-GO: source evidence inconsistent')};
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const read=(root,path)=>JSON.parse(readFileSync(join(root,path),'utf8'));
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

export function validateR110CatalogSecurityGate(manifest,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(manifest?.schema!==1||manifest.workPackage!=='B10-R18-110'||
   manifest.decision!=='NO_GO'||manifest.parentPr!==211||
   manifest.parentSha!=='8f4de32594137513c9bae1ed139e1ded5d5bacdc'||
   manifest.observedLocalDate!=='2026-11-18'||
   manifest.scope!=='LIVE_ORIGINAL_READ_ONLY_PG_CATALOG_SECURITY_OBSERVATION_AND_UNRELEASED_FOG_FIX_GATE')fail();
 if(!exact(manifest.provenance,{
  originalProjectRef:SOURCE,qaProjectRef:QA,
  method:'SUPABASE_READ_ONLY_SELECT_PG_CATALOG_AND_SECURITY_ADVISORS',
  originalFunctionSqlBodiesExported:false,originalHistorySqlExported:false,
  credentialsExported:false
 }))fail();
 const c=manifest.catalog;
 if(!c||c.originalRegisteredMigrations!==83||
   c.qaRegisteredMigrations!==0||c.qaPublicApplicationTables!==0||
   c.originalPublicTables!==31||c.originalPublicTablesMissingRls!==0||
   c.originalExposedTablesMissingRls!==0||c.originalPublicViews!==0||
   c.originalExposedNonInvokerViews!==0||
   !exact(c.schemaDefinerSummary,[
    {schema:'public',definers:85,authenticatedCallable:67,anonCallable:0,anonGrantedButSchemaDenied:0},
    {schema:'forge_visibility',definers:23,authenticatedCallable:0,anonCallable:0,anonGrantedButSchemaDenied:7},
    {schema:'forge_world_v2',definers:24,authenticatedCallable:0,anonCallable:0,anonGrantedButSchemaDenied:0}
   ])||c.publicCallableDefinerPostgresOwned!==67||
   c.publicCallableDefinersWithConfiguredSearchPath!==67||
   c.publicCallableDefinersWithoutDirectAuthUidText!==7||
   !exact(c.privateVisibilityAnonFunctionGrantsWithoutSchemaUsage,PRIVATE_NAMES)||
   !exact(c.securityAdvisors,[
    {name:'rls_enabled_no_policy',level:'INFO',count:15},
    {name:'authenticated_security_definer_function_executable',level:'WARN',count:67},
    {name:'auth_leaked_password_protection',level:'WARN',count:1}
   ]))fail();
 const sourceMd5=[
  '5f47826bc6673b92a0cbc277b1b77c51',
  '32bb20cc485a57d24a50b13a64cecab0',
  'd492c33eddc090ea9a1bcfed7602807e',
  '084a62df8ed72d3e5fffbfce9507ff0f',
  'f988c6d7a05c441e45746491278ccff4',
  '2956971f75ba69858989ca80b53d4bbe',
  '847d71e3382c05d2802c965c532ff225'
 ];
 const sourceBytes=[1950,263,141,102,2364,110,3836];
 if(!exact(c.sevenPrivilegeReviewTargets,
  NAMES.map((name,i)=>({name,bytes:sourceBytes[i],source_md5:sourceMd5[i]}))))fail();

 const idx=read(root,R102+'catalog-index.json');
 const r104=read(root,R104+'manifest.json');
 const r105=read(root,R105+'manifest.json');
 if(idx.functions?.length!==67||idx.totals?.catalogFunctions!==67||
   idx.totals?.authenticatedCallable!==67||
   idx.totals?.anonymousCallable!==0||
   idx.totals?.publicAclCallable!==0||
   idx.totals?.emptyConfiguredSearchPath!==67||
   !exact(idx.functions.filter(f=>!f.markers.directAuthIdentity)
      .map(f=>f.name),NAMES))fail();
 const candidate=readFileSync(join(root,R104+'unapplied-fog-status-guard.sql'));
 if(blob(candidate)!=='c84d7cf8b0958621f11ec273cb36361e2501a77f'||
    r104.candidate?.appliedToAnyDatabase!==false||
    r104.sourceFindings?.fogStatusSourceLevelMetadataOracle!==true||
    r105.priorIsolatedProof?.originalFogStatusOracleReproduced!==true||
    r105.priorIsolatedProof?.stagedCandidateAppliedToDisposableOnly!==true||
    r105.priorIsolatedProof?.originalSourceRestoreReintroducedOracle!==true||
    r105.acceptance?.actualSignedAccountCasesExecuted!==0)fail();
 const privateEvidence=manifest.frozenPrivateRecovery;
 if(!exact(privateEvidence,{
  operatorLocal83Verified:true,operatorR99HashMatched:true,
  operatorR108ScanDone:true,operatorR109TriageDone:true,
  aggregateSha256:SHA,rawPrivateSqlInRepository:false,
  operatorSessionIndependentlyAttested:false,
  perFunctionPrivateSqlSecurityReviewed:false
 }))fail();
 const fog=manifest.fogGuard;
 if(!exact(fog,{
  historicalSourceMetadataOracleConfirmed:true,
  disposablePostgres17FixtureReproduced:true,
  stagedCandidateBlocksOracleInSyntheticFixture:true,
  candidatePath:R104+'unapplied-fog-status-guard.sql',
  candidateGitBlobSha:'c84d7cf8b0958621f11ec273cb36361e2501a77f',
  candidateAppliedToOriginal:false,candidateAppliedToQa:false,
  signedHostedAcceptanceExecuted:0,signedHostedAcceptanceRequired:12,
  originalFunctionRestoreIsSafeRollback:false
 }))fail();
 const locked=[
  'privateAll83SemanticAuditApproved','independentOperatorAuthAttested',
  'all67AuthenticatedDefinerRpcsReviewed','internalFunctionExecuteGrantsReviewed',
  'signedFogAndCampaignAuthorizationAccepted','QAOnly83HistoryDryRunApproved',
  'QAOriginal83SchemaInstalled','fogGuardQaPatchVerified',
  'pendingEightMigrationsInstalled','DMPlayerCrossAccountAccepted',
  'freeTierPerformanceAccepted','productionReleaseAuthorized'
 ];
 if(!exact(Object.keys(manifest.releaseGates||{}),locked)||
    locked.some(k=>manifest.releaseGates[k]!==false)||
    !exact(manifest.unchanged,{
     originalSqlUnchanged:true,qaSqlUnchanged:true,
     privateSqlNeverExported:true,sourceOnlyCode:true,
     noProductionOrQaVercelDeployment:true,
     noPaidResources:true,noMerges:true
    }))fail();
 return Object.freeze({
  workPackage:'B10-R18-110',decision:'NO_GO',
  originalPublicRlsTables:31,publicTablesWithoutRls:0,
  authenticatedPublicDefinerReviewRequired:67,
  sevenSourceIdentifiedReviewTargets:7,
  privateSchemaAnonymousExecuteButNoUsage:7,
  sourceConfirmedFogStatusMetadataDisclosure:true,
  fogCandidateAlreadyApplied:false,
  operatorSqlIntegrityAttestedLocally:83,
  privateHumanSqlReviewApproved:false,
  qaSchemaInstallAuthorized:false,productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail();
  const manifest=read(ROOT,DIR+'manifest.json');
  process.stdout.write(JSON.stringify(validateR110CatalogSecurityGate(manifest),null,2)+'\n');
 }catch{
  process.stderr.write('R110 CATALOG SECURITY NO-GO: pinned read-only source observation rejected.\n');
  process.exitCode=1;
 }
}
