import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('fog and collision staging SQL is private, additive and inactive',()=>{
 const sql=source('staging/sql-candidates/fog_collision_visibility_foundation.sql');
 assert.match(sql,/STAGING CANDIDATE ONLY/);
 assert.match(sql,/create schema if not exists forge_visibility/);
 assert.match(sql,/fog_enforced boolean not null default false/);
 assert.match(sql,/collision_enforced boolean not null default false/);
 assert.match(sql,/alter table forge_visibility\.exploration enable row level security/);
 assert.match(sql,/revoke all on forge_visibility\.exploration from public,anon,authenticated/);
 assert.match(sql,/revoke all on schema forge_visibility from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant (select|all) on.*exploration.*to authenticated/i);
 assert.doesNotMatch(sql,/drop policy|alter policy|alter publication|create trigger/i);
});
test('recovered scope forbids CSS-only fog or client-authoritative collision',()=>{
 const doc=source('docs/staged-authoritative-fog-collision.md');
 assert.match(doc,/not a reliable enforcement switch/);
 assert.match(doc,/Replace broad player reads of `map_tokens`/);
 assert.match(doc,/server authorization and data filtering/);
 assert.match(doc,/No paid staging database/);
});

test('fog overlay is fail-closed and wired to authorized player snapshots',()=>{
 const overlay=source('src/MapFogOverlay.jsx');
 const board=source('src/main.jsx');
 assert.match(overlay,/normalizeAuthorizedFogFrame\(frame,mapId\)/);
 assert.match(overlay,/if\(!sanitized\)/);
 assert.match(overlay,/fillStyle='#040914'/);
 assert.match(source('src/style.css'),/\.map-fog-overlay\{[^}]*pointer-events:none/);
 assert.match(board,/import MapFogOverlay from/);
 assert.match(board,/!isDM&&<MapFogOverlay map=\{map\}/);
 assert.match(board,/fogFrame=\{fog.frame\}/);
 assert.match(board,/!fog.frame\|\|fog.frame.mapId!==selectedMap\|\|fog.frame.enabled/);
 assert.match(source('src/useAuthorizedMapFog.js'),/get_authorized_map_fog/);
 assert.match(source('src/useMapCombat.js'),/get_authorized_map_combat/);
});
