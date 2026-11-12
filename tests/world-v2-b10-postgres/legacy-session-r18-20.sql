-- B10-R18-20: SOURCE-REAL LIVE LEGACY ADVANCE-SESSION RPC REPLAY.
-- pg_get_functiondef snapshot is read-only from production. This script
-- runs in a disposable PG17 B10 fixture and NEVER commits a live mutation.
-- Viewer status, Realtime transport and bump ticks are TEST STUBS, not proof
-- of actual player LOS, network security or cross-account Auth acceptance.
BEGIN;
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN fog_enforced boolean NOT NULL DEFAULT false;
\i /tmp/world_v2_b10_r18_18_legacy_triggers.sql
\i /tmp/world_v2_b10_r18_19_latest_trajectory.sql
\i supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql

-- Exact live source expects these private session/preview column contracts.
-- Column types were obtained by read-only information_schema inspection.
CREATE TABLE forge_visibility.movement_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,piece_id uuid NOT NULL,kind text NOT NULL,
 map_id uuid NOT NULL,campaign_id uuid NOT NULL,
 base_x integer NOT NULL,base_y integer NOT NULL,
 last_x integer NOT NULL,last_y integer NOT NULL,
 last_seq bigint NOT NULL DEFAULT 0,
 map_width integer NOT NULL,map_height integer NOT NULL,grid_size integer NOT NULL,
 span_x double precision NOT NULL,span_y double precision NOT NULL,
 scene jsonb NOT NULL,attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
 environment_revision bigint NOT NULL,rules_updated_at timestamptz,
 collision_enforced boolean NOT NULL,ignore_collision boolean NOT NULL DEFAULT false,
 token_visible boolean NOT NULL DEFAULT true,
 base_updated_at timestamptz,base_tool_revision bigint,
 character_id uuid,character_updated_at timestamptz,
 last_sent timestamptz,expires_at timestamptz NOT NULL
);
CREATE TABLE forge_visibility.movement_preview_rates(
 actor_id uuid NOT NULL,piece_id uuid NOT NULL,
 last_sent timestamptz NOT NULL DEFAULT now(),last_seq bigint NOT NULL,
 map_id uuid NOT NULL,kind text NOT NULL,
 base_x integer NOT NULL,base_y integer NOT NULL,
 last_x integer NOT NULL,last_y integer NOT NULL,
 PRIMARY KEY(actor_id,piece_id)
);
ALTER TABLE forge_visibility.movement_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_visibility.movement_preview_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_visibility.movement_sessions,
 forge_visibility.movement_preview_rates FROM PUBLIC,anon,authenticated;

