import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAuthorizedNavigation} from '../src/AuthorizedNavigation.js';
import {normalizeAuthorizedFogFrame} from '../src/MapFogModel.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migrationFiles=[
 'supabase/migrations/20261109000100_authorized_predictive_navigation.sql',
 'supabase/migrations/20261109000200_private_verified_visibility_deltas.sql',
 'supabase/migrations/20261109000300_navigation_scene_revisions.sql'
];
const [navigationSql,privateSql,revisionSql]=migrationFiles.map(source);
const map='00000000-0000-4000-8000-000000000001';
const piece='00000000-0000-4000-8000-000000000002';
const epoch='00000000-0000-4000-8000-000000000003';
const frame=(revision,permissionGeneration=5,environmentRevision=8)=>({
 mapId:map,protocolVersion:2,deltaProtocolVersion:1,epoch,
 revision,sequence:revision,width:20,height:20,enabled:true,
 collisionEnabled:true,partyShared:false,
 permissionGeneration,navigationEnvironmentRevision:environmentRevision,
 visible:[0,1,20,21],explored:[0,1,20,21]
});
const issuedGrant=(visibilityRevision=3,permissionGeneration=5,environmentRevision=8)=>({
 version:1,mapId:map,pieceId:piece,kind:'token',origin:[0,0],
 gridWidth:20,gridHeight:20,visibilityRevision,environmentRevision,
 permissionGeneration,collisionEnabled:true,footprint:[1,1],
 nodes:[[0,0,5],[1,0,4],[0,1,1],[1,1,0]]
});

