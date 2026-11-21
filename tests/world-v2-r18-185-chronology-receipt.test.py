"""R18-185 fictional sanitized receipts only: no owner's archive or SQL."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path("scripts/release").resolve()))
import r185_reconcile_private_chronology_receipt as r185

def fixture():
    receipt = {key: False for key in r185.FALSE_KEYS}
    receipt.update({key: True for key in r185.TRUE_KEYS})
    receipt.update(r185.COUNTS)
    receipt.update({
        "work_package": "B10-R18-184",
        "decision": "NO_GO",
        "mode": "OFFLINE_SHA256_VERIFIED_R111_R106_CHRONOLOGY_STRUCTURAL_PARITY",
        "limitations": r185.EXPECTED_LIMITATIONS[:],
        "rpc_rewrite_parity": {key: True for key in r185.RPC_KEYS},
    })
    return receipt

def encoded(report):
    raw = json.dumps(report, sort_keys=True).encode("utf-8")
    return raw, hashlib.sha256(raw).hexdigest()

class StrictReceiptGate(unittest.TestCase):
    def assert_denied(self, record):
        raw, digest = encoded(record)
        self.assertFalse(r185.reconcile_bytes(raw, digest))

    def test_fictional_receipt_passes_only_structural_gate(self):
        raw, digest = encoded(fixture())
        self.assertTrue(r185.reconcile_bytes(raw, digest))
        self.assertFalse(fixture()["production_release_authorized"])
        self.assertFalse(fixture()["private_history_semantically_approved"])

    def test_count_does_not_accept_bool_as_integer(self):
        altered = fixture()
        altered["verified_history_count"] = True
        self.assert_denied(altered)

    def test_any_failed_rpc_or_authorization_assertion_rejected(self):
        for key in r185.RPC_KEYS:
            altered = fixture()
            altered["rpc_rewrite_parity"][key] = False
            self.assert_denied(altered)
        for key in r185.FALSE_KEYS:
            altered = fixture()
            altered[key] = True
            self.assert_denied(altered)

    def test_missing_or_extra_keys_rejected(self):
        altered = fixture()
        del altered["real_signed_qa_passed"]
        self.assert_denied(altered)
        altered = fixture()
        altered["unreviewed_sql"] = "not allowed"
        self.assert_denied(altered)

    def test_invalid_expected_counts_limitations_or_wrong_mode(self):
        for key in r185.COUNTS:
            altered = fixture()
            altered[key] += 1
            self.assert_denied(altered)
        altered = fixture()
        altered["limitations"] = []
        self.assert_denied(altered)
        altered = fixture()
        altered["mode"] = "FORGED_SIGNED_QA_PASS"
        self.assert_denied(altered)

    def test_mismatch_digest_duplicate_json_invalid_encoding_oversize(self):
        raw, digest = encoded(fixture())
        self.assertFalse(r185.reconcile_bytes(raw, "0" * 64))
        self.assertFalse(r185.reconcile_bytes(raw, digest.upper()))
        duplicate = raw[:-1] + b', "decision": "GO"}'
        self.assertFalse(r185.reconcile_bytes(duplicate, hashlib.sha256(duplicate).hexdigest()))
        for other in (b"\xff", b"{" + b"x" * 4096 + b"}", b'{"x":NaN}'):
            self.assertFalse(r185.reconcile_bytes(other, hashlib.sha256(other).hexdigest()))

    def test_regular_local_file_only_and_no_file_changes(self):
        raw, digest = encoded(fixture())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fictional.json"
            path.write_bytes(raw)
            self.assertTrue(r185.reconcile_path(path, digest))
            self.assertEqual(path.read_bytes(), raw)
            link = Path(directory) / "symlink.json"
            link.symlink_to(path)
            self.assertFalse(r185.reconcile_path(link, digest))
            self.assertFalse(r185.reconcile_path(Path(directory), digest))

if __name__ == "__main__":
    unittest.main()
