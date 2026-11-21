"""R204 original helper lexical nesting and synthetic stale map ACL NO_GO."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r204",ROOT/"scripts/release/r204_validate_helper_membership_branch.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class CurrentHelperAcl(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.data=json.loads(FILE.read_text())

 def test_current_helper_source_and_qa_no_go(self):
  r=gate.validate(deepcopy(self.data),ROOT)
  self.assertEqual(r["decision"],"NO_GO")
  self.assertTrue(r["current_map_helper_448_byte_fingerprint_and_nesting_pinned"])
  self.assertTrue(r["all_3_storage_select_policies_lack_operation_discriminator_marker"])
  self.assertFalse(r["source_exact_current_helper_boolean_semantics_proven"])
  self.assertFalse(r["real_signed_removed_user_fresh_url_issuance_denial_proven"])
  self.assertFalse(r["hosted_qa_or_production_release_authorized"])

 def test_helper_auth_identity_and_or_nesting_drift_rejected(self):
  for key,value in (
    ("body_bytes",449),("body_sha256","0"*64),("authenticated_execute",False),
    ("anon_execute_denied",False),("or_word_count",0),
    ("and_word_count",4),("exists_word_count",0),
    ("member_table_word_count",0),("auth_uid_call_count",1),
    ("or_token_offset",392),("or_depth",1),("member_depth",2),
    ("player_maps_depth",2),("first_uid_depth",1),
    ("membership_reference_precedes_or",False),
    ("player_maps_reference_precedes_or",False),
    ("user_editable_metadata_absent",False)
  ):
   m=deepcopy(self.data)
   m["knownOriginalMapHelper"][key]=value
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(m,ROOT)

 def test_operation_marker_drift_and_unsafe_release_flags_rejected(self):
  for key,value in (
    ("select_applicable_policy_count",2),
    ("only_operation_helper_count",1),
    ("signed_url_operation_marker_count",1),
    ("map_helper_marker_count",0),
    ("auth_uid_marker_count",1),
    ("editable_metadata_marker_count",1)
  ):
   m=deepcopy(self.data)
   m["liveStorageSelectOperationMarkers"][key]=value
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(m,ROOT)
  for key in gate.FALSE_CLAIMS:
   m=deepcopy(self.data)
   m["interpretation"][key]=True
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(m,ROOT)
  for key in gate.RESTRICTIONS:
   m=deepcopy(self.data)
   m["restrictions"][key]=False
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(m,ROOT)

 def test_sha_pin_prevents_unreviewed_live_query_or_fixture_changes(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for rel,sha in gate.BLOBS.items():
    p=root/rel
    p.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,p)
    self.assertEqual(gate.blob_sha(p.read_bytes()),sha)
   p=root/"tests/world-v2-r18-204-postgres/run.sh"
   p.write_bytes(p.read_bytes()+b"\n# synthetic edit\n")
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(deepcopy(self.data),root)

 def test_original_catalog_source_never_outputs_function_sql_or_object_paths(self):
  q=(ROOT/"scripts/release/r204_readonly_map_helper_or_depth.sql").read_text()
  op=(ROOT/"scripts/release/r204_readonly_storage_operation_markers.sql").read_text()
  self.assertIn("pg_catalog.pg_proc",q)
  self.assertIn("regexp_instr",q)
  self.assertIn("membership_reference_precedes_or",q)
  self.assertIn("pg_catalog.pg_policy",op)
  self.assertIn("only_operation_helper_count",op)
  self.assertNotIn("SELECT body",q)
  self.assertNotIn("SELECT expr",op)
  for unsafe in ("UPDATE storage.","DELETE FROM storage.","DROP POLICY","ALTER POLICY",
                 "TRUNCATE storage.","INSERT INTO storage."):
   self.assertNotIn(unsafe,q)
   self.assertNotIn(unsafe,op)

 def test_runner_uses_only_synthetic_membership_and_rolled_back_unsafe_or(self):
  r=(ROOT/"tests/world-v2-r18-204-postgres/run.sh").read_text()
  for marker in ("R204_ISOLATED","R203_ISOLATED","R202_ISOLATED",
    "R201_ISOLATED","127.0.0.1",
    "tests/world-v2-r18-203-postgres/run.sh",
    "fictional_map_assignments","synthetic_can_view_map_guard",
    "member_role='dm'","unsafe-outer-or.sql","ROLLBACK;",
    "revoked stale assignee","cross-campaign"):
   self.assertIn(marker,r)

 def test_duplicates_and_wrong_types_fail_closed(self):
  with self.assertRaises(gate.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=gate.no_duplicates)
  m=deepcopy(self.data);m["schema"]=True
  with self.assertRaises(gate.AuditBlocked):gate.validate(m,ROOT)
  m=deepcopy(self.data);m["knownOriginalMapHelper"]["or_depth"]=2.0
  with self.assertRaises(gate.AuditBlocked):gate.validate(m,ROOT)

if __name__=="__main__":unittest.main()
