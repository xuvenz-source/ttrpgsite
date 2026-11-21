-- R18-209: five currently installed original World Motion V2 phases + visibility guard.
-- SELECT-only pg_catalog. Raw function bodies, arguments, table rows, JWTs,
-- IDs and exact SQL never leave the server. Output names refer ONLY to
-- known public RPCs. Markers/offsets are lexical, not authorized execution.
WITH sources AS (
 SELECT p.oid,p.proname,p.prosrc,p.pronargs,p.prosecdef,
  COALESCE('search_path=""'=ANY(p.proconfig),false) AS empty_search_path,
  pg_get_userbyid(p.proowner)='postgres' AS postgres_owned,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_callable,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_callable
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f'
 AND p.proname IN('begin_world_motion_v2','advance_world_motion_v2',
 'commit_world_motion_v2','cancel_world_motion_v2','can_view_campaign_map')
), metrics AS (
 SELECT *,regexp_instr(prosrc,'\mcan_view_campaign_map\s*\(',1,1,0,'i')::int AS map_guard_pos,
 regexp_instr(prosrc,'\mis_campaign_dm\s*\(',1,1,0,'i')::int AS dm_guard_pos,
 regexp_instr(prosrc,'\mFOR\s+UPDATE\M',1,1,0,'i')::int AS first_row_lock_pos,
 regexp_instr(prosrc,'\mUPDATE\s+public\s*\.',1,1,0,'i')::int AS first_qualified_update_pos,
 regexp_instr(prosrc,'\mactor_id\s*=\s*auth\s*\.\s*uid\s*\(',1,1,0,'i')::int AS direct_actor_eq_pos,
 regexp_count(prosrc,'\mFOR\s+UPDATE\M',1,'i')::int AS row_lock_count,
 prosrc ~* '\mINSERT\M' AS insert_word,
 prosrc ~* '\mUPDATE\M' AS update_word,
 prosrc ~* '\mDELETE\M' AS delete_word,
 prosrc ~* 'auth\s*\.\s*uid\s*\(' AS direct_uid,
 prosrc ~* '\mcampaign_members\M' AS direct_membership,
 prosrc ~* '\mcan_view_campaign_map\s*\(' AS map_helper,
 prosrc ~* '\mis_campaign_dm\s*\(' AS dm_helper
 FROM sources
)
SELECT proname AS known_public_rpc, pronargs AS input_arg_count,
 octet_length(prosrc)::int AS body_bytes,
 encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS body_sha256,
 prosecdef,postgres_owned,empty_search_path,auth_callable,anon_callable,
 direct_uid,direct_membership,map_helper,dm_helper,
 direct_actor_eq_pos>0 AS actor_equals_uid_marker,
 map_guard_pos,dm_guard_pos,first_row_lock_pos,
 first_qualified_update_pos,row_lock_count,insert_word,update_word,delete_word,
 (map_guard_pos>0 AND first_qualified_update_pos>map_guard_pos)
  AS map_helper_before_first_qualified_update
FROM metrics
ORDER BY CASE proname
 WHEN 'begin_world_motion_v2' THEN 1
 WHEN 'advance_world_motion_v2' THEN 2
 WHEN 'commit_world_motion_v2' THEN 3
 WHEN 'cancel_world_motion_v2' THEN 4
 ELSE 5 END;
