-- R18-18: SOURCE-REAL legacy collision trigger hostile suite.
-- ONLY disposable PG17 job: tests/world-v2-b10-postgres/run.sh.
-- Install source-extracted original trigger definitions, then candidate
-- 0.10-cell SQL inside this single BEGIN/ROLLBACK. Never on live Supabase.
BEGIN;
-- Test fixture map_rules predates the real fog_enforced column. This is
-- schema parity scaffolding, not a new feature or migration.
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN fog_enforced boolean NOT NULL DEFAULT false;
\i /tmp/world_v2_b10_r18_18_legacy_triggers.sql
\i supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql

CREATE OR REPLACE FUNCTION public.r18_18_wall(
 p_map uuid,p_ax numeric,p_ay numeric,p_bx numeric,p_by numeric,
 p_type text DEFAULT 'wall',p_state text DEFAULT 'closed',
 p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r18$
BEGIN
 UPDATE public.map_environments e SET live=jsonb_build_object(
  'objects',jsonb_build_array(
   jsonb_build_object('type',p_type,'state',p_state,'blocksMovement',true,
    'points',jsonb_build_array(
     jsonb_build_object('x',p_ax,'y',p_ay),
     jsonb_build_object('x',p_bx,'y',p_by)))
   ||p_extra))
 WHERE e.map_id=p_map;
 IF NOT FOUND THEN RAISE EXCEPTION 'R18-18 test map not found';END IF;
END $r18$;
CREATE OR REPLACE FUNCTION public.r18_18_clear(p_map uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r18$
BEGIN
 UPDATE public.map_environments SET live='{"objects":[]}'::jsonb
 WHERE map_id=p_map;
END $r18$;

-- Test-only expectations exercise actual public UPDATE and both real
-- BEFORE UPDATE collision triggers. Rejected statements are protected by
-- a PL/pgSQL exception subtransaction; inspect errors and unchanged rows.
CREATE OR REPLACE FUNCTION public.r18_18_token_x(
 p_id uuid,p_x integer,p_error text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r18$
DECLARE old_x integer;seen_error text;affected integer;
BEGIN
 SELECT x INTO old_x FROM public.map_tokens WHERE id=p_id;
 BEGIN
  UPDATE public.map_tokens SET x=p_x WHERE id=p_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN seen_error:='missing-token';END IF;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS seen_error=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  (p_error IS NULL AND seen_error IS NULL AND
    (SELECT x=p_x FROM public.map_tokens WHERE id=p_id)) OR
  (p_error IS NOT NULL AND seen_error IS NOT NULL AND
    position(lower(p_error) IN lower(seen_error))>0 AND
    (SELECT x=old_x FROM public.map_tokens WHERE id=p_id)),
  'R18-18 '||p_label);
END $r18$;
CREATE OR REPLACE FUNCTION public.r18_18_token_span(
 p_id uuid,p_span numeric,p_error text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r18$
DECLARE old_span numeric;seen_error text;affected integer;
BEGIN
 SELECT span_x INTO old_span FROM public.map_tokens WHERE id=p_id;
 BEGIN
  UPDATE public.map_tokens SET span_x=p_span WHERE id=p_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN seen_error:='missing-token';END IF;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS seen_error=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  (p_error IS NULL AND seen_error IS NULL AND
   (SELECT span_x=p_span FROM public.map_tokens WHERE id=p_id)) OR
  (p_error IS NOT NULL AND seen_error IS NOT NULL AND
   position(lower(p_error) IN lower(seen_error))>0 AND
   (SELECT span_x=old_span FROM public.map_tokens WHERE id=p_id)),
  'R18-18 '||p_label);
END $r18$;
CREATE OR REPLACE FUNCTION public.r18_18_tool_x(
 p_id uuid,p_x integer,p_error text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r18$
DECLARE old_x integer;seen_error text;affected integer;
BEGIN
 SELECT x INTO old_x FROM public.campaign_tool_issues WHERE id=p_id;
 BEGIN
  UPDATE public.campaign_tool_issues SET x=p_x WHERE id=p_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN seen_error:='missing-tool';END IF;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS seen_error=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  (p_error IS NULL AND seen_error IS NULL AND
   (SELECT x=p_x FROM public.campaign_tool_issues WHERE id=p_id)) OR
  (p_error IS NOT NULL AND seen_error IS NOT NULL AND
   position(lower(p_error) IN lower(seen_error))>0 AND
   (SELECT x=old_x FROM public.campaign_tool_issues WHERE id=p_id)),
  'R18-18 '||p_label);
END $r18$;
CREATE OR REPLACE FUNCTION public.r18_18_tool_span(
 p_id uuid,p_span numeric,p_error text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r18$
DECLARE old_config jsonb;seen_error text;affected integer;
BEGIN
 SELECT config INTO old_config FROM public.campaign_tool_issues WHERE id=p_id;
 BEGIN
  UPDATE public.campaign_tool_issues
   SET config=jsonb_set(config,'{span}',to_jsonb(p_span),true) WHERE id=p_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN seen_error:='missing-tool';END IF;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS seen_error=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  (p_error IS NULL AND seen_error IS NULL AND
   (SELECT (config->>'span')::numeric=p_span
    FROM public.campaign_tool_issues WHERE id=p_id)) OR
  (p_error IS NOT NULL AND seen_error IS NOT NULL AND
   position(lower(p_error) IN lower(seen_error))>0 AND
   (SELECT config=old_config
    FROM public.campaign_tool_issues WHERE id=p_id)),
  'R18-18 '||p_label);
END $r18$;

DO $r18_18$
DECLARE
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 actor uuid:='00000000-0000-4000-8000-000000000011';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 token uuid:='00000000-0000-4000-8000-000000000101';
 large_token uuid:='00000000-0000-4000-8000-000000000103';
 mount uuid:='00000000-0000-4000-8000-000000000201';
 note text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('forge.collision_override','off',true);
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_trigger WHERE tgname IN
   ('forge_player_collision','forge_tool_collision') AND
   tgenabled='O' AND NOT tgisinternal),
  'T01 both source-extracted legacy collision triggers installed and enabled');
 PERFORM public.b08_assert(
  (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=
   'forge_visibility.enforce_collision()'::regprocedure) AND
  (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=
   'forge_visibility.enforce_tool_collision()'::regprocedure),
  'T02 real legacy collision guards retain security definer and pinned search path');
 -- 1x1 token: strict production rejected this 5% edge clip.
 PERFORM public.r18_18_wall(test_map,2.95,0,2.95,16);
 PERFORM public.r18_18_token_x(token,2,NULL,
  'T03 real token UPDATE accepts 5-percent far-edge overlap');
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_token_x(token,1,NULL,'T04 token fixture restored');
 PERFORM public.r18_18_wall(test_map,2.75,0,2.75,16);
 PERFORM public.r18_18_token_x(token,2,'Movement blocked by a wall',
  'T05 real token UPDATE rejects 25-percent deeper intrusion');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16);
 PERFORM public.r18_18_token_x(token,2,'Movement blocked by a wall',
  'T06 real token UPDATE rejects genuine wall crossing');
 PERFORM public.r18_18_wall(test_map,3,0,3,16);
 PERFORM public.r18_18_token_x(token,2,NULL,
  'T07 border-only wall contact remains permitted');
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_token_x(token,1,NULL,'T08 token reset for door checks');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16,'door','closed');
 PERFORM public.r18_18_token_x(token,2,'Movement blocked',
  'T09 closed door is solid even with clearance');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16,'door','open');
 PERFORM public.r18_18_token_x(token,2,NULL,'T10 open door remains passable');
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_token_x(token,1,NULL,'T11 token reset for window');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16,'window','closed',
  '{"vision":"pass","blocksLight":false}'::jsonb);
 PERFORM public.r18_18_token_x(token,2,'Movement blocked',
  'T12 see-through closed window remains solid');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16,'window','broken');
 PERFORM public.r18_18_token_x(token,2,NULL,'T13 broken window remains passable');
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_token_x(token,1,NULL,'T14 reset for conditional barrier');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16,'wall','closed',
  '{"attributeField":"strength","movementAt":15}'::jsonb);
 UPDATE public.map_tokens SET npc_values='{"strength":14}'::jsonb
 WHERE id=token;
 PERFORM public.r18_18_token_x(token,2,'Movement blocked',
  'T15 conditional movement threshold denies insufficient attribute');
 UPDATE public.map_tokens SET npc_values='{"strength":16}'::jsonb
 WHERE id=token;
 PERFORM public.r18_18_token_x(token,2,NULL,
  'T16 conditional wall permits high enough attribute');
 -- Resize even at the same anchor must check newly expanded footprint.
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_token_x(token,1,NULL,'T17 reset for span enlargement');
 UPDATE public.map_tokens SET npc_values='{}'::jsonb WHERE id=token;
 PERFORM public.r18_18_wall(test_map,2.5,0,2.5,16);
 PERFORM public.r18_18_token_span(token,2,'Movement blocked',
  'T18 token resize cannot cross interior wall at stationary anchor');
 -- Map bounds use actual FULL footprint even though collision uses inset.
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_token_x(token,1,NULL,'T19 reset for bounds');
 PERFORM public.r18_18_token_x(token,16,'Movement leaves the map bounds',
  'T20 map edge enforces unshrunk token footprint');
 -- Resizing the DM-owned 2x2 token tests large-piece semantics.
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 PERFORM public.r18_18_wall(test_map,7.95,0,7.95,16);
 PERFORM public.r18_18_token_x(large_token,6,NULL,
  'T21 2x2 token allows 5-percent fixed-cell edge contact');
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_token_x(large_token,5,NULL,'T22 reset large token');
 PERFORM public.r18_18_wall(test_map,7.75,0,7.75,16);
 PERFORM public.r18_18_token_x(large_token,6,'Movement blocked',
  'T23 2x2 token blocks deep footprint crossing');
 -- Explicit DM override only, never an implicit bypass.
 PERFORM public.r18_18_wall(test_map,6.05,0,6.05,16);
 PERFORM public.r18_18_token_x(large_token,6,'Movement blocked',
  'T24 DM defaults to solid wall like player');
 PERFORM set_config('forge.collision_override','on',true);
 PERFORM public.r18_18_token_x(large_token,6,NULL,
  'T25 authenticated DM explicit collision override persists');
 PERFORM set_config('forge.collision_override','off',true);
 -- Tool, including mount footprint and resize, uses exactly the same helper.
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM public.r18_18_wall(test_map,3.95,0,3.95,16);
 PERFORM public.r18_18_tool_x(mount,2,NULL,
  'T26 real mounted tool UPDATE accepts shallow 5-percent edge');
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_tool_x(mount,1,NULL,'T27 tool reset');
 PERFORM public.r18_18_wall(test_map,3.75,0,3.75,16);
 PERFORM public.r18_18_tool_x(mount,2,'Tool movement blocked',
  'T28 tool 2x2 deep overlap remains solid');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16);
 PERFORM public.r18_18_tool_x(mount,2,'Tool movement blocked',
  'T29 tool cannot cross near-edge thin wall');
 -- stationary mount grows from 2x2 to 3x3: expansion hits line at x3.5.
 PERFORM public.r18_18_wall(test_map,3.5,0,3.5,16);
 PERFORM public.r18_18_tool_span(mount,3,'Tool movement blocked',
  'T30 tool config resize checks newly expanded footprint');
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16,'door','open');
 PERFORM public.r18_18_tool_x(mount,2,NULL,'T31 open door passes mount tool');
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_tool_x(mount,1,NULL,'T32 mount restored');
 -- Never allow unsigned/non-DM actors to exploit the DM override flag.
 PERFORM public.r18_18_wall(test_map,2.05,0,2.05,16);
 PERFORM set_config('forge.collision_override','on',true);
 PERFORM public.r18_18_token_x(token,2,'Movement blocked',
  'T33 player cannot use DM override even if session variable is set');
 PERFORM set_config('forge.collision_override','off',true);
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM public.r18_18_token_x(token,2,'Sign in to move tokens',
  'T34 unsigned token direct UPDATE fails closed');
 PERFORM public.r18_18_tool_x(mount,2,'Sign in to move tools',
  'T35 unsigned tool direct UPDATE fails closed');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- Unpublished/corrupt physical collision arrays must never silently pass.
 UPDATE public.map_environments SET live='{"objects":null}'::jsonb
 WHERE map_id=test_map;
 PERFORM public.r18_18_token_x(token,2,
  'Published collision configuration unavailable',
  'T36 absent published geometry blocks token UPDATE');
 PERFORM public.r18_18_tool_x(mount,2,
  'Published collision configuration unavailable',
  'T37 absent published geometry blocks mounted tool UPDATE');
 -- No testcase modifies live permissions: fixture has no production RLS.
 PERFORM public.b08_assert(
  NOT has_schema_privilege('anon','forge_world_v2','USAGE') AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  (SELECT count(*)=0 FROM public.map_tokens
   WHERE id=token AND x<>1),
  'T38 private V2 schema remains revoked and rejected positions unchanged');
 RAISE NOTICE 'R18-18: 38 hostile direct-write token/tool assertions PASSED, rollback follows';
