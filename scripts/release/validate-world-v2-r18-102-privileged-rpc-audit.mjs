/**
 * B10-R18-102 — read-only 67 authenticated SECURITY DEFINER RPC inventory.
 * Git-bound metadata index and strict false security/release gates; never SQL.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR101HistoricalRiskAudit}
 from './validate-world-v2-r18-101-history-risk-audit.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const DIR='staging/world-v2-b10-r18-102-privileged-rpc-audit/';
const OLD='staging/world-v2-b10-r18-101-history-risk-audit/';
const BLOB='c076de1c51d7d2a6ecf9eeb4f8986cc5c8885ab2';
const fail=s=>{throw Error('R102 PRIVILEGED RPC NO-GO: '+s)};
const read=(root,path)=>JSON.parse(readFileSync(join(root,path),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(a,k)=>a&&typeof a==='object'&&!Array.isArray(a)&&
 Object.keys(a).length===k.length&&k.every(x=>Object.hasOwn(a,x));
const all=(o,b)=>Object.values(o).every(x=>x===b);
const missingIdentity=[
 'get_campaign_sheet_inventory','get_dm_map_npc_values',
 'get_npc_token_values','is_map_fog_published',
 'patch_campaign_sheet_noninventory','preview_map_motion',
 'publish_map_environment'
];
const missingScope=[
 'cancel_world_motion_v2','end_authorized_navigation_gesture',
 'end_map_motion_previews','end_map_motion_sessions',
 'get_world_visibility_v2','is_map_fog_published','preview_map_motion'
];
const totals={
 catalogFunctions:67,advisorWarnings:67,allPublicDefinerFunctions:85,
 authenticatedCallable:67,anonymousCallable:0,publicAclCallable:0,
 emptyConfiguredSearchPath:67,postgresOwned:67,directAuthIdentityMarker:60,
 scopeMarker:60,fogVisionMarker:31,movementMarker:44,dynamicSqlMarker:0,
 functionsWithoutDirectAuthIdentity:7,functionsWithoutScopeMarker:7
};
const info={
 authenticatedFunctions:67,postgresOwned:67,emptySearchPath:67,
 anonExecutable:0,publicExecuteGranted:0,directIdentityText:60,
 withoutDirectIdentityText:7,withoutScopeText:7,fogVisionText:31,
 movementText:44,indirectHelperCandidatesTraced:7,
 extraNonAuthCallablePublicDefiners:18
};
const gates=['fullPrivilegedFunctionSourceReviewComplete',
 'indirectAuthCallChainsVerified','signedCrossUserFogMovementNocAccessTestsPassed',
 'rollbackPrepared','original83SqlPrivateRecoveryComplete',
 'qaOnlyDryRunComplete','qaSchemaInstalled','pendingEightInstalled',
 'productionReleaseAuthorized'];
const unchanged=['originalDatabaseUnchanged','qaDatabaseUnchanged',
 'existingVercelUnchanged','qaVercelUndeployed',
 'noSqlDefinitionsExported','noSecretsCommitted','noPaidResource',
 'noMerge','noProductionDeploy'];
export function validateR102PrivilegedRpc(m,index,review,{repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 if(!keys(m,['schema','workPackage','decision','parentPr','parentSha',
   'observedLocalDate','scope','original','qa','files','results',
   'gates','unchanged'])||
  m.schema!==1||m.workPackage!=='B10-R18-102'||m.decision!=='NO_GO'||
  m.parentPr!==203||
  m.parentSha!=='7b5b38be2bd8dee99dba7765969e0c55a2f9c16b'||
  m.observedLocalDate!=='2026-11-17'||
  m.scope!=='LIVE_AUTHENTICATED_SECURITY_DEFINER_RPC_CATALOG_AND_INDIRECT_AUTH_TRIAGE')
  fail('parent and source-only state altered');
 if(!same(m.original,{
  projectRef:'lwhwgqaunxbmvyndswze',status:'ACTIVE_HEALTHY',
  historicalMigrations:83,providerAdvisorWarnings:67,
  catalogMatchedAdvisorFunctions:67,publicSecurityDefiners:85,
  anonExecutableSecurityDefiners:0,privilegeChangesApplied:false
 })||!same(m.qa,{
  projectRef:'bgydsamxypjslergfpla',status:'ACTIVE_HEALTHY',
  registeredMigrations:0,publicApplicationTables:0,sqlChanged:false
 })||!same(m.results,info)||
 !keys(m.gates,gates)||!all(m.gates,false)||
 !keys(m.unchanged,unchanged)||!all(m.unchanged,true))
  fail('hosted privilege/security/approval observation mismatch');
 const expectedFiles={
  catalogIndex:DIR+'catalog-index.json',catalogGitBlobSha:BLOB,
  indirectReview:DIR+'indirect-auth-review.json',
  validator:'scripts/release/validate-world-v2-r18-102-privileged-rpc-audit.mjs',
  tests:'tests/world-v2-r18-102-privileged-rpc-audit.test.mjs',
  runbook:'docs/testing/world-v2-r18-102-privileged-rpc-review-2026-11-17.md'
 };
 if(!same(m.files,expectedFiles))fail('source index identity changed');
 const raw=readFileSync(join(root,expectedFiles.catalogIndex));
 const blob=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
 if(blob!==BLOB)fail('catalog Git blob content was not the verified 67-source snapshot');
 // Reject altered in-memory/parsing input even when the disk blob is genuine.
 // A Git-blob hash alone does not authenticate a separately supplied object.
 if(!same(index,JSON.parse(raw.toString('utf8'))))
  fail('caller supplied RPC metadata differs from immutable verified blob');
 if(!same(review,read(root,expectedFiles.indirectReview)))
  fail('caller supplied helper review differs from staged source evidence');
 if(!keys(index,['schema','workPackage','decision','provenance',
  'interpretation','totals','functions'])||
  index.schema!==1||index.workPackage!=='B10-R18-102'||
  index.decision!=='NO_GO'||
  !same(index.provenance,{
   projectRef:'lwhwgqaunxbmvyndswze',observedLocalDate:'2026-11-17',
   source:'SELECT-only pg_proc/catalog metadata and current Supabase security advisors',
   rawFunctionDefinitionsReturned:false,sqlOrPermissionsChanged:false,
   advisorRule:'authenticated_security_definer_function_executable'
  })||
  index.interpretation!==
   'Live callable-function metadata. Boolean markers are only text matches in routine bodies, not proof of actual authorization checks or of vulnerabilities. Individual source and cross-account tests have NOT been performed.'||
  !same(index.totals,totals)||
  !Array.isArray(index.functions)||index.functions.length!==67)
  fail('catalog inventory incomplete or provenance misrepresented');
 const names=new Set(),counts={
  directAuthIdentity:0,scopeText:0,fogVisionText:0,movementText:0,dynamicSqlText:0
 };
 for(const f of index.functions){
  if(!keys(f,['schema','name','identityArguments','ownerRole',
   'volatility','grants','securityDefiner','configuredSearchPath',
   'markers','sourceReviewed','permissionReviewApproved'])||
   f.schema!=='public'||!/^[a-z][a-z0-9_]*$/.test(f.name)||
   typeof f.identityArguments!=='string'||f.identityArguments.length>1024||
   f.ownerRole!=='postgres'||!['s','v','i'].includes(f.volatility)||
   f.securityDefiner!==true||f.configuredSearchPath!==''||
   !same(f.grants,{
    authenticatedExecute:true,anonExecute:false,publicExecuteAcl:false
   })||!keys(f.markers,Object.keys(counts))||
   f.sourceReviewed!==false||f.permissionReviewApproved!==false||
   names.has(f.name))fail('unexpected RPC privilege, stored SQL or approval');
  names.add(f.name);
  for(const k of Object.keys(counts)){
   if(typeof f.markers[k]!=='boolean')fail('invalid marker');
   if(f.markers[k])counts[k]++;
  }
 }
 if(!same(counts,{
  directAuthIdentity:60,scopeText:60,fogVisionText:31,
  movementText:44,dynamicSqlText:0
 })||!same(index.functions.filter(x=>!x.markers.directAuthIdentity)
  .map(x=>x.name),missingIdentity)||
  !same(index.functions.filter(x=>!x.markers.scopeText)
  .map(x=>x.name),missingScope))
  fail('exact 67-RPC catalog marker reconciliation failed');
 const expectedReviewTargets=[
  ['get_campaign_sheet_inventory',['public.can_edit_campaign_sheet_inventory'],true],
  ['get_dm_map_npc_values',['public.is_campaign_dm'],true],
  ['get_npc_token_values',['public.is_campaign_dm'],true],
  ['is_map_fog_published',[],false],
  ['patch_campaign_sheet_noninventory',['public.can_edit_campaign_sheet'],true],
  ['preview_map_motion',['forge_visibility.dispatch_movement_preview'],false],
  ['publish_map_environment',['forge_visibility.bump_tick','public.is_campaign_dm'],true]
 ];
 if(!keys(review,['schema','workPackage','decision','provenance',
  'originalProjectRef','indirectIdentityTargets',
  'missingScopeTextTargets','helperMetadata','outcomes'])||
   review.schema!==1||review.workPackage!=='B10-R18-102'||
   review.decision!=='NO_GO'||
   review.provenance!==
    'SQL SELECT-only server-side regex call-name candidates; these do NOT prove runtime call paths or authorization correctness'||
   review.originalProjectRef!=='lwhwgqaunxbmvyndswze'||
   !same(review.missingScopeTextTargets,missingScope)||
   !Array.isArray(review.indirectIdentityTargets)||
   review.indirectIdentityTargets.length!==7||
   !Array.isArray(review.helperMetadata)||review.helperMetadata.length!==5||
   !same(review.outcomes,{
    functionSourceReviewed:false,indirectAuthCallChainsVerified:false,
    crossUserPermissionTestsPerformed:false,privilegedRpcPermissionsApproved:false
   }))fail('incomplete indirect Auth helper review metadata');
 for(let i=0;i<7;i++){
  const x=review.indirectIdentityTargets[i],v=expectedReviewTargets[i];
  if(!keys(x,['name','helperCandidates','directIdentityText','scopeText','reviewFocus'])||
   x.name!==v[0]||!same(x.helperCandidates,v[1])||
   x.directIdentityText!==false||x.scopeText!==v[2]||
   typeof x.reviewFocus!=='string'||x.reviewFocus.length<20||
   !names.has(x.name))fail('unverified indirect Auth review target');
 }
 const helpers=[
  'forge_visibility.bump_tick','forge_visibility.dispatch_movement_preview',
  'public.can_edit_campaign_sheet','public.can_edit_campaign_sheet_inventory',
  'public.is_campaign_dm'
 ];
 for(let i=0;i<5;i++){
  const h=review.helperMetadata[i];
  if(!keys(h,['schema','name','arguments','securityDefiner','owner',
   'authExecute','anonExecute','emptySearchPath','directAuthText','scopeText'])||
   h.schema+'.'+h.name!==helpers[i]||h.owner!=='postgres'||
   h.securityDefiner!==true||h.anonExecute!==false||
   h.emptySearchPath!==true||h.scopeText!==true||
   typeof h.arguments!=='string'||h.arguments.length>512||
   h.authExecute!==(i===4)||
   h.directAuthText!==([false,true,true,false,true][i]))
   fail('unexpected candidate helper permissions or identity signals');
 }
 const old=read(root,OLD+'manifest.json');
 const prev=validateR101HistoricalRiskAudit(old,
  read(root,OLD+'metadata-index.json'),{repoRoot:root});
 if(prev.decision!=='NO_GO'||prev.historicalFilesChecked!==83||
  old.releaseGates.historicalPrivilegedFunctionsReviewed!==false||
  old.qa.registeredMigrations!==0)
  fail('R101 original history/privileged-review gate drift');
 return Object.freeze({
  workPackage:'B10-R18-102',decision:'NO_GO',
  advisorAndCatalogFunctionsReconciled:67,
  anonExecutable:0,publicExecGrants:0,
  directAuthTextMissing:7,scopeTextMissing:7,
  candidateHelpersInspected:5,
  functionAuthorizationReviewed:false,
  qaSchemaInstalled:false,productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('offline-only, no network/SQL actions');
  const r=validateR102PrivilegedRpc(
   read(ROOT,DIR+'manifest.json'),
   read(ROOT,DIR+'catalog-index.json'),
   read(ROOT,DIR+'indirect-auth-review.json'));
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
 }catch(e){
  process.stderr.write(String(e?.message||e)+'\n');process.exitCode=1;
 }
}
