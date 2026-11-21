-- R207: current live privileged authorization helper call graph, SELECT ONLY.
-- Only names of twelve known public routines, byte/hashes, permission flags,
-- static callee slot numbers, direct-membership/identity/metadata markers.
-- The original SQL body, signatures, JWT/user/campaign rows and private
-- migration filenames remain INSIDE Postgres. This is a LEXICAL call graph:
-- regex matches are not executed authorization semantics or RLS signoff.
WITH targets(slot,name) AS (
 VALUES
 (1,'get_campaign_account_names'),(2,'get_campaign_sheet_inventory'),
 (3,'get_dm_map_npc_values'),(4,'get_npc_token_values'),
 (5,'is_map_fog_published'),(6,'patch_campaign_sheet_noninventory'),
 (7,'preview_map_motion'),(8,'publish_map_environment'),
 (9,'can_edit_campaign_sheet_inventory'),(10,'is_campaign_dm'),
 (11,'is_campaign_member'),(12,'can_edit_campaign_sheet')
), src AS (
 SELECT t.slot,p.proname,p.prosrc,p.oid,
   octet_length(p.prosrc)::int AS source_bytes,
   encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS source_sha256,
   p.prosecdef AS is_definer,
   has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
   has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec
 FROM targets t JOIN pg_catalog.pg_proc p ON p.proname=t.name
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  AND n.nspname='public' WHERE p.prokind='f'
), edges AS (
 SELECT a.slot AS caller_slot,b.slot AS callee_slot
 FROM src a JOIN src b ON a.oid<>b.oid
 WHERE a.prosrc ~* ('\m(?:public\s*\.\s*)?'||b.proname||'\s*\(')
)
SELECT a.slot,a.proname AS known_function_name,
 a.source_bytes,a.source_sha256,a.is_definer,a.auth_exec,a.anon_exec,
 COALESCE((SELECT array_agg(e.callee_slot ORDER BY e.callee_slot)
            FROM edges e WHERE e.caller_slot=a.slot),ARRAY[]::int[])
    AS lexical_callee_slots,
 (a.prosrc ~* '\mcampaign_members\M') AS direct_member_marker,
 (a.prosrc ~* 'auth\s*\.\s*uid\s*\(') AS direct_uid_marker,
 (a.prosrc ~* '\mraw_user_meta_data\M|\muser_metadata\M')
   AS editable_metadata_marker,
 (regexp_instr(a.prosrc,'\mraw_user_meta_data\M|\muser_metadata\M',1,1,0,'i')>0
  AND regexp_instr(a.prosrc,'\mWHERE\M',1,1,0,'i')>0
  AND regexp_instr(a.prosrc,'\mraw_user_meta_data\M|\muser_metadata\M',1,1,0,'i')
    < regexp_instr(a.prosrc,'\mWHERE\M',1,1,0,'i'))
    AS metadata_marker_before_first_where,
 (a.prosrc ~* '\mINSERT\M|\mUPDATE\M|\mDELETE\M|\mTRUNCATE\M')
    AS write_verb_marker
FROM src a ORDER BY a.slot;
