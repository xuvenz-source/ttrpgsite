-- B10-R18-77. UNVERSIONED, SOURCE-EXACT, OPERATOR-GATED ROLLBACK.
-- NOT a migration. Refuses an unknown, modified or partially installed ray.
-- Must be executed with an independent, transaction-local rollback-only GUC.
-- One PostgreSQL DO statement is atomic; any failed gate rolls back the DDL.
DO $r77_rollback$
DECLARE
 fn regprocedure:=to_regprocedure(
  'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)');
 before_row pg_proc%ROWTYPE;
 after_row pg_proc%ROWTYPE;
 optimized_source text;
 original_source text;
 verified_forward_source text;
 anchor1 text:='forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)';
 anchor2 text:='forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay)';
 anchor3 text:='forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)';
 anchor4 text:='forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)';
 inline1 text:='((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))';
 inline2 text:='((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))';
 inline3 text:='((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))';
 inline4 text:='((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))';
 version_count integer;
 reviewed_count integer;
 fog_hash text;
BEGIN
 IF current_user<>'postgres'
  OR current_database() NOT IN ('postgres','world_v2_b10_r05') THEN
  RAISE EXCEPTION 'R77 rollback refused: requires audited postgres operator';
 END IF;
 IF current_setting('forge.r18_77_release_authorization',true)
    IS DISTINCT FROM 'sealed_post_83_plus_8_ray_inline_rollback_only' THEN
  RAISE EXCEPTION 'R77 rollback refused: independent rollback authorization missing';
 END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'R77 rollback refused: official migration history absent';
 END IF;
 SELECT count(*) INTO version_count FROM supabase_migrations.schema_migrations;
 SELECT count(*) INTO reviewed_count
 FROM supabase_migrations.schema_migrations
 WHERE version::text=ANY(ARRAY[
  '20261111023204','20261113021005','20261113021007','20261113021010',
  '20261113021012','20261113021020','20261113021022','20261113024116'
 ]::text[]);
 IF version_count<>91 OR reviewed_count<>8 OR
  (SELECT max(version::text) FROM supabase_migrations.schema_migrations)
   <>'20261113024116' THEN
  RAISE EXCEPTION 'R77 rollback refused: exact approved 83+8 history absent';
 END IF;
 IF fn IS NULL
  OR to_regprocedure('forge_visibility.cross2(double precision,double precision,double precision,double precision)') IS NULL
  OR to_regprocedure('forge_visibility.wall_passes(jsonb,jsonb,text,text)') IS NULL
  OR to_regprocedure('forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)') IS NULL
  OR to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'R77 rollback refused: expected private dependency missing';
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
  RAISE EXCEPTION 'R77 rollback refused: dependent original helper drift';
 END IF;
 fog_hash:=md5(pg_get_functiondef(to_regprocedure(
  'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')));
 IF fog_hash NOT IN (
  'ee3356af321fec1a3e167a75c6245e86',
  'f37c8d13e8d48bea123b4c811ae6de4d') THEN
  RAISE EXCEPTION 'R77 rollback refused: private viewer fog source drift';
 END IF;
 IF has_schema_privilege('authenticated','forge_visibility','USAGE')
    OR has_schema_privilege('anon','forge_visibility','USAGE')
    OR has_function_privilege('authenticated',
       'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon',
       'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'R77 rollback refused: private visibility ACL drift';
 END IF;
 SELECT * INTO before_row FROM pg_proc WHERE oid=fn;
 optimized_source:=pg_get_functiondef(fn);
 IF before_row.prosecdef IS DISTINCT FROM false
    OR before_row.provolatile IS DISTINCT FROM 's'
    OR before_row.proparallel IS DISTINCT FROM 'u'
    OR before_row.proacl IS NOT NULL
    OR before_row.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR pg_get_userbyid(before_row.proowner)<>'postgres'
    OR before_row.pronargdefaults<>1
    OR (SELECT l.lanname FROM pg_language l WHERE l.oid=before_row.prolang)<>'plpgsql'
 THEN RAISE EXCEPTION 'R77 rollback refused: private ray function properties drift';
 END IF;
 IF (length(optimized_source)-length(replace(optimized_source,inline1,'')))<>length(inline1)
  OR (length(optimized_source)-length(replace(optimized_source,inline2,'')))<>length(inline2)
  OR (length(optimized_source)-length(replace(optimized_source,inline3,'')))<>length(inline3)
  OR (length(optimized_source)-length(replace(optimized_source,inline4,'')))<>length(inline4)
  OR position('forge_visibility.cross2(' IN optimized_source)>0 THEN
  RAISE EXCEPTION 'R77 rollback refused: four verified inline source anchors absent';
 END IF;
 original_source:=replace(optimized_source,inline1,anchor1);
 original_source:=replace(original_source,inline2,anchor2);
 original_source:=replace(original_source,inline3,anchor3);
 original_source:=replace(original_source,inline4,anchor4);
 IF md5(original_source)<>'a9fc198168c29fd5d80041b05337017e' THEN
  RAISE EXCEPTION 'R77 rollback refused: candidate is not a sealed transform of original';
 END IF;
 verified_forward_source:=replace(original_source,anchor1,inline1);
 verified_forward_source:=replace(verified_forward_source,anchor2,inline2);
 verified_forward_source:=replace(verified_forward_source,anchor3,inline3);
 verified_forward_source:=replace(verified_forward_source,anchor4,inline4);
 IF verified_forward_source IS DISTINCT FROM optimized_source THEN
  RAISE EXCEPTION 'R77 rollback refused: candidate differs from reviewed source';
 END IF;
 -- Roll back only the exact source this candidate was derived from.
 -- No user or map data are interpolated into the DDL.
 EXECUTE original_source;
 SELECT * INTO after_row FROM pg_proc WHERE oid=fn;
 IF md5(pg_get_functiondef(fn))<>'a9fc198168c29fd5d80041b05337017e'
  OR after_row.oid IS DISTINCT FROM before_row.oid
  OR after_row.proowner IS DISTINCT FROM before_row.proowner
  OR after_row.proacl IS DISTINCT FROM before_row.proacl
  OR after_row.prosecdef IS DISTINCT FROM before_row.prosecdef
  OR after_row.proconfig IS DISTINCT FROM before_row.proconfig
  OR after_row.provolatile IS DISTINCT FROM before_row.provolatile
  OR after_row.proparallel IS DISTINCT FROM before_row.proparallel
  OR after_row.pronargdefaults IS DISTINCT FROM before_row.pronargdefaults
  OR has_schema_privilege('authenticated','forge_visibility','USAGE')
  OR has_schema_privilege('anon','forge_visibility','USAGE') THEN
  RAISE EXCEPTION 'R77 rollback refused: expected original source or properties not restored';
 END IF;
 RAISE NOTICE 'R77 rollback verified: exact original private ray source and security restored';
END $r77_rollback$;
