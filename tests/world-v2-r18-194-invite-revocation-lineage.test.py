"""R194 fail-closed source-only invitation-to-revocation contract regressions."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
    "r194",ROOT/"scripts/release/r194_reconcile_private_invite_revocation.py"
)
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST=ROOT/gate.MANIFEST

class InviteLineageAndRevocation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=json.loads(MANIFEST.read_text())

    def test_pinned_source_passes_but_remains_no_go(self):
        report=gate.validate(deepcopy(self.source),ROOT)
        self.assertEqual(report["decision"],"NO_GO")
        self.assertTrue(report["r193_private_source_matches_live_reconciled"])
        self.assertTrue(report["frozen_unapplied_revocation_prototypes_verified"])
        for key in ("privileged_truncate_authorization_issue_resolved",
                    "signed_multiuser_qa_passed",
                    "all_83_original_history_semantics_approved",
                    "all_67_privileged_call_chains_approved",
                    "hosted_sql_or_production_release_authorized"):
            self.assertIs(report[key],False)
        self.assertNotIn("CREATE FUNCTION",json.dumps(report))
        self.assertNotIn("campaign_member_revocations",json.dumps(report))

    def test_reject_source_receipt_drift(self):
        for path, value in (
            (("ownerR193Receipt","sha256"),"0"*64),
            (("ownerR193Receipt","uniqueMigrationChronology"),False),
            (("ownerR193Receipt","join"),{}),
            (("ownerR193Receipt","create"),{}),
            (("ownerR193Receipt","join","latestStatementOrdinal"),5),
            (("ownerR193Receipt","create","latestBodyMatchesLive"),False),
            (("liveFunctionSourceSnapshot","joinCampaign","bodyBytes"),741),
            (("liveFunctionSourceSnapshot","createCampaign","sha256"),"0"*64),
        ):
            mutated=deepcopy(self.source)
            ref=mutated
            for k in path[:-1]:
                ref=ref[k]
            ref[path[-1]]=value
            with self.subTest(path=path),self.assertRaises(gate.AuditBlocked):
                gate.validate(mutated,ROOT)

    def test_reject_elevated_release_or_bypass(self):
        for key in gate.NO_GO_FLAGS:
            mutated=deepcopy(self.source)
            mutated["releaseGates"][key]=True
            with self.subTest(flag=key),self.assertRaises(gate.AuditBlocked):
                gate.validate(mutated,ROOT)
        for key in gate.RESTRICTIONS:
            mutated=deepcopy(self.source)
            mutated[key]=False
            with self.subTest(restriction=key),self.assertRaises(gate.AuditBlocked):
                gate.validate(mutated,ROOT)
        altered=deepcopy(self.source)
        altered["inheritedRepairEvidence"]["privilegedTruncateGapRemainsUnresolved"]=False
        with self.assertRaises(gate.AuditBlocked):
            gate.validate(altered,ROOT)

    def test_locked_old_source_blob_cannot_change(self):
        with tempfile.TemporaryDirectory() as d:
            other=Path(d)
            for path in gate.SOURCE_BLOBS:
                dst=other/path
                dst.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(ROOT/path,dst)
            gate.check_source_blobs(other)
            target=other/"staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql"
            target.write_bytes(target.read_bytes()+b"\n-- synthetic tamper\n")
            with self.assertRaises(gate.AuditBlocked):
                gate.check_source_blobs(other)

    def test_invalid_json_and_repair_replacement_are_rejected(self):
        with self.assertRaises(gate.AuditBlocked):
            json.loads('{"a":1,"a":2}',object_pairs_hook=gate.unique)
        changed=deepcopy(self.source)
        changed["frozenSourceBlobs"]["tests/world-v2-r18-121-postgres/run.sh"]="0"*40
        with self.assertRaises(gate.AuditBlocked):
            gate.validate(changed,ROOT)
        changed=deepcopy(self.source)
        changed["inheritedRepairEvidence"]["existingDraftPrototypePrs"]=[226,228]
        with self.assertRaises(gate.AuditBlocked):
            gate.validate(changed,ROOT)
        changed=deepcopy(self.source)
        changed["schema"]=True
        with self.assertRaises(gate.AuditBlocked):
            gate.validate(changed,ROOT)

    def test_no_original_private_source_ever_published(self):
        raw=MANIFEST.read_text()
        for phrase in ("r111-private-review-docket.json",
                       "r106-original-83-recovery",
                       "CREATE FUNCTION",
                       "raw_user_meta_data",
                       "service_role_secret"):
            self.assertNotIn(phrase,raw)

if __name__=="__main__":
    unittest.main()
