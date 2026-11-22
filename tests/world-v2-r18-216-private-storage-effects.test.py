"""R216 fictional 83-file archive and strict sanitized-only receipt tests."""
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
import r154_private_history_audit as original
import r216_private_storage_effect_words as storage
import r216_validate_owner_r215_receipt as receipts

spec = importlib.util.spec_from_file_location(
    "fake_r193", ROOT / "tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fake)

def add(root, index, sql):
    docket_path = root / "r111-private-review-docket.json"
    docket = json.loads(docket_path.read_text())
    entry = docket["reviewItems"][index]
    path = root / "r106-original-83-recovery" / "supabase" / "migrations" / entry["filename"]
    raw = path.read_text() + "\n" + sql + "\n"
    path.write_text(raw)
    entry["sourceBodySha256"] = hashlib.sha256(raw.encode()).hexdigest()
    docket_path.write_text(json.dumps(docket))

def fictional_receipt():
    stmt = dict.fromkeys(receipts.CODES, 0)
    files = dict.fromkeys(receipts.CODES, 0)
    # Three categories across two R111 priority references.
    stmt.update(managed_storage_direct_dml=1,
                managed_storage_policy_target=2, opaque_do_block=1)
    files.update(managed_storage_direct_dml=1,
                 managed_storage_policy_target=1, opaque_do_block=1)
    return {
        **receipts.FIXED, **receipts.GUARDS,
        "original_migrations_sha256_reverified": 83,
        "r214_top_level_statements_reconciled": 937,
        "managed_effect_lexical_statement_counts": stmt,
        "managed_effect_lexical_file_counts": files,
        "managed_effect_flagged_migration_count": 2,
        "first_r111_priority_order_managed_review_items": [
            {"r111_priority_index": 2,
             "lexical_review_codes": ["managed_storage_direct_dml","managed_storage_policy_target"]},
            {"r111_priority_index": 19,
             "lexical_review_codes": ["opaque_do_block"]},
        ],
        "priority_items_truncated": False,
        "limitations": receipts.LIMITATIONS[:],
    }

class ReceiptTests(unittest.TestCase):
    def test_accept_only_sanitized_and_keep_no_go(self):
        outcome = receipts.validate(fictional_receipt())
        self.assertTrue(outcome["sanitized_r215_receipt_valid"])
        self.assertFalse(outcome["qa_sql_install_authorized"])
        self.assertEqual(outcome["direct_storage_dml_statement_count"], 1)
    def test_reject_false_approvals_and_counter_inconsistency(self):
        for key, bad in (
            ("decision", "GO"),
            ("qa_sql_install_authorized", True),
            ("no_network_or_database_access", False),
            ("original_migrations_sha256_reverified", True),
            ("r214_top_level_statements_reconciled", 937.0),
        ):
            with self.subTest(key=key):
                data = fictional_receipt()
                data[key] = bad
                with self.assertRaises(receipts.Blocked):
                    receipts.validate(data)
        data = fictional_receipt()
        data["unredacted_sql"] = "UPDATE storage.objects SET private=true"
        with self.assertRaises(receipts.Blocked):
            receipts.validate(data)
        data = fictional_receipt()
        data["managed_effect_lexical_file_counts"]["managed_storage_policy_target"] = 2
        with self.assertRaises(receipts.Blocked):
            receipts.validate(data)
        data = fictional_receipt()
        data["first_r111_priority_order_managed_review_items"][1]["r111_priority_index"] = 1
        with self.assertRaises(receipts.Blocked):
            receipts.validate(data)
    def test_strict_json_double_keys_and_nan(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sanitized.json"
            path.write_text(json.dumps(fictional_receipt()))
            self.assertTrue(receipts.validate(receipts.read_sanitized(path))["sanitized_r215_receipt_valid"])
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(receipts.Blocked):
                receipts.read_sanitized(path)
            path.write_text('{"decision":NaN}')
            with self.assertRaises(receipts.Blocked):
                receipts.read_sanitized(path)

class PrivateStorageFixtureTests(unittest.TestCase):
    def test_storage_dml_verb_and_policy_markers(self):
        examples = (
            ("INSERT INTO storage.objects(id) VALUES (1)",
             {"storage_direct_insert","storage_objects_target_word"}),
            ("UPDATE storage.objects SET name=name",
             {"storage_direct_update","storage_direct_update_delete_without_where_word"}),
            ("DELETE FROM storage.buckets WHERE id=1",
             {"storage_direct_delete","storage_buckets_target_word"}),
            ("TRUNCATE TABLE storage.objects",
             {"storage_direct_truncate","storage_objects_target_word"}),
            ("CREATE POLICY invented ON storage.objects FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)",
             {"storage_policy_select","storage_policy_missing_with_check_word"}),
            ("CREATE POLICY invented2 ON storage.objects FOR UPDATE USING (true)",
             {"storage_policy_update","storage_policy_missing_with_check_word","storage_policy_missing_direct_auth_identity_word"}),
            ("CREATE POLICY invented3 ON storage.buckets FOR INSERT WITH CHECK (true)",
             {"storage_policy_insert","storage_policy_missing_using_word"}),
        )
        for statement, required in examples:
            with self.subTest(statement=statement[:18]):
                self.assertTrue(required.issubset(set(storage.check_statement(statement))))
        self.assertEqual(storage.check_statement(
            "DO $fixture$ BEGIN EXECUTE 'UPDATE storage.objects SET name=name'; END $fixture$"), ())
    def test_full_fake_83_archive_and_no_private_source_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            fake.fixture(root)
            add(root, 2, "INSERT INTO storage.objects(id) VALUES(1);")
            add(root, 1, "UPDATE storage.objects SET name=name;")
            add(root, 6, "CREATE POLICY invented ON storage.objects FOR SELECT USING (true);")
            add(root, 9, "CREATE POLICY another ON storage.buckets FOR UPDATE USING (true);")
            result = storage.report(root)
            self.assertEqual(result["original_migrations_sha256_reverified"], 83)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertGreaterEqual(result["storage_lexical_statement_indicator_counts"]["storage_direct_insert"], 1)
            self.assertGreaterEqual(result["storage_lexical_statement_indicator_counts"]["storage_policy_update"], 1)
            self.assertEqual(result["r215_storage_direct_dml_statements_reconciled"], 2)
            self.assertEqual(result["r215_storage_policy_statements_reconciled"], 2)
            ids = [row["r111_priority_index"] for row in result["first_r111_priority_storage_review_items"]]
            self.assertEqual(ids, sorted(ids))
            self.assertFalse(result["qa_sql_install_authorized"])
            self.assertFalse(result["effective_rls_or_signed_url_revocation_verified"])
            exported = json.dumps(result)
            for private in ("invented", "another", "storage.objects", "storage.buckets", "sourceBodySha256",
                            "r111-private-review-docket"):
                self.assertNotIn(private, exported)
    def test_original_integrity_rejects_tamper(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = fake.fixture(root)
            path = next(directory.glob("*.sql"))
            path.write_text(path.read_text() + "\n-- mutation")
            with self.assertRaises(original.AuditBlocked):
                storage.report(root)

if __name__ == "__main__":
    unittest.main()
