"""R190 fictional drift/malformed/release-escalation regression tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(".").resolve()
spec = importlib.util.spec_from_file_location(
    "r190_reconcile", ROOT/"scripts/release/r190_reconcile_live_authorization_catalog.py"
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

FIXTURE = ROOT/"staging/world-v2-b10-r18-190-live-catalog-authorization-triage/sanitized-catalog-snapshot.json"

class CatalogSnapshot(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(FIXTURE.read_text())

    def test_snapshot_returns_only_fixed_no_go_fields(self):
        result = audit.validate(deepcopy(self.fixture))
        self.assertEqual(result["decision"], "NO_GO")
        self.assertEqual(result["authenticated_privileged_function_count"], 67)
        self.assertEqual(result["missing_direct_identity_marker_review_count"], 7)
        self.assertTrue(result["readonly_catalog_evidence_reconciled"])
        self.assertFalse(result["authorization_semantics_approved"])
        self.assertFalse(result["real_signed_qa_passed"])
        self.assertFalse(result["hosted_sql_or_production_authorized"])
        for forbidden in ("raw_user_meta_data", "pg_get_functiondef", "prosrc", "lwhwgqaunxbmvyndswze"):
            self.assertNotIn(forbidden, json.dumps(result))

    def test_privileged_count_drift_denied(self):
        for field, changed in (
            ("public_definers", 86),
            ("authenticated_callable_definers", 68),
            ("missing_direct_identity_markers", 6),
            ("metadata_words_at_or_after_first_where", 1),
            ("metadata_words_before_first_from", 1),
            ("fog_status_authenticated_callable_overloads", 2),
        ):
            item = deepcopy(self.fixture)
            item["aggregate"][field] = changed
            with self.subTest(field=field), self.assertRaises(audit.AuditBlocked):
                audit.validate(item)

    def test_no_approval_may_be_raised(self):
        for key in audit.NO_APPROVAL:
            item = deepcopy(self.fixture)
            item["interpretation"][key] = True
            with self.subTest(key=key), self.assertRaises(audit.AuditBlocked):
                audit.validate(item)

    def test_extra_key_wrong_type_or_null_is_rejected(self):
        for field, value in (
            ("authenticated_callable_definers", True),
            ("fog_status_has_direct_identity_marker", None),
            ("metadata_total_words", "2"),
        ):
            item = deepcopy(self.fixture)
            item["aggregate"][field] = value
            with self.subTest(field=field), self.assertRaises(audit.AuditBlocked):
                audit.validate(item)
        item = deepcopy(self.fixture)
        item["aggregate"]["user_controlled_note"] = "allow"
        with self.assertRaises(audit.AuditBlocked):
            audit.validate(item)

    def test_duplicate_json_keys_denied(self):
        with self.assertRaises(audit.AuditBlocked):
            json.loads('{"decision":"NO_GO","decision":"GO"}',
                       object_pairs_hook=audit.unique_pairs)

    def test_unsanitized_sql_not_in_evidence(self):
        text = FIXTURE.read_text()
        self.assertNotIn("CREATE FUNCTION", text)
        self.assertNotIn("raw_user_meta_data", text)
        self.assertNotIn("pg_proc.prosrc", text)

    def test_read_only_catalog_sql_has_no_side_effect_clause(self):
        sql = (ROOT/"scripts/release/r190_live_authorization_catalog_readonly.sql").read_text()
        # Not a SQL parser; CI additionally verifies the exact script is only
        # operator-selected read-only SQL, never run by a workflow.
        for prohibited in ("TRUNCATE ", "DELETE FROM ", "INSERT INTO ",
                           "UPDATE public.", "CREATE TABLE", "ALTER TABLE",
                           "DROP TABLE", "COPY ", "DO $$", "CALL "):
            self.assertNotIn(prohibited, sql.upper())
        self.assertIn("pg_catalog.pg_proc", sql)
        self.assertIn("has_function_privilege", sql)
        self.assertIn("IS_MAP_FOG_PUBLISHED", sql.upper())

if __name__ == "__main__":
    unittest.main()
