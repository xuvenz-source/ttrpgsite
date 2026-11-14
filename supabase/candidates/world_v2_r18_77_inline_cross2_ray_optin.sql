-- B10-R18-77. UNVERSIONED, OPT-IN, SOURCE-SEALED, NO-GO.
-- This file is NOT a migration and MUST NOT be applied on current production.
-- A reviewed external release transaction must explicitly set transaction-local
-- forge.r18_77_release_authorization to the exact candidate-only value below.
-- Requires official 83+8 linked Supabase CLI verification, signed multiplayer
-- QA, Free-tier checks and independent operator authorization beforehand.
-- Only four original cross2 calls inside the private ray function are inlined.
-- No grants, client RPCs, tables, triggers, fog schema or movement changes.
-- One DO statement is atomic: every failed gate reverts its DDL.
DO $r77_install$
DECLARE
 fn regprocedure:=to_regprocedure(
  'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)');
 original_row pg_proc%ROWTYPE;
 updated_row pg_proc%ROWTYPE;
 old_source text;
 new_source text;
 anchor1 text:='forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)';
 anchor2 text:='forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay)';
 anchor3 text:='forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)';
 anchor4 text:='forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)';
 new1 text:='((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))';
 new2 text:='((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))';
 new3 text:='((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))';
 new4 text:='((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))';
 version_count integer;
 reviewed_count integer;
 fog_hash text;
BEGIN
 IF current_user<>'postgres'
  OR current_database() NOT IN ('postgres','world_v2_b10_r05') THEN
  RAISE EXCEPTION 'R77 install refused: requires audited postgres operator';
 END IF;
 IF current_setting('forge.r18_77_release_authorization',true)
    IS DISTINCT FROM 'sealed_post_83_plus_8_ray_inline_candidate_only' THEN
  RAISE EXCEPTION 'R77 install refused: explicit independent authorization missing';
 END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'R77 install refused: official migration history missing';
 END IF;
 SELECT count(*) INTO version_count
 FROM supabase_migrations.schema_migrations;
 SELECT count(*) INTO reviewed_count
 FROM supabase_migrations.schema_migrations
 WHERE version::text=ANY(ARRAY[
  '20261111023204','20261113021005','20261113021007','20261113021010',
  '20261113021012','20261113021020','20261113021022','20261113024116'
 ]::text[]);
 IF version_count<>91 OR reviewed_count<>8 OR
   (SELECT max(version::text) FROM supabase_migrations.schema_migrations)
     <>'20261113024116' THEN
  RAISE EXCEPTION 'R77 install refused: exact 83+8 migration state absent';
 END IF;
 IF fn IS NULL OR
  to_regprocedure('forge_visibility.cross2(double precision,double precision,double precision,double precision)') IS NULL
  OR to_regprocedure('forge_visibility.wall_passes(jsonb,jsonb,text,text)') IS NULL
  OR to_regprocedure('forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)') IS NULL
  OR to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'R77 install refused: private dependency missing';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
    <>'65c4bff8aaa6ecf38e335a44e95d874e'
  OR md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.wall_passes(jsonb,jsonb,text,text)')))
    <>'5c52255db93f2a9ed892e684dd11f898'
  OR md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)')))
    <>'cec916b326a14937ceee2e170619cca2' THEN
  RAISE EXCEPTION 'R77 install refused: dependent wall/light helper drift';
 END IF;
 fog_hash:=md5(pg_get_functiondef(to_regprocedure(
  'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')));
 IF fog_hash NOT IN (
  'ee3356af321fec1a3e167a75c6245e86',
  'f37c8d13e8d48bea123b4c811ae6de4d') THEN
  RAISE EXCEPTION 'R77 install refused: private viewer fog source drift';
 END IF;
 IF has_schema_privilege('authenticated','forge_visibility','USAGE')
    OR has_schema_privilege('anon','forge_visibility','USAGE')
    OR has_function_privilege('authenticated',
       'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon',
       'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'R77 install refused: original private visibility grants expanded';
 END IF;
 SELECT * INTO original_row FROM pg_proc WHERE oid=fn;
 old_source:=pg_get_functiondef(fn);
 IF md5(old_source)<>'a9fc198168c29fd5d80041b05337017e'
    OR original_row.prosecdef IS DISTINCT FROM false
    OR original_row.provolatile IS DISTINCT FROM 's'
    OR original_row.proparallel IS DISTINCT FROM 'u'
    OR original_row.proacl IS NOT NULL
    OR original_row.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR pg_get_userbyid(original_row.proowner)<>'postgres'
    OR original_row.pronargdefaults<>1
    OR (SELECT l.lanname FROM pg_language l WHERE l.oid=original_row.prolang)<>'plpgsql'
 THEN RAISE EXCEPTION 'R77 install refused: original source, owner or function ACL drift';
 END IF;
 IF (length(old_source)-length(replace(old_source,anchor1,'')))<>length(anchor1)
  OR (length(old_source)-length(replace(old_source,anchor2,'')))<>length(anchor2)
  OR (length(old_source)-length(replace(old_source,anchor3,'')))<>length(anchor3)
  OR (length(old_source)-length(replace(old_source,anchor4,'')))<>length(anchor4) THEN
  RAISE EXCEPTION 'R77 install refused: expected four source anchors not unique';
 END IF;
 new_source:=replace(old_source,anchor1,new1);
 new_source:=replace(new_source,anchor2,new2);
 new_source:=replace(new_source,anchor3,new3);
 new_source:=replace(new_source,anchor4,new4);
 IF new_source IS NOT DISTINCT FROM old_source
   OR position('forge_visibility.cross2(' IN new_source)>0 THEN
  RAISE EXCEPTION 'R77 install refused: no verified private ray source change';
 END IF;
 -- No dynamic arguments from request, user geometry or JWT enter EXECUTE.
 -- The DDL is derived ONLY from the sealed postgres-owned function source.
 EXECUTE new_source;
 SELECT * INTO updated_row FROM pg_proc WHERE oid=fn;
 IF pg_get_functiondef(fn) IS DISTINCT FROM new_source
  OR updated_row.oid IS DISTINCT FROM original_row.oid
  OR updated_row.proowner IS DISTINCT FROM original_row.proowner
  OR updated_row.proacl IS DISTINCT FROM original_row.proacl
  OR updated_row.prosecdef IS DISTINCT FROM original_row.prosecdef
  OR updated_row.proconfig IS DISTINCT FROM original_row.proconfig
  OR updated_row.provolatile IS DISTINCT FROM original_row.provolatile
  OR updated_row.proparallel IS DISTINCT FROM original_row.proparallel
  OR updated_row.pronargdefaults IS DISTINCT FROM original_row.pronargdefaults
  OR has_schema_privilege('authenticated','forge_visibility','USAGE')
  OR has_schema_privilege('anon','forge_visibility','USAGE') THEN
  RAISE EXCEPTION 'R77 install refused: unexpected definition or privilege change';
 END IF;
 RAISE NOTICE 'R77 candidate verified: exact source inline ray with unchanged security; release gates remain operator-controlled';
END $r77_install$;
