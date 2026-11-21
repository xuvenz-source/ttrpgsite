"""R211 source-only prep consent, 83-history private auditor delivery NO_GO."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT=Path(".").resolve()
sys.path.insert(0,str(ROOT/"scripts/release"))
spec=importlib.util.spec_from_file_location(
 "r211pkg",ROOT/"scripts/release/r211_validate_private_qa_preflight_package.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class PrivateQaPreflightPackage(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=FILE.read_bytes()
  cls.m=json.loads(cls.raw)

 def check(self,data):
  return gate.validate(data,ROOT,self.raw)

 def test_only_qa_preparation_is_approved_not_sql_install(self):
  r=self.check(deepcopy(self.m))
  self.assertEqual(r["decision"],"NO_GO")
  self.assertTrue(r["qa_only_preparation_user_authorized"])
  self.assertFalse(r["qa_sql_installation_user_authorized"])
  self.assertFalse(r["original_or_production_change_authorized"])
  self.assertTrue(r["owner_private_83_file_preflight_not_yet_run"])
  self.assertTrue(r["owner_local_script_and_fictional_tests_sha_pinned"])
  self.assertFalse(r["all_83_migration_semantics_approved"])
  self.assertFalse(r["isolate_qa_install_safe_to_run_proven"])

 def test_qa_baseline_and_original_history_cannot_be_forged(self):
  for section,key,value in (
   ("readOnlyBaseline","qaPublicTables",1),
   ("readOnlyBaseline","qaPublicFunctions",1),
   ("readOnlyBaseline","qaAuthUsers",1),
   ("privateOriginalSourceState","migrationsShaVerified",82),
   ("privateOriginalSourceState","all83SemanticMigrationEffectsReviewed",True),
   ("ownerLocalPreflight","ownerPrivateReportReceived",True),
   ("ownerLocalPreflight","preparedInstallableQaSchemaProven",True)
  ):
   x=deepcopy(self.m)
   x[section][key]=value
   with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
    self.check(x)

 def test_scope_rejects_implicit_qa_sql_or_prod_permissions(self):
  for section in ("scope","releaseApprovals","restrictions","riskGuardrails"):
   for key in self.m[section]:
    x=deepcopy(self.m)
    x[section][key]=not x[section][key]
    with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
     self.check(x)
  x=deepcopy(self.m)
  x["nextManualAction"]="Run unreviewed SQL against QA"
  with self.assertRaises(gate.Blocked):self.check(x)

 def test_source_blob_hash_drift_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for rel,sha in self.m["sourceBlobs"].items():
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,p)
    self.assertEqual(gate.gitblob(p.read_bytes()),sha)
   p=root/"scripts/release/r211_private_qa_migration_effects.py"
   p.write_bytes(p.read_bytes()+b"\n# tamper")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(self.m),root,self.raw)

 def test_no_raw_sql_archive_or_project_credentials_in_manifest(self):
  s=FILE.read_text()
  for forbidden in (
   "CREATE FUNCTION public.","CREATE POLICY ON",
   "r111-private-review-docket.json",
   "r106-original-83-recovery",
   "service_role_key=","DATABASE_URL=","JWT_SECRET="
  ):
   self.assertNotIn(forbidden,s)
  script=(ROOT/"scripts/release/r211_private_qa_migration_effects.py").read_text()
  self.assertIn("original_migrations_sha256_reverified",script)
  self.assertIn("all_83_migrations_semantically_reviewed",script)
  self.assertIn("first_r111_priority_review_indices_not_chronology",script)
  self.assertIn("no_sql_executed",script)
  self.assertIn("no_network_or_database_access",script)
  self.assertNotIn("print(statement)",script)
  self.assertNotIn("print(filename)",script)

 def test_duplicate_keys_wrong_types_unexpected_changes_fails_closed(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=gate.no_duplicates)
  x=deepcopy(self.m);x["schema"]=True
  with self.assertRaises(gate.Blocked):self.check(x)
  x=deepcopy(self.m);x["readOnlyBaseline"]["qaPublicTables"]=0.0
  with self.assertRaises(gate.Blocked):self.check(x)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(self.m),ROOT,self.raw+b"\n")

if __name__=="__main__":unittest.main()
