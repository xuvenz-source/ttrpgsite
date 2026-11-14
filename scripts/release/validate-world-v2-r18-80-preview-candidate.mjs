/**
 * R18-80 — Offline source-integrity and preview-scope assessment, NO-GO-only.
 *
 * This validates all checked-out frontend file bytes against the Git SHA-1
 * tree shared by R18-62 and R18-79. It cannot prove a Vercel build was made
 * with particular flags, attest authenticated players, call Supabase or
 * change a remote environment. Use actual Vercel and operator evidence later.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,readlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const RECORD='staging/world-v2-b10-r18-80-qa-preview-candidate.json';
const FRONTEND_TREE='546cfbaca75a16a447f740a24d1ef59e0a489f59';
const SHA62='380e31bda9e20638c3e1f660a2cdf001b8e37c0d';
const SHA79='e3b791ea7ba478b9220bc5ddb111b628cec36348';
const fail=()=>{throw Error('R80 PREVIEW NO-GO: source, deployment or authorization evidence drift')};
const sha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const gitDigest=(kind,bytes)=>createHash('sha1')
 .update(Buffer.from(kind+' '+bytes.length+'\0')).update(bytes).digest();
const gitBlobOid=(bytes)=>gitDigest('blob',bytes).toString('hex');
function treeDigest(dir){
 const children=readdirSync(dir,{withFileTypes:true});
 children.sort((a,b)=>Buffer.compare(
  Buffer.from(a.name+(a.isDirectory()?'/':'')),
  Buffer.from(b.name+(b.isDirectory()?'/':''))));
 const parts=[];
 for(const entry of children){
  if(entry.name==='.git'||entry.name==='node_modules')fail();
  const absolute=join(dir,entry.name);
  const st=lstatSync(absolute);
  let mode,oid;
  if(st.isDirectory()){
   mode='40000';oid=treeDigest(absolute);
  }else if(st.isSymbolicLink()){
   mode='120000';oid=gitDigest('blob',Buffer.from(readlinkSync(absolute)));
  }else if(st.isFile()){
   mode=(st.mode&0o111)?'100755':'100644';
   oid=gitDigest('blob',readFileSync(absolute));
  }else fail();
  parts.push(Buffer.from(mode+' '+entry.name+'\0'),oid);
 }
 return gitDigest('tree',Buffer.concat(parts));
}
export function validateR80QaCandidate({record,repoRoot=ROOT}={}){
 const r=record??JSON.parse(readFileSync(join(repoRoot,RECORD),'utf8'));
 if(!r||r.schema!==1||r.workPackage!=='B10-R18-80'||
  r.dateLocal!=='2026-11-15'||
  r.kind!=='SOURCE_IDENTICAL_PREVIEW_SELECTION_READONLY'||
  r.releaseDecision!=='NO_GO'||r.previewDeploymentAuthorized!==false||
  r.productionDeploymentAuthorized!==false||r.remoteChangesMade!==false||
  r.previewV2AcceptanceAlreadyValid!==false)fail();
 const c=r.candidate,d=r.currentDeployment,a=r.activation,q=r.qa,p=r.approvals,sp=c?.sourceParity;
 if(c?.decision!=='REUSE_R18_62_SOURCE_WITH_EXPLICIT_BRANCH_SCOPED_REBUILD_ONLY'||
  c.previewSourceSha!==SHA62||c.stage79ParentSha!==SHA79||
  c.sourceBranch!=='stage/world-v2-b10-r18-62-preview-auth-redirect-2026-11-14'||
  c.projectId!=='prj_JvLavoId5bra74h24BDL7ZyMKizN'||
  c.teamId!=='team_x0HgomZNnFpGbnYWHgut76AX'||
  c.deployedPreviewId!=='dpl_Pk7zo5VLppWs6hjc6WKsp4bMH2ZC'||
  c.deployedPreviewHost!=='ttrpgsite-git-stage-world-v2-b10-r18-62-previ-4f1679-ttrpg-site.vercel.app'||
  c.deploymentState!=='READY'||c.deploymentTarget!=='preview'||
  c.existingDeploymentSupportsV2Qa!=='NOT_ATTESTED_V2_INACTIVE_BY_ENV_SCOPE')fail();
 if(sp?.method!=='GITHUB_ROOT_TREE_SHA_AND_COMPARE_COMMITS_READ_ONLY'||
  sp.srcTreeSha!==FRONTEND_TREE||
  sp.indexHtmlBlobSha!=='75a0c28b69c09f7661faa7822a7abfde7164e2d0'||
  sp.packageJsonBlobSha!=='d728ea81b83c9ae02fc36bedeb5abeba3a5bc277'||
  sp.viteConfigBlobSha!=='7abe1f343e0631c97160ff63bcc00119e4f3775d'||
  sp.vercelConfigBlobSha!=='de8875a0750955e5d326a84f089b7533a09c5050'||
  sp.frontendSourcePathsChangedSinceR18_62!==0||
  sp.migrationsChangedSinceR18_62!==0||
  sp.backendCandidateFilesAddedSinceR18_62!==2)fail();
 const root=resolve(repoRoot);
 if(treeDigest(join(root,'src')).toString('hex')!==FRONTEND_TREE)fail();
 for(const [path,known] of [
  ['index.html',sp.indexHtmlBlobSha],
  ['package.json',sp.packageJsonBlobSha],
  ['vite.config.js',sp.viteConfigBlobSha],
  ['vercel.json',sp.vercelConfigBlobSha]
 ]){
  if(gitBlobOid(readFileSync(join(root,path)))!==known)fail();
 }
 const read=path=>readFileSync(join(root,path),'utf8');
 const app=read('src/TabletopApp.jsx');
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 const panel=read('src/engine/v2/WorldTraceCapturePanel.jsx');
 const qa=read('src/engine/v2/WorldV2QaReceipt.js');
 const oauth=read('src/AuthRedirect.js');
 const vite=read('vite.config.js');
 const vercel=JSON.parse(read('vercel.json'));
 const sourceGate=/VITE_WORLD_ENGINE_V2==='integrated'\s*&&\s*import\.meta\.env\.VITE_WORLD_ENGINE_V2_READY==='true'/;
 if(!sourceGate.test(app)||!app.includes("import('./engine/v2/WorldV2Board.jsx')")||
  !app.includes("import('./BattlemapBoard.jsx')")||
  !runtime.includes("VITE_WORLD_V2_ATOMIC_FINALIZE==='1'")||
  !runtime.includes("VITE_WORLD_V2_ATOMIC_FINALIZE_READY==='1'")||
  !runtime.includes("VITE_WORLD_V2_OBSERVER_RECOVERY==='1'")||
  !runtime.includes("VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY==='1'")||
  !panel.includes('R18-58 multiplayer acceptance')||
  !panel.includes('worldV2Trace.enabled')||
  !qa.includes('WORLD_V2_QA_REQUIRED_CHECKS')||
  !qa.includes('previewMode:dmPreview')||
  !oauth.includes("return target.origin+'/';")||
  !vite.includes('VERCEL_GIT_COMMIT_SHA')||
  vercel.git?.deploymentEnabled?.['**']!==false||
  vercel.git?.deploymentEnabled?.main!==true)fail();
 if(!same(d,{
  canonicalHost:'ttrpgsite.vercel.app',
  canonicalSourceSha:'5ca8c83bdef4a5d9870020b0f2b16723f7790e38',
  oldFailedV2PreviewSha:'1b33da9bb60252e7964700e9d97b1d05ea452392',
  oldFailedV2PreviewAlias:'ttrpgsite-movement-qa-ttrpg-site.vercel.app',
  useOldFailedPreview:false,productionUnchanged:true,
  previewDeploymentProtection:'VERCEL_AUTHENTICATION_ENABLED_PREVIEW',
  oldR18_62OauthReportedWorking:true,currentSupabaseRegisteredMigrations:83,
  pendingR05PlusNarrowMigrations:8
 }))fail();
 if(a?.currentProjectEnvNamesContainBranchSpecificR18_62V2!==false||
  a.genericPreviewV2FlagsConfigured!==false||
  !same(a.knownBranchSpecificV2EnvOnly,[
   'stage/world-v2-b10-r18-39-local-browser-metrics-2026-11-13',
   'stage/world-v2-b10-r18-40-blocked-lateral-rebase-2026-11-13'
  ])||
  !same(a.conditionRequires,[
   {name:'VITE_WORLD_ENGINE_V2',value:'integrated',scope:'preview:R18_62_ONLY'},
   {name:'VITE_WORLD_ENGINE_V2_READY',value:'true',scope:'preview:R18_62_ONLY'}
  ])||
  !same(a.remainAbsentOrOff,[
   'VITE_WORLD_V2_ATOMIC_FINALIZE','VITE_WORLD_V2_ATOMIC_FINALIZE_READY',
   'VITE_WORLD_V2_OBSERVER_RECOVERY','VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY'
  ])||
  a.currentGitDeploymentEnabledForStageBranch!==false||
  a.type!=='BUILD_TIME_FLAGS_REQUIRE_NEW_PREVIEW_BUILD'||
  a.operatorMustApproveConfigAndRebuild!==true||
  a.oauthRedirectHostMustBeIndependentlyVerified!==true||
  a.noProductionFlagChange!==true||a.noGlobalPreviewFlagChange!==true)fail();
 if(!same(q,{
  panelPresentInR18_62Source:true,panelOptInQuery:'worldV2Trace=1',
  panelRequiresActiveV2Board:true,receiptMode:'R18-58 multiplayer acceptance',
  actualNewDeploymentId:'NOT_CREATED',actualNewBuildSha:'NOT_ATTESTED',
  independentSignedDM:'NOT_VERIFIED',independentSignedP1:'NOT_VERIFIED',
  independentSignedP2:'NOT_VERIFIED',
  trueCollisionAndImmediateRegrab:'NOT_VERIFIED',
  fogRevocationAndPrivateObservation:'NOT_VERIFIED',
  browserMovementP95:'NOT_MEASURED',
  physicalFreeTierRamAndLocksUnderLoad:'NOT_MEASURED',
  current83BackendTestScope:'PRE_MIGRATION_DIAGNOSTIC_ONLY',
  integrated91BackendAcceptance:'NOT_PERFORMED'
 }))fail();
 if(!same(p,{
  explicitBranchPreviewChange:'NOT_GIVEN_FOR_R18_80',
  exactDeployedShaReview:'NOT_PERFORMED_FOR_V2_ACTIVE_REBUILD',
  officialPinnedSupabaseCli83Plus8:'NOT_VERIFIED',
  publicProductionPromotion:'PROHIBITED'
 }))fail();
 const references={
  sourceGate:'src/TabletopApp.jsx',
  sourceAtomicGate:'src/engine/v2/WorldV2TabletopRuntime.js',
  sourceQaPanel:'src/engine/v2/WorldTraceCapturePanel.jsx',
  sourceQaReceipt:'src/engine/v2/WorldV2QaReceipt.js',
  sourceOauth:'src/AuthRedirect.js',
  sourceVite:'vite.config.js',
  sourceVercel:'vercel.json',
  sourceQaChecker:'scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs',
  sourceQaProtocol:'docs/testing/world-v2-r18-58-multiplayer-acceptance-2026-11-13.md',
  sourceAuthProtocol:'docs/testing/world-v2-r18-62-preview-auth-gate-2026-11-14.md'
 };
 if(!same(r.references,references))fail();
 return Object.freeze({
  decision:'NO_GO',
  safeToDeployPreviewWithoutApproval:false,
  productionSafeToDeploy:false,
  candidateSourceGitSha:SHA62,
  candidatePreviewId:c.deployedPreviewId,
  candidateSourceIdenticalToLatestStageAtAudit:true,
  activePreviewV2BuildVerified:false,
  needsScopedPreviewFlagConfiguration:true,
  needsApprovedPreviewRebuild:true,
  needsVercelProtectedSessionAndOAuthVerification:true,
  preMigration83Only:true,
  noIndependentMultiplayerAcceptanceYet:true,
  noOfficialLinkedCliDryRunYet:true,
  nextStep:'EXPLICIT_APPROVAL_THEN_REBUILD_AND_VERIFY_EXACT_V2_ACTIVE_PREVIEW'
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail();
  process.stdout.write(JSON.stringify(validateR80QaCandidate(),null,2)+'\n');
 }catch{
  process.stderr.write('R80 PREVIEW NO-GO: inspect source and preview state privately.\n');
  process.exitCode=1;
 }
}
