"""R205 hostile current live 67-definer/8-focus signed QA no-go tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r205",ROOT/"scripts/release/r205_validate_definer_auth_triage.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class PrivilegedSourceGate(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=FILE.read_bytes()
  cls.data=json.loads(cls.raw)

 def check(self,m):
  return gate.validate(m,ROOT,self.raw)

 def test_exact_live_67_census_cannot_approve_hosted(self):
  v=self.check(deepcopy(self.data))
  self.assertEqual(v["decision"],"NO_GO")
  self.assertEqual(v["current_live_privileged_authenticated_definers"],67)
  self.assertEqual(v["anonymous_callable_count"],0)
  self.assertTrue(v["all_67_current_search_paths_empty"])
  self.assertTrue(v["seven_no_direct_uid_source_identifiers_sha_reconciled"])
  self.assertTrue(v["one_user_editable_metadata_word_only_not_proven_auth"])
  self.assertFalse(v["all_67_source_chain_semantics_approved"])
  self.assertFalse(v["signed_qa_or_approval_proven"])
  self.assertFalse(v["hosted_sql_or_production_release_authorized"])

 def test_seven_identity_delegation_metadata_risks_are_not_equivalent_to_bugs(self):
  queue=self.data["originalKnownFunctionQueue"]
  assert len(queue)==8
  self.assertEqual(sum(not v["direct_uid"] for v in queue),7)
  self.assertEqual(sum(v["metadata_word"] for v in queue),1)
  self.assertEqual(sum(v["calls_dm_helper"] for v in queue),3)
  self.assertEqual(queue[5]["known_public_function_name"],"patch_campaign_sheet_noninventory")
  self.assertTrue(queue[5]["calls_edit_helper"])
  self.assertEqual(queue[4]["known_public_function_name"],"is_map_fog_published")
  self.assertFalse(queue[4]["direct_membership"])
  for unsafe in ("noDirectUidImpliesVulnerability",
                 "userMetadataNameDisplayImpliesAuthorizationBug",
                 "existingFogOracleRemediatedOnOriginal",
                 "existingRevokedSheetOwnerRemediatedOnOriginal"):
   self.assertIs(self.data["interpretation"][unsafe],False)

 def test_catalog_original_counts_and_source_hashes_cannot_drift(self):
  for key,val in (
    ("authenticated_callable_security_definer",66),
    ("also_anon_callable",1),("empty_search_path",66),
    ("direct_uid_marker",61),("missing_direct_uid_marker",6),
    ("editable_metadata_marker",0),("max_function_body_bytes",12860),
    ("no_explicit_search_path",1)
  ):
   item=deepcopy(self.data)
   item["originalReadOnlyPublicDefinerCensus"][key]=val
   with self.subTest(key=key),self.assertRaises(gate.Blocked):
    self.check(item)
  for idx in (0,1,4,5,7):
   item=deepcopy(self.data)
   item["originalKnownFunctionQueue"][idx]["body_sha256"]="0"*64
   with self.subTest(idx=idx),self.assertRaises(gate.Blocked):
    self.check(item)
  item=deepcopy(self.data)
  item["originalKnownFunctionQueue"][5]["calls_edit_helper"]=False
  with self.assertRaises(gate.Blocked):self.check(item)

 def test_all_no_go_flags_and_source_only_guards_immutable(self):
  for key in gate.BLOCKED:
   item=deepcopy(self.data)
   item["interpretation"][key]=True
   with self.subTest(key=key),self.assertRaises(gate.Blocked):
    self.check(item)
  for key in gate.LIMITS:
   item=deepcopy(self.data)
   item["limits"][key]=False
   with self.subTest(key=key),self.assertRaises(gate.Blocked):
    self.check(item)

 def test_original_source_105_115_and_live_catalog_queries_pinned(self):
  with tempfile.TemporaryDirectory() as directory:
   tmp=Path(directory)
   for rel,expected in gate.SOURCES.items():
    target=tmp/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,target)
    self.assertEqual(gate.blob(target.read_bytes()),expected)
   altered=tmp/"tests/world-v2-r18-115-postgres/run.sh"
   altered.write_bytes(altered.read_bytes()+b"\n# altered fixture")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(self.data),tmp,self.raw)

 def test_census_catalog_is_readonly_and_never_exports_actual_function_sql(self):
  a=(ROOT/"scripts/release/r205_readonly_definer_authorization_census.sql").read_text()
  b=(ROOT/"scripts/release/r205_readonly_definer_focus_queue.sql").read_text()
  self.assertIn("pg_catalog.pg_proc",a)
  self.assertIn("has_function_privilege",b)
  self.assertNotIn("SELECT prosrc",a)
  self.assertNotIn("SELECT prosrc",b)
  for sql in (a,b):
   for unsafe in ("UPDATE public.","INSERT INTO public.",
                  "DELETE FROM public.","DROP FUNCTION","ALTER FUNCTION"):
    self.assertNotIn(unsafe,sql)

 def test_manifest_duplicate_json_wrong_types_and_raw_mutation_rejected(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=gate.unique)
  item=deepcopy(self.data);item["schema"]=True
  with self.assertRaises(gate.Blocked):self.check(item)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(self.data),ROOT,self.raw+b"\n ")

if __name__=="__main__":unittest.main()
