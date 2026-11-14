-- B10-R18-46 UNVERSIONED CANDIDATE: capture original source BEFORE R18-17/19/20/26.
-- NEVER execute directly against Supabase. Official CLI-created reviewed
-- migrations must invoke this only after frozen R05 and exact source preflight.
-- This stores *code*, not campaign content, in an RLS-protected private table.
-- Must run within the same reviewed/atomic install sequence as its overlays.
DO $r46_before_capture$
DECLARE n int;
BEGIN
 IF to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL
  OR (SELECT count(*) FROM forge_world_v2.motion_r05_function_backup)<>4
  OR to_regclass('forge_world_v2.motion_r46_source_backup') IS NOT NULL
  OR to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NOT NULL
  OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL
  OR has_schema_privilege('anon','forge_world_v2','USAGE')
  OR has_schema_privilege('authenticated','forge_world_v2','USAGE')
 THEN RAISE EXCEPTION 'R46 source capture STOP: unexpected R05 or post-R05 state';END IF;
 SELECT count(*) INTO n FROM forge_world_v2.motion_sessions
 WHERE status='active' AND expires_at>clock_timestamp();
 IF n<>0 THEN RAISE EXCEPTION 'R46 source capture STOP: active motion sessions';END IF;
END $r46_before_capture$;

CREATE TABLE forge_world_v2.motion_r46_source_backup(
 signature text PRIMARY KEY,
 old_definition text NOT NULL CHECK(length(old_definition)>80),
 original_digest text NOT NULL CHECK(length(original_digest)=32),
 installed_digest text CHECK(installed_digest IS NULL OR length(installed_digest)=32),
 original_anon_exec boolean NOT NULL,
 original_auth_exec boolean NOT NULL,
 original_security_definer boolean NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 sealed_at timestamptz,
 CONSTRAINT r46_seal_pair CHECK(
  (installed_digest IS NULL AND sealed_at IS NULL) OR
  (installed_digest IS NOT NULL AND sealed_at IS NOT NULL))
);
ALTER TABLE forge_world_v2.motion_r46_source_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.motion_r46_source_backup FROM PUBLIC,anon,authenticated;

DO $r46_capture$
DECLARE item record; p oid; src text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('forge_world_v2.swept_hits_segment(double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision)','86cbe9a2145e05f8a5f88b05e6b87186'),
 ('forge_visibility.swept_hits_segment(double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision)','95ee819774fc9b4303dffff76c786dee'),
 ('forge_visibility.enforce_collision()','7e652f0f2334980ccc724e1748d334ba'),
 ('forge_visibility.enforce_tool_collision()','771ea1716498a43210661532f9c24977'),
 ('forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)','6dcd75ce4719cd0bf6173f77f75fdf32')
 ) AS pinned(signature,digest) LOOP
  p:=to_regprocedure(item.signature);
  IF p IS NULL THEN
   RAISE EXCEPTION 'R46 source capture STOP: missing %',item.signature;
  END IF;
  src:=pg_get_functiondef(p);
  IF md5(src) IS DISTINCT FROM item.digest THEN
   RAISE EXCEPTION 'R46 source capture STOP: live original hash drift %',item.signature;
  END IF;
  INSERT INTO forge_world_v2.motion_r46_source_backup(
   signature,old_definition,original_digest,
   original_anon_exec,original_auth_exec,original_security_definer)
  SELECT item.signature,src,md5(src),
   has_function_privilege('anon',p,'EXECUTE'),
   has_function_privilege('authenticated',p,'EXECUTE'),pr.prosecdef
  FROM pg_proc pr WHERE pr.oid=p;
 END LOOP;
 IF (SELECT count(*) FROM forge_world_v2.motion_r46_source_backup)<>5
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.motion_r46_source_backup'::regclass)
  OR has_table_privilege('anon',
   'forge_world_v2.motion_r46_source_backup','SELECT')
  OR has_table_privilege('authenticated',
   'forge_world_v2.motion_r46_source_backup','SELECT')
 THEN RAISE EXCEPTION 'R46 source capture STOP: incomplete or exposed private snapshot';END IF;
 RAISE NOTICE 'R18-46 source capture: 5 original function hashes saved in private RLS table BEFORE candidate changes';
END $r46_capture$;
