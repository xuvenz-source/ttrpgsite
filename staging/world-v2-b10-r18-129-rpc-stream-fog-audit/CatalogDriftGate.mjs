/**
 * B10-R18-129 SOURCE-ONLY audit helper. No host/network/database access.
 * Compares a freshly provided *metadata-only* catalog observation with a
 * read-only observed pin. It neither fetches SQL nor trusts client identity.
 * Matching a pin proves only catalog parity, NOT permissions or revocation.
 */
export const R129_LIVE_ENABLED=false;
const MD5=/^[0-9a-f]{32}$/;
const sort=values=>[...values].sort((a,b)=>a.localeCompare(b));
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const isRecord=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const asNames=a=>Array.isArray(a)?sort(a.map(x=>x.name)):[];
export function verifyCatalogDrift(pinned,observed){
 const problems=[];
 const add=s=>{if(!problems.includes(s))problems.push(s)};
 if(!isRecord(pinned)||!isRecord(observed)){
  return Object.freeze({status:'CATALOG_UNVERIFIED',problems:Object.freeze(['invalid_metadata']),
   securityReleaseAuthorized:false,hostedActionPerformed:false});
 }
 if(pinned.workPackage!=='B10-R18-129'||pinned.source!=='READ_ONLY live original PostgreSQL catalog; never user records')
  add('unrecognized_pin');
 if(observed.originalProjectRef!==pinned.originalProjectRef||
  observed.source!==pinned.source)add('source_identity_mismatch');
 for(const k of ['publicSecurityDefinerAuthenticatedCallableCount',
  'directGuardTextAbsentCount','realtimePublisherFunctionCount',
  'realtimePublicationTableCount']){
  if(!Number.isSafeInteger(observed[k])||observed[k]!==pinned[k])
   add('count_drift_'+k);
 }
 for(const k of ['appSchemaFunctionCounts','authHasSchemaUsage',
  'realtimeMessagesPolicyCounts','fogMetadataOracle']){
  if(!same(observed[k],pinned[k]))add('metadata_drift_'+k);
 }
 for(const k of ['publicationRlsEnabledForAll17','campaignMembersPublished',
   'originalV2SharedScenePolicyExists']){
  if(observed[k]!==pinned[k])add('publication_drift_'+k);
 }
 for(const k of ['authSelectPrivilegeMissingOn','supabaseRealtimePublicationTables']){
  if(!Array.isArray(observed[k])||!same(sort(observed[k]),sort(pinned[k])))
   add('publication_membership_drift_'+k);
 }
 for(const [field,expectedField] of [
  ['directGuardTextAbsent','directGuardTextAbsentCount'],
  ['realtimePublishers','realtimePublisherFunctionCount']]){
  const a=pinned[field],z=observed[field];
  if(!Array.isArray(a)||!Array.isArray(z)||
   !same(asNames(a),asNames(z))||a.length!==pinned[expectedField]||
   z.length!==observed[expectedField]){add('function_set_drift_'+field);continue;}
  const baseline=new Map(a.map(f=>[f.name,f]));
  for(const f of z){
   const prev=baseline.get(f.name);
   if(!isRecord(f)||!prev||!MD5.test(f.sourceMd5||'')||
    f.sourceMd5!==prev.sourceMd5||
    (field==='directGuardTextAbsent'&&f.classification!==prev.classification)||
    (field==='realtimePublishers'&&f.schema!==prev.schema)){
    add('function_definition_drift_'+field);break;
   }
  }
 }
 if(observed.publicSecurityDefinerAuthenticatedCallableCount!==67||
    observed.directGuardTextAbsentCount!==15||
    observed.realtimePublisherFunctionCount!==7||
    observed.realtimePublicationTableCount!==17)
   add('unexpected_baseline_cardinality');
 if(observed.authHasSchemaUsage?.forge_world_v2!==false||
    observed.authHasSchemaUsage?.forge_visibility!==false)
   add('private_schema_exposure');
 if(observed.fogMetadataOracle?.directMembershipOrMapAuthorizationCheck!==false)
   add('fog_oracle_state_changed');
 return Object.freeze({
  status:problems.length?'CATALOG_DRIFT_NO_GO':'CATALOG_METADATA_MATCH_NO_GO',
  problems:Object.freeze(problems),
  securityReleaseAuthorized:false,
  hostedActionPerformed:false,
  privilegedRpcChainsProven:false,
  realtimeConnectedSocketsProvenRevoked:false,
  signedUserQaProven:false,
  catalogParity:problems.length===0
 });
}
