import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261107124000_fog_visibility_batch_optimization.sql',import.meta.url),'utf8');
test('fog optimization preserves authenticated map access and fail-closed bounds',()=>{
 for(const token of ["SECURITY DEFINER","SET search_path TO ''",
  "if actor is null then raise exception 'Sign in first'","public.can_view_campaign_map",
  "if fog_on and (w not between 1 and 128 or h not between 1 and 128)",
  "select live into scene from public.map_environments",
  "partyShared","t.owner_id=actor","cm.role='player'",
  "order by t.id limit 8","t.visible","m.campaign_id"])
  assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/grant (all|select|execute) on /i);
 assert.doesNotMatch(sql,/disable row level security/i);
});
test('fog source batching retains the same 12-cell vision and light tests',()=>{
 for(const token of ["sources as materialized","left join public.characters ch",
   "coalesce(ch.field_values,t.npc_values,'{}'::jsonb)",
   "src.x+src.span_x/2.0","src.y+src.span_y/2.0",
   "greatest(0,src.x-12)","least(w-1,src.x+src.span_x::int+12)",
   "power(cx+0.5-(src.x+src.span_x/2.0),2)",
   "cy+0.5-(src.y+src.span_y/2.0),2)<=144",
   "forge_visibility.ray_blocked(scene","forge_visibility.is_lit(p_map,scene",
   "cx+0.5,cy+0.5,'vision',src.viewer_values"])
  assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/where forge_visibility.point_visible\(p_map,cx/);
});
test('exploration writes only when visibility contains cells not yet remembered',()=>{
 assert.match(sql,/jsonb_array_length\(seen\)>0 and not exists\(/);
 assert.match(sql,/e\.explored_cells @> seen/);
 assert.match(sql,/on conflict\(map_id,user_id\) do update/);
 assert.match(sql,/if shared then[\s\S]*?forge_visibility\.exploration e/);
 assert.match(sql,/else[\s\S]*?select explored_cells into memory from forge_visibility\.exploration/);
});
