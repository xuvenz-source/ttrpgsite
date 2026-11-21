-- R18-204 — current original map visibility helper lexical nesting audit.
-- SELECT-only pg_proc and in-DB character analysis. Never outputs the
-- function body/signature, real records, campaign/member IDs, Storage policy
-- source, bucket/object paths, JWTs or issued signed URLs.
-- Parenthesis-depth markers are NOT formal SQL boolean-semantic approval.
WITH source AS (
 SELECT p.oid,p.prosrc AS body,p.prosecdef,p.proowner,p.proconfig
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='can_view_campaign_map' AND p.prokind='f'
), positions AS (
 SELECT *,
   regexp_instr(body,'\mOR\M',1,1,0,'i') AS or_pos,
   regexp_instr(body,'\mcampaign_members\M',1,1,0,'i') AS member_pos,
   regexp_instr(body,'\mcampaign_player_maps\M',1,1,0,'i') AS player_maps_pos,
   regexp_instr(body,'\mEXISTS\M',1,1,0,'i') AS exists_pos,
   regexp_instr(body,'auth\s*\.\s*uid\s*\(',1,1,0,'i') AS uid1_pos,
   regexp_instr(body,'auth\s*\.\s*uid\s*\(',1,2,0,'i') AS uid2_pos
 FROM source
), char_scan AS (
 SELECT p.*,i,substr(p.body,i,1) AS chr
 FROM positions p CROSS JOIN LATERAL generate_series(1,char_length(p.body)) i
), depths AS (
 SELECT *,
   sum(CASE chr WHEN '(' THEN 1 WHEN ')' THEN -1 ELSE 0 END)
    OVER (PARTITION BY oid ORDER BY i
     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_paren_depth
 FROM char_scan
)
SELECT
 count(DISTINCT oid)::int AS helper_overloads,
 min(octet_length(body))::int AS body_bytes,
 min(encode(sha256(convert_to(body,'UTF8')),'hex')) AS body_sha256,
 bool_and(prosecdef) AS security_definer,
 bool_and(pg_get_userbyid(proowner)='postgres') AS postgres_owned,
 bool_and(has_function_privilege('authenticated',oid,'EXECUTE')) AS authenticated_execute,
 bool_and(NOT has_function_privilege('anon',oid,'EXECUTE')) AS anon_execute_denied,
 min(regexp_count(body,'\mOR\M',1,'i'))::int AS or_word_count,
 min(regexp_count(body,'\mAND\M',1,'i'))::int AS and_word_count,
 min(regexp_count(body,'\mEXISTS\M',1,'i'))::int AS exists_word_count,
 min(regexp_count(body,'\mcampaign_members\M',1,'i'))::int AS member_table_word_count,
 min(regexp_count(body,'\mcampaign_player_maps\M',1,'i'))::int AS player_maps_word_count,
 min(regexp_count(body,'auth\s*\.\s*uid\s*\(',1,'i'))::int AS auth_uid_call_count,
 max(or_pos)::int AS or_token_offset,
 max(CASE WHEN i=or_pos THEN COALESCE(prior_paren_depth,0) END)::int AS or_depth,
 max(CASE WHEN i=exists_pos THEN COALESCE(prior_paren_depth,0) END)::int AS exists_depth,
 max(CASE WHEN i=member_pos THEN COALESCE(prior_paren_depth,0) END)::int AS member_depth,
 max(CASE WHEN i=player_maps_pos THEN COALESCE(prior_paren_depth,0) END)::int AS player_maps_depth,
 max(CASE WHEN i=uid1_pos THEN COALESCE(prior_paren_depth,0) END)::int AS first_uid_depth,
 max(CASE WHEN i=uid2_pos THEN COALESCE(prior_paren_depth,0) END)::int AS second_uid_depth,
 bool_or(i=or_pos AND exists_pos<member_pos AND member_pos<or_pos) AS membership_reference_precedes_or,
 bool_or(i=or_pos AND player_maps_pos<or_pos) AS player_maps_reference_precedes_or,
 bool_and(NOT (body ~* '\mraw_user_meta_data\M|\muser_metadata\M'))
    AS user_editable_metadata_absent
FROM depths;
