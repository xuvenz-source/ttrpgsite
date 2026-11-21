-- B10-R18-190: READ-ONLY pg_catalog snapshot; no function bodies, SQL or user data returned.
-- Run only on verified original project with explicit read-only execution.
-- This query does NOT execute privileged functions or grant release authority.
WITH definer AS (
 SELECT p.oid, p.proname, p.prosrc, p.proretset, p.prorettype,
        pg_get_functiondef(p.oid) AS definition,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
), active AS (
 SELECT * FROM definer WHERE auth_exec
), metadata AS (
 SELECT *, regexp_instr(prosrc,'\mFROM\M',1,1,0,'i') AS from_pos,
           regexp_instr(prosrc,'\mWHERE\M',1,1,0,'i') AS where_pos
 FROM active
 WHERE definition ~* '\m(raw_user_meta_data|user_metadata)\M'
), fog AS (
 SELECT * FROM active WHERE proname='is_map_fog_published'
)
SELECT
 (SELECT COUNT(*) FROM definer)::int AS public_definers,
 (SELECT COUNT(*) FROM active)::int AS authenticated_callable_definers,
 (SELECT COUNT(*) FROM active WHERE definition ~* 'auth\s*\.\s*(uid|jwt)\s*\(')::int AS direct_identity_markers,
 (SELECT COUNT(*) FROM active WHERE definition !~* 'auth\s*\.\s*(uid|jwt)\s*\(')::int AS missing_direct_identity_markers,
 (SELECT COUNT(*) FROM active WHERE anon_exec)::int AS anonymous_callable_definers,
 (SELECT COUNT(*) FROM metadata)::int AS user_metadata_definer_candidates,
 (SELECT COALESCE(SUM(regexp_count(prosrc,'\m(raw_user_meta_data|user_metadata)\M',1,'i')),0) FROM metadata)::int AS metadata_total_words,
 (SELECT COALESCE(SUM(CASE WHEN from_pos>0 THEN regexp_count(substring(prosrc FROM 1 FOR from_pos-1),'\m(raw_user_meta_data|user_metadata)\M',1,'i') ELSE 0 END),0) FROM metadata)::int AS metadata_words_before_first_from,
 (SELECT COALESCE(SUM(CASE WHEN where_pos>0 THEN regexp_count(substring(prosrc FROM where_pos),'\m(raw_user_meta_data|user_metadata)\M',1,'i') ELSE 0 END),0) FROM metadata)::int AS metadata_words_at_or_after_first_where,
 (SELECT COALESCE(SUM(CASE WHEN where_pos>0 THEN regexp_count(substring(prosrc FROM where_pos),'auth\s*\.\s*uid\s*\(',1,'i') ELSE 0 END),0) FROM metadata)::int AS metadata_function_uid_words_at_or_after_where,
 (SELECT BOOL_AND(proretset AND prorettype='pg_catalog.record'::regtype) FROM metadata) AS metadata_candidate_returns_setof_record,
 (SELECT COUNT(*) FROM fog)::int AS fog_status_authenticated_callable_overloads,
 (SELECT BOOL_AND(prorettype='pg_catalog.bool'::regtype) FROM fog) AS fog_status_returns_boolean,
 (SELECT BOOL_AND(definition ~* 'auth\s*\.\s*(uid|jwt)\s*\(') FROM fog) AS fog_status_has_direct_identity_marker,
 (SELECT BOOL_AND(definition ~* '\mcampaign_members\M') FROM fog) AS fog_status_has_literal_campaign_member_marker,
 (SELECT BOOL_AND(definition ~* '\mcan_view_campaign_map\M') FROM fog) AS fog_status_has_map_view_helper_marker,
 (SELECT BOOL_AND(anon_exec) FROM fog) AS fog_status_anonymous_callable;
