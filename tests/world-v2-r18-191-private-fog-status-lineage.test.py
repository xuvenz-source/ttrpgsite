"""R18-191 fictional 83-file chronological fog-definition/sha tests."""
from datetime import datetime, timedelta
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(".").resolve()
sys.path.insert(0, str(ROOT/"scripts/release"))
import r154_private_history_audit as r154
import r191_private_fog_status_lineage as r191

spec = importlib.util.spec_from_file_location(
    "r187_fictional_fixture",
    ROOT/"tests/world-v2-r18-187-private-priority-queue.test.py"
)
fictional = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

def make_fictional_history(root: Path, *, bad_filename=False):
    folder = fictional.make_fictional_snapshot(root)
    docket_file = root/"r111-private-review-docket.json"
    docket = json.loads(docket_file.read_text())
    old_body = " SELECT EXISTS(SELECT 1 FROM public.fictional_fog WHERE enabled = true) "
    live_body = " SELECT EXISTS(SELECT 1 FROM public.fictional_fog WHERE enabled = false) "
    start = datetime(2026, 11, 1, 0, 0, 0)
    for i, item in enumerate(docket["reviewItems"]):
        old = folder/item["filename"]
        prefix = (start+timedelta(minutes=i)).strftime("%Y%m%d%H%M%S")
        new = f"{prefix}_fictional.sql"
        if bad_filename and i == 0:
            new = "nonchronological_fictional.sql"
        data = old.read_text()
        if i in (5,79):
            body = old_body if i == 5 else live_body
            data += (
                "\nCREATE OR REPLACE FUNCTION public.is_map_fog_published(p_map_id uuid) "
                "RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' "
                f"AS $fog$" + body + "$fog$;\n"
            )
        old.unlink()
        (folder/new).write_text(data)
        item["filename"] = new
        item["sourceBodySha256"] = hashlib.sha256(data.encode("utf-8")).hexdigest()
    docket_file.write_text(json.dumps(docket))
    return folder, old_body, live_body

class FogHistoryLineage(unittest.TestCase):
    def test_fictional_83_valid_chronology_and_latest_match(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            _, old_body, live_body = make_fictional_history(root)
            self.assertNotEqual(old_body, live_body)
            with patch.object(r191, "LIVE_BODY_SHA256", hashlib.sha256(live_body.encode()).hexdigest()), \
                 patch.object(r191, "LIVE_BODY_BYTES", len(live_body.encode())):
                result = r191.report(root)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertEqual(result["original_historical_sources_sha256_verified"], 83)
            self.assertEqual(result["historical_direct_target_definitions"], 2)
            self.assertEqual(result["historical_explicit_security_definer_definitions"], 2)
            self.assertEqual(result["historical_body_sha256_matches_live_count"], 1)
            self.assertTrue(result["all_83_migration_filenames_validated_unique_timestamp_chronology"])
            self.assertTrue(result["latest_direct_target_definition_identified"])
            self.assertEqual(result["latest_direct_target_r111_priority_docket_index_not_chronology"], 80)
            self.assertTrue(result["latest_direct_target_body_sha256_matches_live"])
            self.assertFalse(result["latest_direct_target_has_direct_identity_marker"])
            self.assertFalse(result["all_67_live_privileged_call_chains_approved"])
            self.assertFalse(result["qa_or_production_sql_authorized"])
            for forbidden in ("fictional_", "raw_user_meta_data",
                              "CREATE FUNCTION public.is_map_fog_published",
                              "CREATE OR REPLACE FUNCTION public.is_map_fog_published",
                              "r106-original", "p_map_id"):
                self.assertNotIn(forbidden, json.dumps(result))

    def test_changed_archive_digest_rejected(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            folder, _, _ = make_fictional_history(root)
            target = sorted(folder.glob("*.sql"))[5]
            target.write_text("SELECT 2;\n")
            with self.assertRaises(r154.AuditBlocked):
                r191.report(root)

    def test_invalid_chronology_suppresses_latest_claim(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            make_fictional_history(root, bad_filename=True)
            result = r191.report(root)
            self.assertFalse(result["all_83_migration_filenames_validated_unique_timestamp_chronology"])
            self.assertFalse(result["latest_direct_target_definition_identified"])
            self.assertIsNone(result["latest_direct_target_r111_priority_docket_index_not_chronology"])
            self.assertFalse(result["latest_direct_target_body_sha256_matches_live"])
            self.assertEqual(result["historical_direct_target_definitions"], 2)

    def test_not_a_direct_definition_cannot_forge_target(self):
        self.assertIsNone(r191.examine_direct_definition(
            "SELECT 'CREATE FUNCTION public.is_map_fog_published(fake uuid)'"))
        self.assertIsNone(r191.examine_direct_definition(
            "CREATE FUNCTION public.other(p uuid) RETURNS bool LANGUAGE sql "
            "AS $b$ SELECT true $b$;"))

    def test_unsupported_body_never_claims_equivalence(self):
        target = (
            "CREATE FUNCTION public.is_map_fog_published(map uuid) RETURNS boolean "
            "LANGUAGE plpgsql SECURITY DEFINER SET search_path='' "
            "AS $fog$ BEGIN RETURN true; END $fog$;"
        )
        entry = r191.examine_direct_definition(target)
        self.assertFalse(entry["supported_sql_dollar_body"])
        self.assertFalse(entry["sha256_matches_live"])

if __name__ == "__main__":
    unittest.main()
