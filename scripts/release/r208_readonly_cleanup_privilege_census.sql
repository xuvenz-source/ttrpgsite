-- R208: SELECT-only original live privileged write/cleanup RPC focus.
-- Reviews 8 authenticated-callable postgres-owned definer routines without
-- direct campaign_members/known DM/sheet/map helper text. This absence is
-- NOT an auth flaw: release of one's OWN stale session/lease must remain
-- possible after revocation; no actual signed account behavior is checked.
-- Only known public routine identifiers, source SHA/length and fixed booleans
-- leave PostgreSQL. NO SQL body/signatures, user records, private history or
-- bearer URLs are exported. This is lexical triage, not SQL execution.
WITH names (fn) AS(
 VALUES ('advance_world_motion_v2'),('cancel_world_motion_v2'),
 ('end_authorized_navigation_gesture'),('end_map_motion_previews'),
 ('end_map_motion_sessions'),('get_authorized_map_fog_delta'),
 ('release_campaign_sheet_item'),('release_campaign_tool_item')
), p AS(
 SELECT p.proname,p.prosrc,p.oid,l.lanname,
  pg_get_userbyid(p.proowner) AS owner_name,
  COALESCE('search_path=""'=ANY(p.proconfig),false) AS empty_search_path,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec
 FROM pg_catalog.pg_proc p JOIN names n ON n.fn=p.proname
 JOIN pg_catalog.pg_namespace s ON s.oid=p.pronamespace
  AND s.nspname='public'
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.prokind='f' AND p.prosecdef
)
SELECT p.proname AS known_rpc_name,
 octet_length(p.prosrc)::int AS source_bytes,
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS source_sha256,
 p.lanname AS language,
 (p.owner_name='postgres') AS postgres_owned,
 p.empty_search_path,p.auth_exec,p.anon_exec,
 regexp_count(p.prosrc,'auth\s*\.\s*uid\s*\(',1,'i')::int AS uid_calls,
 p.prosrc ~* '\mWHERE\M' AS has_where_word,
 p.prosrc ~* '\muser_id\M' AS user_id_word,
 p.prosrc ~* '\mholder_id\M' AS holder_id_word,
 p.prosrc ~* '\mactor_id\M' AS actor_id_word,
 p.prosrc ~* '\mcampaign_id\M' AS campaign_id_word,
 p.prosrc ~* '\mmap_id\M' AS map_id_word,
 p.prosrc ~* '\mtoken_id\M' AS token_id_word,
 p.prosrc ~* '\msession_id\M' AS session_id_word,
 p.prosrc ~* '\mDELETE\M' AS delete_word,
 p.prosrc ~* '\mUPDATE\M' AS update_word,
 p.prosrc ~* '\mINSERT\M' AS insert_word,
 p.prosrc ~* '\mFOR\s+UPDATE\M' AS for_update_word,
 p.prosrc ~* '\mget_authorized_map_fog_v2\s*\(' AS fog_guard_helper_word,
 p.prosrc ~* '\mend_map_motion_previews\s*\(' AS preview_cleanup_helper_word,
 p.prosrc ~* '\mraw_user_meta_data\M|\muser_metadata\M' AS editable_metadata_word
FROM p ORDER BY p.proname;
