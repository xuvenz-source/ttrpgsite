"""R197 strict five-table read-only authenticated grant and scratch rollback tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location("r197",ROOT/"scripts/release/r197_validate_auth_truncate_scope.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST=ROOT/gate.MANIFEST

class FiveTableLeastPrivilege(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.original=json.loads(MANIFEST.read_text())

 def test_untouched_evidence_no_go(self):
  result=gate.validate(deepcopy(self.original),ROOT)
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["original_five_direct_auth_truncate_grants_verified"])
  self.assertTrue(result["source_frozen_unapplied_revoke_verified"])
  self.assertFalse(result["normal_rest_sql_execution_path_proven"])
  self.assertFalse(result["hosted_sql_or_production_release_authorized"])
  self.assertNotIn("CREATE FUNCTION",json.dumps(result))
  self.assertNotIn("r106-original",json.dumps(result))

 def test_catalogue_drift_and_unsafe_approval_denied(self):
  for key,values in {
   "authenticated_effective_truncate_tables":[0,4,True],
   "chosen_rls_enabled":[4],
   "direct_auth_truncate_entries":[0],
   "public_truncate_entries":[1],
   "inherited_auth_truncate_entries":[1],
   "inherits_owner_on_chosen":[1],
   "chosen_effective_auth_delete":[4],
   "auth_superuser":[True],
   "auth_bypassrls":[True],
   "anon_truncate_public_tables":[1],
  }.items():
   for value in values:
    with self.subTest(key=key,value=value):
     data=deepcopy(self.original)
     data["readOnlyOriginalCatalog"][key]=value
     with self.assertRaises(gate.AuditBlocked):
      gate.validate(data,ROOT)
  for key in gate.INTERPRET:
   data=deepcopy(self.original)
   data["interpretation"][key]=not gate.INTERPRET[key]
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(data,ROOT)

 def test_release_scope_and_target_list_immutable(self):
  for key in gate.RESTRICT:
   item=deepcopy(self.original)
   item["restrictions"][key]=False
   with self.subTest(flag=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  item=deepcopy(self.original)
  item["fivePublicTables"].append("public.campaign_members")
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)
  item=deepcopy(self.original)
  item["issue"]=229
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

 def test_script_blobs_are_pinned_by_bytes(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory)
   for rel in gate.BLOBS:
    dest=root/rel
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,dest)
   self.assertEqual(gate.git_blob((root/list(gate.BLOBS)[0]).read_bytes()),
                    gate.BLOBS[list(gate.BLOBS)[0]])
   target=root/list(gate.BLOBS)[0]
   target.write_bytes(target.read_bytes()+b"\n-- fake GRANT inserted\n")
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(deepcopy(self.original),root)

 def test_candidate_scoped_revoke_and_inherited_postcondition(self):
  sql=(ROOT/"staging/world-v2-b10-r18-197-authenticated-truncate/unapplied-five-table-revoke.sql").read_text()
  for name in gate.TABLES:
   self.assertIn(name,sql)
  self.assertIn("REVOKE TRUNCATE ON TABLE",sql)
  self.assertIn("FROM authenticated;",sql)
  self.assertIn("has_table_privilege",sql)
  self.assertIn("ERRCODE='42501'",sql)
  for forbidden in ("REVOKE ALL","DROP TABLE","DISABLE ROW LEVEL SECURITY","FROM service_role","GRANT TRUNCATE"):
   self.assertNotIn(forbidden,sql)

 def test_synthetic_runner_checks_real_role_execution_and_rollbacks(self):
  runner=(ROOT/"tests/world-v2-r18-197-postgres/run.sh").read_text()
  self.assertIn("R197_ISOLATED",runner)
  self.assertIn("127.0.0.1",runner)
  self.assertIn("SET LOCAL ROLE authenticated",runner)
  self.assertIn("ROLLBACK;",runner)
  self.assertIn("TRUNCATE public.campaign_map_views",runner)
  self.assertIn("RLS failed to default-deny",runner)
  self.assertIn("r197_inherited",runner)
  self.assertIn("DELETE",runner)
  self.assertIn("service_role",runner)

 def test_duplicates_or_wrong_types_rejected(self):
  with self.assertRaises(gate.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=gate.unique)
  item=deepcopy(self.original)
  item["schema"]=True
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)
  item=deepcopy(self.original)
  item["readOnlyOriginalCatalog"]["chosen_tables"]=True
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

if __name__=="__main__":
 unittest.main()
