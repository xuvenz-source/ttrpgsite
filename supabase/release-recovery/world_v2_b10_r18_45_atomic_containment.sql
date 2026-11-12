-- B10-R18-45 INCIDENT CONTAINMENT — NOT A MIGRATION. NEVER AUTO-APPLY.
-- This is a POST-COMMIT EMERGENCY STOP for a previously installed R18-28/30
-- finalizer. It removes authenticated/anon/PUBLIC execute permission from
-- that ONE optional RPC and leaves ordinary Begin/Advance/Commit working.
-- It is NOT a full database rollback. It does not undo already committed
-- token moves, revoke an already-running SQL statement, reverse R05/17/19/20,
-- remove migration history or delete player data.
-- Only a privileged operator after independent approval should use this.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $r45_containment_pre$
DECLARE src text;
BEGIN
 IF to_regclass('forge_world_v2.motion_sessions') IS NULL OR
    to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL OR
    to_regprocedure(
     'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'
    ) IS NULL OR
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
      AND column_name IN ('final_request_r28','final_reply_r28'))<>2 THEN
  RAISE EXCEPTION 'R45 containment STOP: expected versioned atomic release absent/partial';
 END IF;
 IF has_schema_privilege('anon','forge_world_v2','USAGE') OR
    has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
    has_function_privilege('anon',
     'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
     'EXECUTE') OR
    NOT has_function_privilege('authenticated',
     'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
     'EXECUTE') OR
    NOT has_function_privilege('authenticated',
     'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
     'EXECUTE') THEN
  RAISE EXCEPTION 'R45 containment STOP: unexpected browser privileges';
 END IF;
 SELECT pg_get_functiondef(
  'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure
 ) INTO src;
 IF position('final_request_r28' IN src)=0 OR
    position('noMotion' IN src)=0 OR
    position('auth.uid()' IN src)=0 OR
    position('public.advance_world_motion_v2(' IN src)=0 OR
    position('public.commit_world_motion_v2(' IN src)=0 THEN
  RAISE EXCEPTION 'R45 containment STOP: unexpected unreviewed terminal function body';
 END IF;
END $r45_containment_pre$;

-- Removing this grant prevents NEW browser calls using authenticated/anon.
-- In-flight statements and owner/service-role permissions are not stopped.
REVOKE ALL ON FUNCTION public.finalize_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

DO $r45_containment_post$
BEGIN
 IF has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE') OR
    has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE') OR
    has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
    has_schema_privilege('anon','forge_world_v2','USAGE') OR
    NOT has_function_privilege('authenticated',
     'public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)',
     'EXECUTE') OR
    NOT has_function_privilege('authenticated',
     'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
     'EXECUTE') OR
    NOT has_function_privilege('authenticated',
     'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
     'EXECUTE') OR
    to_regprocedure(
     'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'
    ) IS NULL THEN
  RAISE EXCEPTION 'R45 containment STOP: terminal revoke or legacy compatibility failed';
 END IF;
 RAISE NOTICE 'R18-45: authenticated atomic terminal access revoked, existing Begin/Advance/Commit unchanged; NOT full SQL rollback';
END $r45_containment_post$;
COMMIT;
-- After containment: leave BOTH atomic Vercel flags OFF. Existing live
-- browsers must use ordinary Begin/Advance/Commit. Recover R05 itself only
-- through the separately tested, protected 4-function restoration procedure
-- after checking active sessions. Independent P1/P2 permission/observer
-- validation remains required before any reenabling operation.