test('all three staged migrations preserve one ordered, private movement protocol',()=>{
 assert.equal(migrationFiles.length,3);
 assert.match(navigationSql,/CREATE OR REPLACE FUNCTION public\.get_authorized_map_navigation\(/i);
 assert.match(privateSql,/ADD COLUMN IF NOT EXISTS authorized_frame jsonb/i);
 assert.match(privateSql,/CREATE OR REPLACE FUNCTION forge_visibility\.bump_viewer_ticks\(/i);
 assert.match(revisionSql,/CREATE OR REPLACE FUNCTION public\.get_authorized_map_fog_v2\(/i);
 assert.match(revisionSql,/CREATE OR REPLACE FUNCTION public\.get_authorized_map_fog_delta\(/i);
 assert.match(privateSql,/REVOKE ALL ON FUNCTION forge_visibility\.authorized_viewer_fog_frame/i);
 assert.match(privateSql,/REVOKE ALL ON FUNCTION forge_visibility\.bump_viewer_ticks/i);
 assert.match(navigationSql,/REVOKE ALL ON TABLE forge_visibility\.navigation_permission_generations/i);
 assert.match(navigationSql,/REVOKE ALL ON FUNCTION forge_visibility\.bump_navigation_permission_generation/i);
 assert.match(navigationSql,/REVOKE ALL ON FUNCTION public\.get_authorized_map_navigation\(uuid,text,uuid\)\s+FROM PUBLIC,anon/i);
 assert.match(revisionSql,/REVOKE ALL ON FUNCTION public\.get_authorized_map_fog_v2\(uuid\) FROM PUBLIC,anon/i);
 assert.match(revisionSql,/REVOKE ALL ON FUNCTION public\.get_authorized_map_fog_delta\(uuid,uuid,bigint,bigint\)/i);
});

test('navigation SQL avoids unsupported pg_catalog-qualified special expressions',()=>{
 const all=[navigationSql,privateSql,revisionSql].join('\n');
 assert.doesNotMatch(all,/pg_catalog\.(?:greatest|least)\s*\(/i);
 assert.match(navigationSql,/\bGREATEST\(/);
 assert.match(navigationSql,/\bLEAST\(/);
 assert.match(navigationSql,/pg_catalog\.pg_try_advisory_xact_lock/);
 assert.match(navigationSql,/pg_catalog\.hashtextextended/);
});

test('map geometry, collision and permission generation must agree with private fog frame',()=>{
 assert.match(navigationSql,/fog_frame->>'navigationEnvironmentRevision'/);
 assert.match(navigationSql,/fog_frame->>'permissionGeneration'/);
 assert.match(navigationSql,/fog_frame->>'collisionEnabled'/);
 assert.match(navigationSql,/Navigation permissions changed during authorization/);
 assert.match(navigationSql,/AND \(dm OR c\.user_id=actor\)/);
 assert.match(revisionSql,/'permissionGeneration',coalesce\(\(select g\.generation/i);
 assert.match(privateSql,/'permissionGeneration',current_frame->'permissionGeneration'/);
 assert.match(revisionSql,/'permissionGeneration',current_frame->'permissionGeneration'/);
});

test('trigger coverage revokes movement on token and shared-tool insert, update or delete',()=>{
 assert.match(navigationSql,/CREATE TRIGGER forge_navigation_token_permissions\s+AFTER INSERT OR DELETE OR\s+UPDATE OF/);
 assert.match(navigationSql,/CREATE TRIGGER forge_navigation_tool_permissions\s+AFTER INSERT OR DELETE OR\s+UPDATE OF/);
 assert.match(navigationSql,/IF TG_OP='INSERT' THEN/g);
 assert.match(navigationSql,/ELSIF TG_OP='DELETE' THEN/g);
 assert.match(navigationSql,/OLD\.map_id IS DISTINCT FROM NEW\.map_id/);
 // Alphabetically scheduled before existing forge_visibility_token_tick:
 assert.ok('forge_navigation_token_permissions'<'forge_visibility_token_tick');
 assert.match(navigationSql,/AFTER INSERT OR DELETE OR\s+UPDATE OF npc_values,owner_id/);
 assert.match(navigationSql,/AFTER INSERT OR DELETE OR\s+UPDATE OF state,config,owner_id/);
});

test('private viewer Realtime snapshots remain recipient-scoped',()=>{
 assert.match(privateSql,/cm\.user_id=actor/);
 assert.match(privateSql,/cm\.role='player'/);
 assert.match(privateSql,/coalesce\(pm\.map_id,camp\.active_map_id\)=m\.id/);
 assert.match(privateSql,/WHERE tick\.map_id=p_map AND tick\.user_id=recipient\.user_id FOR UPDATE/i);
 assert.match(privateSql,/authorized_frame=excluded\.authorized_frame/i);
 assert.doesNotMatch(privateSql,/GRANT (?:SELECT|ALL) ON TABLE forge_visibility/i);
});

test('fog metadata survives client normalization without any private geometry',()=>{
 const raw=frame(12,5,8);
 const parsed=normalizeAuthorizedFogFrame(raw,map);
 assert.equal(parsed?.navigationEnvironmentRevision,8);
 assert.equal(parsed?.permissionGeneration,5);
 assert.equal(normalizeAuthorizedFogFrame({...raw,permissionGeneration:-1},map),null);
 assert.equal(normalizeAuthorizedFogFrame({...raw,navigationEnvironmentRevision:-1},map),null);
 assert.equal(Object.hasOwn(parsed,'objects'),false);
});

test('client rejects stale or incompatible permission generations and boundaries',async()=>{
 let calls=0;
 const db={rpc:async()=>{calls++;return {
  data:issuedGrant(3,calls===1?5:6),error:null
 }}};
 const store=createAuthorizedNavigation({db});
 assert.equal(store.adoptFrame(map,frame(3,5)),true);
 assert.ok(await store.ensure(map,'token',piece,{x:0,y:0,spanX:1,spanY:1}));
 assert.equal(store.hasGrant(map,'token',piece),true);
 assert.equal(store.allows(map,'token',piece,{x:1,y:0},{x:2,y:0}),false);
 assert.equal(store.adoptFrame(map,frame(4,6)),true);
 assert.equal(store.hasGrant(map,'token',piece),false);
 assert.ok(await store.ensure(map,'token',piece,{x:0,y:0,spanX:1,spanY:1}));
 assert.equal(calls,2);
 store.revoke(map);
 assert.equal(store.authority(map),null);
 assert.equal(store.allows(map,'token',piece,{x:0,y:0},{x:1,y:0}),false);
 store.dispose();
});

test('no deployment, external migration or paid service is required by the isolated CI workflow',()=>{
 const workflow=source('.github/workflows/staging-movement-validation.yml');
 assert.match(workflow,/stage\/complete-predictive-navigation-and-fog-2026-11-09/);
 assert.match(workflow,/npm test/);
 assert.match(workflow,/npm run build/);
 assert.match(workflow,/npm run lint:critical/);
 assert.doesNotMatch(workflow,/vercel deploy|supabase db push|supabase migration up|supabase link/i);
});
