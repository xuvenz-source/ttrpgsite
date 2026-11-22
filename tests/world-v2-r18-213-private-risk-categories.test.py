"""R213 uses fictional 83-file source fixtures only, never owner SQL in CI."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/release"))
import r154_private_history_audit as audit
import r211_private_qa_migration_effects as r211
import r213_private_qa_risk_categories as r213

spec = importlib.util.spec_from_file_location(
    "fake_r193", ROOT / "tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fake)

def add(root, index, sql):
    docket_path = root / "r111-private-review-docket.json"
    docket = json.loads(docket_path.read_text())
    item = docket["reviewItems"][index]
    path = root / "r106-original-83-recovery" / "supabase" / "migrations" / item["filename"]
    body = path.read_text() + "\n" + sql + "\n"
    path.write_text(body)
    item["sourceBodySha256"] = hashlib.sha256(body.encode()).hexdigest()
    docket_path.write_text(json.dumps(docket))

class RiskTests(unittest.TestCase):
    def test_codes_bounded_and_never_export_sql(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake.fixture(root)
            add(root, 3, "DO $test$ BEGIN EXECUTE 'CREATE ROLE invented'; END; $test$;")
            add(root, 1, "GRANT TRUNCATE ON TABLE public.fake TO authenticated;")
            add(root, 6, "CREATE POLICY fake ON storage.objects USING (TRUE);")
            result = r213.report(root)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertEqual(result["original_migrations_sha256_reverified"], 83)
            self.assertEqual(result["risk_flagged_original_file_count"],
                             r211.report(root)["risk_flagged_original_file_count"])
            self.assertEqual(list(result["risk_category_file_counts"]), list(r213.CLASS_CODES))
            indices = [row["r111_priority_index"] for row in result["priority_ordered_first_r111_risk_items"]]
            self.assertEqual(indices, sorted(indices))
            for index in (2, 4, 7):
                self.assertIn(index, indices)
            self.assertFalse(result["qa_sql_install_authorized"])
            self.assertFalse(result["complete_semantic_review_proven"])
            self.assertTrue(result["no_sql_executed"])
            output = json.dumps(result)
            for forbidden in ("CREATE POLICY fake", "GRANT TRUNCATE ON TABLE",
                              "r111-private-review-docket", "invented", "fake.sql"):
                self.assertNotIn(forbidden, output)

    def test_individual_fictional_risk_categories(self):
        kind, hits, risk = r211.classify("GRANT TRUNCATE ON TABLE public.fake TO authenticated")
        self.assertIn("privilege_public_anon_or_truncate", r213.codes_for(kind, hits, risk))
        kind, hits, risk = r211.classify("DO $x$ BEGIN EXECUTE 'CREATE ROLE fake'; END $x$")
        self.assertIn("do_copy_or_top_level_destructive", r213.codes_for(kind, hits, risk))
        kind, hits, risk = r211.classify(
            "CREATE FUNCTION public.fake() RETURNS void LANGUAGE sql SECURITY DEFINER AS $x$ SELECT 1 $x$")
        self.assertIn("privileged_definition_header", r213.codes_for(kind, hits, risk))

    def test_priority_truncation_uses_true_r111_order_not_chronology(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake.fixture(root)
            for index in range(25):
                add(root, index, "DO $x$ BEGIN NULL; END $x$;")
            summary = r213.report(root)
            ids = [row["r111_priority_index"] for row in summary["priority_ordered_first_r111_risk_items"]]
            self.assertEqual(ids, list(range(1, 25)))
            self.assertTrue(summary["priority_risk_items_truncated"])
            self.assertGreaterEqual(summary["risk_flagged_original_file_count"], 25)

    def test_source_hash_drift_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = fake.fixture(root)
            first = next(paths.glob("*.sql"))
            first.write_text(first.read_text() + "\n-- tampered")
            with self.assertRaises(audit.AuditBlocked):
                r213.report(root)

if __name__ == "__main__":
    unittest.main()
