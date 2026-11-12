-- B10-R18-19: SOURCE-REAL latest trajectory/alternate RPC and map authority.
-- Disposable local PG17 ONLY. No remote connection. Entire suite ROLLBACK.
BEGIN;
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN fog_enforced boolean NOT NULL DEFAULT false;
\i /tmp/world_v2_b10_r18_18_legacy_triggers.sql
\i /tmp/world_v2_b10_r18_19_latest_trajectory.sql
\i supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql
\i supabase/candidates/world_v2_r18_19_cross_map_guard.sql

CREATE OR REPLACE FUNCTION public.r19_scene(
 x numeric,y0 numeric DEFAULT 0,y1 numeric DEFAULT 16,
 kind text DEFAULT 'wall',portal_state text DEFAULT 'closed')
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $r19$
 SELECT jsonb_build_object('objects',jsonb_build_array(
   jsonb_build_object('type',kind,'state',portal_state,'blocksMovement',true,
   'points',jsonb_build_array(
    jsonb_build_object('x',x,'y',y0),
    jsonb_build_object('x',x,'y',y1)))));
$r19$;

CREATE OR REPLACE FUNCTION public.r19_expect_tool_map(
 p_id uuid,p_map uuid,p_error text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r19$
DECLARE previous uuid;message text;
BEGIN
 SELECT map_id INTO previous FROM public.campaign_tool_issues WHERE id=p_id;
 BEGIN
  UPDATE public.campaign_tool_issues SET map_id=p_map WHERE id=p_id;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  (p_error IS NULL AND message IS NULL AND
   (SELECT map_id IS NOT DISTINCT FROM p_map
    FROM public.campaign_tool_issues WHERE id=p_id))
  OR
  (p_error IS NOT NULL AND position(lower(p_error) IN lower(coalesce(message,'')))>0
   AND (SELECT map_id IS NOT DISTINCT FROM previous
    FROM public.campaign_tool_issues WHERE id=p_id)),
  'R19 '||p_label);
END $r19$;
CREATE OR REPLACE FUNCTION public.r19_expect_token_map(
 p_id uuid,p_map uuid,p_error text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r19$
DECLARE previous uuid;message text;
BEGIN
 SELECT map_id INTO previous FROM public.map_tokens WHERE id=p_id;
 BEGIN
  UPDATE public.map_tokens SET map_id=p_map WHERE id=p_id;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  (p_error IS NULL AND message IS NULL AND
   (SELECT map_id IS NOT DISTINCT FROM p_map
    FROM public.map_tokens WHERE id=p_id))
  OR
  (p_error IS NOT NULL AND position(lower(p_error) IN lower(coalesce(message,'')))>0
   AND (SELECT map_id IS NOT DISTINCT FROM previous
    FROM public.map_tokens WHERE id=p_id)),
  'R19 '||p_label);
END $r19$;

