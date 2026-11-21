"""R211 invented 83-file SQL inventory QA preflight, no private SQL ever in CI."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(".").resolve()
sys.path.insert(0,str(ROOT/"scripts/release"))
import r154_private_history_audit as baseline
import r211_private_qa_migration_effects as gate

spec=importlib.util.spec_from_file_location(
 "r193fictional",ROOT/"tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

def add_statement(root,index,source):
 folder=root/"r106-original-83-recovery"/"supabase"/"migrations"
 docket_path=root/"r111-private-review-docket.json"
 docket=json.loads(docket_path.read_text())
 item=docket["reviewItems"][index]
 path=folder/item["filename"]
 text=path.read_text()+"\n"+source+"\n"
 path.write_text(text)
 item["sourceBodySha256"]=hashlib.sha256(text.encode()).hexdigest()
 docket_path.write_text(json.dumps(docket))

class PrivateQaSemanticPreflight(unittest.TestCase):
 def test_private_83_integrity_and_safe_fixed_no_go_schema(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   fictional.fixture(root)
   # Every source in this test is invented, never the owner's original.
   r=gate.report(root)
   self.assertEqual(r["work_package"],"B10-R18-211")
   self.assertEqual(r["decision"],"NO_GO")
   self.assertEqual(r["original_migrations_sha256_reverified"],83)
   self.assertTrue(r["original_migration_chronology_unique_valid"])
   self.assertEqual(sum(r["top_level_statement_kinds"].values()),
                    r["lexical_top_level_statements"])
   self.assertEqual(len(r["top_level_statement_kinds"]),len(gate.KIND_NAMES))
   self.assertEqual(len(r["conservative_word_markers"]),len(gate.AGG_KEYS))
   self.assertFalse(r["all_83_migrations_semantically_reviewed"])
   self.assertFalse(r["private_source_safe_for_qa_install_proven"])
   self.assertFalse(r["qa_sql_write_authorized"])
   self.assertFalse(r["original_or_production_write_authorized"])
   self.assertTrue(r["no_sql_executed"])
   self.assertTrue(r["no_network_or_database_access"])
   out=json.dumps(r)
   for forbidden in (
    "r106-original","r111-private-review-docket","fictional.sql",
    "CREATE FUNCTION public.", "CREATE POLICY owner_read",
    "ALTER TABLE public.", "raw_user_meta_data", "auth.users"
   ):
    self.assertNotIn(forbidden,out)

 def test_classifier_top_level_do_body_not_create_policy(self):
  category,marks,review=gate.classify(
    "DO $fixture$ BEGIN EXECUTE 'CREATE POLICY bad ON storage.objects'; END $fixture$")
  self.assertEqual(category,"do_block")
  self.assertTrue(review)
  self.assertTrue(marks["dollar_execute_word"])
  self.assertTrue(marks["storage_objects_word"])
  self.assertEqual(gate.kind_of("CREATE OR REPLACE FUNCTION public.example() RETURNS void AS $f$ SELECT 1; $f$ LANGUAGE sql"),"create_function")
  self.assertEqual(gate.kind_of("CREATE POLICY fictional ON storage.objects USING (true)"),"create_policy")
  self.assertEqual(gate.kind_of("ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC"),"default_privileges")
  self.assertEqual(gate.kind_of("CREATE EXTENSION IF NOT EXISTS pg_net"),"extension_change")
  self.assertEqual(gate.kind_of("GRANT TRUNCATE ON TABLE public.fake TO authenticated"),"grant")
  self.assertEqual(gate.kind_of("COPY public.fake FROM PROGRAM 'echo nothing'"),"copy")
  self.assertEqual(gate.kind_of("VACUUM public.fake"),"other")
  forged=( "CREATE FUNCTION public.invented() RETURNS void LANGUAGE plpgsql "
           "SECURITY DEFINER AS $body$ BEGIN RAISE NOTICE 'SET search_path = public'; END; $body$" )
  function_kind,source_markers,suspicious=gate.classify(forged)
  self.assertEqual(function_kind,"create_function")
  self.assertTrue(source_markers["definer_without_local_search_path"])
  self.assertTrue(suspicious)
  guarded=("CREATE FUNCTION public.invented() RETURNS void LANGUAGE plpgsql "
           "SECURITY DEFINER SET search_path='' AS $body$ BEGIN RETURN; END; $body$")
  _,source_markers,_=gate.classify(guarded)
  self.assertFalse(source_markers["definer_without_local_search_path"])

 def test_lexical_sensitive_effects_count_and_r111_indices_are_not_chronology(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   fictional.fixture(root)
   add_statement(root,19,"CREATE EXTENSION IF NOT EXISTS pg_net;")
   add_statement(root,2,"DO $fixture$ BEGIN EXECUTE 'DROP TABLE public.fake'; END $fixture$;")
   add_statement(root,30,"GRANT TRUNCATE ON TABLE public.fake TO authenticated;")
   add_statement(root,4,"CREATE POLICY fake_policy ON storage.objects USING (TRUE);")
   add_statement(root,8,"UPDATE auth.users SET id=id WHERE FALSE;")
   add_statement(root,13,"COPY public.fake FROM PROGRAM 'echo fake';")
   r=gate.report(root)
   self.assertGreaterEqual(r["top_level_statement_kinds"]["extension_change"],1)
   self.assertGreaterEqual(r["top_level_statement_kinds"]["do_block"],1)
   self.assertGreaterEqual(r["top_level_statement_kinds"]["grant"],1)
   self.assertGreaterEqual(r["top_level_statement_kinds"]["create_policy"],1)
   self.assertGreaterEqual(r["top_level_statement_kinds"]["update"],1)
   self.assertGreaterEqual(r["top_level_statement_kinds"]["copy"],1)
   self.assertGreaterEqual(r["conservative_word_markers"]["grant_truncate_word"],1)
   self.assertGreaterEqual(r["conservative_word_markers"]["literal_true_policy_word"],1)
   self.assertGreaterEqual(r["conservative_word_markers"]["auth_data_write_word"],1)
   self.assertIn(3,r["first_r111_priority_review_indices_not_chronology"])
   self.assertIn(20,r["first_r111_priority_review_indices_not_chronology"])
   self.assertFalse(r["qa_sql_write_authorized"])

 def test_tampered_owner_archive_fails_before_exposing_sql(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   dir=fictional.fixture(root)
   p=next(dir.glob("*.sql"))
   p.write_text(p.read_text()+"\n-- not inventoried")
   with self.assertRaises(baseline.AuditBlocked):
    gate.report(root)

 def test_invalid_or_duplicate_chronology_fails_closed(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   fictional.fixture(root)
   docket_path=root/"r111-private-review-docket.json"
   docket=json.loads(docket_path.read_text())
   docket["reviewItems"][0]["filename"]=docket["reviewItems"][1]["filename"]
   docket_path.write_text(json.dumps(docket))
   with self.assertRaises(baseline.AuditBlocked):
    gate.report(root)

 def test_unclosed_dollar_body_rejected_not_executed(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   fictional.fixture(root)
   add_statement(root,6,"DO $fake$ BEGIN EXECUTE 'CREATE ROLE fake'; END")
   with self.assertRaises(baseline.AuditBlocked):
    gate.report(root)

if __name__=="__main__":
 unittest.main()
