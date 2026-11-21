"""R18-193 fictional 83-file join/create provenance tests; no private SQL in CI."""
from datetime import datetime, timedelta
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(".").resolve()
sys.path.insert(0,str(ROOT/"scripts/release"))
import r154_private_history_audit as r154
import r193_private_invite_source_lineage as r193

spec=importlib.util.spec_from_file_location(
    "r187_fictional", ROOT/"tests/world-v2-r18-187-private-priority-queue.test.py"
)
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

CREATE_BODY="\nBEGIN RETURN NEW; END;\n"
JOIN_OLD="\nBEGIN PERFORM 1; RETURN NEW; END;\n"
JOIN_NEW="\nBEGIN PERFORM auth.uid(); INSERT INTO public.campaign_members VALUES(1) ON CONFLICT DO NOTHING; RETURN NEW; END;\n"

def function(name, body):
    return (
        f"CREATE OR REPLACE FUNCTION public.{name}(p_code text) "
        f"RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' "
        + "AS $fn$" + body + "$fn$;\n"
    )

def fixture(root:Path, invalid=False):
    folder=fictional.make_fictional_snapshot(root)
    docket_file=root/"r111-private-review-docket.json"
    docket=json.loads(docket_file.read_text())
    for i,item in enumerate(docket["reviewItems"]):
        original=folder/item["filename"]
        new=(datetime(2026,11,1)+timedelta(minutes=i)).strftime("%Y%m%d%H%M%S")+"_fictional.sql"
        if invalid and i==0: new="bad_name.sql"
        sql=original.read_text()
        if i==10: sql+="\n"+function("create_campaign",CREATE_BODY)
        if i==11: sql+="\n"+function("join_campaign",JOIN_OLD)
        if i==79: sql+="\n"+function("join_campaign",JOIN_NEW)
        original.unlink()
        (folder/new).write_text(sql)
        item["filename"]=new
        item["sourceBodySha256"]=hashlib.sha256(sql.encode()).hexdigest()
    docket_file.write_text(json.dumps(docket))
    return folder

def patched_targets():
    value=copy.deepcopy(r193.TARGETS)
    for kind,body in (("JOIN",JOIN_NEW),("CREATE",CREATE_BODY)):
        value[kind]["body_sha256"]=hashlib.sha256(body.encode()).hexdigest()
        value[kind]["body_bytes"]=len(body.encode())
    return value

class InviteHistory(unittest.TestCase):
    def test_original_83_file_chronology_and_two_functions(self):
        with tempfile.TemporaryDirectory() as work:
            root=Path(work)
            fixture(root)
            with patch.object(r193,"TARGETS",patched_targets()):
                result=r193.report(root)
            self.assertEqual(result["decision"],"NO_GO")
            self.assertEqual(result["original_private_history_sha256_verified"],83)
            self.assertTrue(result["all_83_migration_versions_valid_unique_chronology"])
            self.assertEqual(result["targets"]["JOIN"]["historical_direct_definitions"],2)
            self.assertEqual(result["targets"]["JOIN"]["historical_sha256_matches_live_count"],1)
            self.assertTrue(result["targets"]["JOIN"]["latest_sha256_matches_live"])
            self.assertEqual(result["targets"]["JOIN"]["latest_r111_priority_docket_index_not_chronology"],80)
            self.assertTrue(result["targets"]["JOIN"]["latest_on_conflict_marker"])
            self.assertTrue(result["targets"]["JOIN"]["latest_direct_identity_marker"])
            self.assertEqual(result["targets"]["CREATE"]["historical_direct_definitions"],1)
            self.assertTrue(result["targets"]["CREATE"]["latest_sha256_matches_live"])
            self.assertFalse(result["qa_or_production_sql_authorized"])
            for forbidden in ("fictional_", "raw_user_meta_data", "CREATE FUNCTION public.",
                              "r106-original","p_code"):
                self.assertNotIn(forbidden,json.dumps(result))

    def test_filename_invalid_suppresses_latest(self):
        with tempfile.TemporaryDirectory() as work:
            root=Path(work)
            fixture(root,invalid=True)
            result=r193.report(root)
            self.assertFalse(result["all_83_migration_versions_valid_unique_chronology"])
            self.assertFalse(result["targets"]["JOIN"]["latest_direct_definition_located"])
            self.assertIsNone(result["targets"]["JOIN"]["latest_r111_priority_docket_index_not_chronology"])
            self.assertEqual(result["targets"]["JOIN"]["historical_direct_definitions"],2)

    def test_tamper_fails_before_reporting(self):
        with tempfile.TemporaryDirectory() as work:
            root=Path(work)
            folder=fixture(root)
            target=next(folder.glob("*.sql"))
            target.write_text("SELECT 2;\n")
            with self.assertRaises(r154.AuditBlocked):
                r193.report(root)

    def test_unsupported_and_unrelated_statements(self):
        self.assertIsNone(r193.evaluate("SELECT 'CREATE FUNCTION public.join_campaign(...)'",r193.TARGETS["JOIN"]))
        sql="CREATE FUNCTION public.join_campaign(p text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $x$ SELECT 1 $x$;"
        x=r193.evaluate(sql,r193.TARGETS["JOIN"])
        self.assertTrue(x["plpgsql_dollar_body_supported"])
        self.assertFalse(x["sha256_matches_live"])
        other="CREATE FUNCTION public.join_campaign(p text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $x$ SELECT 'x' $x$;"
        x=r193.evaluate(other,r193.TARGETS["JOIN"])
        self.assertFalse(x["plpgsql_dollar_body_supported"])
        self.assertFalse(x["sha256_matches_live"])

if __name__=="__main__":
    unittest.main()
