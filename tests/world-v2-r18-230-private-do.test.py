"""R230 tests only fictional private-history fixtures; no real SQL or network."""
from __future__ import annotations
from contextlib import redirect_stdout,redirect_stderr
from datetime import datetime,timedelta
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
SPEC=importlib.util.spec_from_file_location("r230",ROOT/"scripts/release/r230_private_opaque_do_effects.py")
r230=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r230)
PRIOR={
 "decision":"NO_GO",
 "original_migrations_sha256_reverified":83,
 "original_migration_chronology_unique_valid":True,
 "lexical_top_level_statements":937,
 "risk_flagged_original_file_count":22,
 "top_level_statement_kinds":{"do_block":12},
 "unclassified_top_level_statements":0,
 "qa_sql_write_authorized":False
}

class PrivateOpaqueDoTests(unittest.TestCase):
    def test_only_top_level_do_accepted(self):
        with self.assertRaises(Exception):
            r230.analyze_do("SELECT 'DO';")
        with self.assertRaises(Exception):
            r230.analyze_do("CREATE FUNCTION invented() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;")

    def test_fictional_opaque_do_risk_codes(self):
        fake="""DO $fictional$ BEGIN
          EXECUTE format('DELETE FROM auth.users WHERE id = NULL');
          RAISE EXCEPTION 'fictional abort'; END $fictional$;"""
        flags=r230.analyze_do(fake)
        self.assertIn("DYNAMIC_EXECUTE_WORD",flags)
        self.assertIn("DML_OR_TRUNCATE_WORD",flags)
        self.assertIn("MANAGED_AUTH_STORAGE_WORD",flags)
        self.assertIn("EXCEPTION_HANDLER_WORD",flags)
        self.assertIn("DOLLAR_OR_QUOTED_DYNAMIC_WORD",flags)
        self.assertTrue(flags<=r230.ALLOWED_CODES)

    def test_executed_code_is_only_classification(self):
        flags=r230.analyze_do("DO $$ BEGIN PERFORM 1; END $$;")
        self.assertIn("DOLLAR_OR_QUOTED_DYNAMIC_WORD",flags)
        self.assertNotIn("NETWORK_OR_NOTIFY_WORD",flags)
        self.assertNotIn("DML_OR_TRUNCATE_WORD",flags)

    def test_fail_closed_on_forged_prior_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            for key,value in {
              "decision":"GO",
              "qa_sql_write_authorized":True,
              "lexical_top_level_statements":0,
              "original_migrations_sha256_reverified":82,
              "risk_flagged_original_file_count":0,
              "top_level_statement_kinds":{"do_block":11},
            }.items():
                prior=dict(PRIOR)
                prior[key]=value
                with self.subTest(key=key):
                    with patch.object(r230.r211,"report",return_value=prior):
                        with self.assertRaises(Exception):
                            r230.report(Path(directory))

    def test_entirely_fabricated_83_file_history_and_no_leak(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            folder=root/"r106-original-83-recovery"/"supabase"/"migrations"
            folder.mkdir(parents=True)
            for component in (root,root/"r106-original-83-recovery",
                              root/"r106-original-83-recovery"/"supabase",folder):
                component.chmod(0o700)
            items=[]
            base=datetime(2025,1,1,0,0,0)
            for i in range(83):
                version=(base+timedelta(minutes=i)).strftime("%Y%m%d%H%M%S")
                name=f"{version}_fictional_item_{i:02d}.sql"
                body=(
                    "DO $fake$ BEGIN EXECUTE 'DELETE FROM auth.users'; END $fake$;\n"
                    if i<12 else "SELECT 1;\n"
                )
                data=body.encode()
                dest=folder/name
                dest.write_bytes(data)
                dest.chmod(0o600)
                items.append({"filename":name,"sourceBodySha256":hashlib.sha256(data).hexdigest()})
            docket=root/"r111-private-review-docket.json"
            docket.write_text(json.dumps({"decision":"NO_GO","reviewItems":items}))
            docket.chmod(0o600)
            with patch.object(r230.r211,"report",return_value=PRIOR):
                data=r230.report(root)
            self.assertEqual(data["original_private_migrations_sha256_reverified"],83)
            self.assertEqual(data["historical_top_level_do_blocks_reconciled"],12)
            self.assertEqual(data["original_do_containing_migration_count"],12)
            self.assertEqual(data["risk_marker_counts_by_do_block"]["DYNAMIC_EXECUTE_WORD"],12)
            self.assertEqual(data["decision"],"NO_GO")
            self.assertFalse(data["any_sql_executed"])
            self.assertFalse(data["historical_migrations_approved_for_qa"])
            self.assertEqual(len(data["r111_priority_review_items_not_chronological"]),12)
            serialized=json.dumps(data)
            self.assertNotIn("fictional_item",serialized)
            self.assertNotIn("DELETE FROM auth.users",serialized)
            self.assertNotIn("2025010",serialized)
            # Hash drift must be rejected without exposing private source bytes.
            (folder/items[0]["filename"]).write_text("DO $$ BEGIN END $$;")
            with patch.object(r230.r211,"report",return_value=PRIOR):
                with self.assertRaises(Exception):
                    r230.report(root)

if __name__=="__main__":
    unittest.main()
