"""R18-188 fictional 83-file private metadata-context tests; never upload source."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(".").resolve()
sys.path.insert(0, str(ROOT / "scripts/release"))
import r154_private_history_audit as r154
import r188_private_metadata_context as r188

spec = importlib.util.spec_from_file_location(
    "r187_fictional_fixture",
    ROOT / "tests/world-v2-r18-187-private-priority-queue.test.py"
)
fictional = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

def reorganized_fictional_archive(root: Path):
    folder = fictional.make_fictional_snapshot(root)
    first = folder / "fictional_000.sql"
    parts = r154.statements(first.read_text(encoding="utf-8"))
    matches = [p for p in parts if "raw_user_meta_data" in p]
    assert len(matches) == 1
    target = matches[0]
    parts.remove(target)
    first.write_text(";\n".join(parts) + ";\n", encoding="utf-8")
    target_file = folder / "fictional_030.sql"
    target_file.write_text(target + ";\n", encoding="utf-8")
    docket = root / "r111-private-review-docket.json"
    obj = json.loads(docket.read_text(encoding="utf-8"))
    for idx, file in ((0, first), (30, target_file)):
        obj["reviewItems"][idx]["sourceBodySha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
    docket.write_text(json.dumps(obj), encoding="utf-8")
    return folder

class MetadataContext(unittest.TestCase):
    def test_exact_fictional_83_sha_bound_target(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            reorganized_fictional_archive(root)
            result = r188.report(root)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertEqual(result["historical_files_sha256_verified"], 83)
            self.assertEqual(result["r111_docket_review_index_not_chronology"], 31)
            self.assertEqual(result["executable_statement_ordinal"], 1)
            data = result["bounded_source_context"]
            self.assertTrue(data["target_privileged_statement_identified"])
            self.assertEqual(data["metadata_markers_unquoted_code"], 0)
            self.assertEqual(data["metadata_markers_single_quoted_literals"], 1)
            self.assertEqual(data["metadata_markers_comments_or_noncode_difference"], 0)
            self.assertTrue(data["auth_uid_token_in_code"])
            self.assertTrue(data["auth_jwt_token_in_code"])
            self.assertTrue(data["campaign_members_token_in_code"])
            self.assertFalse(data["authorization_use_of_user_metadata_determined"])
            self.assertFalse(data["effective_latest_function_definition_determined"])
            self.assertTrue(data["manual_semantic_review_required"])
            for forbidden in ("fake_func_", "fictional_", "raw_user_meta_data", "r106-original"):
                self.assertNotIn(forbidden, json.dumps(result))

    def test_marker_only_in_comment_cannot_be_cleared(self):
        source = (
            "CREATE FUNCTION public.fake() RETURNS boolean LANGUAGE sql "
            "SECURITY DEFINER SET search_path='' AS $b$ "
            "SELECT auth.uid() IS NOT NULL AND "
            "EXISTS(SELECT 1 FROM campaign_members) "
            "-- raw_user_meta_data\n"
            "$b$;"
        )
        findings = r188.assess_statement(source)
        self.assertEqual(findings["metadata_markers_unquoted_code"], 0)
        self.assertEqual(findings["metadata_markers_single_quoted_literals"], 0)
        self.assertEqual(findings["metadata_markers_comments_or_noncode_difference"], 1)
        self.assertTrue(findings["manual_semantic_review_required"])

    def test_nested_comment_and_escaped_quote_preserved(self):
        code, literal, comments = r188.split_code_and_literals(
            "SELECT 'raw_user_meta_data', 'it''s user_metadata', "
            "'-- hidden', /* block /* child */ user_metadata */ auth.uid();"
        )
        self.assertEqual(comments, 1)
        self.assertEqual(len(r188.META.findall(code)), 0)
        self.assertEqual(len(r188.META.findall(literal)), 2)
        self.assertIn("auth.uid()", code)
        self.assertNotIn("user_metadata */", code)

    def test_malformed_or_non_privileged_target_refused(self):
        with self.assertRaises(r154.AuditBlocked):
            r188.split_code_and_literals("SELECT /* unclosed")
        with self.assertRaises(r154.AuditBlocked):
            r188.assess_statement("SELECT 'raw_user_meta_data'")
        with self.assertRaises(r154.AuditBlocked):
            r188.split_code_and_literals("SELECT 'unterminated")

    def test_hash_mismatch_rejected_prior_to_reporting(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            folder = reorganized_fictional_archive(root)
            (folder / "fictional_030.sql").write_text("SELECT 2;\n")
            with self.assertRaises(r154.AuditBlocked):
                r188.report(root)

if __name__ == "__main__":
    unittest.main()
