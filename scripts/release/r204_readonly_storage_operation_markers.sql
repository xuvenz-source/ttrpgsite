-- R204 current original Storage policy operation discriminator markers.
-- ONLY aggregate counts. No policy SQL, bucket names/values, object paths,
-- signed URLs or user records returned. Read-only pg_catalog SELECT.
WITH p AS (
 SELECT COALESCE(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'') AS expr
 FROM pg_catalog.pg_policy p
 JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage' AND c.relname='objects' AND p.polcmd IN('r','*')
)
SELECT count(*)::int AS select_applicable_policy_count,
 count(*) FILTER(WHERE expr ~* '\mallow_only_operation\M')::int
   AS only_operation_helper_count,
 count(*) FILTER(WHERE expr ~* '\mallow_any_operation\M')::int
   AS any_operation_helper_count,
 count(*) FILTER(WHERE expr ~* '\mobject\.list\M')::int
   AS object_list_operation_marker_count,
 count(*) FILTER(WHERE expr ~* '\mobject\.get_authenticated\M')::int
   AS authenticated_download_operation_marker_count,
 count(*) FILTER(WHERE expr ~* '\mcreateSignedUrl\M|\msigned_url\M')::int
   AS signed_url_operation_marker_count,
 count(*) FILTER(WHERE expr ~* '\mstorage\.foldername\M')::int
   AS foldername_marker_count,
 count(*) FILTER(WHERE expr ~* '\mstorage\.filename\M')::int
   AS filename_marker_count,
 count(*) FILTER(WHERE expr ~* '\mowner_id\M')::int
   AS owner_id_marker_count,
 count(*) FILTER(WHERE expr ~* 'auth\s*\.\s*uid\s*\(')::int
   AS auth_uid_marker_count,
 count(*) FILTER(WHERE expr ~* '\mcan_view_campaign_map\M')::int
   AS map_helper_marker_count,
 count(*) FILTER(WHERE expr ~* '\mraw_user_meta_data\M|\muser_metadata\M')::int
   AS editable_metadata_marker_count
FROM p;
