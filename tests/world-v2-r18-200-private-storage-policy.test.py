"""R200 fictional 83-file original policy event and map helper SHA tests.

No original private migration, policy SQL, bucket paths or signed URLs in CI.
"""
from datetime import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(".").resolve()
sys.path.insert(0,str(ROOT/"scripts/release"))
import r154_private_history_audit as r154
import r193_private_invite_source_lineage as r193
import r198_private_sheet_auth_lineage as r198
import r200_private_storage_policy_lineage as r200

spec=importlib.util.spec_from_file_location(
 "r193fictional",ROOT/"tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

SHEET_BODY="\nBEGIN RETURN auth.uid() IS NOT NULL;END;\n"
MAP_BODY=("\n SELECT EXISTS(SELECT 1 FROM public.campaign_members m "
          "WHERE m.user_id=auth.uid()) AND EXISTS"
          "(SELECT 1 FROM public.campaign_player_maps WHERE id IS NOT NULL);\n")

def fixture(root:Path,include_map=True,invalid=False):
 folder=fictional.fixture(root,invalid=invalid)
 docket_file=root/"r111-private-review-docket.json"
 docket=json.loads(docket_file.read_text())
 additions={
  15:("CREATE OR REPLACE FUNCTION public.can_edit_campaign_sheet(a uuid,b text,c uuid) "
      "RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' "
      "AS $acl$"+SHEET_BODY+"$acl$;"),
  10:('CREATE POLICY "map-read" ON "storage"."objects" AS PERMISSIVE '
      "FOR SELECT TO authenticated USING (bucket_id='private' AND "
      "public.can_view_campaign_map(NULL,NULL));"),
  40:("CREATE POLICY owner_read ON storage.objects FOR SELECT TO authenticated "
      "USING (auth.uid() IS NOT NULL);"),
  60:("ALTER POLICY owner_read ON storage.objects USING "
      "(auth.uid() IS NOT NULL AND bucket_id='private');"),
  70:('DROP POLICY IF EXISTS "map-read" ON "storage"."objects";'),
  77:("CREATE POLICY restricted_read ON storage.objects AS RESTRICTIVE "
      "FOR SELECT TO authenticated USING "
      "(EXISTS (SELECT 1 FROM public.campaign_members));"),
  80:("DO $dynamic$ BEGIN EXECUTE "
      "'CREATE POLICY dynamic_read ON storage.objects FOR SELECT TO authenticated'; "
      "END $dynamic$;"),
 }
 if include_map:
  additions[71]=(
   "CREATE OR REPLACE FUNCTION public.can_view_campaign_map(a uuid,b uuid) "
   "RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' "
   "AS $visibility$"+MAP_BODY+"$visibility$;"
  )
 for i,new_sql in additions.items():
  item=docket["reviewItems"][i]
  path=folder/item["filename"]
  source=path.read_text()
  source+="\n"+new_sql+"\n"
  path.write_text(source)
  item["sourceBodySha256"]=hashlib.sha256(source.encode()).hexdigest()
 docket_file.write_text(json.dumps(docket))
 return folder

def review(root:Path,map_body=MAP_BODY):
 helper={
  "name":"can_view_campaign_map",
  "body_sha256":hashlib.sha256(map_body.encode()).hexdigest(),
  "body_bytes":len(map_body.encode())
 }
 with patch.object(r193,"TARGETS",fictional.patched_targets()), \
      patch.dict(r198.TARGET,{
       "body_sha256":hashlib.sha256(SHEET_BODY.encode()).hexdigest(),
       "body_bytes":len(SHEET_BODY.encode())}), \
      patch.object(r200,"MAP_HELPER",helper):
  return r200.report(root)

class StorageOriginalHistory(unittest.TestCase):
 def test_83_source_sha_and_quoted_policy_changes(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   fixture(root)
   r=review(root)
   self.assertEqual(r["decision"],"NO_GO")
   self.assertEqual(r["original_historical_migrations_sha256_verified"],83)
   self.assertTrue(r["original_chronology_valid_unique"])
   self.assertEqual(r["historical_direct_map_helper_definitions"],1)
   self.assertTrue(r["latest_map_helper_sha256_matches_current"])
   self.assertTrue(r["latest_map_helper_body_bytes_match_current"])
   self.assertTrue(r["latest_map_helper_direct_auth_uid_marker"])
   self.assertTrue(r["latest_map_helper_direct_membership_marker"])
   self.assertTrue(r["latest_map_helper_direct_player_map_marker"])
   self.assertEqual(r["latest_map_helper_r111_priority_index_not_chronology"],72)
   self.assertEqual(r["historical_direct_storage_objects_policy_events"],5)
   self.assertEqual(r["historical_direct_create_policy_events"],3)
   self.assertEqual(r["historical_direct_alter_policy_events"],1)
   self.assertEqual(r["historical_direct_drop_policy_events"],1)
   self.assertEqual(r["historical_direct_events_with_for_select_marker"],3)
   self.assertEqual(r["historical_direct_events_with_as_restrictive_marker"],1)
   self.assertEqual(r["historical_direct_events_with_to_authenticated_marker"],3)
   self.assertEqual(r["historical_direct_events_with_auth_uid_marker"],2)
   self.assertEqual(r["historical_direct_events_with_campaign_members_marker"],1)
   self.assertEqual(r["historical_direct_events_with_map_helper_marker"],1)
   self.assertEqual(r["historical_direct_events_with_bucket_id_marker"],2)
   self.assertEqual(r["historical_do_block_policy_word_markers"],1)
   self.assertEqual(r["last_direct_policy_event_r111_priority_index_not_chronology"],78)
   self.assertFalse(r["current_live_policy_expression_identity_proven"])
   self.assertFalse(r["storage_policy_permissive_or_and_helper_authorization_proven"])
   self.assertFalse(r["qa_or_production_sql_authorized"])
   for forbidden in ("r106-original","owner_read","map-read",
                     "CREATE POLICY","CREATE FUNCTION","raw_user_meta_data",
                     "private'","dynamic_read"):
    self.assertNotIn(forbidden,json.dumps(r))

 def test_missing_map_helper_reports_no_source_match_not_safe_go(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   fixture(root,include_map=False)
   r=review(root)
   self.assertFalse(r["latest_map_helper_direct_definition_found"])
   self.assertIsNone(r["latest_map_helper_executable_statement_ordinal"])
   self.assertFalse(r["latest_map_helper_sha256_matches_current"])
   self.assertEqual(r["decision"],"NO_GO")

 def test_changed_live_source_fingerprint_never_approved(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   fixture(root)
   r=review(root,map_body=" SELECT FALSE; ")
   self.assertFalse(r["latest_map_helper_sha256_matches_current"])
   self.assertEqual(r["historical_direct_map_helper_definitions"],1)
   self.assertFalse(r["new_signed_url_issuance_denied_to_revoked_hosted_actor_proven"])

 def test_source_hash_tampering_fails_before_export(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   folder=fixture(root)
   target=next(folder.glob("*.sql"))
   target.write_text("SELECT 2;\n")
   with self.assertRaises(r154.AuditBlocked):
    review(root)

 def test_invalid_filenames_fail_closed(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   fixture(root,invalid=True)
   with self.assertRaises(r154.AuditBlocked):
    review(root)

 def test_non_storage_policy_and_non_direct_statements_ignored(self):
  self.assertIsNone(r200.storage_event(
   "CREATE POLICY fake ON public.campaign_members USING (true);"))
  self.assertIsNone(r200.storage_event(
   "SELECT 'CREATE POLICY fake ON storage.objects'"))
  self.assertIsNone(r200.helper_context(
   "CREATE FUNCTION public.unrelated() RETURNS boolean LANGUAGE sql AS $x$ SELECT TRUE $x$;",
   r200.MAP_HELPER))
  self.assertIsNotNone(r200.storage_event(
   'CREATE POLICY "read" ON "storage"."objects" FOR SELECT TO "authenticated" USING (true);'))
  self.assertIsNotNone(r200.storage_event(
   'DROP POLICY IF EXISTS "read" ON "storage"."objects";'))

if __name__=="__main__":
 unittest.main()
