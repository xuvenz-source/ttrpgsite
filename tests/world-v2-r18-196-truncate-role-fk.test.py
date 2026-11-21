"""R196 read-only role grant and inbound FK cascade fail-closed contract tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r196",ROOT/"scripts/release/r196_validate_truncate_role_fk_evidence.py")
r196=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r196)
FILE=ROOT/r196.MANIFEST

class CascadeAndAcl(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.evidence=json.loads(FILE.read_text())

 def test_precise_direct_grant_no_go(self):
  result=r196.verify(deepcopy(self.evidence),ROOT)
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["original_direct_only_truncate_acl_verified"])
  self.assertTrue(result["two_inbound_foreign_keys_verified"])
  self.assertFalse(result["external_privileged_admin_workflows_fully_reviewed"])
  self.assertFalse(result["hosted_sql_or_prod_release_authorized"])
  self.assertNotIn("CREATE FUNCTION",json.dumps(result))
  self.assertNotIn("user_id",json.dumps(result))

 def test_no_grant_or_inbound_fk_evidence_drift(self):
  changes={
   "direct_service_truncate_grant_entries":[0,2,True],
   "public_truncate_grant_entries":[1],
   "inherited_other_role_truncate_grants":[1],
   "service_inherits_table_owner":[True],
   "service_role_superuser":[True],
   "service_role_bypasses_rls":[False],
   "inbound_referencing_tables":[0,1,3],
   "service_role_truncate_on_referencing_tables":[1],
   "enabled_user_truncate_triggers":[1],
   "any_truncate_word":[1],
  }
  for key,attempts in changes.items():
   for value in attempts:
    with self.subTest(key=key,value=value):
     item=deepcopy(self.evidence)
     item["originalProjectLiveReadOnlySnapshot"][key]=value
     with self.assertRaises(r196.AuditBlocked):
      r196.verify(item,ROOT)

 def test_reject_all_release_escalations_and_false_evidence(self):
  for field in r196.CANNOT_APPROVE:
   item=deepcopy(self.evidence)
   item["interpretation"][field]=True
   with self.subTest(field=field),self.assertRaises(r196.AuditBlocked):
    r196.verify(item,ROOT)
  for field in r196.RESTRICTIONS:
   item=deepcopy(self.evidence)
   item["restrictions"][field]=False
   with self.subTest(field=field),self.assertRaises(r196.AuditBlocked):
    r196.verify(item,ROOT)
  for field in ("directRevokeAloneExpectedToRemoveServiceRoleEffectiveTruncate",
                "noCurrentlyInstalledTruncateTrigger"):
   item=deepcopy(self.evidence)
   item["interpretation"][field]=False
   with self.assertRaises(r196.AuditBlocked):
    r196.verify(item,ROOT)

 def test_immutable_candidate_and_runner_tamper_denied(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   for rel in r196.FROZEN:
    dst=root/rel
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,dst)
   self.assertTrue(all(r196.blob_sha1((root/rel).read_bytes())==ref
                       for rel,ref in r196.FROZEN.items()))
   runner=root/"tests/world-v2-r18-196-postgres/run.sh"
   runner.write_bytes(runner.read_bytes()+b"\n# fake test added\n")
   with self.assertRaises(r196.AuditBlocked):
    r196.verify(deepcopy(self.evidence),root)

 def test_manifest_is_sanitized_and_query_is_catalog_read_only(self):
  evidence=FILE.read_text()
  for bad in ("r106-original-83-recovery","CREATE FUNCTION",
              "r111-private-review-docket.json","SUPABASE_SERVICE_ROLE_KEY"):
   self.assertNotIn(bad,evidence)
  query=(ROOT/"scripts/release/r196_readonly_membership_truncate_provenance.sql").read_text()
  self.assertIn("pg_catalog.aclexplode",query)
  self.assertIn("pg_catalog.pg_has_role",query)
  self.assertIn("pg_catalog.pg_constraint",query)
  self.assertIn("pg_catalog.pg_trigger",query)
  for forbidden in ("TRUNCATE public.","DROP TABLE","DELETE FROM public.",
                    "CREATE TABLE","UPDATE public.","ALTER TABLE"):
   self.assertNotIn(forbidden,query)

 def test_runner_checks_both_cascade_routes_and_rollback(self):
  runner=(ROOT/"tests/world-v2-r18-196-postgres/run.sh").read_text()
  self.assertIn("baseline-cascade.sql",runner)
  self.assertIn("TRUNCATE public.campaign_members CASCADE",runner)
  self.assertIn("TRUNCATE public.campaigns CASCADE",runner)
  self.assertIn("ROLLBACK;",runner)
  self.assertIn("R196_ISOLATED",runner)
  self.assertIn("127.0.0.1",runner)
  self.assertIn("tests/world-v2-r18-120-postgres/verify-contract.sql",runner)

 def test_duplicate_json_and_boolean_replacement_fail(self):
  with self.assertRaises(r196.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=r196.strict_json)
  item=deepcopy(self.evidence)
  item["schema"]=True
  with self.assertRaises(r196.AuditBlocked):
   r196.verify(item,ROOT)
  item=deepcopy(self.evidence)
  item["originalProjectLiveReadOnlySnapshot"]["inbound_referencing_tables"]=True
  with self.assertRaises(r196.AuditBlocked):
   r196.verify(item,ROOT)

if __name__=="__main__":
 unittest.main()
