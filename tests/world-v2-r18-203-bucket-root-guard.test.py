"""R203 adversarial original Storage first AND-child bucket comparison tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r203",ROOT/"scripts/release/r203_validate_bucket_root_guard.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST=ROOT/gate.MANIFEST

class IndependentBucketGuard(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.evidence=json.loads(MANIFEST.read_text())

 def test_exact_current_original_three_distinct_root_guards_still_no_go(self):
  r=gate.validate(deepcopy(self.evidence),ROOT)
  self.assertEqual(r["decision"],"NO_GO")
  self.assertTrue(r["original_storage_root_and_bucket_eq_constant_verified"])
  self.assertTrue(r["three_storage_select_bucket_constants_distinct_verified"])
  self.assertTrue(r["nested_or_separate_from_first_bucket_comparator_verified"])
  self.assertFalse(r["policy_complete_effective_helper_authorization_approved"])
  self.assertFalse(r["real_signed_revoked_member_fresh_url_denied"])
  self.assertFalse(r["previously_issued_signed_url_revocation_proven"])
  self.assertFalse(r["hosted_qa_or_production_sql_authorized"])

 def test_breaking_top_level_bucket_operator_or_nested_or_fails_closed(self):
  for slot,field,value in (
   (0,"root_and",False),(0,"root_and_children",1),
   (1,"first_child_bucket_equality_constant",False),
   (1,"first_child_contains_or",True),
   (1,"nested_or_only_beyond_first",False),
   (2,"has_bucket_literal",False),
   (2,"distinct_private_bucket_values",2),
   (0,"anonymous_slot",2),
   (0,"root_and_children",True),
  ):
   item=deepcopy(self.evidence)
   item["originalLiveStoragePerPolicyAnon"][slot][field]=value
   with self.subTest(slot=slot,field=field),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)

 def test_source_snapshot_and_historical_receipt_immutable(self):
  for field,value in (
   ("sha256","0"*64),("originalMigrationHashesVerified",82),
   ("historicalDirectStorageCreate",11),
   ("historicalDirectStorageDrop",3),
   ("latestMapHelperBodyCurrentShaMatches",False)
  ):
   item=deepcopy(self.evidence)
   item["ownerR200Receipt"][field]=value
   with self.subTest(field=field),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  item=deepcopy(self.evidence)
  item["parent"]["head"]="0"*40
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

 def test_no_release_flag_may_be_cleared(self):
  for field in gate.FALSE_CLAIMS:
   item=deepcopy(self.evidence)
   item["interpretation"][field]=True
   with self.subTest(flag=field),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  for field in gate.RESTRICTIONS:
   item=deepcopy(self.evidence)
   item["guardrails"][field]=False
   with self.subTest(flag=field),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)

 def test_source_sha_pin_detects_candidate_or_runner_edits(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for rel,sha in gate.BLOBS.items():
    target=root/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,target)
    self.assertEqual(gate.git_blob(target.read_bytes()),sha)
   altered=root/"scripts/release/r203_readonly_storage_bucket_root_guards.sql"
   altered.write_bytes(altered.read_bytes()+b"\n-- unverified query\n")
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(deepcopy(self.evidence),root)

 def test_readonly_sql_never_selects_bucket_literal_or_policy_sql(self):
  sql=(ROOT/"scripts/release/r203_readonly_storage_bucket_root_guards.sql").read_text()
  for mandatory in ("pg_catalog.pg_policy","pg_catalog.pg_operator",
    "pg_catalog.pg_attribute","PRIVATE_bucket_value_not_selected",
    "first_child_bucket_equality_constant","distinct_private_bucket_values"):
   self.assertIn(mandatory,sql)
  selection=sql[sql.rfind("SELECT p.anonymous_slot"):]
  self.assertNotIn("PRIVATE_bucket_value_not_selected",selection)
  self.assertNotIn("pg_get_expr",selection)
  for forbidden in ("UPDATE storage.","DELETE FROM storage.","DROP POLICY",
                    "ALTER POLICY ","TRUNCATE storage.","GRANT ALL"):
   self.assertNotIn(forbidden,selection)

 def test_runner_requires_loopback_and_classifies_bad_nested_or_then_rollback(self):
  s=(ROOT/"tests/world-v2-r18-203-postgres/run.sh").read_text()
  for mandatory in ("R203_ISOLATED","R201_ISOLATED","R202_ISOLATED",
    "127.0.0.1","tests/world-v2-r18-202-postgres/run.sh",
    "scripts/release/r203_readonly_storage_bucket_root_guards.sql",
    "ALTER POLICY fictional_personal_owner","ROLLBACK;",
    "good!=2 || bad!=1", "cmp -s"):
   self.assertIn(mandatory,s)

 def test_duplicate_json_and_python_boolean_integer_coercion_denied(self):
  with self.assertRaises(gate.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=gate.unique_json)
  for change in ("yes",True,0):
   item=deepcopy(self.evidence)
   item["schema"]=change
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  item=deepcopy(self.evidence)
  item["originalLiveStoragePerPolicyAnon"][2]["root_and_children"]=2.0
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

if __name__=="__main__":unittest.main()
