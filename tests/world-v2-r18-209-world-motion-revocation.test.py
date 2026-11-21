"""R209 hostile original five-phase movement guard source-only NO_GO tests."""
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
 "r209",ROOT/"scripts/release/r209_validate_world_motion_revocation.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class WorldMotionRevocationGate(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=FILE.read_bytes()
  cls.data=json.loads(cls.raw)

 def check(self,data):return gate.validate(data,ROOT,self.raw)

 def test_current_live_five_phase_snapshots_and_hard_no_go(self):
  result=self.check(deepcopy(self.data))
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["five_original_current_function_source_hashes_pinned"])
  self.assertTrue(result["begin_refs_member_gated_map_helper_and_dm_guard"])
  self.assertTrue(result["advance_actor_ownership_word_without_map_guard_word"])
  self.assertTrue(result["commit_map_guard_word_before_first_qualified_update_word"])
  self.assertTrue(result["cancel_actor_ownership_marker_without_membership_marker"])
  self.assertFalse(result["live_signed_mid_session_revoke_commit_denial_verified"])
  self.assertFalse(result["hosted_qa_or_production_release_authorized"])

 def test_live_lexical_positions_do_not_certify_all_branch_semantics(self):
  rows=self.data["originalCurrentWorldV2FourPhasesAndMapVisibility"]
  self.assertEqual(len(rows),5)
  self.assertTrue(all(x["prosecdef"] and x["postgres_owned"]
                      and x["empty_search_path"] for x in rows))
  self.assertTrue(all(x["auth_callable"] and not x["anon_callable"] for x in rows))
  self.assertTrue(rows[0]["map_helper"] and rows[0]["dm_helper"])
  self.assertTrue(rows[1]["actor_equals_uid_marker"])
  self.assertFalse(rows[1]["map_helper"])
  self.assertEqual(rows[1]["row_lock_count"],1)
  self.assertEqual(rows[2]["first_row_lock_pos"],581)
  self.assertEqual(rows[2]["map_guard_pos"],811)
  self.assertEqual(rows[2]["first_qualified_update_pos"],4994)
  self.assertTrue(rows[2]["map_helper_before_first_qualified_update"])
  self.assertTrue(rows[3]["actor_equals_uid_marker"])
  self.assertTrue(rows[4]["direct_membership"])
  self.assertFalse(self.data["unapprovedClaims"]["mapHelperCurrentMembershipEnforcedInAllCommitPaths"])

 def test_forged_later_guard_or_missing_guard_fails_closed(self):
  for slot,key,value in (
   (0,"body_sha256","0"*64),(0,"map_helper",False),
   (0,"dm_helper",False),(1,"body_bytes",1151),
   (1,"actor_equals_uid_marker",False),
   (1,"map_helper",True),
   (2,"map_guard_pos",5000),(2,"first_qualified_update_pos",800),
   (2,"map_helper_before_first_qualified_update",False),
   (3,"actor_equals_uid_marker",False),
   (4,"direct_membership",False),
   (4,"auth_callable",False),
   (4,"input_arg_count",True),
  ):
   data=deepcopy(self.data)
   data["originalCurrentWorldV2FourPhasesAndMapVisibility"][slot][key]=value
   with self.subTest(slot=slot,key=key),self.assertRaises(gate.Blocked):
    self.check(data)

 def test_all_signed_qa_and_release_flags_fail_closed(self):
  for section in ("unapprovedClaims","evidenceBoundaries","restrictions"):
   for key in self.data[section]:
    data=deepcopy(self.data)
    data[section][key]=not data[section][key]
    with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
     self.check(data)
  data=deepcopy(self.data)
  data["ownerR206SanitizedReportSha256"]="0"*64
  with self.assertRaises(gate.Blocked):self.check(data)

 def test_current_catalog_sql_never_selects_raw_function_source(self):
  script=(ROOT/"scripts/release/r209_readonly_world_motion_phase_gates.sql").read_text()
  self.assertIn("pg_catalog.pg_proc",script)
  self.assertIn("map_helper_before_first_qualified_update",script)
  self.assertIn("first_qualified_update_pos",script)
  selected=script[script.rfind("SELECT proname AS known_public_rpc"):]
  for forbidden in ("prosrc AS source","pg_get_functiondef",
   "SELECT p.prosrc","FROM auth.users","FROM public.campaign_members",
   "UPDATE public.","DELETE FROM public.","ALTER POLICY","DROP FUNCTION"):
   self.assertNotIn(forbidden,selected)
  # Only SHA/byte functions may receive prosrc inside PostgreSQL; the
  # final SELECT must never include a standalone source SQL output field.
  self.assertFalse(any(line.strip().startswith(("prosrc,", "prosrc AS "))
    for line in selected.splitlines()))

 def test_frozen_source_and_synthetic_fixture_safety(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for rel,sha in gate.BLOBS.items():
    path=root/rel
    path.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,path)
    self.assertEqual(gate.gitblob(path.read_bytes()),sha)
   p=root/"tests/world-v2-r18-209-postgres/run.sh"
   p.write_bytes(p.read_bytes()+b"\n# forbidden unreviewed modification")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(self.data),root,self.raw)
  s=(ROOT/"tests/world-v2-r18-209-postgres/run.sh").read_text()
  for phrase in ("R209_ISOLATED","GITHUB_ACTIONS","127.0.0.1",
    "world_v2_r18_209","fake_world_commit","fake_world_advance",
    "fake_world_cancel","DELETE FROM public.fake_world_members",
    "unsafe-commit.sql","ROLLBACK;","SET LOCAL ROLE authenticated",
    "RESET ROLE;","f" ):
   self.assertIn(phrase,s)
  self.assertNotIn("supabase db",s)
  self.assertNotIn("curl ",s)

 def test_duplicate_json_types_and_manifest_bytes_rejected(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=gate.unique)
  data=deepcopy(self.data);data["schema"]=True
  with self.assertRaises(gate.Blocked):self.check(data)
  data=deepcopy(self.data)
  data["originalCurrentWorldV2FourPhasesAndMapVisibility"][2]["map_guard_pos"]=811.0
  with self.assertRaises(gate.Blocked):self.check(data)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(self.data),ROOT,self.raw+b" ")

if __name__=="__main__":unittest.main()
