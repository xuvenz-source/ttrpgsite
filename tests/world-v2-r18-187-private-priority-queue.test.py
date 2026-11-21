"""R187 fictional full-history parity and priority-queue regression tests."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path("scripts/release").resolve()))
import r187_private_privileged_priority_queue as r187
from r154_private_history_audit import AuditBlocked

def definition(index, *, identity, membership, meta=False, definer=True):
    body = ["true"]
    if identity:
        body.append("auth.uid() is not null")
    if membership:
        body.append("exists(select 1 from campaign_members)")
    if meta:
        body.append("(auth.jwt() -> 'raw_user_meta_data') is not null")
    return (
        f"CREATE OR REPLACE FUNCTION public.fake_func_{index}() RETURNS boolean "
        f"LANGUAGE sql SECURITY {'DEFINER' if definer else 'INVOKER'} "
        "SET search_path = '' AS $b$ SELECT " + " AND ".join(body) + " $b$;\n"
    )

def make_fictional_snapshot(root):
    root.chmod(0o700)
    folder = root / "r106-original-83-recovery" / "supabase" / "migrations"
    folder.mkdir(parents=True)
    statements = []
    n = 0
    # Exactly 158 definer statements with risk markers:
    # 56 missing both identity and membership; 14 identity-only absence;
    # 87 membership-only absence; 1 user-meta-only lexical marker.
    for _ in range(56):
        statements.append(definition(n, identity=False, membership=False))
        n += 1
    for _ in range(14):
        statements.append(definition(n, identity=False, membership=True))
        n += 1
    for _ in range(87):
        statements.append(definition(n, identity=True, membership=False))
        n += 1
    statements.append(definition(n, identity=True, membership=True, meta=True))
    n += 1
    for _ in range(24):
        statements.append(definition(n, identity=True, membership=True))
        n += 1
    for _ in range(49):
        statements.append(definition(n, identity=True, membership=True, definer=False))
        n += 1
    assert len(statements) == 231

    review = []
    for i in range(83):
        name = f"fictional_{i:03}.sql"
        source = "".join(statements) if i == 0 else "SELECT 1;\n"
        (folder / name).write_text(source, encoding="utf-8")
        review.append({
            "filename": name,
            "sourceBodySha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
            "securityApproved": False,
        })
    docket = {"workPackage": "B10-R18-111", "decision": "NO_GO", "reviewItems": review}
    (root / "r111-private-review-docket.json").write_text(json.dumps(docket))
    return folder

class PrivatePriorityQueue(unittest.TestCase):
    def test_priority_order_is_fixed_and_not_source_names(self):
        code = r187.priority_bucket
        self.assertEqual(code(["USER_EDITABLE_AUTH_METADATA_MARKER"]), r187.BUCKETS[0])
        self.assertEqual(code(["MISSING_DIRECT_AUTH_IDENTITY_MARKER",
                               "MISSING_CAMPAIGN_MEMBERSHIP_MARKER"]), r187.BUCKETS[1])
        self.assertEqual(code(["MISSING_DIRECT_AUTH_IDENTITY_MARKER"]), r187.BUCKETS[2])
        self.assertEqual(code(["MISSING_CAMPAIGN_MEMBERSHIP_MARKER"]), r187.BUCKETS[3])
        with self.assertRaises(AuditBlocked):
            code(["arbitrary_source_value"])
        with self.assertRaises(AuditBlocked):
            code([])

    def test_fictional_full_83_file_parity(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            make_fictional_snapshot(root)
            result = r187.report(root)
            self.assertEqual(result["decision"], "NO_GO")
            self.assertEqual(result["historical_files_sha256_verified"], 83)
            self.assertEqual(result["historical_definer_statements"], 182)
            self.assertEqual(result["historical_definer_statements_with_markers"], 158)
            self.assertEqual(result["triage_bucket_counts"], {
                r187.BUCKETS[0]: 1, r187.BUCKETS[1]: 56,
                r187.BUCKETS[2]: 14, r187.BUCKETS[3]: 87
            })
            self.assertEqual(len(result["bounded_priority_queue"]), 24)
            self.assertEqual(result["bounded_priority_queue_remaining"], 134)
            self.assertEqual(result["bounded_priority_queue"][0]["triage_bucket"], r187.BUCKETS[0])
            self.assertEqual(result["bounded_priority_queue"][0]["executable_statement_ordinal"], 158)
            self.assertFalse(result["effective_privileged_authorization_approved"])
            self.assertFalse(result["hosted_sql_or_production_release_authorized"])
            for bad in ("fake_func_", "fictional_", "r106-original", "raw_user_meta_data"):
                self.assertNotIn(bad, json.dumps(result))

    def test_source_tamper_denied(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            folder = make_fictional_snapshot(root)
            file = folder / "fictional_001.sql"
            file.write_text("SELECT 2;\n", encoding="utf-8")
            with self.assertRaises(AuditBlocked):
                r187.report(root)

    def test_wrong_sha_valid_but_different_marker_snapshot_denied(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            folder = make_fictional_snapshot(root)
            path = folder / "fictional_001.sql"
            source = "CREATE FUNCTION public.other() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $b$ SELECT true $b$;"
            path.write_text(source, encoding="utf-8")
            docket = root / "r111-private-review-docket.json"
            obj = json.loads(docket.read_text())
            obj["reviewItems"][1]["sourceBodySha256"] = hashlib.sha256(source.encode()).hexdigest()
            docket.write_text(json.dumps(obj))
            with self.assertRaises(AuditBlocked):
                r187.report(root)

if __name__ == "__main__":
    unittest.main()
