-- B10-R18-48 NARROW UNVERSIONED SEAL: R18-26/27 explicitly EXCLUDED.
-- Must run ONLY after R05 -> R46 five-source capture -> R17/19/20 ->
-- R28/30, without R26 step prefilter nor R27 Commit empty-work overlay.
-- Original step_allowed is SNAPSHOTTED and sealed unchanged. Existing
-- R46 recovery restores the four touched geometry/legacy trigger functions
-- and safely revalidates the unchanged fifth source and 4 R05 originals.
-- DRY RUN / DISPOSABLE PG17 ONLY. Do not apply to live Supabase.
-- R18-48 narrow seal of source-backed post-R05 candidate code.
-- Must run AFTER R18-17/19/20/28/30 and BEFORE committing the
-- reviewed installation transaction(s) in a disposable PG17 rehearsal.
-- Saves installed fingerprints; post-commit recovery rejects unknown drift.
DO $r46_pre_seal$
DECLARE rec record; current_md5 text;
BEGIN
 IF to_regclass('forge_world_v2.motion_r46_source_backup') IS NULL
  OR (SELECT count(*) FROM forge_world_v2.motion_r46_source_backup)<>5
  OR EXISTS(SELECT 1 FROM forge_world_v2.motion_r46_source_backup
   WHERE sealed_at IS NOT NULL OR installed_digest IS NOT NULL)
  OR to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NULL
  OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL
 THEN RAISE EXCEPTION 'R46 seal STOP: incomplete sequence or already sealed';END IF;
 FOR rec IN SELECT * FROM forge_world_v2.motion_r46_source_backup LOOP
  IF to_regprocedure(rec.signature) IS NULL OR
   md5(rec.old_definition) IS DISTINCT FROM rec.original_digest THEN
    RAISE EXCEPTION 'R46 seal STOP: missing original or replacement source for %',rec.signature;
  END IF;
  current_md5:=md5(pg_get_functiondef(to_regprocedure(rec.signature)));
  -- Narrow release deliberately leaves the R18-26 step validator
  -- ORIGINAL: sealed digests may be equal only for this exact signature.
  -- Wall swept helpers and the two legacy collision triggers MUST change.
  IF current_md5 IS NULL OR
     (rec.signature LIKE 'forge_world_v2.step_allowed(%'
       AND (current_md5<>rec.original_digest
        OR rec.original_digest<>'6dcd75ce4719cd0bf6173f77f75fdf32')) OR
     (rec.signature NOT LIKE 'forge_world_v2.step_allowed(%'
       AND current_md5=rec.original_digest) THEN
   RAISE EXCEPTION 'R48 narrow seal STOP: expected 4 replacements and unmodified original step validator %',rec.signature;
  END IF;
  UPDATE forge_world_v2.motion_r46_source_backup
  SET installed_digest=current_md5,sealed_at=clock_timestamp()
  WHERE signature=rec.signature;
 END LOOP;
 IF (SELECT count(*) FROM forge_world_v2.motion_r46_source_backup
     WHERE sealed_at IS NOT NULL AND installed_digest IS NOT NULL)<>5
 THEN RAISE EXCEPTION 'R46 seal STOP: incomplete replacement digests';END IF;
END $r46_pre_seal$;

CREATE TABLE forge_world_v2.motion_r46_guard_seal(
 id integer PRIMARY KEY CHECK(id=1),
 function_digest text NOT NULL CHECK(length(function_digest)=32),
 map_trigger_digest text NOT NULL CHECK(length(map_trigger_digest)=32),
 token_trigger_digest text NOT NULL CHECK(length(token_trigger_digest)=32),
 sealed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forge_world_v2.motion_r46_guard_seal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.motion_r46_guard_seal FROM PUBLIC,anon,authenticated;

DO $r46_seal_guard$
DECLARE
 guard_oid oid; map_o oid;token_o oid;
 map_def text;token_def text;guard_def text;
BEGIN
 guard_oid:=to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()');
 SELECT t.oid,pg_get_triggerdef(t.oid) INTO map_o,map_def
 FROM pg_trigger t WHERE t.tgrelid='public.battle_maps'::regclass
  AND t.tgname='forge_map_campaign_affinity_r18_20'
  AND t.tgfoid=guard_oid AND t.tgenabled='O' AND NOT t.tgisinternal;
 SELECT t.oid,pg_get_triggerdef(t.oid) INTO token_o,token_def
 FROM pg_trigger t WHERE t.tgrelid='public.map_tokens'::regclass
  AND t.tgname='forge_token_campaign_affinity_r18_20'
  AND t.tgfoid=guard_oid AND t.tgenabled='O' AND NOT t.tgisinternal;
 guard_def:=pg_get_functiondef(guard_oid);
 IF guard_oid IS NULL OR map_o IS NULL OR token_o IS NULL
  OR guard_def IS NULL
  OR position('Campaign identity cannot change via direct UPDATE' IN guard_def)=0
  OR position('BEFORE UPDATE OF campaign_id' IN map_def)=0
  OR position('BEFORE UPDATE OF campaign_id' IN token_def)=0
  OR (SELECT count(*) FROM pg_trigger WHERE tgfoid=guard_oid)<>2
  OR has_schema_privilege('anon','forge_world_v2','USAGE')
  OR has_schema_privilege('authenticated','forge_world_v2','USAGE')
  OR has_function_privilege('anon',guard_oid,'EXECUTE')
  OR has_function_privilege('authenticated',guard_oid,'EXECUTE')
 THEN RAISE EXCEPTION 'R46 seal STOP: campaign trigger topology/ACL drift';END IF;
 INSERT INTO forge_world_v2.motion_r46_guard_seal(
  id,function_digest,map_trigger_digest,token_trigger_digest)
 VALUES(1,md5(guard_def),md5(map_def),md5(token_def));
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
  'forge_world_v2.motion_r46_guard_seal'::regclass)
 THEN RAISE EXCEPTION 'R46 seal STOP: missing private RLS';END IF;
 RAISE NOTICE 'R18-46 seal PASS: four replacement functions plus one unchanged original step validator and two campaign triggers, private ACLs, exact postrelease fingerprints';
END $r46_seal_guard$;
