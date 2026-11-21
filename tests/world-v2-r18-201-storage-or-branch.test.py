"""R201 adversarial anonymous Storage SELECT policy branches and scratch RLS tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r201",ROOT/"scripts/release/r201_validate_storage_or_branch_scope.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST=ROOT/gate.MANIFEST

class ReadOnlyOriginalPolicyScope(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.fixture=json.loads(MANIFEST.read_text())

 def test_exact_original_three_permissive_policy_slots_are_still_no_go(self):
  result=gate.validate(deepcopy(self.fixture),ROOT)
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["original_three_permissive_policy_branch_boolean_slots_verified"])
  self.assertTrue(result["one_original_branch_contains_both_and_or_words"])
  self.assertFalse(result["current_storage_policy_semantics_safely_proven"])
  self.assertFalse(result["original_revoked_user_can_sign_protected_campaign_asset_proven"])
  self.assertFalse(result["hosted_sql_or_release_authorized"])

 def test_branch_ownership_and_or_word_markers_are_pinned(self):
  for slot,key,value in (
    (0,"map_helper",False),(0,"direct_membership",True),
    (1,"or_word",False),(1,"owner_marker",False),
    (1,"role_applies_authenticated",False),
    (2,"role_applies_anon",True),(2,"has_bucket",False),
    (2,"missing_using",True),
  ):
   data=deepcopy(self.fixture)
   data["currentOriginalStorageSelectPoliciesAnonymous"][slot][key]=value
   with self.subTest(slot=slot,key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(data,ROOT)

 def test_fingerprint_count_and_release_escalation_rejected(self):
  for key,value in (
    ("bytes",3184),("sha256","0"*64),
    ("migrationShaVerified",82),
    ("historicalStoragePolicyCreates",9),
    ("historicalStoragePolicyDrops",1),
    ("historicalMapHelperDefinitions",0),
    ("latestMapHelperBodyMatchesCurrent",False)
  ):
   data=deepcopy(self.fixture)
   data["ownerR200Receipt"][key]=value
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(data,ROOT)
  for key in gate.BLOCKED:
   data=deepcopy(self.fixture)
   data["interpretation"][key]=True
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(data,ROOT)
  for key in gate.SAFETY:
   data=deepcopy(self.fixture)
   data["restrictions"][key]=False
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(data,ROOT)

 def test_source_blob_and_no_secret_export_fails_closed(self):
  with tempfile.TemporaryDirectory() as temp:
   fake=Path(temp)
   for rel,sha in gate.BLOBS.items():
    p=fake/rel
    p.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,p)
    self.assertEqual(gate.blob_sha(p.read_bytes()),sha)
   rel="tests/world-v2-r18-201-postgres/run.sh"
   p=fake/rel
   p.write_bytes(p.read_bytes()+b"\n# synthetic tamper\n")
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(deepcopy(self.fixture),fake)
  raw=MANIFEST.read_text()
  for forbidden in ("CREATE POLICY","raw_user_meta_data","r106-original-83-recovery",
                     "signedUrl=", "postgres://"):
   self.assertNotIn(forbidden,raw)

 def test_readonly_query_has_only_anonymous_flags_not_policy_sql(self):
  sql=(ROOT/"scripts/release/r201_readonly_storage_policy_branch_matrix.sql").read_text()
  self.assertIn("pg_catalog.pg_policy",sql)
  self.assertIn("anonymous_slot",sql)
  self.assertIn("role_applies_authenticated",sql)
  self.assertNotIn("SELECT polname",sql)
  for forbidden in ("UPDATE storage.","DELETE FROM storage.","TRUNCATE storage.",
                    "DROP POLICY","CREATE POLICY","ALTER POLICY"):
   self.assertNotIn(forbidden,sql)

 def test_disposable_runner_checks_negative_or_and_personal_art_preservation(self):
  script=(ROOT/"tests/world-v2-r18-201-postgres/run.sh").read_text()
  for required in (
   "R201_ISOLATED","127.0.0.1","fictional_campaign_map",
   "fictional_personal_owner","fictional_personal_path",
   "SET LOCAL ROLE authenticated","synthetic_can_view_map",
   "intentional-bleed-rollback.sql","ROLLBACK;",
   "owner_id=public.synthetic_actor()", "removed actor lost independently owned art"
  ):
   self.assertIn(required,script)

 def test_duplicate_or_wrong_typed_fields_are_denied(self):
  with self.assertRaises(gate.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=gate.json_unique)
  for change in (
    ("schema",True),("schema","1"),("decision","GO")
  ):
   data=deepcopy(self.fixture)
   data[change[0]]=change[1]
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(data,ROOT)
  data=deepcopy(self.fixture)
  data["currentOriginalStorageSelectPoliciesAnonymous"][1]["anonymous_slot"]=True
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(data,ROOT)

if __name__=="__main__":
 unittest.main()
