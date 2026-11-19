-- B10-R18-126 PG17-only Realtime stub and counter fixture.
-- Executed AFTER R125 original synthetic schema, BEFORE R125 SQL candidate.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA realtime;
REVOKE ALL ON SCHEMA realtime FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA realtime TO authenticated;

CREATE TABLE forge_world_v2.scene_publications(
 map_id uuid PRIMARY KEY REFERENCES public.battle_maps(id),
 campaign_id uuid NOT NULL,
 generation bigint NOT NULL,
 changed_at timestamptz NOT NULL
);
REVOKE ALL ON forge_world_v2.scene_publications
 FROM PUBLIC,anon,authenticated;

-- NOT the actual Supabase Realtime service. Synthetic persistent message log
-- exists only for deterministic ACL and fanout tests.
CREATE TABLE realtime.messages(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 topic text NOT NULL,
 extension text NOT NULL,
 event text NOT NULL,
 payload jsonb NOT NULL,
 private boolean NOT NULL
);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON realtime.messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON realtime.messages TO authenticated;

CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path=''
AS $topic$
 SELECT pg_catalog.current_setting('request.jwt.claim.scene_topic',true)
$topic$;
REVOKE ALL ON FUNCTION realtime.topic() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION realtime.topic() TO authenticated;

-- Emulates the old scene receive policy to prove atomic removal by R126.
CREATE POLICY "World V2 scene publication receive"
 ON realtime.messages FOR SELECT TO authenticated
 USING (
  extension='broadcast'
  AND realtime.topic() LIKE 'forge-world-scene-v2:%'
 );

-- This stub must only run as a trusted definer, never from browser roles.
CREATE FUNCTION realtime.send(p_payload jsonb,p_event text,
 p_topic text,p_private boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $send$
BEGIN
 IF p_topic IS NULL OR p_private IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R126 mock attempted public/null scene broadcast';END IF;
 IF pg_catalog.current_setting('r126.fail_viewer',true) IS NOT NULL
  AND pg_catalog.current_setting('r126.fail_viewer',true)<>''
  AND p_topic LIKE '%'||pg_catalog.current_setting('r126.fail_viewer',true)||'%'
 THEN RAISE EXCEPTION 'R126 controlled fake Realtime failure';END IF;
 INSERT INTO realtime.messages(topic,extension,event,payload,private)
 VALUES(p_topic,'broadcast',p_event,p_payload,p_private);
END $send$;
REVOKE ALL ON FUNCTION realtime.send(jsonb,text,text,boolean)
 FROM PUBLIC,anon,authenticated;
COMMIT;
