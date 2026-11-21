"""R195 scratch-only service_role TRUNCATE guard evidence / NO_GO tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
    "r195",ROOT/"scripts/release/r195_validate_membership_truncate_denial.py"
)
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST=ROOT/gate.MANIFEST

class UnappliedTruncateGuard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original=json.loads(MANIFEST.read_text())

    def test_exact_snapshot_source_and_no_approval(self):
        result=gate.validate(deepcopy(self.original),ROOT)
        self.assertEqual(result["decision"],"NO_GO")
        self.assertTrue(result["unapplied_truncate_guard_and_scratch_runner_byte_pinned"])
        self.assertFalse(result["privileged_truncate_bypass_fixed_on_hosted"])
        self.assertFalse(result["signed_qa_performed"])
        self.assertFalse(result["hosted_sql_or_production_release_authorized"])
        self.assertNotIn("CREATE FUNCTION",json.dumps(result))

    def test_reject_false_live_observation_or_premature_approval(self):
        for field in ("service_role_effective_truncate","service_role_effective_delete",
                      "rls_enabled"):
            altered=deepcopy(self.original)
            altered["live_read_only_grants"][field]=False
            with self.subTest(field=field), self.assertRaises(gate.AuditBlocked):
                gate.validate(altered,ROOT)
        for field in gate.RISKS:
            altered=deepcopy(self.original)
            altered["limitations"][field]=True
            with self.subTest(field=field), self.assertRaises(gate.AuditBlocked):
                gate.validate(altered,ROOT)
        for field in gate.RESTRICTIONS:
            altered=deepcopy(self.original)
            altered[field]=False
            with self.subTest(field=field), self.assertRaises(gate.AuditBlocked):
                gate.validate(altered,ROOT)

    def test_candidate_and_isolation_runner_sha_pinned(self):
        with tempfile.TemporaryDirectory() as work:
            fake=Path(work)
            for src in gate.FROZEN_BLOBS:
                dst=fake/src
                dst.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(ROOT/src,dst)
            # Original blob bytes match, but copy lives outside repo.
            for src,ref in gate.FROZEN_BLOBS.items():
                self.assertEqual(gate.git_blob_sha((fake/src).read_bytes()),ref)
            candidate=fake/self.original["candidate_unapplied_only"]["path"]
            candidate.write_bytes(candidate.read_bytes()+b"\n-- synthetic adversary edits candidate\n")
            with self.assertRaises(gate.AuditBlocked):
                gate.validate(deepcopy(self.original),fake)

    def test_duplicate_json_or_type_coercion_denied(self):
        with self.assertRaises(gate.AuditBlocked):
            json.loads('{"a":1,"a":2}',object_pairs_hook=gate.no_duplicates)
        altered=deepcopy(self.original)
        altered["schema"]=True
        with self.assertRaises(gate.AuditBlocked):
            gate.validate(altered,ROOT)
        altered=deepcopy(self.original)
        altered["synthetic_runner"]["postgres_version"]="17"
        with self.assertRaises(gate.AuditBlocked):
            gate.validate(altered,ROOT)

    def test_scratch_candidate_constrains_only_truncate(self):
        sql=(ROOT/self.original["candidate_unapplied_only"]["path"]).read_text()
        self.assertIn("REVOKE TRUNCATE ON TABLE public.campaign_members FROM service_role",sql)
        self.assertIn("BEFORE TRUNCATE ON public.campaign_members",sql)
        self.assertIn("FOR EACH STATEMENT",sql)
        self.assertIn("RAISE EXCEPTION",sql)
        self.assertNotIn("DROP TABLE",sql.upper())
        self.assertNotIn("ALTER TABLE PUBLIC.CAMPAIGN_MEMBERS DISABLE ROW LEVEL SECURITY",sql.upper())
        self.assertNotIn("GRANT ALL",sql.upper())
        self.assertNotIn("UPDATE PUBLIC.CAMPAIGN_MEMBERS",sql.upper())
        runner=(ROOT/self.original["synthetic_runner"]["path"]).read_text()
        self.assertIn("R195_ISOLATED",runner)
        self.assertIn("127.0.0.1",runner)
        self.assertIn("tests/world-v2-r18-120-postgres/verify-contract.sql",runner)
        self.assertIn("baseline-bypass.sql",runner)

if __name__=="__main__":
    unittest.main()
