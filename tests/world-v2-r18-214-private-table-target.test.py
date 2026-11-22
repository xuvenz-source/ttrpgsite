"""R214 fictional archive-only graph triage + sanitized ledger validation."""
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
import r214_private_qa_table_target_order as graph
import r214_validate_owner_r213_receipt as receipt

fixture_spec = importlib.util.spec_from_file_location(
    "r214_fixture", ROOT / "tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fixture_module = importlib.util.module_from_spec(fixture_spec)
fixture_spec.loader.exec_module(fixture_module)

def add_private_fixture_statement(root, index, sql):
    docket_file = root / "r111-private-review-docket.json"
    docket = json.loads(docket_file.read_text())
    item = docket["reviewItems"][index]
    source = root / "r106-original-83-recovery/supabase/migrations" / item["filename"]
    updated = source.read_text() + "\n" + sql + "\n"
    source.write_text(updated)
    item["sourceBodySha256"] = hashlib.sha256(updated.encode()).hexdigest()
    docket_file.write_text(json.dumps(docket))

def fake_r213():
    counts = {k: 0 for k in receipt.RISK_CODES}
    counts["do_copy_or_top_level_destructive"] = 2
    counts["auth_or_storage_data_write"] = 1
    return {
        **receipt.SCALARS, **receipt.GUARDS,
        "original_migrations_sha256_reverified": 83,
        "r211_lexical_statements_reconciled": 937,
        "risk_flagged_original_file_count": 2,
        "risk_category_file_counts": counts,
        "priority_ordered_first_r111_risk_items": [
            {"r111_priority_index": 1, "lexical_risk_codes": ["do_copy_or_top_level_destructive"]},
            {"r111_priority_index": 29, "lexical_risk_codes": [
                "auth_or_storage_data_write", "do_copy_or_top_level_destructive"]},
        ],
        "priority_risk_items_truncated": False,
        "limitations": list(receipt.LIMITATIONS),
    }

class SanitizedReceiptTests(unittest.TestCase):
    def test_valid_but_no_authority(self):
        result = receipt.validate(fake_r213())
        self.assertTrue(result["r213_sanitized_receipt_valid"])
        self.assertEqual(result["decision"], "NO_GO")
        self.assertEqual(result["priority_ordered_risk_files"], 2)
        self.assertFalse(result["migration_semantics_approved"])
        self.assertFalse(result["qa_or_original_sql_write_authorized"])

    def test_reject_forged_or_extra_input_and_counter_drift(self):
        for key, value in (
            ("decision", "GO"), ("qa_sql_install_authorized", True),
            ("complete_semantic_review_proven", True),
            ("no_sql_executed", False),
            ("original_migrations_sha256_reverified", True),
            ("risk_flagged_original_file_count", 2.0),
        ):
            with self.subTest(key=key):
                item = fake_r213()
                item[key] = value
                with self.assertRaises(receipt.Blocked):
                    receipt.validate(item)
        item = fake_r213()
        item["migration_sql"] = "CREATE TABLE private.secret(x int)"
        with self.assertRaises(receipt.Blocked):
            receipt.validate(item)
        item = fake_r213()
        item["risk_category_file_counts"]["auth_or_storage_data_write"] = 2
        with self.assertRaises(receipt.Blocked):
            receipt.validate(item)

    def test_strict_indices_order_unknown_keys_and_json(self):
        for ids in ([29, 1], [1, 1], [1, 84], [1, True]):
            item = fake_r213()
            for row, index in zip(item["priority_ordered_first_r111_risk_items"], ids):
                row["r111_priority_index"] = index
            with self.assertRaises(receipt.Blocked):
                receipt.validate(item)
        item = fake_r213()
        item["priority_risk_items_truncated"] = True
        with self.assertRaises(receipt.Blocked):
            receipt.validate(item)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fake-report.json"
            path.write_text(json.dumps(fake_r213()))
            self.assertTrue(receipt.validate(receipt.read_sanitized(path))["r213_sanitized_receipt_valid"])
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(receipt.Blocked):
                receipt.read_sanitized(path)
            path.write_text('{"risk_flagged_original_file_count":NaN}')
            with self.assertRaises(receipt.Blocked):
                receipt.read_sanitized(path)

class TableTargetTests(unittest.TestCase):
    def test_target_parser_avoids_sql_export(self):
        self.assertEqual(graph.target_of(
            "CREATE TABLE public.invented_alpha(id bigint)"),
            ("create", ("public", "invented_alpha")))
        self.assertEqual(graph.target_of(
            "ALTER TABLE public.invented_alpha ADD COLUMN y int"),
            ("reference", ("public", "invented_alpha")))
        self.assertEqual(graph.target_of(
            'CREATE POLICY "P" ON storage.objects USING (TRUE)'),
            ("reference", ("storage", "objects")))
        self.assertEqual(graph.target_of(
            "CREATE TRIGGER fake BEFORE UPDATE ON public.invented_alpha FOR EACH ROW EXECUTE FUNCTION public.trig()"),
            ("reference", ("public", "invented_alpha")))
        self.assertEqual(graph.target_of(
            'DROP POLICY IF EXISTS "P" ON "public"."invented_alpha"'),
            ("reference", ("public", "invented_alpha")))

    def test_private_chronology_checks_conservative_public_table_targets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            fixture_module.fixture(root)
            add_private_fixture_statement(root, 0,
                "CREATE TABLE public.r214_created(id integer); "
                "ALTER TABLE public.r214_created ADD COLUMN x text; "
                "CREATE INDEX r214_idx ON public.r214_created(id); "
                "CREATE POLICY r214_ok ON public.r214_created USING (TRUE); "
                "ALTER TABLE public.r214_missing ADD COLUMN x integer; "
                "CREATE POLICY r214_review ON public.r214_missing USING (TRUE); "
                "CREATE POLICY r214_storage ON storage.objects USING (TRUE); "
                "ALTER TABLE r214_ambiguous ADD COLUMN y integer;")
            result = graph.report(root)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertEqual(result["original_migrations_sha256_reverified"], 83)
            c = result["structural_target_statement_counts"]
            self.assertGreaterEqual(c["explicit_public_table_creates"], 1)
            self.assertGreaterEqual(c["public_target_without_earlier_archive_create"], 2)
            self.assertGreaterEqual(c["unqualified_table_targets"], 1)
            self.assertGreaterEqual(c["nonpublic_explicit_table_targets"], 1)
            self.assertIn(1, result["first_r111_priority_order_review_indices"])
            self.assertFalse(result["all_83_migration_semantics_approved"])
            self.assertFalse(result["qa_sql_install_authorized"])
            self.assertFalse(result["postgresql_parser_or_execution_used"])
            output = json.dumps(result)
            for disallowed in ("r214_missing", "r214_created", "r214_storage",
                               "r111-private-review-docket", "CREATE POLICY", "sourceBodySha256"):
                self.assertNotIn(disallowed, output)

    def test_true_r111_priority_truncation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            fixture_module.fixture(root)
            for priority in range(25):
                add_private_fixture_statement(root, priority,
                                              "ALTER TABLE r214_ambiguous ADD COLUMN z int;")
            result = graph.report(root)
            self.assertTrue(result["priority_order_review_indices_truncated"])
            self.assertEqual(result["first_r111_priority_order_review_indices"],
                             list(range(1, 25)))

    def test_changed_archive_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = fixture_module.fixture(root)
            first = next(directory.glob("*.sql"))
            first.write_text(first.read_text() + "\n-- changed")
            with self.assertRaises(original.AuditBlocked):
                graph.report(root)

if __name__ == "__main__":
    unittest.main()
