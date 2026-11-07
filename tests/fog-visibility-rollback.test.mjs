import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../staging/sql-candidates/rollback_fog_visibility_batch_optimization.sql',import.meta.url),'utf8');
const staged=readFileSync(new URL('../supabase/migrations/20261107124000_fog_visibility_batch_optimization.sql',import.meta.url),'utf8');
test('fog rollback keeps the production point-visible implementation for deliberate recovery',()=>{
 assert.match(source,/CREATE OR REPLACE FUNCTION public\.get_authorized_map_fog\(p_map uuid\)/);
 assert.match(source,/forge_visibility\.point_visible\(p_map,cx\+0\.5,cy\+0\.5,actor\)/);
 assert.match(source,/SECURITY DEFINER/);
 assert.match(source,/public\.can_view_campaign_map/);
 assert.doesNotMatch(source,/alter (table|policy)|grant |revoke /i);
 assert.match(staged,/sources as materialized/);
 assert.doesNotMatch(staged,/where forge_visibility\.point_visible\(p_map,cx/);
});
