"""R213 immutable owner-only 83-history broad grant script source delivery."""
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
 "r213_gate",ROOT/"scripts/release/r213_validate_private_qa_grant_package.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST
RAW=FILE.read_bytes()
DATA=json.loads(RAW)

class PrivateGrantDelivery(unittest.TestCase):
 def check(self,m):return gate.validate(m,ROOT,RAW)

 def test_83_source_report_and_five_live_acl_reconcile_no_sql_go(self):
  r=self.check(deepcopy(DATA))
  self.assertEqual(r["decision"],"NO_GO")
  self.assertTrue(r["owner_r211_83_source_sha_and_937_statement_preflight_pinned"])
  self.assertEqual(r["previous_r211_flagged_files"],22)
  self.assertEqual(r["original_current_authenticated_truncate_table_count"],5)
  self.assertEqual(r["original_historical_literal_grant_truncate_marker_count"],0)
  self.assertFalse(r["new_private_all_83_grant_lineage_report_received"])
  self.assertTrue(r["owner_private_r213_script_sha_pinned"])
  self.assertFalse(r["qa_sql_installation_approved"])
  self.assertFalse(r["all_83_migrations_semantically_approved"])
  self.assertFalse(r["all_67_privileged_call_graphs_approved"])

 def test_source_receipt_and_original_live_permission_tamper_denied(self):
  for section,key,value in (
   ("ownerR211SanitizedReceipt","verifiedOriginalMigrations",82),
   ("ownerR211SanitizedReceipt","topLevelStatementCount",938),
   ("ownerR211SanitizedReceipt","flaggedOriginalFiles",23),
   ("ownerR211SanitizedReceipt","literalGrantTruncateMarkers",5),
   ("ownerR211SanitizedReceipt","sha256","0"*64),
   ("ownerR211SanitizedReceipt","fullySemanticReviewed",True),
   ("currentOriginalReadOnlyEffectiveAcl","authenticatedTruncateTables",0),
   ("currentOriginalReadOnlyEffectiveAcl","publicTables",30),
   ("currentOriginalReadOnlyEffectiveAcl","permissivePublicPolicies",76)
  ):
   m=deepcopy(DATA);m[section][key]=value
   with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
    self.check(m)

 def test_all_scope_approval_flags_fail_closed(self):
  for section in ("scope","securityHold","restrictions"):
   for key in DATA[section]:
    m=deepcopy(DATA)
    m[section][key]=not m[section][key]
    with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
     self.check(m)
  m=deepcopy(DATA);m["ownerNextStep"]="Upload 83 original private SQL files"
  with self.assertRaises(gate.Blocked):self.check(m)

 def test_new_source_and_prior_private_reader_blob_immutable(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for relative,sha in gate.SOURCES.items():
    p=root/relative
    p.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/relative,p)
    self.assertEqual(gate.gitblob(p.read_bytes()),sha)
   path=root/"scripts/release/r213_private_qa_broad_grant_review.py"
   path.write_bytes(path.read_bytes()+b"\n# unreviewed mutation")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(DATA),root,RAW)

 def test_report_contract_fixed_r111_priority_indices_and_no_private_export(self):
  code=(ROOT/"scripts/release/r213_private_qa_broad_grant_review.py").read_text()
  self.assertIn("additional_broad_grant_priority_indices_not_r211_flagged",code)
  self.assertIn("r111_priority_index_not_migration_chronology",code)
  self.assertIn("RISK_CODES",code)
  self.assertIn("no_network_or_database",code.lower().replace("network_or_database_accessed","no_network_or_database"))
  self.assertIn("private_sql_policy_function_table_names_versions_or_paths_exported",code)
  self.assertNotIn("print(statement)",code)
  self.assertNotIn("print(filename)",code)
  self.assertNotIn("print(item[",code)
  for forbidden in (
   "CREATE FUNCTION public.","CREATE POLICY fake ON storage.objects",
   "r111-private-review-docket.json","r106-original-83-recovery",
   "service_role_key=","DATABASE_URL=","JWT_SECRET="):
   self.assertNotIn(forbidden,FILE.read_text())

 def test_schema_types_and_duplicate_json_rejected(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
              object_pairs_hook=gate.unique)
  m=deepcopy(DATA);m["schema"]=True
  with self.assertRaises(gate.Blocked):self.check(m)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(DATA),ROOT,RAW+b"\n")

if __name__=="__main__":unittest.main()
