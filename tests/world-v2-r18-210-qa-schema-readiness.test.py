"""R210 original-vs-empty-QA read-only installation gate and privacy tests."""
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
 "r210",ROOT/"scripts/release/r210_validate_qa_schema_readiness.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class QaReadiness(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=FILE.read_bytes()
  cls.data=json.loads(cls.raw)
 def check(self,x):return gate.validate(x,ROOT,self.raw)

 def test_original_qa_catalog_has_no_application_schema_and_requires_approval(self):
  r=self.check(deepcopy(self.data))
  self.assertEqual(r["decision"],"NO_GO")
  self.assertEqual(r["original_public_tables"],31)
  self.assertEqual(r["original_public_functions"],112)
  self.assertEqual(r["isolated_qa_public_tables"],0)
  self.assertEqual(r["isolated_qa_public_functions"],0)
  self.assertEqual(r["isolated_qa_auth_users"],0)
  self.assertFalse(r["qa_only_sql_install_owner_approval_received"])
  self.assertFalse(r["isolated_qa_application_schema_installed"])
  self.assertFalse(r["private_83_migration_install_safe_to_run_proven"])
  self.assertFalse(r["original_or_production_sql_authorized"])

 def test_qa_baseline_cannot_be_implicitly_populated(self):
  for section,key,value in (
   ("original","public_tables",30),
   ("original","public_functions",111),
   ("isolatedQa","public_tables",1),
   ("isolatedQa","public_functions",1),
   ("isolatedQa","migration_ledger_present",1),
   ("isolatedQaExistingAccountCounts","auth_users",1),
   ("isolatedQaExistingAccountCounts","storage_buckets",1),
   ("isolatedQaExistingAccountCounts","storage_objects",1),
   ("ownerPrivateHistoricalSourceContext","originalMigrationFilesShaVerified",82),
   ("ownerPrivateHistoricalSourceContext","privateMigrationSemanticReviewFullyApproved",True)
  ):
   d=deepcopy(self.data);d[section][key]=value
   with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
    self.check(d)

 def test_every_install_and_production_gate_fails_closed(self):
  for section in ("qaInstallationState","safePlan","hardRestrictions"):
   for key in self.data[section]:
    d=deepcopy(self.data)
    d[section][key]=not d[section][key]
    with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
     self.check(d)
  d=deepcopy(self.data);d["manualGate"]="User said Proceed so QA SQL can run"
  with self.assertRaises(gate.Blocked):self.check(d)

 def test_sql_source_is_select_only_pg_catalog_no_sensitive_records(self):
  q=(ROOT/"scripts/release/r210_readonly_qa_schema_readiness.sql").read_text()
  self.assertIn("pg_catalog.pg_class",q)
  self.assertIn("pg_catalog.pg_proc",q)
  self.assertIn("migration_ledger_present",q)
  self.assertIn("public_functions",q)
  for forbidden in (
   "UPDATE public.","INSERT INTO public.","DELETE FROM public.",
   "DROP TABLE","ALTER TABLE","TRUNCATE ","CREATE FUNCTION ",
   "COPY ","pg_read_file","FROM auth.users","FROM storage.objects",
   "SELECT p.prosrc","DATABASE_URL"
  ):
   self.assertNotIn(forbidden,q)

 def test_sql_query_sha_pin_and_changed_script_fail_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);dest=root/gate.QUERY
   dest.parent.mkdir(parents=True,exist_ok=True)
   shutil.copyfile(ROOT/gate.QUERY,dest)
   self.assertEqual(gate.gitblob(dest.read_bytes()),gate.QUERY_BLOB)
   dest.write_bytes(dest.read_bytes()+b"\n-- unexpected")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(self.data),root,self.raw)

 def test_duplicate_keys_schema_bool_integer_and_byte_changes_denied(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
              object_pairs_hook=gate.unique)
  d=deepcopy(self.data);d["schema"]=True
  with self.assertRaises(gate.Blocked):self.check(d)
  d=deepcopy(self.data);d["isolatedQa"]["public_tables"]=0.0
  with self.assertRaises(gate.Blocked):self.check(d)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(self.data),ROOT,self.raw+b"\n")

if __name__=="__main__":unittest.main()