END $r18_18$;
-- Additional role-changing permission tests: these verify the trigger's
-- DM override and map-transfer invariants, NOT production RLS policies.
DO $r18_18_roles$
DECLARE
 player uuid:='00000000-0000-4000-8000-000000000011';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 camp uuid:='00000000-0000-4000-8000-000000000001';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 large_token uuid:='00000000-0000-4000-8000-000000000103';
 old_map uuid;reason text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',player::text,true);
 PERFORM set_config('forge.collision_override','off',true);
 SELECT map_id INTO old_map FROM public.map_tokens WHERE id=token;
 BEGIN
  UPDATE public.map_tokens SET map_id=
   '00000000-0000-4000-8000-000000000099'::uuid WHERE id=token;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  position('Players cannot move tokens between maps' IN coalesce(reason,''))>0
  AND (SELECT map_id=old_map FROM public.map_tokens WHERE id=token),
  'P01 player direct token map-transfer cannot bypass role check');
 -- Simulate revocation of DM role in the disposable fixture. The GUC is
 -- deliberately still set to 'on': the SQL guard MUST recheck actual role.
 PERFORM public.r18_18_clear(test_map);
 PERFORM public.r18_18_wall(test_map,7.05,0,7.05,16);
 UPDATE public.campaign_members SET role='player'
 WHERE campaign_id=camp AND user_id=dm;
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 PERFORM set_config('forge.collision_override','on',true);
 PERFORM public.b08_assert(NOT public.is_campaign_dm(camp),
  'P02 live membership fixture revokes DM role before next UPDATE');
 PERFORM public.r18_18_token_x(large_token,7,'Movement blocked',
  'P03 revoked DM cannot bypass collision with stale override GUC');
 UPDATE public.campaign_members SET role='dm'
 WHERE campaign_id=camp AND user_id=dm;
 PERFORM public.r18_18_token_x(large_token,7,NULL,
  'P04 restored DM plus explicit override can cross again');
 RAISE NOTICE 'R18-18: 4 additional role-change and map-transfer assertions PASSED';
END $r18_18_roles$;
ROLLBACK;
