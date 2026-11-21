-- R18-200: known map visibility helper SELECT-only current live provenance.
-- No function SQL body, signatures, policy SQL, object paths or user rows output.
SELECT
  count(*)::int AS helper_overloads,
  min(l.lanname) AS helper_language,
  min(octet_length(p.prosrc))::int AS helper_body_utf8_bytes,
  min(encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) AS helper_body_sha256,
  bool_and(p.prosecdef) AS security_definer,
  bool_and(pg_get_userbyid(p.proowner)='postgres') AS postgres_owned,
  bool_and(has_function_privilege('authenticated',p.oid,'EXECUTE')) AS authenticated_execute,
  bool_and(has_function_privilege('anon',p.oid,'EXECUTE')) AS anon_execute,
  bool_and(p.prosrc ~* '\mcampaign_members\M') AS direct_membership_marker,
  bool_and(p.prosrc ~* 'auth\s*\.\s*uid\s*\(') AS direct_auth_uid_marker,
  bool_and(p.prosrc ~* '\mcampaign_player_maps\M') AS direct_player_map_marker,
  bool_and(p.prosrc ~* '\m(?:raw_user_meta_data|user_metadata)\M') AS user_editable_metadata_marker,
  bool_and(EXISTS(
    SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg='search_path=""'
  )) AS explicitly_empty_search_path
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' AND p.proname='can_view_campaign_map';
