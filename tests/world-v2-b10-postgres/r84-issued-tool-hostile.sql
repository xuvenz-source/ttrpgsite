-- R18-84: source-real issued TOOL x/y trigger verification.
-- Included only after the 72 unchanged signed token Commits in the
-- throwaway R54 full-trigger pass, strictly inside BEGIN/ROLLBACK.
-- The public original Begin/Advance/Commit implementations are unchanged.
\set ON_ERROR_STOP on
DO $r84_tool_guard$
BEGIN
 IF current_database()<>'world_v2_b10_r05' OR current_user<>'postgres'
 OR current_setting('track_functions')<>'all'
 OR to_regclass('pg_temp.r84_function_delta') IS NULL
 OR to_regclass('pg_temp.r83_function_delta') IS NOT NULL
 OR to_regclass('pg_temp.r84_tool_samples') IS NOT NULL
 OR (SELECT count(*)<>4 FROM pg_trigger t
  WHERE t.tgrelid='public.campaign_tool_issues'::regclass
    AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
 OR (SELECT x=1 AND y=7 AND revision=1
     FROM public.campaign_tool_issues
     WHERE id='00000000-0000-4000-8000-000000000201'::uuid)
     IS DISTINCT FROM true
 OR (SELECT count(*)<>36 FROM pg_temp.r68_samples)
 THEN RAISE EXCEPTION 'R84 tool test refuses incomplete/nonisolated signed token baseline';END IF;
END $r84_tool_guard$;

CREATE TEMP TABLE r84_tool_samples (
 fog text NOT NULL CHECK(fog IN ('fog-off','fog-on')),
 repeat integer NOT NULL CHECK(repeat BETWEEN 1 AND 2),
 commit_ms double precision NOT NULL CHECK(commit_ms>=0),
 map_sync_ok boolean NOT NULL,
 PRIMARY KEY(fog,repeat)) ON COMMIT DROP;
SELECT pg_stat_clear_snapshot();
CREATE TEMP TABLE r84_tool_functions_before ON COMMIT DROP AS
SELECT funcid,calls,total_time,self_time FROM pg_stat_xact_user_functions;

DO $r84_tool_signed$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 viewer2 uuid:='00000000-0000-4000-8000-000000000012';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 tool_id uuid:='00000000-0000-4000-8000-000000000201';
 token_id uuid:='00000000-0000-4000-8000-000000000101';
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 selection jsonb:=jsonb_build_array(jsonb_build_object(
  'kind','tool','id','00000000-0000-4000-8000-000000000201'));
 sid uuid;begin_ack jsonb;advance_ack jsonb;commit_ack jsonb;
 start_at timestamptz; elapsed double precision; i integer;
 fog_mode text;rev bigint;bad boolean;bad_reason text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);

 -- Two balanced repetitions in both fog states; all tool writes pass
 -- through the unchanged original signed Commit, never an ad-hoc UPDATE.
 FOR i IN 1..2 LOOP
  FOREACH fog_mode IN ARRAY (
   CASE WHEN i%2=0 THEN ARRAY['fog-off','fog-on']
                    ELSE ARRAY['fog-on','fog-off'] END) LOOP
   UPDATE forge_visibility.map_rules
    SET fog_enforced=(fog_mode='fog-on') WHERE map_id=test_map;
   SELECT revision INTO rev FROM public.campaign_tool_issues WHERE id=tool_id;
   begin_ack:=public.begin_world_motion_v2(test_map,selection,
    '{"x":1,"y":7}'::jsonb,'drag',1,1,false);
   sid:=(begin_ack->>'sessionId')::uuid;
   PERFORM public.b08_assert(sid IS NOT NULL,
    'R84-03 original signed player-owned issued tool Begin');
   advance_ack:=public.advance_world_motion_v2(sid,1,
    '{"x":1,"y":7}'::jsonb,'[{"x":2,"y":7}]'::jsonb,1,1);
   PERFORM public.b08_assert(
    advance_ack->>'blocked'='false' AND
    advance_ack->'accepted'='[{"x":2,"y":7}]'::jsonb,
    'R84-04 tool Advance approved by original collision authority');
   start_at:=clock_timestamp();
   commit_ack:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":7}'::jsonb,1,1);
   elapsed:=extract(epoch FROM clock_timestamp()-start_at)*1000;
   PERFORM public.b08_assert(
    commit_ack->'endpoint'='{"x":2,"y":7}'::jsonb
    AND (SELECT x=2 AND y=7 AND revision=rev+1
         FROM public.campaign_tool_issues WHERE id=tool_id)
    AND (SELECT x=2 AND y=7 AND span=2
         FROM public.campaign_tool_map_tokens WHERE issue_id=tool_id),
    'R84-05 all four real tool x/y triggers allow signed canonical write, increment revision and sync map-token');
   INSERT INTO pg_temp.r84_tool_samples
    VALUES(fog_mode,i,elapsed,true);

   -- Canonical reverse requires its OWN signed Begin/Advance/Commit.
   begin_ack:=public.begin_world_motion_v2(test_map,selection,
    '{"x":2,"y":7}'::jsonb,'drag',1,1,false);
   sid:=(begin_ack->>'sessionId')::uuid;
   advance_ack:=public.advance_world_motion_v2(sid,1,
    '{"x":2,"y":7}'::jsonb,'[{"x":1,"y":7}]'::jsonb,1,1);
   commit_ack:=public.commit_world_motion_v2(sid,2,
    '{"x":1,"y":7}'::jsonb,1,1);
   PERFORM public.b08_assert(
    advance_ack->>'blocked'='false'
    AND commit_ack->'endpoint'='{"x":1,"y":7}'::jsonb
    AND (SELECT x=1 AND y=7 AND revision=rev+2
         FROM public.campaign_tool_issues WHERE id=tool_id)
    AND (SELECT x=1 AND y=7 FROM public.campaign_tool_map_tokens
         WHERE issue_id=tool_id),
    'R84-06 tool reverse matches original private canonical and derived map');
  END LOOP;
 END LOOP;

 -- Invalid row-level tool reconfiguration must still fail closed for P1.
 bad:=false;
 BEGIN
  UPDATE public.campaign_tool_issues SET config='{"span":4}'::jsonb
   WHERE id=tool_id;
 EXCEPTION WHEN others THEN bad:=true;END;
 PERFORM public.b08_assert(bad AND
  (SELECT config='{"span":2}'::jsonb FROM public.campaign_tool_issues
   WHERE id=tool_id),
  'R84-07 original tool validation prevents player reconfiguration');

 -- Original token protected-field trigger must also still reject P1 edits.
 bad:=false;
 BEGIN
  UPDATE public.map_tokens SET owner_id=viewer2 WHERE id=token_id;
 EXCEPTION WHEN others THEN bad:=true;END;
 PERFORM public.b08_assert(bad AND
  (SELECT owner_id=actor FROM public.map_tokens WHERE id=token_id),
  'R84-08 original token protected-fields rejects foreign owner overwrite');

 -- The DM's privilege bypass for ordinary field edits MUST NOT bypass
 -- source-real token map/campaign identity validation.
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 bad:=false;
 BEGIN
  UPDATE public.map_tokens SET campaign_id=viewer2 WHERE id=token_id;
 EXCEPTION WHEN others THEN bad:=true;END;
 PERFORM public.b08_assert(bad AND
  (SELECT campaign_id=campaign FROM public.map_tokens WHERE id=token_id),
  'R84-09 DM map/campaign mismatch rejected by original token validator');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);

 -- A published wall must reject a mount crossing BEFORE canonical update
 -- and must NOT reveal private wall coordinates in public Advance.
 UPDATE public.map_environments SET live='{"objects":[
  {"type":"wall","blocksMovement":true,"points":[{"x":3.5,"y":0},
  {"x":3.5,"y":15}]}],"ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id=test_map;
 begin_ack:=public.begin_world_motion_v2(test_map,selection,
  '{"x":1,"y":7}'::jsonb,'drag',1,1,false);
 sid:=(begin_ack->>'sessionId')::uuid;
 advance_ack:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":7}'::jsonb,'[{"x":2,"y":7}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  sid IS NOT NULL
  AND advance_ack->>'blocked'='true'
  AND jsonb_array_length(advance_ack->'accepted')=0
  AND NOT (advance_ack ? 'wallGeometry')
  AND NOT (advance_ack ? 'scene')
  AND (SELECT x=1 AND y=7 FROM public.campaign_tool_issues WHERE id=tool_id),
  'R84-10 source-real issued-tool collision: no wall crossing or leaked geometry');

 -- Restore scene and verify a signed tool session cannot Commit after
 -- membership revocation (it may fail by NULL or by a closed exception).
 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id=test_map;
 begin_ack:=public.begin_world_motion_v2(test_map,selection,
  '{"x":1,"y":7}'::jsonb,'drag',1,1,false);
 sid:=(begin_ack->>'sessionId')::uuid;
 advance_ack:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":7}'::jsonb,'[{"x":2,"y":7}]'::jsonb,1,1);
 UPDATE public.campaign_members SET role='spectator'
  WHERE campaign_id=campaign AND user_id=actor;
 commit_ack:=NULL;
 bad:=false;
 BEGIN
  commit_ack:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":7}'::jsonb,1,1);
 EXCEPTION WHEN others THEN bad:=true;END;
 PERFORM public.b08_assert(
  sid IS NOT NULL AND advance_ack->>'blocked'='false'
  AND (bad OR commit_ack IS NULL)
  AND (SELECT x=1 AND y=7 FROM public.campaign_tool_issues WHERE id=tool_id),
  'R84-11 revoked player may not finalize signed tool move');
 UPDATE public.campaign_members SET role='player'
  WHERE campaign_id=campaign AND user_id=actor;

 UPDATE forge_visibility.map_rules SET fog_enforced=true WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM pg_temp.r84_tool_samples)
  AND (SELECT x=1 AND y=7 AND revision=9 FROM public.campaign_tool_issues
        WHERE id=tool_id)
  AND (SELECT count(*)=4 FROM pg_temp.r84_tool_samples WHERE map_sync_ok)
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token_id),
  'R84-12 eight signed tool Commits and hostile cases preserve canonical tool/token after rollback');
