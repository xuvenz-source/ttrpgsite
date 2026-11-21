"""R206 invented 83-file original privilege/helper source chronology tests.

No original user private SQL, historical migration filename, policy body,
signature, actor record, JWT or credential is copied to GitHub Actions.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(".").resolve()
sys.path.insert(0,str(ROOT/"scripts/release"))
import r154_private_history_audit as r154
import r193_private_invite_source_lineage as r193
import r198_private_sheet_auth_lineage as r198
import r200_private_storage_policy_lineage as r200
import r206_private_privileged_function_lineage as r206
from r191_private_fog_status_lineage import strict_migration_version

spec=importlib.util.spec_from_file_location(
 "r200fictional",ROOT/"tests/world-v2-r18-200-private-storage-policy.test.py"
)
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

# Each body is invented. Never copy any actual original private function.
BODIES=(
 "\n SELECT auth.uid() IS NOT NULL AND 'user_metadata' IS NOT NULL;\n",
 "\n SELECT public.can_edit_campaign_sheet_inventory(a, 'character', a, 'field');\n",
 "\n SELECT public.is_campaign_dm(a);\n",
 "\n SELECT public.is_campaign_dm(a);\n",
 "\n SELECT EXISTS (SELECT 1 FROM public.map_fog_status);\n",
 "\n SELECT public.can_edit_campaign_sheet(a,'character',a);\n",
 "\n SELECT (a IS NOT NULL);\n",
 "\n SELECT public.is_campaign_dm(a);\n",
 "\n SELECT public.can_edit_campaign_sheet(a,'character',a);\n",
 "\n SELECT EXISTS(SELECT 1 FROM public.campaign_members WHERE user_id=auth.uid());\n",
 "\n SELECT EXISTS(SELECT 1 FROM public.campaign_members WHERE user_id=auth.uid());\n",
)
INDICES=(2,4,6,8,12,14,16,18,20,22,24)

def sha(data:str):return hashlib.sha256(data.encode()).hexdigest()

def prepare(root:Path,exclude:int|None=None)->Path:
 folder=fictional.fixture(root)
 docket_file=root/"r111-private-review-docket.json"
 docket=json.loads(docket_file.read_text())
 # The R200 invented fixture has 3 CREATE / 1 ALTER / 1 DROP events.
 # R206 intentionally requires the owner R200 observed 10/0/2 = 12,
 # so reshape ONLY the fabricated files to that shape.
 item=docket["reviewItems"][60]
 p=folder/item["filename"]
 original=p.read_text()
 if "ALTER POLICY owner_read ON storage.objects" not in original:
  raise AssertionError("fictional policy fixture unexpectedly changed")
 edited=original.replace(
   "ALTER POLICY owner_read ON storage.objects",
   "CREATE POLICY owner_read_extra ON storage.objects",1)
 p.write_text(edited)
 item["sourceBodySha256"]=sha(edited)
 for i,index_in_docket in enumerate((30,31,32,33,34,35,36)):
  item=docket["reviewItems"][index_in_docket]
  p=folder/item["filename"]
  text=p.read_text()
  if i<6:
   text+=(f"\nCREATE POLICY fictional_extra_{i} ON storage.objects "
          f"FOR SELECT TO authenticated USING (bucket_id='fake_{i}');\n")
  else:
   text+="\nDROP POLICY IF EXISTS fictional_extra_0 ON storage.objects;\n"
  p.write_text(text)
  item["sourceBodySha256"]=sha(text)
 for index,(target,body) in enumerate(zip(r206.TARGETS,BODIES)):
  if index==exclude:continue
  old=docket["reviewItems"][INDICES[index]]
  path=folder/old["filename"]
  current=path.read_text()
  function=(
   f"\nCREATE OR REPLACE FUNCTION public.{target[0]}(a uuid) "
   "RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' "
   f"AS $fictional_{index}$"+body+f"$fictional_{index}$;\n"
  )
  current+=function
  path.write_text(current)
  old["sourceBodySha256"]=sha(current)
 docket_file.write_text(json.dumps(docket))
 return folder

def targets_for(bodies=BODIES):
 return tuple((t[0],len(body.encode()),sha(body))
              for t,body in zip(r206.TARGETS,bodies))

def inspect(root:Path,targets=None):
 if targets is None:targets=targets_for()
 fake_map={"name":"can_view_campaign_map",
   "body_sha256":sha(fictional.MAP_BODY),
   "body_bytes":len(fictional.MAP_BODY.encode())}
 with patch.object(r193,"TARGETS",fictional.fictional.patched_targets()), \
      patch.dict(r198.TARGET,{
       "body_sha256":sha(fictional.SHEET_BODY),
       "body_bytes":len(fictional.SHEET_BODY.encode())}), \
      patch.object(r200,"MAP_HELPER",fake_map), \
      patch.object(r206,"TARGETS",targets):
  return r206.report(root)

class PrivatePrivilegedHistory(unittest.TestCase):
 def test_all_eleven_sha_exacts_and_private_no_go(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   prepare(root)
   report=inspect(root)
   self.assertEqual(report["decision"],"NO_GO")
   self.assertEqual(report["original_private_migrations_sha256_verified"],83)
   self.assertTrue(report["prior_r200_r198_r193_source_lineage_reverified"])
   self.assertEqual(len(report["target_slots"]),11)
   self.assertTrue(report["all_11_latest_target_bodies_match_current"])
   self.assertEqual([t["slot"] for t in report["target_slots"]],list(range(1,12)))
   self.assertTrue(all(t["latest_sha256_matches_current"] for t in report["target_slots"]))
   self.assertTrue(all(t["latest_explicit_security_definer"] for t in report["target_slots"]))
   self.assertTrue(all(t["direct_historical_definition_count"]==1 for t in report["target_slots"]))
   self.assertTrue(report["target_slots"][1]["latest_calls_inventory_guard_marker"])
   self.assertTrue(report["target_slots"][5]["latest_calls_sheet_guard_marker"])
   self.assertTrue(report["target_slots"][8]["latest_calls_sheet_guard_marker"])
   self.assertTrue(report["target_slots"][0]["latest_user_editable_metadata_marker"])
   for name in r206.NO_APPROVAL_FIELDS:
    self.assertIs(report[name],False)
   dumped=json.dumps(report)
   for forbidden in ("CREATE FUNCTION","get_campaign_sheet_inventory",
     "r106-original-83-recovery","r111-private-review-docket",
     "user_metadata","can_edit_campaign_sheet","fictional_"):
    self.assertNotIn(forbidden,dumped)

 def test_missing_one_direct_definition_is_no_go_not_forged(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   prepare(root,exclude=6)
   report=inspect(root)
   slot=report["target_slots"][6]
   self.assertEqual(slot["direct_historical_definition_count"],0)
   self.assertFalse(slot["latest_direct_definition_found"])
   self.assertIsNone(slot["latest_executable_statement_ordinal"])
   self.assertFalse(slot["latest_sha256_matches_current"])
   self.assertFalse(report["all_11_latest_target_bodies_match_current"])
   self.assertEqual(report["decision"],"NO_GO")

 def test_newer_historical_redefinition_overrides_old_by_version_not_docket_index(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   folder=prepare(root)
   docket_path=root/"r111-private-review-docket.json"
   docket=json.loads(docket_path.read_text())
   last=max(docket["reviewItems"],
     key=lambda item:strict_migration_version(item["filename"]))
   path=folder/last["filename"]
   current=path.read_text()
   # An invented later definition that deliberately does NOT match current.
   current+="\nCREATE OR REPLACE FUNCTION public.get_campaign_sheet_inventory(a uuid) "+(
    "RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' "
    "AS $later$ SELECT FALSE; $later$;\n")
   path.write_text(current)
   last["sourceBodySha256"]=sha(current)
   docket_path.write_text(json.dumps(docket))
   report=inspect(root)
   slot=report["target_slots"][1]
   self.assertEqual(slot["direct_historical_definition_count"],2)
   self.assertFalse(slot["latest_sha256_matches_current"])
   self.assertFalse(report["all_11_latest_target_bodies_match_current"])
   self.assertEqual(report["decision"],"NO_GO")

 def test_forged_live_fingerprint_cannot_turn_into_security_approval(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   prepare(root)
   targets=list(targets_for())
   name,count,old_sha=targets[7]
   targets[7]=(name,count,"0"*64)
   report=inspect(root,tuple(targets))
   self.assertFalse(report["target_slots"][7]["latest_sha256_matches_current"])
   self.assertFalse(report["all_11_latest_target_bodies_match_current"])
   self.assertFalse(report["all_67_live_privileged_call_chains_approved"])

 def test_private_archive_source_tampering_fails_without_exporting_source(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   folder=prepare(root)
   target=next(folder.glob("*.sql"))
   target.write_text("SELECT 2;\n")
   with self.assertRaises(r154.AuditBlocked):
    inspect(root)

 def test_invalid_chronology_and_malformed_target_body_fail_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   folder=prepare(root)
   docket_path=root/"r111-private-review-docket.json"
   docket=json.loads(docket_path.read_text())
   old=docket["reviewItems"][INDICES[0]]
   path=folder/old["filename"]
   text=path.read_text()
   # Replace the first matching invented helper's closing dollar delimiter.
   text=text.replace("$fictional_0$;", "$BROKEN$;",1)
   path.write_text(text)
   old["sourceBodySha256"]=sha(text)
   docket_path.write_text(json.dumps(docket))
   with self.assertRaises((r154.AuditBlocked,ValueError)):
    inspect(root)
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   prepare(root)
   docket_path=root/"r111-private-review-docket.json"
   docket=json.loads(docket_path.read_text())
   docket["reviewItems"][0]["filename"]=docket["reviewItems"][1]["filename"]
   docket_path.write_text(json.dumps(docket))
   with self.assertRaises(r154.AuditBlocked):
    inspect(root)

if __name__=="__main__":unittest.main()
