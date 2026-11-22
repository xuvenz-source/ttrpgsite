"""R219 tests only fictional 83-file archives and synthetic sanitized reports."""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/release"))
import r154_private_history_audit as old
import r219_validate_owner_r218_receipt as sanitized
import r219_private_storage_policy_pair_profiles as pairs

spec = importlib.util.spec_from_file_location(
    "fake_r193", ROOT / "tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fictional = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)


def append(root, index, sql):
    docket_path = root / "r111-private-review-docket.json"
    docket = json.loads(docket_path.read_text())
    item = docket["reviewItems"][index]
    file = root / "r106-original-83-recovery" / "supabase" / "migrations" / item["filename"]
    contents = file.read_text() + "\n" + sql + "\n"
    file.write_text(contents)
    item["sourceBodySha256"] = hashlib.sha256(contents.encode()).hexdigest()
    docket_path.write_text(json.dumps(docket))


def sample_receipt():
    codes = {code: 0 for code in sanitized.CODES}
    codes["possible_permissive_policy_overlap"] = 2
    return {
        **sanitized.EXPECTED, **sanitized.GUARDS,
        "original_migrations_sha256_reverified": 83,
        "top_level_statements_reconciled": 937,
        "storage_policy_statements_reconciled": 3,
        "historical_policy_create_statements": 3,
        "historical_policy_drop_statements": 0,
        "parsed_final_archive_policy_key_count": 3,
        "possible_permissive_overlap_target_count": 1,
        "fixed_review_event_counts": codes,
        "owner_priority_review_file_count": 2,
        "first_r111_priority_review_items": [
            {"r111_priority_index": 1,
             "lexical_review_codes": ["possible_permissive_policy_overlap"]},
            {"r111_priority_index": 2,
             "lexical_review_codes": ["possible_permissive_policy_overlap"]},
        ],
        "priority_review_items_truncated": False,
        "limitations": sanitized.LIMITS[:],
    }


class ReceiptTests(unittest.TestCase):
    def test_strict_owner_receipt_keeps_no_go(self):
        result = sanitized.validate(sample_receipt())
        self.assertTrue(result["r218_sanitized_receipt_schema_valid"])
        self.assertEqual(result["decision"], "NO_GO")
        self.assertEqual(result["r218_unique_migration_priority_pair_markers_not_policy_pairs"], 2)
        self.assertFalse(result["qa_or_production_sql_authorized"])

    def test_duplicate_json_nan_and_approval_forgery(self):
        for key, value in (
            ("decision", "GO"),
            ("qa_sql_install_authorized", True),
            ("no_sql_executed", False),
            ("original_migrations_sha256_reverified", True),
            ("parsed_final_archive_policy_key_count", 3.5),
        ):
            with self.subTest(key=key):
                d = sample_receipt()
                d[key] = value
                with self.assertRaises(sanitized.Blocked):
                    sanitized.validate(d)
        d = sample_receipt()
        d["private_sql"] = "CREATE POLICY secret"
        with self.assertRaises(sanitized.Blocked):
            sanitized.validate(d)
        d = sample_receipt()
        d["owner_priority_review_file_count"] = 1
        with self.assertRaises(sanitized.Blocked):
            sanitized.validate(d)
        with tempfile.TemporaryDirectory() as t:
            path = Path(t) / "fake.json"
            path.write_text(json.dumps(sample_receipt()))
            self.assertTrue(sanitized.validate(sanitized.read_sanitized(path))["r218_sanitized_receipt_schema_valid"])
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(sanitized.Blocked):
                sanitized.read_sanitized(path)
            path.write_text('{"count":NaN}')
            with self.assertRaises(sanitized.Blocked):
                sanitized.read_sanitized(path)


class PairProfilesTests(unittest.TestCase):
    def test_marker_flags_are_structural_not_authorizations(self):
        a = {"priority": 1, "cues": {"bucket": True, "identity_or_guard": True,
                                      "or": False, "true": False}}
        b = {"priority": 1, "cues": {"bucket": False, "identity_or_guard": False,
                                      "or": True, "true": True}}
        codes = pairs.matched_pair_categories(a,b)
        self.assertIn("one_or_both_without_bucket_id_word", codes)
        self.assertIn("one_or_both_without_direct_auth_or_known_campaign_helper_word", codes)
        self.assertIn("one_or_both_with_or_word", codes)
        self.assertIn("one_or_both_with_literal_true_guard_word", codes)
        self.assertIn("same_r111_priority_index_pair", codes)

    def test_three_policy_pairs_are_only_two_legacy_priority_pair_markers(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            fictional.fixture(root)
            # One private source contains TWO different policies. The previous
            # R218 tool deduplicated by migration index, not by policy key.
            append(root, 0, """
CREATE POLICY invented_a ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bucket_a' AND auth.uid() IS NOT NULL);
CREATE POLICY invented_b ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bucket_b' AND is_campaign_member(id));
""")
            append(root, 1, """
CREATE POLICY invented_c ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bucket_c' AND auth.uid() IS NOT NULL OR TRUE);
""")
            result = pairs.report(root)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertEqual(result["final_archive_lexical_policy_keys"], 3)
            self.assertEqual(result["distinct_possible_overlapping_policy_key_pairs"], 3)
            self.assertEqual(result["r218_legacy_unique_r111_priority_pair_count"], 2)
            self.assertEqual(result["possible_pair_operation_counts"]["select"], 3)
            self.assertEqual(result["possible_pair_operation_counts"]["insert"], 0)
            self.assertEqual(result["possible_pair_role_counts"]["authenticated"], 3)
            self.assertEqual(result["possible_pair_role_counts"]["anon"], 0)
            self.assertEqual(result["possible_overlap_storage_table_targets"], 1)
            self.assertEqual(result["possible_pair_lexical_cue_counts"]["one_or_both_with_or_word"], 2)
            self.assertFalse(result["qa_sql_install_authorized"])
            self.assertFalse(result["actual_hosted_policy_catalog_or_rls_verified"])
            ids = [p["r111_priority_index"] for p in result["first_r111_priority_review_items"]]
            self.assertEqual(ids, [1, 2])
            raw_output = json.dumps(result)
            for secret in ("invented_a", "invented_b", "invented_c", "bucket_a",
                           "bucket_b", "storage.objects", "sourceBodySha256",
                           "r111-private-review-docket"):
                self.assertNotIn(secret, raw_output)

    def test_separate_operations_or_roles_do_not_overlap(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            fictional.fixture(root)
            append(root, 0, """
CREATE POLICY invented_d ON storage.objects FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY invented_e ON storage.objects FOR DELETE TO authenticated USING (TRUE);
CREATE POLICY invented_f ON storage.objects FOR SELECT TO anon USING (TRUE);
""")
            result = pairs.report(root)
            self.assertEqual(result["distinct_possible_overlapping_policy_key_pairs"], 0)
            self.assertEqual(result["possible_overlap_storage_table_targets"], 0)

    def test_private_archive_sha_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            directory = fictional.fixture(root)
            path = next(directory.glob("*.sql"))
            path.write_text(path.read_text() + "\n-- changed")
            with self.assertRaises(old.AuditBlocked):
                pairs.report(root)


if __name__ == "__main__":
    unittest.main()
