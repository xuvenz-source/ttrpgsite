-- R18-205 / B10: original live public SECURITY DEFINER authorization census.
-- SELECT-only pg_catalog: never outputs function SQL, signatures, arguments,
-- user/campaign data, original migrations, credentials or JWTs.
-- Text markers are NOT proof of auth safety or actual DML execution.
WITH public_functions AS (
 SELECT p.oid,p.prosrc,p.proconfig,p.prosecdef,
   pg_get_userbyid(p.proowner) AS owner_role,
   has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_callable,
   has_function_privilege('anon',p.oid,'EXECUTE') AS anon_callable
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f'
), callable AS (
 SELECT *,
   COALESCE('search_path=""'=ANY(proconfig),false) AS empty_search_path,
   EXISTS(SELECT 1 FROM unnest(COALESCE(proconfig,ARRAY[]::text[])) cfg
     WHERE cfg LIKE 'search_path=%') AS any_explicit_search_path,
   (prosrc ~* 'auth\s*\.\s*uid\s*\(') AS direct_uid,
   (prosrc ~* '\mcampaign_members\M') AS direct_member,
   (prosrc ~* '\mis_campaign_dm\M') AS calls_dm_guard,
   (prosrc ~* '\mraw_user_meta_data\M|\muser_metadata\M') AS editable_metadata,
   (prosrc ~* 'auth\s*\.\s*jwt\s*\(') AS jwt_marker,
   (prosrc ~* '\mEXECUTE\M') AS dynamic_execute_word,
   (prosrc ~* '\mTRUNCATE\M') AS truncate_word,
   (prosrc ~* '\mDELETE\M') AS delete_word,
   (prosrc ~* '\mUPDATE\M') AS update_word,
   (prosrc ~* '\mINSERT\M') AS insert_word,
   (prosrc ~* '\mstorage\s*\.\s*objects\M') AS storage_objects_word,
   (prosrc ~* '\mtrue\M') AS true_word,
   (prosrc ~* '\mjoin_campaign\M|\mcreate_campaign\M') AS invite_marker
 FROM public_functions WHERE prosecdef AND auth_callable
)
SELECT
 (SELECT count(*)::int FROM public_functions) AS public_functions_total,
 count(*)::int AS authenticated_callable_security_definer,
 count(*) FILTER(WHERE anon_callable)::int AS also_anon_callable,
 count(*) FILTER(WHERE owner_role='postgres')::int AS postgres_owned,
 count(*) FILTER(WHERE NOT any_explicit_search_path)::int AS no_explicit_search_path,
 count(*) FILTER(WHERE empty_search_path)::int AS empty_search_path,
 count(*) FILTER(WHERE any_explicit_search_path AND NOT empty_search_path)::int
   AS other_search_path,
 count(*) FILTER(WHERE direct_uid)::int AS direct_uid_marker,
 count(*) FILTER(WHERE NOT direct_uid)::int AS missing_direct_uid_marker,
 count(*) FILTER(WHERE direct_member)::int AS direct_membership_marker,
 count(*) FILTER(WHERE NOT direct_uid AND NOT direct_member)::int
   AS missing_both_direct_identity_and_membership_markers,
 count(*) FILTER(WHERE calls_dm_guard)::int AS calls_dm_guard_marker,
 count(*) FILTER(WHERE editable_metadata)::int AS editable_metadata_marker,
 count(*) FILTER(WHERE jwt_marker)::int AS direct_jwt_marker,
 count(*) FILTER(WHERE dynamic_execute_word)::int AS dynamic_execute_word,
 count(*) FILTER(WHERE truncate_word)::int AS truncate_word,
 count(*) FILTER(WHERE delete_word)::int AS delete_word,
 count(*) FILTER(WHERE update_word)::int AS update_word,
 count(*) FILTER(WHERE insert_word)::int AS insert_word,
 count(*) FILTER(WHERE storage_objects_word)::int AS storage_objects_word,
 count(*) FILTER(WHERE true_word)::int AS true_word,
 count(*) FILTER(WHERE invite_marker)::int AS invite_marker,
 min(octet_length(prosrc))::int AS min_function_body_bytes,
 max(octet_length(prosrc))::int AS max_function_body_bytes
FROM callable;
