"""R207 adversarial original-current 12 privilege helper graph NO_GO tests."""
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
 "r207gate",ROOT/"scripts/release/r207_validate_privileged_helper_graph.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
FILE=ROOT/gate.MANIFEST

class OriginalPrivilegedGraph(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.raw=FILE.read_bytes()
  cls.manifest=json.loads(cls.raw)

 def check(self,m):
  return gate.validate(m,ROOT,self.raw)

 def test_exact_12_live_sha_and_owner_11_private_lineages_remain_no_go(self):
  r=self.check(deepcopy(self.manifest))
  self.assertEqual(r["decision"],"NO_GO")
  self.assertTrue(r["owner_r206_83_sha_and_11_live_function_matches_reconciled"])
  self.assertTrue(r["current_original_12_function_source_hashes_matched"])
  self.assertTrue(r["inventory_get_chain_reaches_existing_sheet_guard"])
  self.assertTrue(r["fog_status_has_no_detected_current_membership_helper"])
  self.assertFalse(r["original_fog_status_vulnerability_remediated"])
  self.assertFalse(r["original_sheet_revoked_owner_gap_remediated"])
  self.assertFalse(r["real_signed_qa_or_hosted_sql_authorized"])

 def test_lexical_graph_exact_risk_paths_and_no_fake_safety(self):
  graph=self.manifest["currentOriginalLiveTwelveFunctionLexicalCallGraph"]
  self.assertEqual(len(graph),12)
  expect=[[11],[9],[10],[10],[],[12],[],[10],[12],[],[],[10]]
  self.assertEqual([p["lexical_callee_slots"] for p in graph],expect)
  self.assertTrue(graph[0]["editable_metadata_marker"])
  self.assertTrue(graph[0]["metadata_marker_before_first_where"])
  self.assertTrue(graph[0]["direct_member_marker"])
  self.assertFalse(graph[4]["direct_uid_marker"])
  self.assertFalse(graph[4]["direct_member_marker"])
  self.assertFalse(graph[11]["direct_member_marker"])
  self.assertTrue(graph[11]["direct_uid_marker"])
  self.assertFalse(graph[8]["auth_exec"])
  self.assertFalse(graph[11]["auth_exec"])
  self.assertTrue(all(row["anon_exec"] is False for row in graph))

 def test_changed_source_hashs_graph_edges_and_metadata_scope_fail_closed(self):
  for i,key,value in (
   (0,"source_sha256","0"*64),(1,"source_bytes",1949),
   (1,"lexical_callee_slots",[]),(2,"lexical_callee_slots",[11]),
   (5,"lexical_callee_slots",[]),(6,"direct_uid_marker",True),
   (8,"auth_exec",True),(11,"direct_member_marker",True),
   (0,"metadata_marker_before_first_where",False),
   (4,"anon_exec",True),(0,"slot",True),
   (11,"lexical_callee_slots",[12])
  ):
   data=deepcopy(self.manifest)
   data["currentOriginalLiveTwelveFunctionLexicalCallGraph"][i][key]=value
   with self.subTest(slot=i+1,field=key),self.assertRaises(gate.Blocked):
    self.check(data)

 def test_original_r206_receipt_and_all_security_holds_immutable(self):
  for key,value in (
   ("bytes",11289),("sha256","0"*64),("verifiedOriginalMigrations",82),
   ("latest11BodiesMatchedCurrent",False),("securityApproved",True)
  ):
   data=deepcopy(self.manifest)
   data["ownerR206SanitizedReceipt"][key]=value
   with self.subTest(key=key),self.assertRaises(gate.Blocked):
    self.check(data)
  for section in ("unapprovedClaims","restrictions","provenanceLimitations"):
   for key in self.manifest[section]:
    data=deepcopy(self.manifest)
    data[section][key]=not data[section][key]
    with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
     self.check(data)

 def test_readonly_query_does_not_export_source_code_or_private_rows(self):
  q=(ROOT/"scripts/release/r207_readonly_privileged_helper_graph.sql").read_text()
  for marker in ("pg_catalog.pg_proc","lexical_callee_slots",
   "current","sha256","prosrc ~*"):
   if marker=="current":
    self.assertIn("current live",q)
   else:self.assertIn(marker,q)
  returned=q[q.rfind("SELECT a.slot"):]
  # Source may appear only as an *argument* to in-DB regexp/boolean
  # functions, never as a standalone SELECT output column or raw source.
  self.assertFalse(any(line.strip().startswith(("a.prosrc,", "p.prosrc,", "a.prosrc AS", "p.prosrc AS")) for line in returned.splitlines()))
  for forbidden in ("a.prosrc AS","pg_get_functiondef",
                    "FROM public.characters","FROM auth.users",
                    "DROP FUNCTION","DELETE FROM","UPDATE public.","ALTER POLICY"):
   self.assertNotIn(forbidden,returned)

 def test_loopback_pg17_and_unsafe_metadata_or_rolled_back(self):
  s=(ROOT/"tests/world-v2-r18-207-postgres/run.sh").read_text()
  for expected in (
   "R207_ISOLATED","GITHUB_ACTIONS","127.0.0.1",
   "world_v2_r18_207","r207_disposable_only",
   "fake_campaign_account_names","fake_is_campaign_member",
   "raw_user_meta_data","campaign_member","SET LOCAL ROLE authenticated",
   "ROLLBACK;","fail","unsafe.sql","revoked user"):
   if expected=="revoked user":
    self.assertIn("removed actor",s)
   else:self.assertIn(expected,s)
  self.assertNotIn("supabase db",s)
  self.assertNotIn("curl ",s)

 def test_git_source_byte_pin_rejects_unauthorized_test_edits(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for rel,sha in gate.BLOBS.items():
    dest=root/rel
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,dest)
    self.assertEqual(gate.gitblob(dest.read_bytes()),sha)
   f=root/"tests/world-v2-r18-207-postgres/run.sh"
   f.write_bytes(f.read_bytes()+b"\n# tamper\n")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(self.manifest),root,self.raw)

 def test_duplicate_json_and_type_coercion_fail_closed(self):
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=gate.unique)
  m=deepcopy(self.manifest)
  m["schema"]=True
  with self.assertRaises(gate.Blocked):self.check(m)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(self.manifest),ROOT,self.raw+b" ")
  m=deepcopy(self.manifest)
  m["decision"]="GO"
  with self.assertRaises(gate.Blocked):self.check(m)

if __name__=="__main__":unittest.main()
