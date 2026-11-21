"""R18-186 fictional SHA-checked private archive; no actual private files in CI."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path("scripts/release").resolve()))
import r186_private_privileged_statement_inventory as r186

DEF_ONE = """
create or replace function public.fake_private_gate()
returns boolean language plpgsql security definer set search_path = ''
as $fake$ begin return auth.uid() is not null and
  exists(select 1 from campaign_members); end $fake$;
"""
DEF_RISKY = """
create or replace function public.fake_private_gate()
returns boolean language plpgsql security definer
as $body$ begin execute 'select 1'; return true; end $body$;
"""
NO_DEF = """
create or replace function public.fake_invoker()
returns boolean language plpgsql security invoker
as $body$ begin -- SECURITY DEFINER fake string marker
 return true; end $body$;
"""

def make_archive(root: Path, risky_count: int = 1):
    root.chmod(0o700)
    folder = root / "r106-original-83-recovery" / "supabase" / "migrations"
    folder.mkdir(parents=True)
    review = []
    for index in range(83):
        name = f"fake_{index:03}.sql"
        source = DEF_RISKY if index < risky_count else "select 1;\n"
        (folder / name).write_text(source, encoding="utf-8")
        review.append({
            "filename": name,
            "sourceBodySha256": hashlib.sha256(source.encode()).hexdigest(),
            "securityApproved": False
        })
    docket = {"workPackage":"B10-R18-111","decision":"NO_GO","reviewItems":review}
    (root / "r111-private-review-docket.json").write_text(json.dumps(docket), encoding="utf-8")
    return folder

class BoundedLexicalInventory(unittest.TestCase):
    def test_search_path_equal_and_safe_member_gate(self):
        is_definer, code = r186.flag_definer(DEF_ONE)
        self.assertTrue(is_definer)
        self.assertEqual(code, ())

    def test_search_path_to_and_public_are_separate_markers(self):
        sql = DEF_ONE.replace("set search_path = ''", "set search_path to public")
        is_definer, code = r186.flag_definer(sql)
        self.assertTrue(is_definer)
        self.assertIn("FUNCTION_LOCAL_SEARCH_PATH_PUBLIC_MARKER", code)
        self.assertNotIn("MISSING_FUNCTION_LOCAL_SEARCH_PATH_MARKER", code)

    def test_quoted_body_does_not_fake_definer_declaration(self):
        self.assertEqual(r186.flag_definer(NO_DEF), (False, ()))
        sql = NO_DEF.replace("security invoker", "security definer")
        is_definer, code = r186.flag_definer(sql)
        self.assertTrue(is_definer)
        self.assertIn("MISSING_FUNCTION_LOCAL_SEARCH_PATH_MARKER", code)

    def test_risky_function_has_only_fixed_known_markers(self):
        privileged, codes = r186.flag_definer(DEF_RISKY)
        self.assertTrue(privileged)
        self.assertEqual(codes, (
            "MISSING_FUNCTION_LOCAL_SEARCH_PATH_MARKER",
            "MISSING_DIRECT_AUTH_IDENTITY_MARKER",
            "MISSING_CAMPAIGN_MEMBERSHIP_MARKER",
            "DYNAMIC_EXECUTE_MARKER",
        ))
        self.assertNotIn("fake_private_gate", repr(codes))

    def test_sha_checked_fictional_83_file_archive_and_bounded_report(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            make_archive(root, risky_count=30)
            output = r186.report(root)
            self.assertEqual(output["decision"], "NO_GO")
            self.assertEqual(output["history_files_sha256_verified"], 83)
            self.assertEqual(output["direct_security_definer_statements"], 30)
            self.assertEqual(output["definer_statements_with_any_review_marker"], 30)
            self.assertEqual(len(output["bounded_review_queue"]), 24)
            self.assertEqual(output["bounded_review_queue_remaining"], 6)
            self.assertEqual(output["bounded_review_queue"][0]["r111_docket_review_index_not_chronology"], 1)
            self.assertFalse(output["all_67_live_privileged_call_chains_approved"])
            self.assertFalse(output["qa_or_production_sql_authorized"])
            self.assertNotIn("fake_private_gate", json.dumps(output))
            self.assertNotIn("r106-original", json.dumps(output))

    def test_archive_tamper_refused_before_any_report(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            folder = make_archive(root)
            (folder / "fake_001.sql").write_text("select 2;\n", encoding="utf-8")
            with self.assertRaises(r186.AuditBlocked):
                r186.report(root)

if __name__ == "__main__":
    unittest.main()
