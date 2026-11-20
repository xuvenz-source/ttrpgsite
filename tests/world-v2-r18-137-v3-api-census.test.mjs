import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {censusBrowserRoutes,censusSummary,R137_LIVE_ENABLED} from
 '../staging/world-v2-b10-r18-137-v3-api-dependency-census/BrowserApiRouteCensus.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const base='staging/world-v2-b10-r18-137-v3-api-dependency-census/';
const live=read(base+'live-public-api-acl-snapshot.json');
const other=read(base+'live-other-data-surfaces.json');
const plan=read(base+'v3-gameplay-api-coverage-plan.json');
const manifest=read(base+'manifest.json');
const doc=readFileSync(join(root,'docs/testing/world-v2-r18-137-complete-v3-api-dependency-census-2026-11-20.md'),'utf8');
const source=censusBrowserRoutes({root,liveCatalog:live});

test('R137 inherits fully green R136 source-only head and keeps production NO_GO',()=>{
 assert.equal(R137_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-137');
 assert.equal(manifest.parentPr,244);
 assert.equal(manifest.parentSha,'696e720470094eb1a9114aaa3a25ad66bf8d3a2f');
 assert.equal(manifest.parentFinalCi.allPassed,true);
 assert.equal(manifest.release,'NO_GO');
 assert.equal(manifest.productionReleaseAuthorized,false);
 for(const flag of ['noHostedWrites','noAppSourceChanges','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])
  assert.equal(manifest[flag],true,flag);
});
test('R137 exact READ-ONLY public API baseline is 77 functions, 67 definers and 31 relations',()=>{
 assert.equal(live.functionCount,77);
 assert.equal(live.publicSqlFunctions.length,77);
 assert.equal(live.securityDefinerCount,67);
 assert.equal(live.publicSqlFunctions.filter(x=>x.securityDefiner).length,67);
 assert.equal(live.relationCount,31);
 assert.equal(live.publicRelations.length,31);
 assert.equal(live.originalMigrationCount,83);
 assert.equal(live.authenticatedPublicSchemaUsage,true);
 assert.equal(live.liveHostedGatewayInstalled,false);
 assert.equal(new Set(live.publicSqlFunctions.map(x=>x.name+'('+x.arguments+')')).size,77);
 assert.equal(new Set(live.publicRelations.map(x=>x.name)).size,31);
 for(const name of ['get_world_scene_v2','get_world_visibility_v2',
  'get_world_observer_cursor_v2','advance_world_motion_v2',
  'commit_world_motion_v2','begin_world_motion_v2'])
  assert.ok(live.publicSqlFunctions.some(x=>x.name===name&&x.securityDefiner),name);
 assert.equal(live.publicSqlFunctions.some(x=>x.name==='finalize_world_motion_v2'),false,
  'runtime optional atomic finalization RPC is not on original public catalog');
 assert.equal(live.publicRelations.find(x=>x.name==='map_tokens').selectGranted,false);
 assert.ok(live.publicRelations.find(x=>x.name==='map_tokens').insertGranted);
});
test('R137 recognizes 17 realtime publication tables and 3 private buckets as separate surfaces',()=>{
 assert.equal(other.publishedPublicTableCount,17);
 assert.equal(other.publishedPublicTables.length,17);
 assert.equal(new Set(other.publishedPublicTables).size,17);
 assert.equal(other.storageBucketCount,3);
 assert.deepEqual(other.privateStorageBuckets,
  ['battlemap-assets','personal-token-art','tabletop-artwork']);
 assert.equal(other.allStorageBucketsPrivate,true);
 assert.equal(other.noRealtimeSocketRevocationProven,true);
 assert.equal(other.revokedJwtDoesNotInvalidatePreissuedSignedStorageBearerUrl,true);
 for(const name of ['map_tokens','map_environments','characters','campaigns','chat_messages'])
  assert.ok(other.publishedPublicTables.includes(name));
});
test('R137 reads ALL src JS/JSX and records real RPC, direct tables, Realtime, Edge and Storage',()=>{
 assert.equal(source.workPackage,'B10-R18-137');
 assert.equal(source.release,'NO_GO');
 assert.ok(source.sourceFilesScanned>=150,'source census unexpectedly incomplete');
 assert.ok(source.filesWithObservedAccess>=10,'too few source modules inspected');
 assert.ok(source.occurrenceCount>=85,'too few browser call sites discovered');
 assert.ok(source.kindCounts.rpc>=8);
 assert.ok(source.kindCounts.relation>=20);
 assert.ok(source.kindCounts.channel>=2);
 assert.ok(source.dynamicCount>=2);
 assert.ok(source.kindCounts.realtimePostgresChanges>=1);
 assert.equal(source.criticalMissing.length,0,
  'Known critical features must remain present somewhere in source');
 assert.equal(source.staticLexicalScanNotExhaustive,true);
 assert.equal(source.semanticAuthorizationNotReviewed,true);
 const summary=censusSummary(source);
 assert.equal(summary.files,source.sourceFilesScanned);
 assert.equal(summary.callSites,source.occurrenceCount);
 assert.equal(summary.decision,'NO_GO');
});
test('R137 keeps indirect world movement RPCs, missing live functions and other unknown calls explicit',()=>{
 assert.ok(source.criticalNotDirect.includes('rpc:begin_world_motion_v2'));
 assert.ok(source.criticalNotDirect.includes('rpc:advance_world_motion_v2'));
 const authority=readFileSync(join(root,'src/engine/v2/AuthorityClient.js'),'utf8');
 assert.match(authority,/traceRpc\(db,'finalize_world_motion_v2'/);
 assert.match(authority,/const response=await db\.rpc\(name,params\)/);
 assert.ok(source.occurrences.some(x=>x.path==='src/engine/v2/AuthorityClient.js'&&
  x.kind==='rpc'&&x.dynamic));
 assert.ok(source.occurrences.some(x=>x.path==='src/engine/v2/VisibilityController.js'&&
  x.kind==='rpc'&&x.dynamic));
 assert.ok(source.occurrences.every(x=>statSync(join(root,x.path)).isFile()));
 assert.ok(source.occurrences.every(x=>x.line>0&&x.offset>=0));
});
test('R137 detects concrete required scene, campaign, sheet and storage integrations',()=>{
 const rpcs=source.staticTargets.rpc;
 const tables=source.staticTargets.relation;
 for(const name of ['get_world_scene_v2','get_world_observer_cursor_v2',
  'get_authorized_map_navigation','patch_campaign_sheet_noninventory',
  'get_campaign_account_names','transfer_campaign_inventory_item'])
  assert.ok(rpcs.includes(name),'missing known RPC literal '+name);
 for(const name of ['campaigns','campaign_members','battle_maps','characters',
  'map_tokens','map_environments','npc_templates','chat_messages'])
  assert.ok(tables.includes(name),'missing original direct relation '+name);
 assert.ok(source.staticTargets.edgeFunction.includes('username-update'));
 assert.ok(source.staticTargets.storageBucket.includes('tabletop-artwork'));
 const srcTabletop=source.occurrences.filter(x=>x.path==='src/TabletopApp.jsx');
 assert.ok(srcTabletop.length>=40);
 assert.ok(srcTabletop.some(x=>x.kind==='realtimePostgresChanges'));
 assert.ok(source.occurrences.some(x=>x.path==='src/SignedAssetUrls.js'&&
  x.kind==='storageBucket'&&x.dynamic));
});
test('R137 coverage plan keeps every gameplay route unapproved without semantic review',()=>{
 assert.equal(plan.routeCount,12);
 assert.equal(plan.featureRoutes.length,12);
 assert.ok(plan.featureRoutes.every(x=>x.state!=='READY'));
 assert.equal(plan.stagedV3RouteCount,1);
 assert.equal(plan.liveV3RouteCount,0);
 assert.equal(plan.reviewedUsableCompleteV3GameplayRoutes,0);
 assert.equal(plan.allGameplayRoutesCovered,false);
 assert.equal(plan.allOriginalPrivilegesAudited,false);
 assert.equal(plan.legacyPublicSchemaCanBeReopened,false);
 assert.equal(plan.countedLiveSurface.authenticatedPublicFunctionGrants,77);
 assert.equal(plan.countedLiveSurface.authenticatedSecurityDefinerFunctions,67);
 assert.equal(plan.countedLiveSurface.publicRelations,31);
 assert.equal(plan.countedLiveSurface.realtimePublishedPublicTables,17);
 assert.equal(plan.countedLiveSurface.privateStorageBuckets,3);
 assert.ok(plan.requiredAuditGates.some(x=>x.includes('grant')||x.includes('GRANT')));
 for(const row of plan.featureRoutes){
  assert.ok(row.source.length>=1,row.feature);
  assert.ok(row.legacy.length>=1,row.feature);
  assert.ok(row.proposed.length>=30,row.feature);
  assert.ok(row.required.length>=30,row.feature);
  assert.ok(['P0','P1'].includes(row.priority));
 }
});
test('R137 work package explicitly prevents legacy API unseal and unaudited V3 exposure',()=>{
 assert.equal(manifest.originalMigrations,83);
 assert.equal(manifest.qaMigrations,0);
 assert.equal(manifest.qaPublicTables,0);
 assert.equal(manifest.customV3PostgrestSchemaExposed,false);
 assert.equal(manifest.originalPublicSchemaUsageRevokedOnHosted,false);
 assert.equal(manifest.approvedV3GameplayEndpoints,0);
 assert.equal(manifest.signedHostedQaPassed,false);
 assert.equal(manifest.oldV2ConnectedSocketCutoffProven,false);
 assert.equal(manifest.storageRevocationRemediated,false);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const phrase of ['R18-138','NO_GO','67','77','31','17','Storage',
  'Postgres Changes','signed','dynamic','scene','movement','fog','83'])
  assert.ok(doc.toLowerCase().includes(phrase.toLowerCase()),phrase);
});
