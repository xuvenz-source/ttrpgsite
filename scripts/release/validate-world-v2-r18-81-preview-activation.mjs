/**
 * R18-81 — private-geometry-free operator preview receipt validation.
 *
 * This validates frozen source-backed metadata ONLY; it never contacts
 * Vercel, proves browser OAuth, certifies independent players or returns GO.
 */
import {readFileSync,statSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR80QaCandidate} from './validate-world-v2-r18-80-preview-candidate.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const FILE='staging/world-v2-b10-r18-81-preview-activation-record.json';
const SHA62='380e31bda9e20638c3e1f660a2cdf001b8e37c0d';
const BRANCH62='stage/world-v2-b10-r18-62-preview-auth-redirect-2026-11-14';
const sha=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=()=>{throw Error('R81 PREVIEW NO-GO: inconsistent activation evidence')};
const exact=(got,required)=>{if(!eq(got,required))fail();};
export function validateR81PreviewActivation({record,repoRoot=ROOT}={}){
 const root=resolve(repoRoot);
 const r=record??JSON.parse(readFileSync(join(root,FILE),'utf8'));
 if(!r||r.schema!==1||r.workPackage!=='B10-R18-81'||
  r.observedDate!=='2026-11-15'||
  r.kind!=='PREVIEW_ONLY_OPERATOR_DEPLOYMENT_AND_SAFETY_RECORD'||
  r.releaseDecision!=='NO_GO'||r.safeToPromote!==false||
  r.productionApproval!==false)fail();
 exact(r.scope,{
  projectId:'prj_JvLavoId5bra74h24BDL7ZyMKizN',
  teamId:'team_x0HgomZNnFpGbnYWHgut76AX',
  plan:'hobby',repository:'xuvenz-source/ttrpgsite',
  previewBranch:BRANCH62,
  previewSourceSha:SHA62,
  r81EngineeringParentSha:'bc6f96aa15b7924a9a62c5dd2ae9d4a73f7a5e7b'
 });
 exact(r.approvedAction,{
  requestedByUser:'Proceed with R18-81 after explicit scoped-preview plan',
  allowedChanges:'TWO_BRANCH_SCOPED_PREVIEW_BUILD_FLAGS_AND_ONE_PREVIEW_DEPLOYMENT',
  productionEnvMutationAllowed:false,prodDeploymentAllowed:false,
  databaseWritesAllowed:false,oauthSettingsMutationAllowed:false
 });
 exact(r.environment,{
  createdBranchScopedPreview:[
   {key:'VITE_WORLD_ENGINE_V2',value:'integrated',id:'KBmePLAqSqvfSCyx'},
   {key:'VITE_WORLD_ENGINE_V2_READY',value:'true',id:'CspsbE9FgzHftk6m'}
  ],
  target:['preview'],gitBranch:BRANCH62,
  globalPreviewV2ActivationCount:0,
  existingProductionV2KeyCount:2,
  branchScopedOptionalAtomicObserverExtras:0,
  noProductionEnvMutation:true,noGlobalPreviewMutation:true,
  disabledOrAbsent:[
   'VITE_WORLD_V2_ATOMIC_FINALIZE','VITE_WORLD_V2_ATOMIC_FINALIZE_READY',
   'VITE_WORLD_V2_OBSERVER_RECOVERY','VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY'
  ]
 });
 exact(r.deployment,{
  id:'dpl_Bdek3W7xXVYW3f7QDZpjrDDp9V3F',state:'READY',
  target:'preview',gitSha:SHA62,gitBranch:BRANCH62,
  immutableHost:'ttrpgsite-96k0doq81-ttrpg-site.vercel.app',
  branchAlias:'ttrpgsite-git-stage-world-v2-b10-r18-62-previ-4f1679-ttrpg-site.vercel.app',
  aliasResolvedToNewId:true,
  readyAndBuildPassed:true,
  buildViteVersion:'6.2.0',
  builtWorldV2BoardChunk:true,
  builtWorldV2ChunkNotProofOfRuntimeSelection:true,
  sourceAndPreviewTargetVerified:true,
  previewV2RenderedInSignedBrowser:false,
  oauthCallbackNewHostVerified:false,
  independentDmP1P2Verification:false,
  mapMovementCollisionAcceptance:false
 });
 exact(r.production,{
  canonicalDomain:'ttrpgsite.vercel.app',
  deploymentId:'dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN',
  sourceSha:'5ca8c83bdef4a5d9870020b0f2b16723f7790e38',
  remainedReadyAndUnchanged:true,
  migrationsObserved:83,migrationsAppliedThisStep:0,
  canonicalAliasReassigned:false,
  optionalFogOrRaySqlInstalled:false
 });
 exact(r.protection,{
  vercelSsoPreviewEnabled:true,noShareLinkCreated:true,
  supabaseAuthRedirectAllowlistNotReadableWithConnectedTools:true,
  sameOriginGoogleOnThisNewBuildNotYetTested:true
 });
 exact(r.releaseGates,{
  officialLinkedSupabaseCli83Plus8DryRun:'NOT_VERIFIED',
  independentlyAuthenticatedDM:'NOT_VERIFIED',
  independentlyAuthenticatedP1:'NOT_VERIFIED',
  independentlyAuthenticatedPassiveP2:'NOT_VERIFIED',
  trueImmediateCollisionAndRegrab:'NOT_VERIFIED',
  fogRevocationAndNoLeaks:'NOT_VERIFIED',
  browserInputAckP95:'NOT_MEASURED',
  freePhysicalRamSwapLocksUnderLoad:'NOT_MEASURED',
  pendingIntegratedBackendMigrations:'R05_PLUS_SEVEN_NARROW_UNAPPLIED',
  productionReleaseAuthorization:false
 });
 exact(r.sourceReferences,{
  expectedV2Gate:'src/TabletopApp.jsx',
  qaPanel:'src/engine/v2/WorldTraceCapturePanel.jsx',
  qaReceipt:'src/engine/v2/WorldV2QaReceipt.js',
  qaScript:'scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs',
  r80SourcePin:'staging/world-v2-b10-r18-80-qa-preview-candidate.json',
  r80Runbook:'docs/testing/world-v2-r18-80-smallest-safe-preview-2026-11-15.md'
 });
 for(const path of Object.values(r.sourceReferences)){
  if(!statSync(join(root,path)).isFile())fail();
 }
 if(!sha(r.scope.previewSourceSha)||!sha(r.production.sourceSha))fail();
 const pinned=validateR80QaCandidate({repoRoot:root});
 if(pinned.decision!=='NO_GO'||
  pinned.candidateSourceGitSha!==SHA62||
  pinned.candidateSourceIdenticalToLatestStageAtAudit!==true)fail();
 return Object.freeze({
  decision:'NO_GO',safeToPromote:false,sourceOnlyRecord:true,
  approvedScope:'TWO_R18_62_BRANCH_SCOPED_FLAGS_ONE_PREVIEW_DEPLOYMENT',
  deployedPreviewId:r.deployment.id,
  deployedSourceSha:SHA62,
  previewReadyReported:true,
  protectedPreviewReported:true,
  aliasToNewPreviewVerified:true,
  productionCanonicalReportedUnchanged:true,
  noSupabaseSqlChanges:true,
  liveBrowserActivationIndependentlyVerified:false,
  oauthReturnInNewBuildIndependentlyVerified:false,
  threeIndependentlySignedTestersVerified:false,
  collisionFogAndRevocationAccepted:false,
  officialLinkedCli83Plus8Verified:false,
  sourceDataNotIndependentLiveAttestation:true
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail();
  process.stdout.write(JSON.stringify(validateR81PreviewActivation(),null,2)+'\n');
 }catch{
  process.stderr.write('R81 PREVIEW NO-GO: review private deployment evidence.\n');
  process.exitCode=1;
 }
}
