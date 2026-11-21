"""R206 source-only 11-function historical private auditor distribution NO_GO."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r206gate",ROOT/"scripts/release/r206_validate_private_package.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class PackageIntegrity(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=FILE.read_bytes()
  cls.data=json.loads(cls.raw)

 def check(self,model):return gate.validate(model,ROOT,self.raw)

 def test_exact_live_11_source_and_83_history_gate_is_no_go(self):
  result=self.check(deepcopy(self.data))
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["source_pinned_owner_private_script_verified"])
  self.assertTrue(result["prior_private_history_83_file_provenance_pinned"])
  self.assertTrue(result["eleven_known_public_live_function_fingerprints_pinned"])
  self.assertFalse(result["owner_private_r206_report_received"])
  self.assertFalse(result["all_67_live_function_call_chains_approved"])
  self.assertFalse(result["hosted_sql_or_production_release_authorized"])

 def test_prior_history_sha_and_all_target_body_fingerprints_frozen(self):
  for key,value in (
   ("verifiedOriginalMigrationFiles",82),
   ("sha256","0"*64),("storagePolicyEvents",11),
   ("policyCreates",11),("mapHelperBodyMatched",False)):
   m=deepcopy(self.data)
   m["ownerPrivateR200Receipt"][key]=value
   with self.subTest(key=key),self.assertRaises(gate.Blocked):
    self.check(m)
  for slot in (0,1,4,5,6,8,10):
   m=deepcopy(self.data)
   m["liveKnownFunctionTargets"][slot]["body_sha256"]="0"*64
   with self.subTest(slot=slot),self.assertRaises(gate.Blocked):
    self.check(m)
  m=deepcopy(self.data)
  m["liveKnownFunctionTargets"][2]["slot"]=True
  with self.assertRaises(gate.Blocked):self.check(m)

 def test_private_sql_and_hosted_release_claims_blocked(self):
  for flag in gate.RELEASE_FLAGS:
   m=deepcopy(self.data)
   m["releaseApprovals"][flag]=True
   with self.subTest(flag=flag),self.assertRaises(gate.Blocked):
    self.check(m)
  for flag in gate.SAFETY:
   m=deepcopy(self.data)
   m["restrictions"][flag]=False
   with self.subTest(flag=flag),self.assertRaises(gate.Blocked):
    self.check(m)
  m=deepcopy(self.data)
  m["nextManualGate"]="Upload the private SQL source to GitHub"
  with self.assertRaises(gate.Blocked):self.check(m)

 def test_git_source_blobs_sha_pinned(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   for rel,sha in gate.SOURCE_BLOBS.items():
    file=root/rel
    file.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,file)
    self.assertEqual(gate.sha_blob(file.read_bytes()),sha)
   file=root/"scripts/release/r206_private_privileged_function_lineage.py"
   file.write_bytes(file.read_bytes()+b"\n# tamper")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(self.data),root,self.raw)

 def test_report_contract_excludes_names_private_paths_and_live_sql(self):
  script=(ROOT/"scripts/release/r206_private_privileged_function_lineage.py").read_text()
  self.assertIn("NO_APPROVAL_FIELDS",script)
  self.assertIn("network_or_database_accessed",script)
  self.assertIn('"slot":i',script)
  self.assertIn("original_private_migrations_sha256_verified",script)
  self.assertIn("source_sha256_matches_current",script)
  self.assertIn("r200.report(root)",script)
  self.assertNotIn("print(statement)",script)
  self.assertNotIn("print(filename)",script)
  source=FILE.read_text()
  for forbidden in ("CREATE FUNCTION public.","DATABASE_URL=",
     "r111-private-review-docket.json","r106-original-83-recovery",
     "service_role_key","JWT_SECRET="):
   self.assertNotIn(forbidden,source)

 def test_duplicate_json_schema_and_exact_content_drift_fail_closed(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=gate.no_duplicate_json)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(self.data),ROOT,self.raw+b" ")
  m=deepcopy(self.data)
  m["schema"]=True
  with self.assertRaises(gate.Blocked):
   self.check(m)
  m=deepcopy(self.data)
  m["new"]="GO"
  with self.assertRaises(gate.Blocked):
   self.check(m)

if __name__=="__main__":
 unittest.main()