CREATE TABLE forge_visibility.r20_tick_count(map_id uuid PRIMARY KEY,n bigint NOT NULL DEFAULT 0);
CREATE OR REPLACE FUNCTION forge_visibility.bump_viewer_ticks(
 p_map uuid,p_viewers uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r20$
BEGIN
 INSERT INTO forge_visibility.r20_tick_count(map_id,n)
 VALUES(p_map,1)
 ON CONFLICT(map_id) DO UPDATE
 SET n=forge_visibility.r20_tick_count.n+1;
END $r20$;
REVOKE ALL ON FUNCTION forge_visibility.bump_viewer_ticks(uuid,uuid[])
 FROM PUBLIC,anon,authenticated;

-- Actual live source of the legacy PUBLIC SECURITY DEFINER RPC is replayed.
\i tests/world-v2-b10-postgres/live-source-r18-20.sql

CREATE OR REPLACE FUNCTION public.r20_issue_legacy(
 p_id uuid,p_actor uuid,p_piece uuid,p_kind text,p_scene jsonb,
 p_seq bigint DEFAULT 0,p_expired boolean DEFAULT false,
 p_ignore_collision boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $r20$
DECLARE
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 rule_stamp timestamptz; rev bigint;collision bool;
 px integer;py integer;sx double precision;sy double precision;
 token_time timestamptz;tool_version bigint;
BEGIN
 SELECT updated_at,collision_enforced INTO rule_stamp,collision
 FROM forge_visibility.map_rules WHERE map_id=test_map;
 SELECT revision INTO rev FROM public.map_environments WHERE map_id=test_map;
 IF p_kind='token' THEN
  SELECT x,y,span_x,span_y,updated_at INTO px,py,sx,sy,token_time
  FROM public.map_tokens WHERE id=p_piece;
 ELSIF p_kind='tool' THEN
  SELECT x,y,CASE WHEN kind='mount' THEN coalesce((config->>'span')::numeric,2)
   ELSE 1 END,revision
  INTO px,py,sx,tool_version
  FROM public.campaign_tool_issues WHERE id=p_piece;
  sy:=sx;
 ELSE RAISE EXCEPTION 'Unexpected legacy fixture kind';END IF;
 INSERT INTO forge_visibility.movement_sessions(
  id,actor_id,piece_id,kind,map_id,campaign_id,base_x,base_y,last_x,last_y,
  last_seq,map_width,map_height,grid_size,span_x,span_y,scene,attributes,
  environment_revision,rules_updated_at,collision_enforced,ignore_collision,
  token_visible,base_updated_at,base_tool_revision,expires_at
 ) VALUES(
  p_id,p_actor,p_piece,p_kind,test_map,campaign,px,py,px,py,
  p_seq,16,16,10,sx,sy,p_scene,'{}'::jsonb,rev,rule_stamp,collision,
  p_ignore_collision,true,token_time,tool_version,
  clock_timestamp()+CASE WHEN p_expired THEN interval '-10 seconds'
   ELSE interval '30 seconds' END);
END $r20$;

DO $r20_legacy$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 other_player uuid:='00000000-0000-4000-8000-000000000012';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 camp uuid:='00000000-0000-4000-8000-000000000001';
 sid uuid:='00000000-0000-4000-8000-000000000301';
 second uuid:='00000000-0000-4000-8000-000000000302';
 blocked uuid:='00000000-0000-4000-8000-000000000303';
 shallow uuid:='00000000-0000-4000-8000-000000000304';
 hidden uuid:='00000000-0000-4000-8000-000000000305';
 failing uuid:='00000000-0000-4000-8000-000000000306';
 tool_sid uuid:='00000000-0000-4000-8000-000000000307';
 stale_tool uuid:='00000000-0000-4000-8000-000000000308';
 expired uuid:='00000000-0000-4000-8000-000000000309';
 override_sid uuid:='00000000-0000-4000-8000-000000000310';
 scene jsonb:='{"objects":[]}'::jsonb;
 wall jsonb; n bigint;published boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.b08_assert(
  (SELECT p.prosecdef AND p.proconfig @> array['search_path=']
   FROM pg_proc p WHERE p.oid=
   'public.advance_map_motion_session_path(uuid,jsonb,bigint)'::regprocedure),
  'S01 true live legacy advance session remains SECURITY DEFINER with empty search_path');
 PERFORM public.r20_issue_legacy(sid,actor,token,'token',scene,0);
 SELECT public.advance_map_motion_session_path(sid,
  '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,1) INTO published;
 PERFORM public.b08_assert(published AND
  (SELECT last_x=2 AND last_y=1 AND last_seq=1
   FROM forge_visibility.movement_sessions WHERE id=sid) AND
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
  'S02 valid legacy token path updates preview only, NOT canonical token');
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM realtime.b07_outbox) AND
  (SELECT count(*)=1 FROM forge_visibility.movement_preview_rates
   WHERE actor_id=actor AND piece_id=token AND last_x=2 AND last_seq=1),
  'S03 valid session emits only private per-viewer observer events');

 SELECT count(*) INTO n FROM realtime.b07_outbox;
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(sid,
  '[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb,1) AND
  (SELECT count(*)=n FROM realtime.b07_outbox),
  'S04 identical sequence replay rejected, no new publication');
 PERFORM set_config('request.jwt.claim.sub',other_player::text,true);
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(sid,
  '[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb,2) AND
  (SELECT count(*)=n FROM realtime.b07_outbox),
  'S05 independent actor cannot hijack movement session');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);

 PERFORM public.r20_issue_legacy(second,actor,token,'token',scene,1);
 UPDATE public.map_tokens SET owner_id=other_player WHERE id=token;
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(second,
  '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,2) AND
  (SELECT count(*)=n FROM realtime.b07_outbox),
  'S06 live ownership revocation prevents further session previews');
 UPDATE public.map_tokens SET owner_id=actor WHERE id=token;

 UPDATE public.map_environments SET revision=2 WHERE map_id=test_map;
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(second,
  '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,2),
  'S07 environment revision revokes stale signed scene');
 UPDATE public.map_environments SET revision=1 WHERE map_id=test_map;
 UPDATE forge_visibility.map_rules SET updated_at=clock_timestamp() WHERE map_id=test_map;
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(second,
  '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,2),
  'S08 rule revision change invalidates legacy movement authority');
 UPDATE forge_visibility.map_rules SET updated_at='2026-11-09T00:00:00Z'
 WHERE map_id=test_map;

 wall:='{"objects":[{"type":"wall","points":[{"x":1.5,"y":0},{"x":1.5,"y":2}],"blocksMovement":true}]}'::jsonb;
 PERFORM public.r20_issue_legacy(blocked,actor,token,'token',wall,3);
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(blocked,
   '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,4) AND
   (SELECT last_seq=3 AND last_x=1 FROM forge_visibility.movement_sessions
    WHERE id=blocked) AND
   (SELECT count(*)=n FROM realtime.b07_outbox),
  'S09 solid wall crossing returns false without emitting movement or observer data');

 wall:='{"objects":[{"type":"wall","points":[{"x":2.95,"y":0},{"x":2.95,"y":3}],"blocksMovement":true}]}'::jsonb;
 PERFORM public.r20_issue_legacy(shallow,actor,token,'token',wall,4);
 PERFORM public.b08_assert(
  public.advance_map_motion_session_path(shallow,
   '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,5),
  'S10 source-real legacy session uses same 0.10-cell edge geometry candidate');
 PERFORM public.b08_assert(
  (SELECT x=1 FROM public.map_tokens WHERE id=token),
  'S11 preview remains noncanonical after edge-clearance movement');

 INSERT INTO forge_visibility.b07_sight_authority(viewer_id,status)
 VALUES(other_player,0),(dm,2)
 ON CONFLICT(viewer_id) DO UPDATE SET status=excluded.status;
 PERFORM public.r20_issue_legacy(hidden,actor,token,'token',scene,5);
 SELECT count(*) INTO n FROM realtime.b07_outbox;
 PERFORM public.b08_assert(
  public.advance_map_motion_session_path(hidden,
   '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,6) AND
  (SELECT count(*)=n+1 FROM realtime.b07_outbox) AND
  (SELECT count(*)=0 FROM realtime.b07_outbox WHERE
    topic='forge-observer:'||test_map::text||':'||other_player::text) AND
  (SELECT count(*)=1 FROM realtime.b07_outbox WHERE
    topic='forge-observer:'||test_map::text||':'||dm::text AND
    message->>'action'='hide'),
  'S12 simulated zero-visibility recipient gets no path, hide-only DM gets no path');

 PERFORM public.r20_issue_legacy(failing,actor,token,'token',scene,6);
 SELECT count(*) INTO n FROM realtime.b07_outbox;
 PERFORM set_config('b07.fail_broadcast','1',true);
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(failing,
   '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,7) AND
   (SELECT last_seq=6 AND last_x=1
    FROM forge_visibility.movement_sessions WHERE id=failing) AND
   (SELECT count(*)=n FROM realtime.b07_outbox),
  'S13 Realtime send failure rolls back preview and observer sequence atomically');
 PERFORM set_config('b07.fail_broadcast','0',true);
 DELETE FROM forge_visibility.b07_sight_authority;

 PERFORM public.r20_issue_legacy(tool_sid,actor,tool,'tool',scene,0);
 PERFORM public.b08_assert(
  public.advance_map_motion_session_path(tool_sid,
   '[{"x":1,"y":7},{"x":2,"y":7}]'::jsonb,8) AND
   (SELECT x=1 AND y=7 FROM public.campaign_tool_issues WHERE id=tool),
  'S14 owned, unheld mount advances preview only; no canonical tool write');
 PERFORM public.r20_issue_legacy(stale_tool,actor,tool,'tool',scene,8);
 UPDATE public.campaign_tool_issues SET held_by_token_id=token WHERE id=tool;
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(stale_tool,
   '[{"x":1,"y":7},{"x":2,"y":7}]'::jsonb,9),
  'S15 held tool no longer authorizes its old movement session');
 UPDATE public.campaign_tool_issues SET held_by_token_id=NULL WHERE id=tool;
 UPDATE public.campaign_tool_issues SET revision=revision+1 WHERE id=tool;
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(stale_tool,
   '[{"x":1,"y":7},{"x":2,"y":7}]'::jsonb,9),
  'S16 issued tool revision change revokes stale session');

 PERFORM public.r20_issue_legacy(expired,actor,token,'token',scene,0,true);
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(expired,
   '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,10),
  'S17 expired gesture never advances or publishes');

 PERFORM public.r20_issue_legacy(override_sid,actor,token,'token',scene,0,false,true);
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(override_sid,
   '[{"x":1,"y":1},{"x":2,"y":1}]'::jsonb,11),
  'S18 non-DM cannot retain ignore-collision override');
 PERFORM public.b08_assert(
  NOT public.advance_map_motion_session_path(override_sid,'[]'::jsonb,12)
  AND NOT public.advance_map_motion_session_path(override_sid,
   '[{"x":1.5,"y":1},{"x":2,"y":1}]'::jsonb,13),
  'S19 malformed path and fractional positions rejected at legacy RPC boundary');
 PERFORM public.b08_assert(
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token) AND
  (SELECT x=1 AND y=7 FROM public.campaign_tool_issues WHERE id=tool) AND
  NOT has_schema_privilege('authenticated','forge_visibility','USAGE'),
  'S20 canonical position unchanged, private geometry still inaccessible');

 RAISE NOTICE 'R18-20: 20 live-source legacy session/observer-stub assertions PASSED';
END $r20_legacy$;
ROLLBACK;
