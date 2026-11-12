-- B07 fixture extension for disposable postgres:17 only.
-- Base tests/world-v2-b04-postgres/schema.sql is loaded first.
-- Reconcile the minimal B04 fixture's numeric map dimensions with
-- actual live production types (read-only pg_catalog checked 11 Nov 2026).
-- The original V2 observer_path_status signature requires integer gridSize.
ALTER TABLE public.battle_maps
 ALTER COLUMN grid_size TYPE integer USING grid_size::integer,
 ALTER COLUMN width TYPE integer USING width::integer,
 ALTER COLUMN height TYPE integer USING height::integer;

CREATE SCHEMA realtime;
CREATE TABLE realtime.b07_outbox(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 message jsonb NOT NULL,
 event text NOT NULL,
 topic text NOT NULL,
 is_private boolean NOT NULL
);
ALTER TABLE realtime.b07_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON realtime.b07_outbox FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION realtime.send(
 payload jsonb,event_name text,topic_name text,private boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $b07_test$
BEGIN
 IF current_setting('b07.fail_broadcast',true)='1'
 THEN RAISE EXCEPTION 'B07 simulated transient Realtime failure';END IF;
 INSERT INTO realtime.b07_outbox(message,event,topic,is_private)
 VALUES(payload,event_name,topic_name,private);
END $b07_test$;
REVOKE ALL ON FUNCTION realtime.send(jsonb,text,text,boolean)
 FROM PUBLIC,anon,authenticated;

CREATE TABLE public.campaigns(id uuid PRIMARY KEY,active_map_id uuid);
CREATE TABLE public.campaign_player_maps(
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,map_id uuid NOT NULL,
 PRIMARY KEY(campaign_id,user_id)
);
INSERT INTO public.campaigns(id,active_map_id) VALUES
 ('00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000021');

CREATE TABLE forge_visibility.b07_sight_authority(
 viewer_id uuid PRIMARY KEY,
 status integer NOT NULL CHECK(status BETWEEN 0 AND 2)
);
CREATE OR REPLACE FUNCTION forge_visibility.observer_verified_path_status(
 p_map uuid,p_viewer uuid,p_campaign uuid,p_scene jsonb,
 p_grid integer,p_width integer,p_height integer,p_route jsonb)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $b07_test$
DECLARE status integer;
BEGIN
 -- This controlled vision stub explicitly does NOT prove real LOS/fog.
 -- The actual V2 observer_path_status function is source-extracted intact.
 SELECT a.status INTO status FROM forge_visibility.b07_sight_authority a
 WHERE a.viewer_id=p_viewer;
 RETURN coalesce(status,1);
END $b07_test$;

-- Exact table contract taken from applied V2 observer migration.
CREATE TABLE forge_world_v2.viewer_streams(
 map_id uuid NOT NULL,
 viewer_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 seq bigint NOT NULL DEFAULT 0 CHECK(seq>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(map_id,viewer_id)
);
ALTER TABLE forge_world_v2.viewer_streams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.viewer_streams FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.b07_assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'B07 ASSERTION FAILED: %',label;
 END IF;
 RAISE NOTICE 'PASS B07: %',label;
END $$;
