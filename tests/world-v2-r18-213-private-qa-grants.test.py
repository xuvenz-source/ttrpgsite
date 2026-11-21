"""R213 fabricated 83-migration all-file broad grant and 22-index private triage.

All fixtures fabricated in GitHub Actions; no original historical migration SQL,
docket, names, Auth user, Storage keys or signed URLs in any test.
"""
from copy import deepcopy
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(".").resolve()
sys.path.insert(0,str(ROOT/"scripts/release"))
import r154_private_history_audit as r154
import r211_private_qa_migration_effects as r211
import r213_private_qa_broad_grant_review as audit

spec=importlib.util.spec_from_file_location(
 "fictional83",ROOT/"tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

def add(root,index,sql):
 d=root/"r111-private-review-docket.json"
 docket=json.loads(d.read_text())
 item=docket["reviewItems"][index]
 target=root/"r106-original-83-recovery"/"supabase"/"migrations"/item["filename"]
 source=target.read_text()+"\n"+sql+"\n"
 target.write_text(source)
 item["sourceBodySha256"]=hashlib.sha256(source.encode()).hexdigest()
 d.write_text(json.dumps(docket))

def checked(root):
 prev=r211.report(root)
 with patch.object(audit,"EXPECTED_PRIOR_STATEMENTS",prev["lexical_top_level_statements"]), \
      patch.object(audit,"EXPECTED_PRIOR_RISK_FILES",prev["risk_flagged_original_file_count"]), \
      patch.object(audit,"EXPECTED_PRIOR_TRUNCATE_WORDS",prev["conservative_word_markers"]["grant_truncate_word"]):
  return audit.report(root)

class AllPrivateHistoryGrantReview(unittest.TestCase):
 def test_safe_fictional_83_archive_no_private_data_exported(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   fictional.fixture(root)
   r=checked(root)
   self.assertEqual(r["decision"],"NO_GO")
   self.assertEqual(r["original_private_migrations_verified"],83)
   self.assertGreater(r["r211_historical_statement_total_reconciled"],0)
   self.assertEqual(r["r211_risk_flagged_files_reconciled"],len(r["review_items"]))
   self.assertFalse(r["qa_sql_installation_authorized"])
   self.assertFalse(r["all_83_original_migrations_semantically_approved"])
   self.assertFalse(r["historical_keyword_absence_proves_no_effective_truncate"])
   self.assertFalse(r["network_or_database_accessed"])
   self.assertFalse(r["sql_executed"])
   dumped=json.dumps(r)
   for sensitive in ("r106-original","r111-private-review-docket",
    "CREATE FUNCTION public.","GRANT ALL PRIVILEGES ON TABLE",
    "fictional.sql","SQL_SECRET","pg_catalog.pg_proc","supabase.co"):
    self.assertNotIn(sensitive,dumped)

 def test_broad_grant_outside_prior_flagged_index_is_not_missed(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work);fictional.fixture(root)
   prev=r211.report(root)
   flagged=set(prev["first_r111_priority_review_indices_not_chronology"])
   not_flagged=next(i for i in range(1,84) if i not in flagged)
   add(root,not_flagged-1,
       "GRANT ALL PRIVILEGES ON TABLE public.fake_table TO authenticated;")
   r=checked(root)
   self.assertGreaterEqual(
    r["historical_direct_top_level_grant_marker_totals"]["all_auth"],1)
   self.assertIn(not_flagged,r["additional_broad_grant_priority_indices_not_r211_flagged"])
   self.assertEqual(r["decision"],"NO_GO")

 def test_explicit_truncate_and_revoke_versus_broad_grant_not_same(self):
  candidates=(
   ("GRANT ALL PRIVILEGES ON TABLE public.fake_table TO authenticated;","all_auth"),
   ("GRANT TRUNCATE ON TABLE public.fake_table TO authenticated;","auth_truncate_grant"),
   ("GRANT SELECT, TRUNCATE ON TABLE public.fake_table TO authenticated;","auth_truncate_grant"),
   ("REVOKE TRUNCATE ON TABLE public.fake_table FROM authenticated;","auth_truncate_revoke"),
   ("GRANT ALL PRIVILEGES ON FUNCTIONS IN SCHEMA public TO authenticated;","all_other"),
   ("GRANT ALL PRIVILEGES ON TABLE public.fake_table TO anon;","all_anon_public"),
   ("GRANT ALL PRIVILEGES ON TABLE public.fake_table TO PUBLIC;","all_anon_public")
  )
  for sql,field in candidates:
   kind,_,_=r211.classify(sql)
   markers=audit.grant_markers(sql,kind)
   with self.subTest(sql=sql):
    self.assertTrue(markers[field])
  for sql in (
   "DO $x$ BEGIN EXECUTE 'GRANT ALL PRIVILEGES ON TABLE public.fake_table TO authenticated'; END $x$;",
   "CREATE FUNCTION public.fake() RETURNS void AS $q$ BEGIN RAISE NOTICE 'GRANT ALL PRIVILEGES ON TABLE public.fake_table TO authenticated'; END; $q$ LANGUAGE plpgsql;"
  ):
   kind,_,_=r211.classify(sql)
   self.assertNotEqual(kind,"grant")
   self.assertFalse(audit.grant_markers(sql,kind)["all_auth"])

 def test_fake_do_and_policy_risk_codes_are_bounded_and_nonidentifying(self):
  s="DO $x$ BEGIN EXECUTE 'CREATE POLICY bad ON storage.objects'; END $x$;"
  kind,mark,_=r211.classify(s)
  codes=audit.codes_for(s,kind,mark,audit.grant_markers(s,kind))
  self.assertIn("DO_OR_DYNAMIC_EXECUTE",codes)
  self.assertTrue(codes<=set(audit.RISK_CODES))
  self.assertNotIn("BROAD_TABLE_GRANT_AUTH_CANDIDATE",codes)
  p="CREATE POLICY fake ON storage.objects USING (true OR owner_id=auth.uid());"
  kind,mark,_=r211.classify(p)
  codes=audit.codes_for(p,kind,mark,audit.grant_markers(p,kind))
  self.assertIn("STORAGE_POLICY_CHANGE",codes)
  self.assertIn("RLS_OR_PUBLIC_POLICY",codes)

 def test_checksum_drift_and_bad_chronology_fail_before_private_report(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   folder=fictional.fixture(root)
   p=next(folder.glob("*.sql"))
   p.write_text(p.read_text()+"\n-- unauthorized")
   with self.assertRaises(r154.AuditBlocked):checked(root)
  with tempfile.TemporaryDirectory() as work:
   root=Path(work)
   fictional.fixture(root)
   docket=root/"r111-private-review-docket.json"
   j=json.loads(docket.read_text())
   j["reviewItems"][2]["filename"]=j["reviewItems"][1]["filename"]
   docket.write_text(json.dumps(j))
   with self.assertRaises(r154.AuditBlocked):checked(root)

 def test_report_refuses_fake_premature_approval_even_when_grants_zero(self):
  with tempfile.TemporaryDirectory() as work:
   root=Path(work);fictional.fixture(root)
   r=checked(root)
   for flag in ("historical_keyword_absence_proves_no_effective_truncate",
    "broad_grant_marker_proves_actual_acl_origin",
    "sql_dependency_graph_completed",
    "all_83_original_migrations_semantically_approved",
    "qa_sql_installation_authorized",
    "production_or_original_sql_authorized"):
    self.assertIs(r[flag],False)
   self.assertFalse(r["private_sql_policy_function_table_names_versions_or_paths_exported"])
   self.assertEqual(r["original_effective_authenticated_truncate_tables_observed"],5)

if __name__=="__main__":unittest.main()
