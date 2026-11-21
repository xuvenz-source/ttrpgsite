-- R205: bounded eight-name authorization-review queue from original current catalog.
-- The seven functions with no direct auth.uid, plus one function with a
-- user-editable metadata lexical marker. Known public routine names, hashes
-- and fixed structural booleans only. NO SQL bodies, signatures, arguments,
-- private migration sources, users, JWT values or campaign records.
WITH eligible AS (
 SELECT p.proname,p.oid,p.prosrc
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
   AND has_function_privilege('authenticated',p.oid,'EXECUTE')
), flags AS (
 SELECT proname,oid,prosrc,
  (prosrc ~* 'auth\s*\.\s*uid\s*\(') AS direct_uid,
  (prosrc ~* '\mcampaign_members\M') AS direct_membership,
  (prosrc ~* '\mraw_user_meta_data\M|\muser_metadata\M') AS metadata_word,
  (prosrc ~* '\mcan_edit_campaign_sheet\M') AS calls_edit_helper,
  (prosrc ~* '\mis_campaign_dm\M') AS calls_dm_helper,
  (prosrc ~* '\mcan_view_campaign_map\M') AS calls_map_helper,
  (prosrc ~* '\mget_campaign_sheet_inventory\M') AS calls_inventory_helper,
  (prosrc ~* '\mEXISTS\M') AS exists_word,
  (prosrc ~* '\mUPDATE\M|\mDELETE\M|\mINSERT\M|\mTRUNCATE\M')
    AS write_verb_word,
  (prosrc ~* '\mDELETE\M') AS delete_word
 FROM eligible
)
SELECT proname AS known_public_function_name,
 octet_length(prosrc)::int AS source_bytes,
 encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS body_sha256,
 direct_uid,direct_membership,metadata_word,
 calls_edit_helper,calls_dm_helper,calls_map_helper,
 calls_inventory_helper,exists_word,write_verb_word,delete_word
FROM flags
WHERE NOT direct_uid OR metadata_word
ORDER BY metadata_word DESC,proname;
