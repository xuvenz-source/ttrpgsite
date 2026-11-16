/**
 * R18-96 — pure, offline verification of a connected provider provisioning
 * receipt. This is a historical metadata check; it is NOT a live API probe or
 * a migration/deployment permission. Never record API key values in the file.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const MANIFEST='staging/world-v2-b10-r18-96-free-qa-provisioning/manifest.json';
const fail=reason=>{throw Error('R96 QA NO-GO: '+reason)};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const falseFlags=o=>o&&Object.values(o).every(x=>x===false);

export function validateR96QaProvisioning(m){
 if(!exact(m,['schema','workPackage','decision','parentPr','parentSha',
   'observedDateLocal','evidenceType','authorization','cost',
   'production','qaSupabase','qaVercel','unverifiedGates'])||
   m.schema!==1||m.workPackage!=='B10-R18-96'||m.decision!=='NO_GO'||
   m.parentPr!==197||
   m.parentSha!=='abfbceddef010eef7cca246bcd6e67bc5e09827f'||
   m.observedDateLocal!=='2026-11-16'||
   m.evidenceType!=='LIVE_CONNECTED_PROVIDER_METADATA')
  fail('parent, provenance, schema or NO_GO changed');
 const a=m.authorization,c=m.cost,p=m.production,s=m.qaSupabase,v=m.qaVercel;
 if(!exact(a,['organizationExplicitlyConfirmed','organizationId','onlyVerifiedZeroCostResources'])||
  a.organizationExplicitlyConfirmed!==true||
  a.organizationId!=='uukoiflquxqdszrzgoyg'||a.onlyVerifiedZeroCostResources!==true||
  !exact(c,['supabaseProjectMonthlyUsd','paidBranchCreated',
            'vercelAdditionalProjectMonthlyPriceVerified','vercelDeploymentsCreated'])||
  c.supabaseProjectMonthlyUsd!==0||c.paidBranchCreated!==false||
  c.vercelAdditionalProjectMonthlyPriceVerified!==false||
  c.vercelDeploymentsCreated!==0)
  fail('org consent, independent cost or paid-resource gate changed');
 if(!exact(p,['supabaseRef','supabasePostflightStatus','vercelProjectId',
   'existingVercelEnvironmentVariablesEdited','existingQaAliasRepointed',
   'productionSqlApplied','productionDeploymentCreated'])||
   p.supabaseRef!=='lwhwgqaunxbmvyndswze'||
   p.supabasePostflightStatus!=='ACTIVE_HEALTHY'||
   p.vercelProjectId!=='prj_JvLavoId5bra74h24BDL7ZyMKizN'||
   p.existingVercelEnvironmentVariablesEdited!==false||
   p.existingQaAliasRepointed!==false||
   p.productionSqlApplied!==false||
   p.productionDeploymentCreated!==false)
  fail('original production isolation weakened');
 if(!exact(s,['projectRef','name','organizationId','region','status',
    'apiUrl','postgresMajor','registeredMigrations',
    'modernPublishableKeyAvailable','keyValueRecorded','productionUserOrCampaignDataCopied'])||
   s.projectRef!=='bgydsamxypjslergfpla'||s.projectRef===p.supabaseRef||
   s.name!=='Tabletop Forge QA'||s.organizationId!==a.organizationId||
   s.region!=='ap-northeast-1'||s.status!=='ACTIVE_HEALTHY'||
   s.apiUrl!=='https://bgydsamxypjslergfpla.supabase.co'||
   s.postgresMajor!==17||s.registeredMigrations!==0||
   s.modernPublishableKeyAvailable!==true||s.keyValueRecorded!==false||
   s.productionUserOrCampaignDataCopied!==false)
  fail('blank isolated QA Supabase snapshot compromised');
 const expectedVars=[
  {key:'VITE_SUPABASE_URL',target:['preview','development'],type:'encrypted'},
  {key:'VITE_SUPABASE_PUBLISHABLE_KEY',target:['preview','development'],type:'encrypted'}
 ];
 if(!exact(v,['projectId','name','teamId','framework','linkedGitRepository',
    'live','deploymentCount','protectedByVercelAuthentication','environmentMetadata',
    'qaPublishableKeyConfigured','productionTargetVariablesSet',
    'serviceRoleOrSecretKeyConfigured'])||
   v.projectId!=='prj_49bkFS9Ti4FoPa38LjNNxjgEaZwX'||
   v.projectId===p.vercelProjectId||v.name!=='tabletop-forge-qa'||
   v.teamId!=='team_x0HgomZNnFpGbnYWHgut76AX'||
   v.framework!=='vite'||v.linkedGitRepository!==false||
   v.live!==false||v.deploymentCount!==0||
   v.protectedByVercelAuthentication!==true||
   !same(v.environmentMetadata,expectedVars)||
   v.qaPublishableKeyConfigured!==true||
   v.productionTargetVariablesSet!==false||
   v.serviceRoleOrSecretKeyConfigured!==false)
  fail('QA-only Vercel scope, protection or deployment boundary changed');
 const g=m.unverifiedGates;
 const gateKeys=['original83SchemasBootstrapped','pendingEightInstalled',
   'optionalR57R77Installed','qaAuthenticationAndRedirectsVerified',
   'hostedSignedDmP1PassiveP2Validated','signedFogAndCollisionAcceptance',
   'browserP95AndRealtimeAccepted','freeTierRamSwapLocksMeasured',
   'officialLinkedCli83Plus8DryRun','productionReleaseAuthorized'];
 if(!exact(g,gateKeys)||!falseFlags(g))fail('unverified gameplay/SQL release asserted');
 const raw=JSON.stringify(m);
 if(/"(?:(?:service|secret)[_-]?role|(?:access|refresh)[_-]?token|(?:api|publishable)[_-]?key(?:value)?|password|private[_-]?key)"\s*:/i.test(raw))
  fail('secret value field introduced');
 return Object.freeze({
  workPackage:'B10-R18-96',decision:'NO_GO',qaSupabaseRef:s.projectRef,
  qaVercelProjectId:v.projectId,isolatedBackendProvisioned:true,
  qaSchemasInstalled:false,qaFrontendDeployed:false,
  hostedMovementAcceptanceVerified:false,productionTouched:false,
  productionReleaseAuthorized:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)fail('no arguments or network calls accepted');
  const m=JSON.parse(readFileSync(resolve(ROOT,MANIFEST),'utf8'));
  process.stdout.write(JSON.stringify(validateR96QaProvisioning(m),null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
