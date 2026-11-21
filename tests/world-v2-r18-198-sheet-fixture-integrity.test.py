"""R198 source-only SHA-pinned live sheet helper/R115 fixture and NO_GO tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r198_gate",ROOT/"scripts/release/r198_validate_sheet_fixture_lineage.py"
)
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST=ROOT/gate.MANIFEST

class SheetFixtureIntegrity(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.evidence=json.loads(MANIFEST.read_text())

 def test_current_function_and_unapplied_candidate_pinned_no_go(self):
  result=gate.validate(deepcopy(self.evidence),ROOT)
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["read_only_live_sheet_helper_and_lease_sources_sha_reconciled"])
  self.assertTrue(result["r115_unapplied_revoked_owner_guard_git_blob_verified"])
  self.assertFalse(result["owner_private_r198_report_received"])
  self.assertFalse(result["hosted_sql_or_production_release_authorized"])
  self.assertNotIn("CREATE FUNCTION",json.dumps(result))
  self.assertNotIn("raw_user_meta_data",json.dumps(result))

 def test_live_helper_and_lease_source_drift_rejected(self):
  for name in gate.FUNCTIONS:
   item=deepcopy(self.evidence)
   item["knownPublicFunctions"][name]["bytes"]+=1
   with self.subTest(name=name),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  item=deepcopy(self.evidence)
  item["knownPublicFunctions"]["can_edit_campaign_sheet"]["directCampaignMembersMarker"]=True
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)
  item=deepcopy(self.evidence)
  item["knownPublicFunctions"]["can_edit_campaign_sheet"]["authenticatedExecute"]=True
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

 def test_unsafe_qa_release_and_manual_bypass_rejected(self):
  for name in gate.NO_APPROVAL:
   item=deepcopy(self.evidence)
   item["releaseGuards"][name]=True
   with self.subTest(name=name),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  for name in gate.RESTRICT:
   item=deepcopy(self.evidence)
   item[name]=False
   with self.subTest(name=name),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  item=deepcopy(self.evidence)
  item["privateExpectedHistorySourceFiles"]=82
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

 def test_unchanged_source_sha_rejects_any_sql_or_test_edit(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   for rel in gate.BLOBS:
    target=root/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,target)
   for rel,expected in gate.BLOBS.items():
    self.assertEqual(gate.blob_sha((root/rel).read_bytes()),expected)
   altered=root/"staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql"
   altered.write_bytes(altered.read_bytes()+b"\n-- tampered SQL\n")
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(deepcopy(self.evidence),root)

 def test_public_manifest_never_embeds_original_private_sql(self):
  raw=MANIFEST.read_text()
  for forbidden in ("CREATE FUNCTION","r106-original-83-recovery",
                    "r111-private-review-docket.json","DATABASE_URL",
                    "service_role_key"):
   self.assertNotIn(forbidden,raw)

 def test_duplicate_schema_and_type_errors_rejected(self):
  with self.assertRaises(gate.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
      object_pairs_hook=gate.no_duplicates)
  item=deepcopy(self.evidence)
  item["schema"]=True
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)
  item=deepcopy(self.evidence)
  item["releaseGuards"]["all67PrivilegedCallChainsApproved"]=1
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

if __name__=="__main__":
 unittest.main()