END $r84_tool_signed$;

SELECT pg_stat_clear_snapshot();
CREATE TEMP TABLE r84_tool_function_delta ON COMMIT DROP AS
SELECT n.nspname AS schema_name,p.proname AS function_name,
  (a.calls-coalesce(b.calls,0))::bigint AS calls,
  greatest(0,a.total_time-coalesce(b.total_time,0))::double precision AS inclusive_ms,
  greatest(0,a.self_time-coalesce(b.self_time,0))::double precision AS self_ms
FROM pg_stat_xact_user_functions a
LEFT JOIN pg_temp.r84_tool_functions_before b ON b.funcid=a.funcid
JOIN pg_proc p ON p.oid=a.funcid JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE a.calls>coalesce(b.calls,0)
 AND n.nspname IN('public','forge_visibility','forge_world_v2');

DO $r84_tool_profile_assert$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM pg_temp.r84_tool_function_delta
   WHERE (schema_name,function_name) IN (
    ('public','reject_direct_tool_inventory_overwrite'),
    ('public','sync_campaign_tool_map_token'),
    ('public','validate_campaign_tool_write'),
    ('forge_visibility','enforce_tool_collision')) AND calls>=8)
  AND (SELECT count(*)=4 FROM pg_temp.r84_tool_samples)
  AND (SELECT x=1 AND y=7 FROM public.campaign_tool_issues
       WHERE id='00000000-0000-4000-8000-000000000201'::uuid),
  'R84-13 observed all four original issued-tool x/y trigger functions across eight signed canonical Commits');
END $r84_tool_profile_assert$;
-- Bounded aggregate data only; no token IDs, paths, world geometry or sight.
SELECT schema_name,function_name,calls,
 round(inclusive_ms::numeric,2) AS inclusive_ms,
 round(self_ms::numeric,2) AS self_ms
FROM pg_temp.r84_tool_function_delta
WHERE (schema_name,function_name) IN (
 ('public','commit_world_motion_v2'),
 ('public','reject_direct_tool_inventory_overwrite'),
 ('public','sync_campaign_tool_map_token'),
 ('public','validate_campaign_tool_write'),
 ('forge_visibility','enforce_tool_collision'))
ORDER BY schema_name,function_name;
SELECT fog,count(*) AS samples,round(avg(commit_ms)::numeric,3) AS
 synthetic_mean_tool_commit_ms FROM pg_temp.r84_tool_samples
 GROUP BY fog ORDER BY fog;
