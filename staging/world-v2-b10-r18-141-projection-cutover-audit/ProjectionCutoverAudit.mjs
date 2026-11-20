/**
 * B10-R18-141 SOURCE-ONLY. Reconcile read-only live catalog metadata
 * against the actual browser subscriptions and known V2/Storage sources.
 * This is neither an authorization engine nor a production cutover switch.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {scanRealtimeSubscriptions,compareSubscriptionBaselines} from
 '../world-v2-b10-r18-130-rpc-realtime-subscription-audit/SourceRealtimeSubscriptionAudit.mjs';
import {auditGameplayContracts} from
 '../world-v2-b10-r18-139-gameplay-contract-gate-probe/GameplayContractAudit.mjs';

export const R141_LIVE_ENABLED=false;
const expected=Object.freeze([
 'battle_maps','campaign_handouts','campaign_map_pins','campaign_members',
 'campaign_tool_issues','characters','map_combat_entries',
 'map_environments','map_tokens','npc_templates'
]);
const requiredFields=Object.freeze({
 battle_maps:['storage_path'],
 campaign_handouts:['body'],
 campaign_map_pins:['x','y','visible'],
 campaign_members:['user_id','role'],
 campaign_tool_issues:['config','state'],
 characters:['field_values','portrait_path','token_path'],
 map_combat_entries:['token_id','die_roll','modifier'],
 map_environments:['prepared','live'],
 map_tokens:['npc_values','npc_template_id','character_id'],
 npc_templates:['field_values','portrait_path','token_path']
});
const expectedBuckets=Object.freeze([
 'battlemap-assets','personal-token-art','tabletop-artwork'
]);
export const R141_REQUIRED_BARRIERS=Object.freeze([
 'original_67_definers_semantically_reviewed',
 'original_31_relations_row_and_field_projection_reviewed',
 'all_77_public_rpc_routes_decided',
 'all_19_pg_changes_consumers_quarantined',
 'all_17_public_realtime_tables_fenced_or_scoped',
 'all_old_v2_senders_and_fanout_fenced',
 'already_joined_old_v2_sockets_receive_no_private_bytes',
 'synchronous_host_mask_and_abort_before_async_teardown',
 'server_signed_recipient_epoch_scene_and_sight',
 'post_revoke_storage_bearer_url_access_denied',
 'untrusted_player_preview_cannot_see_dm_assets',
 'real_dm_p1_p2_outsider_revoked_rejoined_multitab_qa',
 'real_collision_los_fog_and_free_tier_p95',
 'human_r127_release_record_and_fenced_rollback'
]);
const reject=msg=>{throw Error('R141 SOURCE SECURITY DRIFT: '+msg)};
const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
const sorted=x=>[...x].sort();
function verifySnapshot(snap){
 if(!snap||snap.workPackage!=='B10-R18-141'||
   snap.originalMigrationCount!==83||snap.qaMigrationCount!==0||
   snap.qaApplicationTables!==0||snap.originalAuthenticatedPublicFunctions!==77||
   snap.originalAuthenticatedPublicSecurityDefiners!==67||
   snap.originalPublicTablesAndViews!==31||
   snap.realtimePublishedTableCount!==17||
   snap.postgreChangesSourceHandlers!==19||
   snap.hostedV3ApiSchemaInstalled!==false||
   snap.originalPublicSchemaAuthenticatedUsage!==true||
   snap.originalFunctionBodiesAllReviewed!==false||
   snap.actualSignedAuthorizationVerified!==false)
  reject('unexpected live original/QA evidence baseline');
 if(!Array.isArray(snap.tables)||!same(sorted(snap.tables.map(x=>x.name)),expected))
  reject('10-table sensitive projection inventory changed');
 for(const t of snap.tables){
  if(t.rls!==true||typeof t.policyCount!=='number'||t.policyCount<1||
     !Array.isArray(t.columns)||!Array.isArray(t.sensitive)||
     !t.projection||!t.policy||
     !same(sorted(t.sensitive),sorted(requiredFields[t.name])))
   reject('incomplete projection or policy review: '+t.name);
  for(const field of t.sensitive)
   if(!t.columns.includes(field))reject('missing observed column '+t.name+'.'+field);
  if(t.name==='map_tokens'){
   if(t.authenticatedSelect!==false)reject('no direct map_tokens SELECT allowed');
  }else if(t.authenticatedSelect!==true){
   reject('authenticated table grant drift '+t.name);
  }
 }
 if(!Array.isArray(snap.storageBuckets)||
    !same(sorted(snap.storageBuckets.map(b=>b.id)),expectedBuckets)||
    snap.storageBuckets.some(b=>b.public!==false)||
    snap.signedAssetUrlSecondsInSource!==3600||
    snap.signedStorageUrlRevocationVerified!==false||
    snap.oldSocketEjectionVerified!==false)
  reject('storage bearer or old-socket boundary drift');
 if(!Array.isArray(snap.publishedTables)||snap.publishedTables.length!==17||
  new Set(snap.publishedTables).size!==17||
  !snap.publishedTables.includes('map_tokens')||
  !snap.publishedTables.includes('characters'))
  reject('Realtime published table metadata changed');
}
export function auditR141({root=process.cwd(),snapshot,subscriptionRows}={}){
 const read=p=>readFileSync(join(root,p),'utf8');
 const snap=snapshot??JSON.parse(read(
  'staging/world-v2-b10-r18-141-projection-cutover-audit/live-original-projection-metadata.json'));
 verifySnapshot(snap);
 const baseline=JSON.parse(read(
  'staging/world-v2-b10-r18-130-rpc-realtime-subscription-audit/client-subscription-baseline.json'));
 const rows=subscriptionRows??scanRealtimeSubscriptions(root);
 const match=compareSubscriptionBaselines(rows,baseline.subscriptions,snap.publishedTables);
 if(match.status!=='SOURCE_PARITY_NO_GO'||match.problems.length||
   match.counts.handlers!==19||match.counts.files!==7||
   match.counts.deleteCapable!==16||match.counts.dynamicTableBindings!==1||
   rows.some(x=>x.hasSelect||!x.hasFilter))
  reject('R130 listener source inventory changed: '+match.problems.join(','));
 const staged=auditGameplayContracts({root});
 if(staged.r138DynamicClassified!==26||staged.r139ExactCallsiteGroups!==6)
  reject('R139 dynamic API source inventory drifted');
 const image=read('src/SignedAssetUrls.js');
 if(!image.includes('createSignedUrl(path,3600)')||
    !image.includes('epoch++')||!image.includes('clear(){'))
  reject('original browser signed URL cache semantics changed');
 const scene=read('src/engine/v2/SceneTransport.js');
 const observer=read('src/engine/v2/RealtimeTransport.js');
 if(!scene.includes("'forge-world-scene-v2:'")||
    !observer.includes("'forge-world-v2:'")||
    !scene.includes('removeChannel(')||
    !observer.includes('removeChannel('))
  reject('legacy V2 topic/subscription assumptions changed');
 const handouts=read('src/useCampaignHandouts.js');
 const app=read('src/TabletopApp.jsx');
 if(!handouts.includes("db.from('campaign_handouts')")||
    !handouts.includes(".select('*')")||
    !app.includes("db.from('characters').select('*')")||
    !app.includes("db.from('npc_templates').select('*')"))
  reject('original broad-table source usage changed');
 const old=read('staging/world-v2-b10-r18-131-stream-quarantine-contract/StreamRevocationQuarantine.mjs');
 if(!old.includes('R131_LIVE_ENABLED=false')||
    !old.includes('serverAuthorizationProven:false')||
    !old.includes('oldSocketDeliveryStopped:false'))
  reject('inherited source-only stream quarantine claims drifted');
 const bridge=read('staging/world-v2-b10-r18-135-v3-client-bridge-cutover/ObserverV3ChannelBridge.mjs');
 if(!bridge.includes('R135_LIVE_ENABLED=false')||
    !bridge.includes('liveSocketRevocationProven:false')||
    !bridge.includes('allOldSendersFencedProven:false'))
  reject('inherited V3 bridge risk boundary drifted');
 return Object.freeze({
  workPackage:'B10-R18-141',decision:'NO_GO',sourceOnly:true,
  liveSourceImported:false,hostedTablesInspected:10,
  originalPrivilegedRpcInventory:67,originalAuthenticatedFunctionInventory:77,
  originalRelationInventory:31,publishedRealtimeTables:17,
  postgresChangesListeners:19,deleteCapableListeners:16,
  privateStorageBuckets:3,preissuedUrlMaxSecondsObservedInClient:3600,
  projections: Object.freeze(snap.tables.map(t=>Object.freeze({
   table:t.name,hasAuthenticatedSelectGrant:t.authenticatedSelect,
   rls:true,fieldsRequiringScopedReview:Object.freeze([...t.sensitive]),
   policyDescription:t.policy,proposedProjectionConstraint:t.projection,
   signedActorQaProven:false,approvedV3Route:false
  }))),
  blockers:R141_REQUIRED_BARRIERS,
  allSourceDriftChecksPassed:true,clientMaskIsServerRevocation:false,
  clientAssetClearRevokesIssuedSignedUrls:false,
  allOriginalBodiesAudited:false,releaseAuthorized:false
 });
}
/**
 * Documentation-only sequence. Never callable as an activation switch.
 * A client-supplied "allChecksPassed" flag has no release authority.
 */