DO $r19$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 other_campaign uuid:='00000000-0000-4000-8000-000000000002';
 map_id uuid:='00000000-0000-4000-8000-000000000021';
 other_map uuid:='00000000-0000-4000-8000-000000000022';
 foreign_map uuid:='00000000-0000-4000-8000-000000000023';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
 scene jsonb;result jsonb;err text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('forge.collision_override','off',true);
 INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
 VALUES(other_map,campaign,160,160,10),
       (foreign_map,other_campaign,160,160,10);
 PERFORM public.b08_assert(
  (SELECT p.prosecdef=false FROM pg_proc p WHERE p.oid=
   'public.commit_map_trajectory(uuid,uuid[],uuid[],jsonb,boolean)'::regprocedure)
  AND (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=
   'forge_visibility.enforce_collision()'::regprocedure)
  AND (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=
   'forge_visibility.enforce_tool_collision()'::regprocedure),
  'A01 real public trajectory RPC remains INVOKER; real triggers remain DEFINER');
 PERFORM public.b08_assert(
  NOT has_function_privilege('authenticated',
   'forge_visibility.validate_piece_trajectory(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,jsonb)',
   'EXECUTE'),
  'A02 private trajectory validator not directly callable by players');
 scene:=public.r19_scene(2.95);
 result:=forge_visibility.validate_piece_trajectory(scene,'{}',1,1,1,1,16,16,
  '[{"dx":1,"dy":0}]');
 PERFORM public.b08_assert(result='{"x":2,"y":1}'::jsonb,
  'A03 source-real private validator accepts 5-percent edge overlap');
 scene:=public.r19_scene(2.75);
 err:=NULL;
 BEGIN
  PERFORM forge_visibility.validate_piece_trajectory(
   scene,'{}',1,1,1,1,16,16,'[{"dx":1,"dy":0}]');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(position('Trajectory blocked' IN coalesce(err,''))>0,
  'A04 source-real trajectory denies deep 25-percent collision');
 scene:=public.r19_scene(2.5,1.5,2.5);
 err:=NULL;
 BEGIN
  PERFORM forge_visibility.validate_piece_trajectory(
   scene,'{}',1,1,1,1,16,16,'[{"dx":2,"dy":0}]');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(position('Trajectory blocked' IN coalesce(err,''))>0,
  'A05 direct fast crossing cannot tunnel through short solid segment');
 result:=forge_visibility.validate_piece_trajectory(
  scene,'{}',1,1,1,1,16,16,
  '[{"dx":0,"dy":2},{"dx":2,"dy":0},{"dx":0,"dy":-2}]');
 PERFORM public.b08_assert(result='{"x":3,"y":1}'::jsonb,
  'A06 real bent safe route reaches same endpoint without crossing wall');
 UPDATE public.map_environments SET live=scene WHERE map_id=map_id;
 result:=public.commit_map_trajectory(map_id,ARRAY[token],ARRAY[]::uuid[],
  '[{"dx":0,"dy":2},{"dx":2,"dy":0},{"dx":0,"dy":-2}]',false);
 PERFORM public.b08_assert(
  (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token)
  AND result->'tokens'->0->>'x'='3',
  'A07 real alternate commit_map_trajectory validates each leg and commits once');
 UPDATE public.map_environments SET live='{"objects":[]}' WHERE map_id=map_id;
 UPDATE public.map_tokens SET x=1,y=1 WHERE id=token;
 UPDATE public.map_environments
  SET live=public.r19_scene(2.5,7.2,9.5) WHERE map_id=map_id;
 err:=NULL;
 BEGIN
  PERFORM public.commit_map_trajectory(map_id,ARRAY[token],ARRAY[tool],
   '[{"dx":2,"dy":0}]',false);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  position('Trajectory blocked' IN coalesce(err,''))>0
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token)
  AND (SELECT x=1 AND y=7 FROM public.campaign_tool_issues WHERE id=tool),
  'A08 combined token/tool commit rolls back both if tool leg collides');
 err:=NULL;
 BEGIN
  PERFORM public.move_map_group(map_id,ARRAY[token],ARRAY[]::uuid[],2,0,false);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  (SELECT x=1 FROM public.map_tokens WHERE id=token)
  AND err IS NULL,
  'A09 independent direct group movement still authorizes a safe token route');
 -- Direct group movement must be reset for remaining maps and roles.
 UPDATE public.map_environments SET live='{"objects":[]}' WHERE map_id=map_id;
 UPDATE public.map_tokens SET x=1,y=1 WHERE id=token;
 err:=NULL;
 BEGIN
  PERFORM public.commit_map_trajectory(map_id,ARRAY[token],ARRAY[]::uuid[],
   '[{"dx":0,"dy":0}]',false);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(position('Movement route is empty' IN coalesce(err,''))>0,
  'A10 zero-length authorized trajectory fails closed');
 err:=NULL;
 BEGIN
  PERFORM public.move_map_group(map_id,ARRAY[token],ARRAY[]::uuid[],
   1,0,true);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  position('Only a DM may bypass collision' IN coalesce(err,''))>0,
  'A11 alternate direct move_map_group denies player collision override');
 -- Key map-transfer hardening: these prior short-circuit paths require DM.
 PERFORM public.r19_expect_tool_map(tool,other_map,
  'Only the DM can transfer','A12 player-owned tool cannot leave its map');
 UPDATE public.campaign_tool_issues SET held_by_token_id=token WHERE id=tool;
 PERFORM public.r19_expect_tool_map(tool,other_map,
  'Only the DM can transfer','A13 held issued tool cannot bypass map transfer check');
 PERFORM public.r19_expect_tool_map(tool,NULL,
  'Only the DM can transfer','A14 held tool cannot be silently unplaced by player');
 UPDATE public.campaign_tool_issues SET held_by_token_id=NULL WHERE id=tool;
 PERFORM public.r19_expect_token_map(token,other_map,
  'Players cannot move tokens','A15 token map transfer still requires DM');
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 PERFORM public.r19_expect_tool_map(tool,foreign_map,
  'Tool destination map outside campaign','A16 DM cannot put tool in foreign campaign map');
 PERFORM public.r19_expect_token_map(token,foreign_map,
  'Token destination map outside campaign','A17 DM cannot put token in foreign campaign map');
 PERFORM public.r19_expect_tool_map(tool,other_map,NULL,
  'A18 DM can transfer tool onto real same-campaign map without local rules');
 PERFORM public.r19_expect_tool_map(tool,map_id,NULL,
  'A19 DM can return tool to its original campaign map');
 PERFORM public.r19_expect_token_map(token,other_map,NULL,
  'A20 DM can transfer token to real same-campaign map');
 PERFORM public.r19_expect_token_map(token,map_id,NULL,
  'A21 DM can return token without changing campaign scope');
 PERFORM public.b08_assert(
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token)
  AND (SELECT x=1 AND y=7 FROM public.campaign_tool_issues WHERE id=tool)
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'A22 position unchanged after denied updates; V2 private ACL still denied');
 RAISE NOTICE 'R18-19: 22 source-real trajectory, atomic RPC and cross-map authorization assertions PASSED';
