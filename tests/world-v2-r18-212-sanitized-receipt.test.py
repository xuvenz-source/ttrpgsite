"""R212 fabricated aggregate reports only; never import user/private SQL into CI."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/release/r212_validate_owner_migration_receipt.py"
spec = importlib.util.spec_from_file_location("r212", SOURCE)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

def fictional():
    kinds = {key: 0 for key in r.STATEMENT_KINDS}
    kinds["create_table"] = 83
    kinds["create_function"] = 3
    kinds["create_policy"] = 2
    markers = {key: 0 for key in r.MARKERS}
    markers["security_definer_definition"] = 2
    return {
      **r.FIXED_STRINGS, **r.FIXED_BOOLEANS,
      "original_migrations_sha256_reverified": 83,
      "lexical_top_level_statements": 88,
      "empty_statement_migration_count": 0,
      "top_level_statement_kinds": kinds,
      "conservative_word_markers": markers,
      "risk_flagged_original_file_count": 3,
      "first_r111_priority_review_indices_not_chronology": [19, 2, 8],
      "r111_priority_review_index_count_truncated": False,
      "unclassified_top_level_statements": 0,
      "limitations": list(r.LIMITATIONS),
    }

class ReceiptTests(unittest.TestCase):
    def test_accept_but_never_go(self):
        summary = r.validate(fictional())
        self.assertEqual(summary["decision"], "NO_GO")
        self.assertEqual(summary["r111_priority_indices_sorted_within_available_selection"], [2, 8, 19])
        self.assertTrue(summary["risk_indices_complete"])
        self.assertFalse(summary["r211_indices_originally_sorted_by_priority"])
        self.assertFalse(summary["qa_sql_install_authorized"])
        self.assertFalse(summary["all_83_migrations_semantically_approved"])
        for forbidden in ("CREATE FUNCTION", "migration.sql", "r111-private-review-docket.json", "service_role"):
            self.assertNotIn(forbidden.lower(), json.dumps(summary).lower())

    def test_forged_authority_and_extra_private_data(self):
        cases = [
            ("decision", "GO"),
            ("qa_sql_write_authorized", True),
            ("original_or_production_write_authorized", True),
            ("no_sql_executed", False),
            ("private_sql_filenames_migration_versions_paths_and_secrets_exported", True),
            ("all_83_migrations_semantically_reviewed", True),
            ("original_migrations_sha256_reverified", True),
            ("lexical_top_level_statements", 88.0),
        ]
        for key, bad in cases:
            with self.subTest(key=key):
                data = fictional()
                data[key] = bad
                with self.assertRaises(r.Blocked):
                    r.validate(data)
        data = fictional()
        data["original_private_sql"] = "CREATE FUNCTION secrets();"
        with self.assertRaises(r.Blocked):
            r.validate(data)

    def test_cross_counter_and_marker_consistency(self):
        changes = [
            lambda v: v["top_level_statement_kinds"].__setitem__("create_policy", 999),
            lambda v: v["top_level_statement_kinds"].__setitem__("unknown_extension", 1),
            lambda v: v["conservative_word_markers"].__setitem__("security_definer_definition", 4),
            lambda v: v["conservative_word_markers"].__setitem__("definer_without_local_search_path", 3),
            lambda v: v.__setitem__("unclassified_top_level_statements", 1),
            lambda v: v.__setitem__("empty_statement_migration_count", 83),
            lambda v: v.__setitem__("limitations", []),
        ]
        for mutate in changes:
            data = fictional()
            mutate(data)
            with self.assertRaises(r.Blocked):
                r.validate(data)

    def test_priority_ids_and_truncation(self):
        for ids in ([19, 2, 2], [19, 2, 84], [19, 2, True], [19, 2], [19, 2, -1]):
            data = fictional()
            data["first_r111_priority_review_indices_not_chronology"] = ids
            with self.assertRaises(r.Blocked):
                r.validate(data)
        data = fictional()
        data["r111_priority_review_index_count_truncated"] = True
        with self.assertRaises(r.Blocked):
            r.validate(data)
        data = fictional()
        data["risk_flagged_original_file_count"] = 25
        data["first_r111_priority_review_indices_not_chronology"] = list(range(24, 0, -1))
        data["r111_priority_review_index_count_truncated"] = True
        summary = r.validate(data)
        self.assertFalse(summary["risk_indices_complete"])
        self.assertFalse(summary["r211_first_24_selection_guaranteed_top_priority"])

    def test_strict_json_decode_duplicate_and_nan(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic-sanitized.json"
            path.write_text(json.dumps(fictional()))
            self.assertEqual(r.validate(r.read_report(path))["risk_flagged_migrations"], 3)
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(r.Blocked):
                r.read_report(path)
            path.write_text('{"lexical_top_level_statements":NaN}')
            with self.assertRaises(r.Blocked):
                r.read_report(path)

if __name__ == "__main__":
    unittest.main()
