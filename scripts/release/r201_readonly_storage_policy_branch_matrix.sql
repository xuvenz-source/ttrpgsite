-- B10-R18-201 — READ-ONLY anonymous per-policy Storage SELECT branch inventory.
-- Runs exclusively as a fixed SELECT on independently verified original project.
-- Outputs only synthetic ordinal slots and structural booleans; NEVER policy SQL,
-- names, bucket names, object keys/paths, user identities or signed URLs.
-- Slot order is opaque, SHA-digest-sorted and NOT policy identity.
WITH current_policies AS (
 SELECT p.oid,p.polroles,p.polpermissive,
  COALESCE(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'') AS using_text,
  p.polqual IS NULL AS missing_using
 FROM pg_catalog.pg_policy p
 JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage' AND c.relname='objects' AND p.polcmd IN ('r','*')
), anonymous_classification AS (
 SELECT
  row_number() OVER (ORDER BY md5(using_text),oid)::int AS anonymous_slot,
  polpermissive,
  (0::oid=ANY(polroles) OR 'authenticated'::regrole::oid=ANY(polroles))
    AS role_applies_authenticated,
  (0::oid=ANY(polroles) OR 'anon'::regrole::oid=ANY(polroles))
    AS role_applies_anon,
  missing_using,
  using_text ~* '\mbucket_id\M' AS has_bucket,
  using_text ~* 'auth\s*\.\s*uid\s*\(' AS direct_uid,
  using_text ~* '\mcampaign_members\M' AS direct_membership,
  using_text ~* '\mcan_view_campaign_map\M' AS map_helper,
  using_text ~* '\mowner\b|\mowner_id\M' AS owner_marker,
  using_text ~* '\mname\M|\mstorage\s*\.\s*foldername\M' AS path_marker,
  using_text ~* '\mEXISTS\M' AS exists_marker,
  using_text ~* '\mAND\M' AS and_word,
  using_text ~* '\mOR\M' AS or_word,
  using_text ~* '\mtrue\M' AS true_word,
  using_text ~* '\mraw_user_meta_data\M|\muser_metadata\M' AS user_metadata_marker,
  using_text ~* '\mauth\s*\.\s*jwt\M' AS jwt_marker
 FROM current_policies
)
SELECT * FROM anonymous_classification ORDER BY anonymous_slot;