END $r19$;

-- Reproduce the live policy BOOLEAN expressions, but the full production
-- user/session/vision helpers are NOT present in this isolated fixture.
-- These are ROLE-based RLS simulations, not real Auth/P1/P2 acceptance.
CREATE OR REPLACE FUNCTION public.is_campaign_member(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $r19$
 SELECT EXISTS(SELECT 1 FROM public.campaign_members c
  WHERE c.campaign_id=p_campaign AND c.user_id=auth.uid());
$r19$;
ALTER TABLE public.campaign_tool_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipient or dm read issued tool" ON public.campaign_tool_issues
 FOR SELECT TO authenticated
 USING (public.is_campaign_dm(campaign_id) OR
  (public.is_campaign_member(campaign_id) AND
   (party_shared OR owner_id=(SELECT auth.uid()))));
CREATE POLICY "recipient or dm edit issued state and position"
 ON public.campaign_tool_issues FOR UPDATE TO authenticated
 USING (public.is_campaign_dm(campaign_id) OR
  (public.is_campaign_member(campaign_id) AND
   (party_shared OR owner_id=(SELECT auth.uid()))))
 WITH CHECK (public.is_campaign_dm(campaign_id) OR
  (public.is_campaign_member(campaign_id) AND
   (party_shared OR owner_id=(SELECT auth.uid()))));
GRANT SELECT ON public.campaign_members TO authenticated;
GRANT SELECT ON public.battle_maps TO authenticated;
GRANT SELECT,UPDATE ON public.campaign_tool_issues TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000011',true);
DO $r19_rls$
DECLARE
 tool uuid:='00000000-0000-4000-8000-000000000201';
 other_map uuid:='00000000-0000-4000-8000-000000000022';
 n integer;err text;
BEGIN
 UPDATE public.campaign_tool_issues SET x=x+1 WHERE id=tool;
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM public.b08_assert(n=1,
  'L01 actual authenticated policy permits owning player same-map tool UPDATE');
 err:=NULL;
 BEGIN
  UPDATE public.campaign_tool_issues SET map_id=other_map WHERE id=tool;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(
  position('Only the DM can transfer' IN coalesce(err,''))>0,
  'L02 actual authenticated RLS alone would allow owner; hardened trigger prevents map change');
 err:=NULL;
 BEGIN
  UPDATE public.campaign_tool_issues SET owner_id=
   '00000000-0000-4000-8000-000000000012'::uuid WHERE id=tool;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;END;
 PERFORM public.b08_assert(position('row-level security' IN lower(coalesce(err,'')))>0,
  'L03 WITH CHECK prevents owner reassignment by ordinary player');
END $r19_rls$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000012',true);
DO $r19_rls$
DECLARE
 tool uuid:='00000000-0000-4000-8000-000000000201';
 n integer;
BEGIN
 UPDATE public.campaign_tool_issues SET x=x+1 WHERE id=tool;
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM public.b08_assert(n=0,
  'L04 independent authenticated player cannot update someone else\'s private tool');
END $r19_rls$;
RESET ROLE;
UPDATE public.campaign_tool_issues
 SET party_shared=true WHERE id='00000000-0000-4000-8000-000000000201';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000012',true);
DO $r19_rls$
DECLARE
 tool uuid:='00000000-0000-4000-8000-000000000201';n integer;
BEGIN
 UPDATE public.campaign_tool_issues SET x=x+1 WHERE id=tool;
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM public.b08_assert(n=1,
  'L05 independent authenticated member may update an explicitly shared tool');
END $r19_rls$;
RESET ROLE;
DELETE FROM public.campaign_members
 WHERE user_id='00000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000012',true);
DO $r19_rls$
DECLARE
 tool uuid:='00000000-0000-4000-8000-000000000201';n integer;
BEGIN
 UPDATE public.campaign_tool_issues SET x=x+1 WHERE id=tool;
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM public.b08_assert(n=0,
  'L06 revoked membership removes RLS UPDATE right to shared tool');
END $r19_rls$;
RESET ROLE;
DO $r19_rls_end$
BEGIN
 PERFORM public.b08_assert(
  (SELECT map_id='00000000-0000-4000-8000-000000000021'::uuid
   FROM public.campaign_tool_issues
   WHERE id='00000000-0000-4000-8000-000000000201'::uuid),
  'L07 all RLS role tests preserved tool campaign map integrity');
 RAISE NOTICE 'R18-19: 7 actual SET ROLE authenticated RLS-pattern assertions PASSED';
END $r19_rls_end$;
ROLLBACK;
