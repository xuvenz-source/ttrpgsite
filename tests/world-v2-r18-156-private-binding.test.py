"""R156 synthetic-only, no original SQL content in GitHub."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"/"release"))
from r156_private_map_binding import structural_flags,audit,AuditBlocked

POLICY="""CREATE POLICY fake_map ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id='fictional-maps' AND name ~ '^fictional/'
 AND EXISTS(SELECT 1 FROM public.battle_maps AS bm
  WHERE bm.storage_path=objects.name
    AND can_view_campaign_map(bm.campaign_id,bm.id))
);"""
class TestR156(unittest.TestCase):
 def make(self, base, body=POLICY):
  root=Path(base)/"ttrpg-history-private"
  folder=root/"r106-original-83-recovery"/"supabase"/"migrations"
  folder.mkdir(parents=True)
  root.chmod(0o700)
  items=[]
  for i in range(83):
   name=f"20261121{i:07d}_fictional_{i}.sql"
   sql=body if i==28 else "SELECT 1;"
   (folder/name).write_text(sql)
   items.append({"filename":name,
                 "sourceBodySha256":hashlib.sha256(sql.encode()).hexdigest(),
                 "securityApproved":False,
                 "reviewStatus":"PENDING"})
  (root/"r111-private-review-docket.json").write_text(json.dumps({
   "workPackage":"B10-R18-111","decision":"NO_GO","reviewItems":items
  }))
  return root,folder,items
 def test_detects_bound_canonical_campaign_file_path(self):
  f=structural_flags(POLICY)
  for k in ("authenticated_scope","select_scope","bucket_id_predicate",
   "storage_object_name_predicate","battle_maps_source_and_alias",
   "same_alias_storage_path_equals_requested_object_name",
   "same_alias_campaign_id_and_map_id_to_helper",
   "exists_subquery_marker"):
   self.assertTrue(f[k],k)
  self.assertFalse(f["direct_auth_uid_or_jwt"])
  self.assertFalse(f["or_text_marker"])
 def test_other_table_alias_not_accepted_for_helper(self):
  f=structural_flags(POLICY.replace("can_view_campaign_map(bm.campaign_id,bm.id)",
          "can_view_campaign_map(other.campaign_id,other.id)"))
  self.assertFalse(f["same_alias_campaign_id_and_map_id_to_helper"])
 def test_no_path_binding_must_not_claim_pass(self):
  f=structural_flags(POLICY.replace("bm.storage_path=objects.name",
          "bm.storage_path='fictional-constant'"))
  self.assertFalse(f["same_alias_storage_path_equals_requested_object_name"])
 def test_no_literal_or_username_leak(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,_,_=self.make(tmp)
   r=audit(root)
   self.assertTrue(r["all_expected_binding_markers_present"])
   self.assertFalse(r["policy_semantically_approved"])
   self.assertEqual(r["source_fingerprints_verified"],83)
   self.assertFalse(r["private_sql_exported"])
   report=json.dumps(r)
   for term in ["fake_map","fictional-maps","20261121","CREATE POLICY",
                "fictional_28.sql","objects.name"]:
    self.assertNotIn(term,report)
 def test_canonical_join_missing_stays_not_approved(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,_,_=self.make(tmp,POLICY.replace(
      "bm.storage_path=objects.name","bm.storage_path='constant'"))
   result=audit(root)
   self.assertFalse(result["all_expected_binding_markers_present"])
   self.assertFalse(result["production_release_authorized"])
 def test_hash_tamper_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,folder,items=self.make(tmp)
   (folder/items[28]["filename"]).write_text("SELECT 42;")
   with self.assertRaises(AuditBlocked):audit(root)
 def test_wrong_priority_sorted_index_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root,folder,items=self.make(tmp)
   first=folder/items[28]["filename"]
   last=folder/items[27]["filename"]
   first.write_text("SELECT 1;")
   last.write_text(POLICY)
   items[28]["sourceBodySha256"]=hashlib.sha256(b"SELECT 1;").hexdigest()
   items[27]["sourceBodySha256"]=hashlib.sha256(POLICY.encode()).hexdigest()
   (root/"r111-private-review-docket.json").write_text(json.dumps({
     "workPackage":"B10-R18-111","decision":"NO_GO","reviewItems":items
   }))
   with self.assertRaises(AuditBlocked):audit(root)
if __name__=="__main__":
 unittest.main()