export function describeFailClosedCutover(evidence={}){
 const ordered=Object.freeze([
  '1: server R128/old-client and old sender fences, explicit trusted release approval',
  '2: synchronous host-wide hide; cancel movement and in-flight data reads',
  '3: invalidate scene/sight/fog/roster and clear local signed asset references',
  '4: quarantine all 19 Postgres Changes consumers and retire V2 scene/observer channels',
  '5: treat failed removeChannel or unconfirmed mask as terminal; never reuse topics',
  '6: separately prove preissued Storage bearer URLs cannot disclose revoked assets',
  '7: verify server-issued current V3 recipient epoch and signed actor/map membership',
  '8: require fresh authorized scene, sight, fog, light and navigation before unmask',
  '9: signed DM/P1/P2/outsider/revoked/rejoined/multi-tab tests and free-tier performance',
  '10: human R127 approval and fenced-only rollback drill'
 ]);
 return Object.freeze({
  decision:'NO_GO',readyToDeploy:false,
  approvedFromClientEvidence:false,
  claimedPrerequisites:Boolean(evidence&&evidence.allChecksPassed===true),
  prerequisitesUnverified:R141_REQUIRED_BARRIERS,
  steps:ordered,
  sourceOnly:true,serverSideOldSocketDeliveryStopped:false,
  preissuedStorageBearerRevocationProven:false
 });
}
