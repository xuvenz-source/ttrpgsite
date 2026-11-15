-- R18-84, ONLY under R54's disposable PostgreSQL 17 BEGIN/ROLLBACK.
-- Extend minimal B04 table SHAPES so unchanged live function bodies can run.
-- Neither DDL, function source nor triggers are production migrations.
\set ON_ERROR_STOP on
DO $r84_preflight$
BEGIN
 IF current_database()<>'world_v2_b10_r05' OR current_user<>'postgres'
 OR to_regclass('pg_temp.r54_samples') IS NOT NULL
 OR to_regclass('forge_visibility.viewer_fog_snapshots') IS NULL
 OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL
 OR (SELECT count(*) FROM forge_world_v2.motion_sessions)<>0
 OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.oid='public.map_tokens'::regclass AND NOT t.tgisinternal
        AND t.tgenabled='O' AND (t.tgtype & 16)=16)<>2
 OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.oid='public.campaign_tool_issues'::regclass AND NOT t.tgisinternal
        AND t.tgenabled='O' AND (t.tgtype & 16)=16)<>0
 THEN RAISE EXCEPTION 'R84 refuses nonisolated/changed original two-trigger fixture';END IF;
END $r84_preflight$;

-- B04 deliberately models only motion-relevant columns; these extra columns
-- preserve references and BEFORE NEW mutations in the source-exact functions.
ALTER TABLE public.map_tokens
 ADD COLUMN npc_template_id uuid,
 ADD COLUMN image_path text,
 ADD COLUMN status_effects jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.campaign_tool_issues
 ADD COLUMN name text NOT NULL DEFAULT 'Test mount',
 ADD COLUMN icon text NOT NULL DEFAULT 'mount',
 ADD COLUMN template_id uuid,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- The source is not rewritten for the fixture. Strict MD5 guard below.
\i tests/world-v2-b10-postgres/r84-live-position-trigger-functions.sql

-- Add the four REAL token x/y trigger paths absent from R54/R83.
CREATE TRIGGER npc_token_sheet_items_rpc_only
 BEFORE UPDATE ON public.map_tokens FOR EACH ROW
 EXECUTE FUNCTION public.reject_direct_sheet_inventory_overwrite();
CREATE TRIGGER tokens_protected
 BEFORE UPDATE ON public.map_tokens FOR EACH ROW
 EXECUTE FUNCTION public.protect_token_fields();
CREATE TRIGGER tokens_touch
 BEFORE UPDATE ON public.map_tokens FOR EACH ROW
 EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tokens_validate
 BEFORE INSERT OR UPDATE ON public.map_tokens FOR EACH ROW
 EXECUTE FUNCTION public.validate_token_map();

-- All four actual production x/y issued-tool paths, including post-write
-- map-token synchronization and source-real collision enforcement.
CREATE TRIGGER campaign_tool_items_rpc_only
 BEFORE UPDATE ON public.campaign_tool_issues FOR EACH ROW
 EXECUTE FUNCTION public.reject_direct_tool_inventory_overwrite();
CREATE TRIGGER campaign_tool_sync_map
 AFTER INSERT OR DELETE OR UPDATE ON public.campaign_tool_issues
 FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_tool_map_token();
CREATE TRIGGER campaign_tool_validate_issue
 BEFORE INSERT OR UPDATE ON public.campaign_tool_issues
 FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_tool_write();
CREATE TRIGGER forge_tool_collision
 BEFORE UPDATE OF map_id,x,y,config ON public.campaign_tool_issues
 FOR EACH ROW EXECUTE FUNCTION forge_visibility.enforce_tool_collision();

DO $r84_verify$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('forge_visibility.enforce_collision()','7e652f0f2334980ccc724e1748d334ba'),
 ('forge_visibility.tick_tokens()','f6c2eef860141bff253024e0f6d8c7ba'),
 ('public.reject_direct_sheet_inventory_overwrite()','14c6e5f2f18d473a807c8f5a4bd3277d'),
 ('public.protect_token_fields()','188ca42e10f52115511eba0a594c29c6'),
 ('public.touch_updated_at()','8639838030b589f3caeaf247e9aa9986'),
 ('public.validate_token_map()','8ddb83de264171910132b2da9979f26c'),
 ('public.reject_direct_tool_inventory_overwrite()','b33940d8d6f5b676b4cf0ec4e0548978'),
 ('public.sync_campaign_tool_map_token()','640b3b7ae479936c45271482a150afaa'),
 ('public.validate_campaign_tool_write()','3968fd2daec5e268c931cdcf42e9bdc7'),
 ('forge_visibility.enforce_tool_collision()','771ea1716498a43210661532f9c24977')
 ) AS source(signature, expected_md5) LOOP
  IF to_regprocedure(r.signature) IS NULL OR
    md5(pg_get_functiondef(to_regprocedure(r.signature)))<>r.expected_md5
  THEN RAISE EXCEPTION 'R84 live function source drift: %',r.signature;END IF;
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=6 FROM pg_trigger t
   WHERE t.tgrelid='public.map_tokens'::regclass AND NOT t.tgisinternal
    AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT count(*)=4 FROM pg_trigger t
   WHERE t.tgrelid='public.campaign_tool_issues'::regclass
    AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT array_agg(t.tgname ORDER BY t.tgname) FROM pg_trigger t
   WHERE t.tgrelid='public.map_tokens'::regclass AND NOT t.tgisinternal
    AND t.tgenabled='O' AND (t.tgtype & 16)=16)
    = ARRAY['forge_player_collision','forge_visibility_token_tick',
      'npc_token_sheet_items_rpc_only','tokens_protected','tokens_touch','tokens_validate']::name[]
  AND (SELECT array_agg(t.tgname ORDER BY t.tgname) FROM pg_trigger t
   WHERE t.tgrelid='public.campaign_tool_issues'::regclass
    AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
    = ARRAY['campaign_tool_items_rpc_only','campaign_tool_sync_map',
      'campaign_tool_validate_issue','forge_tool_collision']::name[]
  AND (SELECT count(*)=4 FROM pg_trigger t
    WHERE t.tgrelid='public.map_tokens'::regclass AND NOT t.tgisinternal
    AND t.tgname IN('npc_token_sheet_items_rpc_only','tokens_protected',
                    'tokens_touch','tokens_validate')
    AND t.tgattr::text='')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE')
  AND NOT has_schema_privilege('anon','forge_world_v2','USAGE'),
  'R84-01 exact 6 token and 4 issued-tool movement UPDATE triggers, original function hashes, private ACL');
 RAISE NOTICE 'R84 disposable source-real trigger inventory: 6/6 token + 4/4 issued-tool x/y; NO production table/RLS parity claim';
END $r84_verify$;
