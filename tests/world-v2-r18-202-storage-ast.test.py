"""R202 current original Storage AST AND root/nested OR source provenance tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r202",ROOT/"scripts/release/r202_validate_storage_nested_or_ast.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class NestedOrAstIntegrity(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.manifest=json.loads(FILE.read_text())

 def test_validates_but_never_authorizes_hosted(self):
  r=gate.validate(deepcopy(self.manifest),ROOT)
  self.assertEqual(r["decision"],"NO_GO")
  self.assertTrue(r["live_three_storage_policy_ast_roots_and"])
  self.assertTrue(r["one_live_policy_nested_or_ast_marker"])
  self.assertFalse(r["current_policy_bucket_scope_safely_authorized"])
  self.assertFalse(r["hosted_revoked_actor_signed_qa_passed"])
  self.assertFalse(r["production_or_qa_install_authorized"])

 def test_ast_root_and_nested_or_drift_rejected(self):
  for slot,key,value in (
   (0,"root_and",False),(1,"root_or",True),(1,"any_or_node",False),
   (2,"root_boolean_expression",False),(2,"ast_serialized_characters",2424),
   (0,"anonymous_slot",True)
  ):
   m=deepcopy(self.manifest)
   m["originalReadOnlyStorageAstAnonymousSlots"][slot][key]=value
   with self.subTest(slot=slot,key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(m,ROOT)

 def test_no_unsafe_claims_or_hosted_changes(self):
  for flag in gate.FALSE_CLAIMS:
   m=deepcopy(self.manifest)
   m["technicalInterpretation"][flag]=True
   with self.subTest(flag=flag),self.assertRaises(gate.AuditBlocked):
    gate.validate(m,ROOT)
  for flag in gate.RESTRICTIONS:
   m=deepcopy(self.manifest)
   m["restrictions"][flag]=False
   with self.subTest(flag=flag),self.assertRaises(gate.AuditBlocked):
    gate.validate(m,ROOT)
  m=deepcopy(self.manifest)
  m["ownerR200ReceiptSha256"]="0"*64
  with self.assertRaises(gate.AuditBlocked):gate.validate(m,ROOT)

 def test_unchanged_frozen_original_sql_query_and_test_runner(self):
  with tempfile.TemporaryDirectory() as d:
   fake=Path(d)
   for rel,sha in gate.BLOBS.items():
    target=fake/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,target)
    self.assertEqual(gate.git_blob(target.read_bytes()),sha)
   runner=fake/"tests/world-v2-r18-202-postgres/run.sh"
   runner.write_bytes(runner.read_bytes()+b"\n# synthetic tamper\n")
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(deepcopy(self.manifest),fake)

 def test_read_only_ast_query_outputs_structural_booleans_not_sql(self):
  sql=(ROOT/"scripts/release/r202_readonly_storage_policy_ast_root.sql").read_text()
  self.assertIn("pg_catalog.pg_policy",sql)
  self.assertIn("polqual::text",sql)
  self.assertIn("root_and",sql)
  self.assertIn("any_or_node",sql)
  for forbidden in ("SELECT polname","SELECT pg_get_expr","DELETE FROM",
                    "UPDATE storage.","TRUNCATE storage.","DROP POLICY","CREATE POLICY"):
   self.assertNotIn(forbidden,sql)

 def test_runner_uses_only_local_synthetic_pg17_and_rollback(self):
  s=(ROOT/"tests/world-v2-r18-202-postgres/run.sh").read_text()
  for necessary in ("R202_ISOLATED","R201_ISOLATED","127.0.0.1",
                    "world_v2_r18_201","tests/world-v2-r18-201-postgres/run.sh",
                    "ALTER POLICY fictional_personal_owner",
                    "intentional","root",
                    "ROLLBACK;","owner_id=public.synthetic_actor()"):
   if necessary=="intentional":
    self.assertIn("INSECURE",s)
   else:self.assertIn(necessary,s)

 def test_duplicate_json_or_wrong_schema_types_denied(self):
  with self.assertRaises(gate.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=gate.unique)
  m=deepcopy(self.manifest);m["schema"]=True
  with self.assertRaises(gate.AuditBlocked):gate.validate(m,ROOT)
  m=deepcopy(self.manifest);m["originalReadOnlyStorageAstAnonymousSlots"][1]["root_and"]=1
  with self.assertRaises(gate.AuditBlocked):gate.validate(m,ROOT)

if __name__=="__main__":unittest.main()
