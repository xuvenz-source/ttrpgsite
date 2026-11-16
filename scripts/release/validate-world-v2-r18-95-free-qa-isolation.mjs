/**
 * B10-R18-95 — source-only Free-tier independent QA project preflight.
 *
 * This tool NEVER creates a project, branch, environment variable, SQL,
 * deployment, or authenticated session. It validates *metadata only*.
 * An existing Vercel Preview is not an isolated Supabase backend if URL and
 * publishable-key env vars are shared across production and preview.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const DEFAULT='staging/world-v2-b10-r18-95-free-qa-isolation/manifest.json';
const fail=s=>{throw Error('R95 FREE QA NO-GO: '+s)};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function validateR95FreeQaIsolation(m){
 if(!exact(m,[
  'schema','workPackage','decision','parentPr','parentSha','sourceOnly',
  'observedDateLocal','organization','productionProject','vercelProject',
  'pricing','qaProposal','unverifiedGates'
 ]))fail('manifest keys changed');
 if(m.schema!==1||m.workPackage!=='B10-R18-95'||m.decision!=='NO_GO'||
    m.sourceOnly!==true||m.parentPr!==196||
    m.parentSha!=='a447e6bb52fd804cb8feafdc6aa37e949b5b706c'||
    m.observedDateLocal!=='2026-11-16')
  fail('source or decision changed');
 const org=m.organization;
 if(!exact(org,['id','name','plan','activeVisibleProjectCount','ownerAdminLimitIndependentlyVerified'])||
    org.id!=='uukoiflquxqdszrzgoyg'||org.name!=='Xuven'||
    org.plan!=='free'||org.activeVisibleProjectCount!==1||
    org.ownerAdminLimitIndependentlyVerified!==false)
  fail('organization is not a verified Free one-project snapshot');
 const prod=m.productionProject;
 if(!exact(prod,['ref','region','registeredMigrations','latestMigration','fogFunctionMd5','rayFunctionMd5'])||
    prod.ref!=='lwhwgqaunxbmvyndswze'||prod.region!=='ap-northeast-1'||
    prod.registeredMigrations!==83||prod.latestMigration!=='20261109171247'||
    prod.fogFunctionMd5!=='ee3356af321fec1a3e167a75c6245e86'||
    prod.rayFunctionMd5!=='a9fc198168c29fd5d80041b05337017e')
  fail('original linked production state or source fingerprint altered');
 const v=m.vercelProject;
 if(!exact(v,['id','name','teamId','previewProtectionEnabled',
  'observedEnvMetadataOnly','sharedSupabaseEnvKeys',
  'currentPreviewIsolatedBackendVerified'])||
    v.id!=='prj_JvLavoId5bra74h24BDL7ZyMKizN'||
    v.name!=='ttrpgsite'||v.teamId!=='team_x0HgomZNnFpGbnYWHgut76AX'||
    v.previewProtectionEnabled!==true||v.observedEnvMetadataOnly!==true||
    v.currentPreviewIsolatedBackendVerified!==false||
    !Array.isArray(v.sharedSupabaseEnvKeys)||v.sharedSupabaseEnvKeys.length!==2)
  fail('shared Vercel production-preview backend boundary changed');
 const expected=[
  {key:'VITE_SUPABASE_URL',target:['production','preview','development']},
  {key:'VITE_SUPABASE_PUBLISHABLE_KEY',target:['production','preview','development']}
 ];
 if(!eq(v.sharedSupabaseEnvKeys,expected)||
    v.sharedSupabaseEnvKeys.some(x=>Object.hasOwn(x,'value')||
     Object.hasOwn(x,'id')||Object.hasOwn(x,'encryptedValue')))
  fail('shared project environment metadata is no longer matching or is leaking a value');
 if(!exact(m.pricing,['freeProjectMonthlyUsd','branchHourlyUsd',
  'currency','freeActiveProjectLimit','additionalCostAuthorized'])||
    m.pricing.currency!=='USD'||m.pricing.freeProjectMonthlyUsd!==0||
    m.pricing.branchHourlyUsd!==0.01344||
    m.pricing.freeActiveProjectLimit!==2||
    m.pricing.additionalCostAuthorized!==false)
  fail('Free-project vs paid-branch quote changed; no paid fallback');
 const q=m.qaProposal;
 if(!exact(q,['route','preferredOrganizationId','preferredRegion',
  'name','newSupabaseProjectRef','newVercelProjectId','existingVercelSharedVarsWillChange',
  'newBackendCreated','newFrontendCreated','authRedirectsConfigured',
  'original83Bootstrapped','pendingEightApplied','candidateR57R77Installed',
  'testAccountsAreProductionAccounts','operatorConfirmedOrganization',
  'operatorAuthorizedBackendCreate','qaSourceShaDeployed','independentDmP1P2Accepted',
  'physicalFreeMemoryAccepted','productionTouched'])||
  q.route!=='SECOND_FREE_SUPABASE_PROJECT_SEPARATE_VERCEL_QA_PROJECT'||
  q.preferredOrganizationId!==org.id||q.preferredRegion!==prod.region||
  q.name!=='Tabletop Forge QA'||
  q.newSupabaseProjectRef!==null||q.newVercelProjectId!==null||
  q.existingVercelSharedVarsWillChange!==false||
  q.newBackendCreated!==false||q.newFrontendCreated!==false||
  q.authRedirectsConfigured!==false||q.original83Bootstrapped!==false||
  q.pendingEightApplied!==false||q.candidateR57R77Installed!==false||
  q.testAccountsAreProductionAccounts!==false||
  q.operatorConfirmedOrganization!==false||
  q.operatorAuthorizedBackendCreate!==false||
  q.qaSourceShaDeployed!==false||q.independentDmP1P2Accepted!==false||
  q.physicalFreeMemoryAccepted!==false||q.productionTouched!==false)
  fail('unreviewed QA backend creation, user identity or deploy claimed');
 const gates=m.unverifiedGates;
 if(!exact(gates,['authenticatedOriginal83CliFetch','linked83Plus8DryRun',
  'accountOwnerAdminFreeQuota','independentSupabaseUrlAndKey',
  'qaOnlyAuthRedirectAllowlist','independentQaRlsAndSignedSight',
  'originalSourceParity','rollback','realHostedBrowserLatency',
  'freePhysicalRamAndLocks','productionRelease'])||
   Object.values(gates).some(v=>v!==false))
  fail('one or more still-unverified release gates claimed success');
 return Object.freeze({
  workPackage:'B10-R18-95',decision:'NO_GO',
  recommendedQaArchitecture:q.route,
  productionProjectRef:prod.ref,
  newProjectMonthlyCostUsd:m.pricing.freeProjectMonthlyUsd,
  paidBranchHourlyCostUsd:m.pricing.branchHourlyUsd,
  observedActiveProjects:org.activeVisibleProjectCount,
  productionPreviewShareSupabaseEnv:true,
  freeProjectMayBeEligible:true,
  independentQaBackendCreated:false,
  userOrganizationSelectionReceived:false,
  authenticatedMigrationBootstrapVerified:false,
  hostedMovementQaPerformed:false,
  productionOrExistingPreviewChanged:false,
  sourceOnly:true
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('takes no arguments and contacts no service');
  const m=JSON.parse(readFileSync(resolve(ROOT,DEFAULT),'utf8'));
  process.stdout.write(JSON.stringify(validateR95FreeQaIsolation(m),null,2)+'\n');
 }catch(e){
  process.stderr.write(String(e.message)+'\n');
  process.exitCode=1;
 }
}
