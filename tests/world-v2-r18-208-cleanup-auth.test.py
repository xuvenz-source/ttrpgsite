"""R208 current 8 authenticated privileged cleanup/write source review hard-gate."""
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
 "r208",ROOT/"scripts/release/r208_validate_cleanup_authorization.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class OriginalCleanupSourceReview(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=FILE.read_bytes()
  cls.data=json.loads(cls.raw)

 def check(self,model):return gate.validate(model,ROOT,self.raw)

 def test_original_8_source_hashes_no_release_approved(self):
  result=self.check(deepcopy(self.data))
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["eight_current_cleanup_write_rpc_source_hashes_pinned"])
  self.assertEqual(self.data["current67DefinerSourceTriage"]["total"],67)
  self.assertEqual(len(self.data["originalCurrentEightLiveSourceMarkers"]),8)
  self.assertTrue(result["all_eight_current_sources_have_auth_uid_text"])
  self.assertFalse(result["no_direct_campaign_membership_is_a_proven_vulnerability"])
  self.assertFalse(result["hosted_revoked_actor_movement_denied_proven"])
  self.assertFalse(result["original_tool_lease_owner_semantics_proven"])
  self.assertFalse(result["hosted_sql_or_production_release_authorized"])

 def test_lexical_auth_word_does_not_approve_execution(self):
  rows=self.data["originalCurrentEightLiveSourceMarkers"]
  self.assertTrue(all(r["uid_calls"]>0 for r in rows))
  self.assertTrue(all(r["has_where_word"] for r in rows))
  self.assertTrue(all(r["postgres_owned"] and r["empty_search_path"] for r in rows))
  self.assertTrue(all(r["auth_exec"] and not r["anon_exec"] for r in rows))
  self.assertTrue(rows[0]["actor_id_word"] and rows[0]["update_word"])
  self.assertTrue(rows[5]["fog_guard_helper_word"])
  self.assertTrue(rows[6]["holder_id_word"] and rows[6]["campaign_id_word"])
  self.assertTrue(rows[7]["holder_id_word"])
  self.assertTrue(self.data["interpretation"]["sourceExactSheetOwnStaleLeaseReleaseRecheckedInScratch"])
  self.assertFalse(self.data["interpretation"]["sourceExactToolItemOwnStaleLeaseReleaseTested"])

 def test_source_sha_and_auth_marker_changes_fail_closed(self):
  for i,key,value in (
   (0,"source_sha256","0"*64),(3,"source_bytes",534),
   (0,"uid_calls",0),(0,"update_word",False),
   (5,"fog_guard_helper_word",False),(6,"holder_id_word",False),
   (7,"source_bytes",True),(2,"auth_exec",False),
   (3,"anon_exec",True),(4,"preview_cleanup_helper_word",False)
  ):
   data=deepcopy(self.data)
   data["originalCurrentEightLiveSourceMarkers"][i][key]=value
   with self.subTest(slot=i,field=key),self.assertRaises(gate.Blocked):
    self.check(data)

 def test_no_premature_approval_or_hosted_scope(self):
  for key in gate.FALSE_CLAIMS:
   data=deepcopy(self.data)
   data["interpretation"][key]=True
   with self.subTest(flag=key),self.assertRaises(gate.Blocked):
    self.check(data)
  for key in gate.GUARDS:
   data=deepcopy(self.data)
   data["guards"][key]=False
   with self.subTest(flag=key),self.assertRaises(gate.Blocked):
    self.check(data)
  data=deepcopy(self.data)
  data["privateOwnerR206ReceiptSha256"]="0"*64
  with self.assertRaises(gate.Blocked):self.check(data)

 def test_67_review_count_and_owner_cleanup_misclassification_denied(self):
  for key,value in (("total",66),
   ("writeVerbWithoutUidAndWithoutCallee",1),
   ("writeWithoutSpecifiedKnownGuardMarker",9),
   ("noUidAndNoDetectedPublicCallee",1)):
   data=deepcopy(self.data)
   data["current67DefinerSourceTriage"][key]=value
   with self.subTest(key=key),self.assertRaises(gate.Blocked):
    self.check(data)

 def test_existing_original_source_regression_and_readonly_sql_are_sha_pinned(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for rel,sha in gate.BLOBS.items():
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,p)
    self.assertEqual(gate.gitblob(p.read_bytes()),sha)
   p=root/"scripts/release/r208_readonly_cleanup_privilege_census.sql"
   p.write_bytes(p.read_bytes()+b"\n-- unauthorized query change")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(self.data),root,self.raw)
  sql=(ROOT/"scripts/release/r208_readonly_cleanup_privilege_census.sql").read_text()
  self.assertIn("pg_catalog.pg_proc",sql)
  self.assertIn("source_sha256",sql)
  selection=sql[sql.rfind("SELECT p.proname"):]
  for forbidden in ("SELECT p.prosrc","p.prosrc AS","pg_get_functiondef",
    "DELETE FROM public.","UPDATE public.","DROP FUNCTION","ALTER POLICY"):
   self.assertNotIn(forbidden,selection)

 def test_json_duplication_and_type_mismatch_fail_closed(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=gate.unique)
  data=deepcopy(self.data);data["schema"]=True
  with self.assertRaises(gate.Blocked):self.check(data)
  data=deepcopy(self.data);data["originalCurrentEightLiveSourceMarkers"][0]["uid_calls"]=2.0
  with self.assertRaises(gate.Blocked):self.check(data)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(self.data),ROOT,self.raw+b" ")

if __name__=="__main__":unittest.main()
