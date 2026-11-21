"""R198 fictional 83-file private sheet helper lineage, no original SQL in CI."""
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

spec=importlib.util.spec_from_file_location(
 "r193_fixture",ROOT/"tests/world-v2-r18-193-private-invite-source-lineage.test.py"
)
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

OLD_BODY="\nBEGIN RETURN FALSE; END;\n"
NEW_BODY="\nBEGIN RETURN auth.uid() IS NOT NULL; END;\n"

def augment(root:Path,include_target=True,bad_timestamp=False):
 folder=fictional.fixture(root,invalid=bad_timestamp)
 docket_file=root/"r111-private-review-docket.json"
 docket=json.loads(docket_file.read_text())
 if include_target:
  for i,body in ((5,OLD_BODY),(75,NEW_BODY)):
   item=docket["reviewItems"][i]
   path=folder/item["filename"]
   sql=path.read_text()
   sql+="\nCREATE OR REPLACE FUNCTION public.can_edit_campaign_sheet(a uuid,b text,c uuid) "
   sql+="RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' "
   sql+="AS $private_auth$"+body+"$private_auth$;\n"
   path.write_text(sql)
   item["sourceBodySha256"]=hashlib.sha256(sql.encode()).hexdigest()
 docket_file.write_text(json.dumps(docket))
 return folder

def report_with_fictional_source(root:Path):
 with patch.object(r193,"TARGETS",fictional.patched_targets()), \
      patch.dict(r198.TARGET,{
       "body_sha256":hashlib.sha256(NEW_BODY.encode()).hexdigest(),
       "body_bytes":len(NEW_BODY.encode())}):
  return r198.report(root)

class SheetPrivateHistory(unittest.TestCase):
 def test_latest_source_exact_but_never_approved(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   augment(root)
   report=report_with_fictional_source(root)
   self.assertEqual(report["decision"],"NO_GO")
   self.assertEqual(report["original_migration_files_sha256_verified"],83)
   self.assertTrue(report["r193_join_create_lineage_reverified"])
   self.assertTrue(report["all_83_original_migration_timestamps_valid_unique"])
   self.assertEqual(report["historical_direct_target_definitions"],2)
   self.assertEqual(report["historical_body_sha256_matches_current_count"],1)
   self.assertEqual(report["latest_r111_priority_docket_index_not_chronology"],76)
   self.assertTrue(report["latest_body_sha256_matches_live"])
   self.assertTrue(report["latest_body_length_matches_live"])
   self.assertTrue(report["latest_direct_auth_identity_marker"])
   self.assertFalse(report["latest_direct_campaign_membership_marker"])
   self.assertFalse(report["effective_function_signature_owner_rls_acl_proven"])
   self.assertFalse(report["qa_or_production_sql_authorized"])
   for forbidden in ("CREATE FUNCTION public.","r106-original","fictional_",
                     "auth.uid() IS NOT NULL","r111-private-review-docket"):
    self.assertNotIn(forbidden,json.dumps(report))

 def test_no_direct_source_fail_closed_no_claim(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   augment(root,include_target=False)
   report=report_with_fictional_source(root)
   self.assertEqual(report["historical_direct_target_definitions"],0)
   self.assertFalse(report["latest_direct_definition_found"])
   self.assertIsNone(report["latest_executable_statement_ordinal"])
   self.assertFalse(report["latest_body_sha256_matches_live"])
   self.assertEqual(report["decision"],"NO_GO")

 def test_private_source_mutation_rejected_before_any_result(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   folder=augment(root)
   target=next(folder.glob("*.sql"))
   target.write_text("SELECT 2;\n")
   with self.assertRaises(r154.AuditBlocked):
    report_with_fictional_source(root)

 def test_invalid_timestamp_or_mismatched_prior_invite_lineage_rejected(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   augment(root,bad_timestamp=True)
   with self.assertRaises(r154.AuditBlocked):
    report_with_fictional_source(root)
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   augment(root)
   with patch.object(r193,"TARGETS",fictional.patched_targets()):
    result=r198.report(root) # Different current SHA remains NO_GO.
    self.assertFalse(result["latest_body_sha256_matches_live"])
    self.assertEqual(result["decision"],"NO_GO")
   # The original unpatched invitation targets must fail prior R193 parity.
   with self.assertRaises(r154.AuditBlocked):
    r198.report(root)

 def test_no_ambiguous_sql_source_statement(self):
  self.assertIsNone(r193.evaluate(
   "SELECT 'CREATE FUNCTION public.can_edit_campaign_sheet(a,b,c)'",
   r198.TARGET))
  self.assertIsNone(r193.evaluate(
   "CREATE FUNCTION public.unrelated(a uuid,b text,c uuid) RETURNS boolean "
   "LANGUAGE plpgsql AS $b$ SELECT TRUE $b$;",r198.TARGET))

if __name__=="__main__":
 unittest.main()
