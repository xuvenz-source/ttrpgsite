"""R18-154 synthetic-only unit tests: no private SQL or hosted DB."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"/"release"))
from r154_private_history_audit import statements, classify_file, audit, AuditBlocked

SAMPLE="""/* fake GRANT EXECUTE ON FUNCTION x() TO PUBLIC */
CREATE OR REPLACE FUNCTION public.fake(c uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.campaign_members m WHERE m.campaign_id=c) THEN
 RETURN true;
 END IF;
 RETURN false;
END;
$fn$;
CREATE POLICY dummy_policy ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='fictional' OR EXISTS(SELECT 1 FROM public.campaigns c));
GRANT EXECUTE ON FUNCTION public.fake(uuid) TO PUBLIC;
"""

class TestR154(unittest.TestCase):
 def fake_workspace(self,base):
  root=Path(base)/"ttrpg-history-private"
  directory=root/"r106-original-83-recovery"/"supabase"/"migrations"
  directory.mkdir(parents=True)
  root.chmod(0o700)
  rows=[]
  for i in range(83):
   name=f"20261121{i:07d}_fictional_{i}.sql"
   body=SAMPLE if i==0 else "SELECT 1;"
   (directory/name).write_text(body)
   rows.append({"filename":name,
                "sourceBodySha256":hashlib.sha256(body.encode()).hexdigest(),
                "securityApproved":False,"reviewStatus":"PENDING"})
  (root/"r111-private-review-docket.json").write_text(json.dumps({
   "workPackage":"B10-R18-111","decision":"NO_GO","reviewItems":rows}))
  return root,directory,rows
 def test_splitter_respects_dollar_body_semicolon_and_comments(self):
  parts=statements(SAMPLE)
  self.assertEqual(len(parts),3)
  self.assertIn("RETURN false;",parts[0])
  self.assertNotIn("fake GRANT",str(parts))
 def test_counts_are_provisional_not_security_approval(self):
  c=classify_file(SAMPLE)
  for label in ("security_definer_functions","definer_without_local_search_path",
    "storage_object_policies","storage_policy_or_marker",
    "storage_policy_no_known_identity_helper","public_execute_grants"):
   self.assertEqual(c.get(label),1,label)
 def test_offline_report_never_displays_source_sql_or_names(self):
  with tempfile.TemporaryDirectory() as d:
   root,_,_=self.fake_workspace(d)
   result=audit(root)
   text=json.dumps(result)
   self.assertEqual(result["files_sha256_verified"],83)
   self.assertEqual(result["decision"],"NO_GO")
   self.assertFalse(result["production_release_authorized"])
   for prohibited in ("fictional_0.sql","public.fake","CREATE POLICY","fake GRANT"):
    self.assertNotIn(prohibited,text)
 def test_tampered_file_is_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root,directory,rows=self.fake_workspace(d)
   (directory/rows[0]["filename"]).write_text("SELECT 42;")
   with self.assertRaises(AuditBlocked):audit(root)
 def test_symlink_migration_is_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root,directory,rows=self.fake_workspace(d)
   p=directory/rows[0]["filename"]
   target=directory/"source.txt"
   p.rename(target)
   p.symlink_to(target)
   with self.assertRaises(AuditBlocked):audit(root)
 def test_nonprivate_workspace_is_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root,_,_=self.fake_workspace(d)
   root.chmod(0o755)
   with self.assertRaises(AuditBlocked):audit(root)
 def test_forged_approval_is_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root,_,rows=self.fake_workspace(d)
   rows[0]["securityApproved"]=True
   (root/"r111-private-review-docket.json").write_text(json.dumps({
     "workPackage":"B10-R18-111","decision":"NO_GO","reviewItems":rows}))
   with self.assertRaises(AuditBlocked):audit(root)

if __name__=="__main__":
 unittest.main()
