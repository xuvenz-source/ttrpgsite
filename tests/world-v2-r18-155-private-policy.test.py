"""R18-155 synthetic-only CI tests, no real migration bodies."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"/"release"))
from r155_private_policy_focus import report,describe,AuditBlocked

POLICY="""CREATE POLICY map_reader ON storage.objects
 FOR SELECT TO authenticated USING (
  bucket_id='synthetic-private-bucket'
  AND EXISTS(SELECT 1 FROM public.battle_maps AS m
     WHERE m.campaign_id='00000000-0000-4000-8000-000000000101'
       AND m.object_path=name)
);"""
NORMAL="SELECT 1;"

class TestR155(unittest.TestCase):
 def fake(self,tmp,policy=POLICY,index=29):
  root=Path(tmp)/"ttrpg-history-private"
  directory=root/"r106-original-83-recovery"/"supabase"/"migrations"
  directory.mkdir(parents=True)
  root.chmod(0o700)
  rows=[]
  for i in range(83):
   name=f"20261121{i:07d}_fictional_{i}.sql"
   body=policy if i==index-1 else NORMAL
   (directory/name).write_text(body)
   rows.append({"filename":name,
      "sourceBodySha256":hashlib.sha256(body.encode()).hexdigest(),
      "securityApproved":False,"reviewStatus":"PENDING"})
  (root/"r111-private-review-docket.json").write_text(json.dumps({
    "workPackage":"B10-R18-111","decision":"NO_GO","reviewItems":rows}))
  return root,directory,rows
 def test_index29_detected_as_docket_position_not_migration_sequence(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,_,_=self.fake(tmp)
   result=report(root)
   self.assertEqual(result["r111_review_index"],29)
   self.assertEqual(result["target_policy_count"],1)
   self.assertEqual(result["policy"]["operation"],"SELECT")
   self.assertEqual(result["policy"]["role_scope"],"AUTHENTICATED")
   self.assertIn("battle_maps",result["policy"]["known_tables_referenced"])
   self.assertTrue(result["policy"]["bucket_id_reference"])
   self.assertTrue(result["policy"]["exists_condition"])
   self.assertFalse(result["private_sql_semantic_approval"])
   self.assertFalse(result["production_release_authorized"])
 def test_output_reveals_no_file_names_or_raw_sql(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,_,_=self.fake(tmp)
   result=report(root)
   safe=json.dumps(result)
   for forbidden in ("map_reader","synthetic-private-bucket","20261121",
      "00000000-0000-4000","CREATE POLICY","SELECT 1","public.battle_maps AS m"):
    self.assertNotIn(forbidden,safe)
   self.assertTrue(result["filenames_exported"] is False)
 def test_wrong_docket_index_fails_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,_,_=self.fake(tmp,index=28)
   with self.assertRaises(AuditBlocked):report(root)
 def test_multiple_unrecognized_policies_fails_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,_,rows=self.fake(tmp)
   name=rows[28]["filename"]
   p=root/"r106-original-83-recovery"/"supabase"/"migrations"/name
   content=POLICY+"\n"+POLICY.replace("map_reader","other_map_reader")
   p.write_text(content)
   rows[28]["sourceBodySha256"]=hashlib.sha256(content.encode()).hexdigest()
   (root/"r111-private-review-docket.json").write_text(json.dumps({
     "workPackage":"B10-R18-111","decision":"NO_GO","reviewItems":rows}))
   with self.assertRaises(AuditBlocked):report(root)
 def test_tamper_prevents_report(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,directory,rows=self.fake(tmp)
   (directory/rows[28]["filename"]).write_text("SELECT leaked;")
   with self.assertRaises(AuditBlocked):report(root)
 def test_unspecified_role_must_not_be_interpreted_as_authenticated(self):
  result=describe("CREATE POLICY unnamed ON storage.objects FOR SELECT USING (bucket_id='x');")
  self.assertEqual(result["role_scope"],"UNSPECIFIED_DEFAULT_PUBLIC")
 def test_unknown_sql_identifiers_not_in_report(self):
  result=describe("CREATE POLICY secret_fictional ON storage.objects FOR SELECT TO authenticated USING (arbitrary_private_helper(bucket_id));")
  self.assertEqual(result["known_helpers_referenced"],[])
  self.assertNotIn("arbitrary_private_helper",json.dumps(result))

if __name__=="__main__":
 unittest.main()
