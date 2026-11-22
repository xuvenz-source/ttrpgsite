"""R235 regression tests for a fabricated, design-only NO_GO manifest.

No real SQL, owner data, network, subprocess, or DB clients.
"""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
SPEC=importlib.util.spec_from_file_location(
 "r235",ROOT/"scripts/release/r235_validate_disposable_replay_proposal.py"
)
r235=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r235)

def invented_design():
 return {
  "schema":1,"work_package":r235.WORK,"decision":"NO_GO",
  "phase":"PRE_APPROVAL_DESIGN_ONLY","source_only":True,
  "source_evidence":dict(r235.EXPECTED_SOURCE),
  "proposed_execution":dict(r235.EXPECTED_EXECUTION),
  "status_checks":[{"id":name,"approved":False} for name in r235.CHECKS],
  "release_gates":{name:False for name in r235.GATES}
 }

class ReplayDesignOnlyTests(unittest.TestCase):
 def test_invented_proposal_is_no_go(self):
  self.assertTrue(r235.validate(invented_design()))
 def test_no_execution_or_hosted_target_can_be_approved(self):
  for key in (
   "execution_enabled","original_project_allowed","qa_project_allowed",
   "production_allowed","remote_connection_allowed",
   "network_egress_during_replay_allowed","real_user_data_allowed",
   "private_sql_to_git_or_chat_allowed","cloud_resource_provisioning_allowed",
   "owner_permission_to_execute_original_migrations"
  ):
   with self.subTest(key=key):
    d=invented_design()
    d["proposed_execution"][key]=True
    with self.assertRaises(r235.Blocked):
     r235.validate(d)
 def test_never_substitute_consent_for_checks(self):
  for ix in range(len(r235.CHECKS)):
   d=invented_design()
   d["status_checks"][ix]["approved"]=True
   with self.subTest(ix=ix),self.assertRaises(r235.Blocked):
    r235.validate(d)
  for gate in r235.GATES:
   d=invented_design()
   d["release_gates"][gate]=True
   with self.subTest(gate=gate),self.assertRaises(r235.Blocked):
    r235.validate(d)
 def test_original_migration_numbers_and_provenance_fail_closed(self):
  for k in r235.EXPECTED_SOURCE:
   d=invented_design()
   val=d["source_evidence"][k]
   d["source_evidence"][k]=not val if type(val) is bool else val+1
   with self.subTest(k=k),self.assertRaises(r235.Blocked):
    r235.validate(d)
 def test_unreviewed_properties_and_fake_approval_rejected(self):
  bad=[]
  d=invented_design();d["decision"]="GO";bad.append(d)
  d=invented_design();d["phase"]="APPROVED_EXECUTION";bad.append(d)
  d=invented_design();d["sql"]="DO $$ BEGIN RAISE NOTICE ... END $$";bad.append(d)
  d=invented_design();d["proposed_execution"]["connection_string"]="postgres://remote";bad.append(d)
  d=invented_design();d["status_checks"][0]["notes"]="owner approved";bad.append(d)
  d=invented_design();d["status_checks"].reverse();bad.append(d)
  d=invented_design();d["proposed_execution"]["maximum_approved_cost_usd"]=100;bad.append(d)
  for case in bad:
   with self.assertRaises(r235.Blocked):
    r235.validate(case)
 def test_duplicate_keys_symlinks_and_pure_json_only(self):
  with self.assertRaises(r235.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=r235.unique_pairs)
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/"invented.json"
   p.write_text(json.dumps(invented_design()))
   self.assertTrue(r235.validate_file(p))
   symlink=Path(t)/"linked.json"
   symlink.symlink_to(p)
   with self.assertRaises(r235.Blocked):
    r235.validate_file(symlink)
   p.write_text('{"decision":"GO"}')
   with self.assertRaises(r235.Blocked):
    r235.validate_file(p)

if __name__=="__main__":unittest.main()
