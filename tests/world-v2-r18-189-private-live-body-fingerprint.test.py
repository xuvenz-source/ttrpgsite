"""R189 source-only fictional 83-file historical/live function body tests."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(".").resolve()
sys.path.insert(0, str(ROOT / "scripts/release"))
import r154_private_history_audit as r154
import r189_private_live_body_fingerprint as r189

spec = importlib.util.spec_from_file_location(
    "r188_fictional_fixture",
    ROOT / "tests/world-v2-r18-188-private-metadata-context.test.py"
)
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

def fake_private_original(root):
    folder = fixture.reorganized_fictional_archive(root)
    target_file = folder / "fictional_030.sql"
    original = target_file.read_text(encoding="utf-8")
    assert original.count("'raw_user_meta_data'") == 1
    updated = original.replace(
        "auth.jwt() -> 'raw_user_meta_data'",
        "raw_user_meta_data = raw_user_meta_data"
    )
    target_file.write_text(updated, encoding="utf-8")
    docket_path = root / "r111-private-review-docket.json"
    docket = json.loads(docket_path.read_text())
    docket["reviewItems"][30]["sourceBodySha256"] = hashlib.sha256(updated.encode("utf-8")).hexdigest()
    docket_path.write_text(json.dumps(docket))
    return folder

class SourceBodyParity(unittest.TestCase):
    def test_unmodified_source_body_digest_match(self):
        sql = (
            "CREATE FUNCTION public.fictional() RETURNS boolean "
            "LANGUAGE sql SECURITY DEFINER SET search_path='' "
            "AS $original$ SELECT auth.uid() IS NOT NULL "
            "AND EXISTS(SELECT 1 FROM campaign_members) "
            "AND raw_user_meta_data = raw_user_meta_data $original$;"
        )
        body = r189.extract_dollar_quoted_sql_body(sql)
        self.assertIn("raw_user_meta_data", body)
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
        checks = r189.body_checks(body, digest, len(body.encode("utf-8")))
        self.assertTrue(all(checks.values()))
        checks = r189.body_checks(body, "0"*64, len(body.encode("utf-8")))
        self.assertFalse(checks["body_fingerprint_and_length_both_match"])

    def test_fake_83_file_original_reports_false_not_approval(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            fake_private_original(root)
            result = r189.report(root)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertEqual(result["historical_sources_sha256_verified"], 83)
            self.assertTrue(result["single_dollar_quoted_sql_function_body_verified"])
            self.assertFalse(result["source_body_comparison"]["body_fingerprint_and_length_both_match"])
            self.assertFalse(result["qa_or_production_sql_authorized"])
            self.assertFalse(result["metadata_authorization_dataflow_proven_safe"])
            for forbidden in ("fictional_", "raw_user_meta_data", "r106-original"):
                self.assertNotIn(forbidden, json.dumps(result))

    def test_fake_83_file_matching_fingerprint_does_not_authorize(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            folder = fake_private_original(root)
            source = folder.joinpath("fictional_030.sql").read_text()
            body = r189.extract_dollar_quoted_sql_body(r154.statements(source)[0])
            digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
            with patch.object(r189, "LIVE_BODY_SHA256", digest), \
                 patch.object(r189, "LIVE_BODY_BYTES", len(body.encode("utf-8"))):
                result = r189.report(root)
            self.assertTrue(result["source_body_comparison"]["body_fingerprint_and_length_both_match"])
            self.assertFalse(result["function_signature_identity_proven"])
            self.assertFalse(result["all_67_live_privileged_call_chains_approved"])
            self.assertFalse(result["qa_or_production_sql_authorized"])

    def test_unsupported_body_format_fails_closed(self):
        for sql in (
            "CREATE FUNCTION public.f() RETURNS boolean LANGUAGE sql SECURITY DEFINER "
            "SET search_path='' AS 'SELECT raw_user_meta_data FROM campaign_members WHERE auth.uid() IS NOT NULL';",
            "CREATE FUNCTION public.f() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER "
            "SET search_path='' AS $b$ SELECT raw_user_meta_data, auth.uid() FROM campaign_members $b$;",
        ):
            with self.assertRaises(r154.AuditBlocked):
                r189.extract_dollar_quoted_sql_body(sql)

    def test_mutated_private_source_fails_before_parity(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            folder = fake_private_original(root)
            (folder / "fictional_030.sql").write_text("SELECT 2;\n")
            with self.assertRaises(r154.AuditBlocked):
                r189.report(root)

if __name__ == "__main__":
    unittest.main()
