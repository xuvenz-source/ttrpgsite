"""R192 source-only R191-to-R104/R105 fog repair lineage fail-closed tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(".").resolve()
spec = importlib.util.spec_from_file_location("r192_gate", ROOT/"scripts/release/r192_reconcile_fog_guard_lineage.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class OriginalFogGuardLineage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT/audit.MANIFEST).read_text())

    def test_exact_original_private_sha_and_repair_sources(self):
        result = audit.check(deepcopy(self.manifest), ROOT)
        self.assertEqual(result["decision"], "NO_GO")
        self.assertTrue(result["original_to_live_fog_body_sha256_matches"])
        self.assertTrue(result["frozen_unapplied_repair_candidate_git_blob_verified"])
        self.assertTrue(result["existing_disposable_pg17_regression_sources_verified"])
        self.assertFalse(result["restore_original_unsecured_fog_function_as_rollback_allowed"])
        self.assertFalse(result["hosted_sql_or_production_release_authorized"])
        self.assertFalse(result["real_signed_qa_passed"])
        self.assertNotIn("CREATE FUNCTION", json.dumps(result))
        self.assertNotIn("r106-original", json.dumps(result))

    def test_drifted_r191_sanitized_fields_denied(self):
        for key, value in (
            ("direct_fog_status_definition_count", 2),
            ("latest_body_sha256_matches_current", False),
            ("latest_has_direct_identity_marker", True),
            ("r111_priority_docket_index_not_chronology", 31),
            ("chronology_valid", False),
            ("sha256", "0"*64),
        ):
            changed = deepcopy(self.manifest)
            changed["owner_private_r191_receipt"][key] = value
            with self.subTest(key=key), self.assertRaises(audit.AuditBlocked):
                audit.check(changed, ROOT)

    def test_release_escalation_or_unsafe_rollback_denied(self):
        for key in audit.PERMISSIONS:
            changed = deepcopy(self.manifest)
            changed["permissions"][key] = True
            with self.subTest(key=key), self.assertRaises(audit.AuditBlocked):
                audit.check(changed, ROOT)
        changed = deepcopy(self.manifest)
        changed["no_revert_to_original_unsafe_function_as_rollback"] = False
        with self.assertRaises(audit.AuditBlocked):
            audit.check(changed, ROOT)
        changed = deepcopy(self.manifest)
        changed["no_hosted_original_or_qa_sql_changes"] = False
        with self.assertRaises(audit.AuditBlocked):
            audit.check(changed, ROOT)

    def test_fixture_sha_drift_is_denied(self):
        with tempfile.TemporaryDirectory() as work:
            fake = Path(work)
            for path in audit.EXPECTED_BLOBS:
                dst = fake/path
                dst.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(ROOT/path,dst)
            audit.source_integrity(fake)
            file = fake / self.manifest["frozen_prior_unapplied_repair"]["candidate_path"]
            file.write_bytes(file.read_bytes()+b"\n-- attacker test")
            with self.assertRaises(audit.AuditBlocked):
                audit.source_integrity(fake)

    def test_malformed_json_and_unknown_key_denied(self):
        with self.assertRaises(audit.AuditBlocked):
            json.loads('{"a":1,"a":2}',object_pairs_hook=audit.unique_pairs)
        changed = deepcopy(self.manifest)
        changed["unknown"] = "approved"
        with self.assertRaises(audit.AuditBlocked):
            audit.check(changed,ROOT)
        changed = deepcopy(self.manifest)
        changed["schema"] = True
        with self.assertRaises(audit.AuditBlocked):
            audit.check(changed,ROOT)

    def test_archive_source_not_in_manifest(self):
        src = (ROOT/audit.MANIFEST).read_text()
        self.assertNotIn("CREATE FUNCTION",src)
        self.assertNotIn("r106-original-83-recovery",src)
        self.assertNotIn("r111-private-review-docket.json",src)
        self.assertNotIn("DATABASE_URL",src)

if __name__=="__main__":
    unittest.main()
