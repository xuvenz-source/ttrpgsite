"""R212 original effective ACL vs R211 private-text markers, strict NO_GO."""
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
 "r212",ROOT/"scripts/release/r212_validate_effective_permission_surface.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
RAW=(ROOT/gate.MANIFEST).read_bytes()
DATA=json.loads(RAW)

class CurrentEffectiveAcl(unittest.TestCase):
 def checked(self,m):
  return gate.validate(m,ROOT,RAW)

 def test_source_bounded_original_and_empty_qa_permission_counts(self):
  r=self.checked(deepcopy(DATA))
  self.assertEqual(r["decision"],"NO_GO")
  self.assertEqual(r["owner_83_private_migration_sources_verified"],True)
  self.assertEqual(r["historical_literal_grant_truncate_count"],0)
  self.assertEqual(r["original_authenticated_truncate_table_acl_count"],5)
  self.assertTrue(r["all_original_public_tables_rls_enabled"])
  self.assertEqual(r["original_public_policies_permissive_count"],77)
  self.assertEqual(r["original_storage_policies_permissive_count"],8)
  self.assertEqual(r["isolated_qa_application_tables_and_functions"],0)
  self.assertFalse(r["original_five_table_truncate_grants_repaired"])
  self.assertFalse(r["qa_sql_installation_authorized"])
  self.assertFalse(r["production_security_release_authorized"])

 def test_live_acl_mismatch_r211_literal_indicator_remains_unapproved(self):
  self.assertEqual(DATA["ownerR211PrivateSanitizedReport"]["literalGrantTruncateMarkers"],0)
  self.assertEqual(DATA["originalEffectivePermissions"]["public_authenticated_truncate_granted_tables"],5)
  self.assertEqual(DATA["originalEffectivePermissions"]["public_rls_enabled_tables"],31)
  self.assertEqual(DATA["originalEffectivePermissions"]["public_policy_count"],77)
  self.assertEqual(DATA["isolatedQaEffectivePermissions"]["public_policy_count"],0)
  self.assertTrue(DATA["auditInterpretation"]["rlsNeverMakesTruncateRowScoped"])
  self.assertTrue(DATA["auditInterpretation"]["literalGrantTruncateMarkerIsNotEffectiveAclEvidence"])
  self.assertTrue(DATA["auditInterpretation"]["originalVsQaFiveExtensionCountDoesNotProveSameExtensionIdentity"])

 def test_source_count_and_report_fingerprint_mutations_rejected(self):
  cases=(
   ("originalEffectivePermissions","public_authenticated_truncate_granted_tables",0),
   ("originalEffectivePermissions","public_rls_enabled_tables",30),
   ("originalEffectivePermissions","public_policy_count",76),
   ("originalEffectivePermissions","public_permissive_policies",76),
   ("originalEffectivePermissions","public_anon_select_granted_tables",1),
   ("originalEffectivePermissions","public_authenticated_callable_definers",66),
   ("originalEffectivePermissions","public_authenticated_truncate_granted_tables",True),
   ("isolatedQaEffectivePermissions","public_tables",1),
   ("isolatedQaEffectivePermissions","installed_extension_count",4),
   ("ownerR211PrivateSanitizedReport","literalGrantTruncateMarkers",5),
   ("ownerR211PrivateSanitizedReport","riskFlaggedFiles",23),
   ("ownerR211PrivateSanitizedReport","sha256","0"*64),
   ("ownerR211PrivateSanitizedReport","securitySemanticsApproved",True),
  )
  for section,key,value in cases:
   m=deepcopy(DATA)
   m[section][key]=value
   with self.subTest(section=section,key=key),self.assertRaises(gate.Blocked):
    self.checked(m)

 def test_no_hosted_write_or_security_go(self):
  for key in DATA["approvals"]:
   m=deepcopy(DATA);m["approvals"][key]=not m["approvals"][key]
   with self.subTest(key=key),self.assertRaises(gate.Blocked):self.checked(m)
  for key in DATA["restrictions"]:
   m=deepcopy(DATA);m["restrictions"][key]=False
   with self.subTest(key=key),self.assertRaises(gate.Blocked):self.checked(m)
  for key in DATA["auditInterpretation"]:
   m=deepcopy(DATA);m["auditInterpretation"][key]=False
   with self.subTest(key=key),self.assertRaises(gate.Blocked):self.checked(m)

 def test_query_only_uses_catalog_aggregates_and_never_exports_sensitive_body(self):
  sql=(ROOT/"scripts/release/r212_readonly_qa_effective_permission_surface.sql").read_text()
  for required in (
   "pg_catalog.pg_policy","pg_catalog.pg_proc",
   "has_table_privilege","TRUNCATE","public_security_definer_functions",
   "storage_object_policies","public_rls_enabled_tables"):
   self.assertIn(required,sql)
  selected=sql[sql.rfind("SELECT\n (SELECT count"):]
  for forbidden in (
   "p.prosrc AS","pg_get_functiondef","pg_get_expr",
   "FROM auth.users","FROM storage.objects","INSERT INTO",
   "UPDATE public.","DROP POLICY","ALTER TABLE","DELETE FROM"):
   self.assertNotIn(forbidden,selected)

 def test_synthetic_only_postgres_and_grant_all_rollback_regression(self):
  script=(ROOT/"tests/world-v2-r18-212-postgres/run.sh").read_text()
  for expected in ("R212_ISOLATED","GITHUB_ACTIONS","127.0.0.1",
    "world_v2_r18_212","r212_disposable_only","fake_campaign_members",
    "ENABLE ROW LEVEL SECURITY","GRANT ALL PRIVILEGES",
    "has_table_privilege","SET LOCAL ROLE authenticated",
    "TRUNCATE TABLE public.fake_campaign_members","ROLLBACK;",
    "REVOKE TRUNCATE","SELECT"):
   self.assertIn(expected,script)
  self.assertNotIn("supabase db push",script)
  self.assertNotIn("curl ",script)

 def test_frozen_git_blob_and_duplicate_manifest_fail_closed(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for rel,sha in gate.SOURCES.items():
    target=root/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,target)
    self.assertEqual(gate.gitblob(target.read_bytes()),sha)
   bad=root/"tests/world-v2-r18-212-postgres/run.sh"
   bad.write_bytes(bad.read_bytes()+b"\n# unauthorized test edit")
   with self.assertRaises(gate.Blocked):
    gate.validate(deepcopy(DATA),root,RAW)
  with self.assertRaises(gate.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
              object_pairs_hook=gate.no_duplicate)
  modified=deepcopy(DATA);modified["schema"]=True
  with self.assertRaises(gate.Blocked):self.checked(modified)
  with self.assertRaises(gate.Blocked):
   gate.validate(deepcopy(DATA),ROOT,RAW+b"\n")

if __name__=="__main__":unittest.main()
