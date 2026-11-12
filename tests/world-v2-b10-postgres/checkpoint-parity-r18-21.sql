-- R18-21: PRESERVE LIVE World V2 SIGNED COMMIT CHECKPOINT IN BOTH
-- corrected source-real cross-map collision guards.
-- Source-real private checkpoint function from live SELECT-only capture.
-- Test-only accepted session checkpoint fixture; actual SQL actor cannot
-- manufacture private table rows. NO Supabase writes. Transaction ROLLBACK.
BEGIN;
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN fog_enforced boolean NOT NULL DEFAULT false;
\i /tmp/world_v2_b10_r18_18_legacy_triggers.sql
\i /tmp/world_v2_b10_r18_19_latest_trajectory.sql
\i tests/world-v2-b10-postgres/live-v2-checkpoint-r18-21.sql
\i supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql
\i supabase/candidates/world_v2_r18_19_cross_map_guard.sql

CREATE OR REPLACE FUNCTION public.r21_denied_movement(
 p_sql text,p_message text,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r21$
DECLARE reason text;affected integer;
BEGIN
 BEGIN EXECUTE p_sql;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN reason:='missing piece';END IF;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS reason=MESSAGE_TEXT;
 END;
 PERFORM public.b08_assert(
  position(lower(p_message) IN lower(coalesce(reason,'')))>0,
  'C '||p_label);
END $r21$;
DO $r21_checkpoints$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 wrong_actor uuid:='00000000-0000-4000-8000-000000000012';
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 map_id uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
 token_session uuid:='00000000-0000-4000-8000-000000000381';
 tool_session uuid:='00000000-0000-4000-8000-000000000382';
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 UPDATE public.map_environments
 SET live='{"objects":[{"type":"wall","points":[{"x":1.5,"y":0},{"x":1.5,"y":10}],"blocksMovement":true}]}'::jsonb
 WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n
   ON n.oid=p.pronamespace WHERE n.nspname='forge_visibility'
   AND p.proname IN ('enforce_collision','enforce_tool_collision')
   AND position('commit_allows_piece_v2' IN pg_get_functiondef(p.oid))>0),
  'C01 BOTH corrected collision guards retain live signed checkpoint hook');
 PERFORM public.r21_denied_movement(
  format('UPDATE public.map_tokens SET x=2 WHERE id=%L',token),
  'Movement blocked','C02 direct token collision without checkpoint denied');
 PERFORM public.b04_issue_token_session(token_session,actor,token);
 UPDATE forge_world_v2.motion_sessions SET
  last_x=2,accepted_cells=1,attempted_cells=1,
  accepted_steps='[{"x":2,"y":1}]'::jsonb
 WHERE id=token_session;
 INSERT INTO forge_world_v2.commit_checkpoints(
  transaction_id,session_id,actor_id,campaign_id,map_id)
 VALUES(txid_current(),token_session,actor,campaign,map_id);
 PERFORM public.b08_assert(
  forge_world_v2.commit_allows_piece_v2('token',token,campaign,map_id,1,1,2,1),
  'C03 source-real V2 helper recognizes the accepted token checkpoint');
 UPDATE public.map_tokens SET x=2 WHERE id=token;
 PERFORM public.b08_assert(
  (SELECT x=2 FROM public.map_tokens WHERE id=token),
  'C04 signed V2 token Commit bypasses redundant direct wall validation');
 PERFORM set_config('request.jwt.claim.sub',wrong_actor::text,true);
 PERFORM public.b08_assert(
  NOT forge_world_v2.commit_allows_piece_v2('token',token,campaign,map_id,1,1,2,1),
  'C05 checkpoint is not transferable to a different authenticated actor');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);

 UPDATE forge_world_v2.commit_checkpoints SET session_id=token_session
 WHERE transaction_id=txid_current();
 PERFORM public.r21_denied_movement(
  format('UPDATE public.campaign_tool_issues SET x=2 WHERE id=%L',tool),
  'Tool movement blocked','C06 tool move still blocked without its own checkpoint');
 PERFORM public.b04_issue_tool_session(tool_session,actor,tool);
 UPDATE forge_world_v2.motion_sessions SET
  last_x=2,accepted_cells=1,attempted_cells=1,
  accepted_steps='[{"x":2,"y":7}]'::jsonb
 WHERE id=tool_session;
 UPDATE forge_world_v2.commit_checkpoints SET session_id=tool_session
 WHERE transaction_id=txid_current();
 PERFORM public.b08_assert(
  forge_world_v2.commit_allows_piece_v2('tool',tool,campaign,map_id,1,7,2,7),
  'C07 source-real V2 helper recognizes issued tool signed checkpoint');
 UPDATE public.campaign_tool_issues SET x=2 WHERE id=tool;
 PERFORM public.b08_assert(
  (SELECT x=2 FROM public.campaign_tool_issues WHERE id=tool),
  'C08 signed V2 tool Commit bypasses redundant direct wall validation');
 DELETE FROM forge_world_v2.commit_checkpoints
 WHERE transaction_id=txid_current();
 PERFORM public.r21_denied_movement(
  format('UPDATE public.map_tokens SET x=1 WHERE id=%L',token),
  'Movement blocked','C09 checkpoint deletion restores full direct collision checks');
 PERFORM public.b08_assert(
  (SELECT x=2 FROM public.map_tokens WHERE id=token)
  AND (SELECT x=2 FROM public.campaign_tool_issues WHERE id=tool)
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE')
  AND NOT has_table_privilege('authenticated',
   'forge_world_v2.commit_checkpoints','INSERT'),
  'C10 unauthorized direct checkpoint creation remains denied; canonical writes consistent');
 RAISE NOTICE 'R18-21: 10 source-real V2 transaction checkpoint assertions PASSED';
END $r21_checkpoints$;
ROLLBACK;
