import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanRealtimeSubscriptions} from
 '../staging/world-v2-b10-r18-130-rpc-realtime-subscription-audit/SourceRealtimeSubscriptionAudit.mjs';
import {R141_LIVE_ENABLED,R141_REQUIRED_BARRIERS,
 auditR141,describeFailClosedCutover} from
 '../staging/world-v2-b10-r18-141-projection-cutover-audit/ProjectionCutoverAudit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='staging/world-v2-b10-r18-141-projection-cutover-audit/';
const read=p=>readFileSync(join(root,p),'utf8');
const snap=JSON.parse(read(base+'live-original-projection-metadata.json'));
const manifest=JSON.parse(read(base+'manifest.json'));
const doc=read('docs/testing/world-v2-r18-141-projection-cutover-audit-2026-11-21.md');
const clone=x=>JSON.parse(JSON.stringify(x));

test('R141 exact read-only original SQL/Storage schema and inherited staged lineage',()=>{
 const v=auditR141({root});
 assert.equal(R141_LIVE_ENABLED,false);
 assert.equal(v.decision,'NO_GO');
 assert.equal(v.hostedTablesInspected,10);
 assert.equal(v.originalPrivilegedRpcInventory,67);
 assert.equal(v.originalAuthenticatedFunctionInventory,77);
 assert.equal(v.originalRelationInventory,31);
 assert.equal(v.publishedRealtimeTables,17);
 assert.equal(v.postgresChangesListeners,19);
 assert.equal(v.deleteCapableListeners,16);
 assert.equal(v.privateStorageBuckets,3);
 assert.equal(v.preissuedUrlMaxSecondsObservedInClient,3600);
 assert.equal(v.allSourceDriftChecksPassed,true);
 assert.equal(v.releaseAuthorized,false);
 assert.equal(v.liveSourceImported,false);
 assert.equal(v.allOriginalBodiesAudited,false);
 assert.equal(v.clientAssetClearRevokesIssuedSignedUrls,false);
 assert.equal(manifest.parentPr,248);
 assert.equal(manifest.parentSha,'8203f37052c4d7896635999befe3f8247095613b');
 assert.equal(manifest.originalMigrationCount,83);
 assert.equal(manifest.qaMigrationCount,0);
 assert.equal(manifest.qaPublicApplicationTables,0);
});
test('R141 requires explicit field minimization even when RLS and SELECT exist',()=>{
 const v=auditR141({root});
 const by=Object.fromEntries(v.projections.map(x=>[x.table,x]));
 for(const entry of v.projections){
  assert.equal(entry.rls,true,entry.table);
  assert.equal(entry.approvedV3Route,false,entry.table);
  assert.equal(entry.signedActorQaProven,false,entry.table);
  assert.ok(entry.fieldsRequiringScopedReview.length>0,entry.table);
 }
 for(const [table,field] of [
  ['characters','field_values'],['npc_templates','field_values'],
  ['map_tokens','npc_values'],['map_environments','prepared'],
  ['map_environments','live'],['campaign_handouts','body'],
  ['campaign_map_pins','x'],['map_combat_entries','token_id'],
  ['campaign_tool_issues','state'],['battle_maps','storage_path']
 ]){
  assert.ok(by[table].fieldsRequiringScopedReview.includes(field),table+'.'+field);
 }
 assert.equal(by.map_tokens.hasAuthenticatedSelectGrant,false);
 assert.equal(by.characters.hasAuthenticatedSelectGrant,true);
 assert.equal(by.map_environments.hasAuthenticatedSelectGrant,true);
 assert.equal(by.map_combat_entries.hasAuthenticatedSelectGrant,true);
 assert.equal(snap.originalPublicSchemaAuthenticatedUsage,true);
 assert.equal(snap.hostedV3ApiSchemaInstalled,false);
 assert.equal(snap.reviewedFunctionExamples.find(x=>x.name==='get_campaign_sheet_inventory')
  .behaviour.includes('WRITES'),true);
});
test('R141 R130 full-source subscription drift catches additional or missing handler',()=>{
 const rows=scanRealtimeSubscriptions(root);
 assert.equal(rows.length,19);
 assert.equal(rows.filter(x=>x.hasSelect).length,0);
 assert.equal(rows.filter(x=>x.includesDelete).length,16);
 const dropped=rows.slice(1);
 assert.throws(()=>auditR141({root,subscriptionRows:dropped}),/listener source inventory changed/);
 const extra=[...rows,rows[0]];
 assert.throws(()=>auditR141({root,subscriptionRows:extra}),/listener source inventory changed/);
});
test('R141 static catalog drift fails closed and cannot accidentally grant token reads',()=>{
 const changed=clone(snap);
 changed.tables.find(x=>x.name==='map_tokens').authenticatedSelect=true;
 assert.throws(()=>auditR141({root,snapshot:changed}),/no direct map_tokens SELECT allowed/);
 const bare=clone(snap);
 bare.tables.find(x=>x.name==='campaign_handouts').columns=
  bare.tables.find(x=>x.name==='campaign_handouts').columns.filter(x=>x!=='body');
 assert.throws(()=>auditR141({root,snapshot:bare}),/missing observed column/);
 const bucket=clone(snap);
 bucket.storageBuckets[0].public=true;
 assert.throws(()=>auditR141({root,snapshot:bucket}),/storage bearer or old-socket boundary drift/);
 const publicApi=clone(snap);
 publicApi.hostedV3ApiSchemaInstalled=true;
 assert.throws(()=>auditR141({root,snapshot:publicApi}),/unexpected live original\/QA/);
});
test('R141 does not turn browser claims or local teardown into release authorization',()=>{
 assert.equal(R141_REQUIRED_BARRIERS.length,14);
 const none=describeFailClosedCutover();
 const forged=describeFailClosedCutover({allChecksPassed:true,oldSocketsDead:true,
  storageAlreadyRevoked:true,version:'v3',dm:true});
 for(const v of [none,forged]){
  assert.equal(v.decision,'NO_GO');
  assert.equal(v.readyToDeploy,false);
  assert.equal(v.approvedFromClientEvidence,false);
  assert.equal(v.serverSideOldSocketDeliveryStopped,false);
  assert.equal(v.preissuedStorageBearerRevocationProven,false);
  assert.equal(v.steps.length,10);
  assert.equal(v.prerequisitesUnverified.length,14);
  assert.ok(v.steps.some(s=>s.includes('synchronous host-wide hide')));
  assert.ok(v.steps.some(s=>s.includes('preissued Storage bearer URLs')));
 }
 assert.equal(forged.claimedPrerequisites,true);
 assert.equal(none.claimedPrerequisites,false);
});
test('R141 manifest and handoff are entirely non-deployable',()=>{
 assert.equal(manifest.workPackage,'B10-R18-141');
 assert.equal(manifest.decision,'NO_GO');
 for(const key of ['noHostedWrites','noVersionedMigrations','noRuntimeSourceEdits',
  'noRelease','noMerge','noDeploy','noPaidResources','noNewGrants'])
  assert.equal(manifest[key],true,key);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 assert.equal(manifest.productionReleaseAuthorized,false);
 assert.equal(manifest.executableV3GameplayAdded,0);
 assert.equal(manifest.signedDmP1P2OutsiderQa,'NOT_RUN');
 assert.equal(manifest.freeTierLatency,'NOT_MEASURED');
 for(const s of ['R18-141','R128','R131','R135','R140','NO_GO',
  'characters','map_environments','map_tokens','get_campaign_sheet_inventory',
  '19 Postgres Changes','17 published','old socket','3600','Storage','R127',
  'DM','P1','P2','outsider','free-tier'])
  assert.ok(doc.toLowerCase().includes(s.toLowerCase()),s);
});
