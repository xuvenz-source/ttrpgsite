"""R231 fictional sanitized-receipt tests. Never load original SQL or owner report."""
from __future__ import annotations
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
SPEC=importlib.util.spec_from_file_location(
    "r231",ROOT/"scripts/release/r231_verify_owner_r230_sanitized.py"
)
r231=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r231)

def invented_receipt():
    """Invented formatted JSON for validation logic, NOT original report."""
    d={k:False for k in r231.FALSE_KEYS}
    d.update({
        "work_package":"B10-R18-230",
        "mode":"OWNER_PRIVATE_OFFLINE_OPAQUE_DO_EFFECT_WORD_REVIEW",
        "decision":"NO_GO",
        **r231.EXPECTED_COUNTS,
        "risk_marker_counts_by_do_block":dict(r231.EXPECTED_CODES),
        "r111_priority_review_items_not_chronological":[
            {"r111_priority_index_not_migration_chronology":i,
             "risk_codes":list(v)}
            for i,v in r231.EXPECTED_PRIORITY_CODES.items()
        ],
        "limitations":[
          "Invented history cannot prove PostgreSQL semantic safety in any SQL block.",
          "Invented lexical examples can be incomplete or misleading due to strings.",
          "Numeric docket review priorities never imply chronological migration order.",
          "Hosted Supabase write authorization is independently and strictly required."
        ]
    })
    assert set(d)==r231.EXPECTED_TOP
    return d

class SanitizedReceiptOnly(unittest.TestCase):
    def test_fake_receipt_accepted_only_as_no_go(self):
        self.assertTrue(r231.validate(invented_receipt()))
    def test_every_positive_approval_rejected(self):
        for key in r231.FALSE_KEYS:
            with self.subTest(key=key):
                d=invented_receipt()
                d[key]=True
                with self.assertRaises(r231.InvalidReceipt):
                    r231.validate(d)
        d=invented_receipt()
        d["decision"]="GO"
        with self.assertRaises(r231.InvalidReceipt):
            r231.validate(d)
    def test_counters_schema_and_priority_tampering_rejected(self):
        d0=invented_receipt()
        cases=[]
        for key in r231.EXPECTED_COUNTS:
            d=deepcopy(d0);d[key]+=1;cases.append(d)
        for key in r231.EXPECTED_CODES:
            d=deepcopy(d0);d["risk_marker_counts_by_do_block"][key]+=1;cases.append(d)
        for key in ("filename","sql","private_source","version","credential"):
            d=deepcopy(d0);d[key]="invented";cases.append(d)
        d=deepcopy(d0);d["r111_priority_review_items_not_chronological"][0]["risk_codes"]=["GO"];cases.append(d)
        d=deepcopy(d0);d["r111_priority_review_items_not_chronological"].reverse();cases.append(d)
        d=deepcopy(d0);d["r111_priority_review_items_not_chronological"][0]["source_sql"]="invented";cases.append(d)
        d=deepcopy(d0);d["r111_priority_review_items_not_chronological"].append(d["r111_priority_review_items_not_chronological"][0]);cases.append(d)
        for d in cases:
            with self.subTest(tampering=str(d)[:45]),self.assertRaises(r231.InvalidReceipt):
                r231.validate(d)
    def test_duplicate_json_keys_and_unpinned_json_rejected(self):
        with self.assertRaises(r231.InvalidReceipt):
            json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=r231.no_duplicate_keys)
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/"invented.json"
            path.write_text(json.dumps(invented_receipt()))
            with self.assertRaises(r231.InvalidReceipt):
                r231.validate_file(path,require_exact_sha=True)
            self.assertTrue(r231.validate_file(path,require_exact_sha=False))
            link=Path(t)/"linked.json"
            link.symlink_to(path)
            with self.assertRaises(r231.InvalidReceipt):
                r231.validate_file(link,require_exact_sha=False)
    def test_pinned_digest_size_and_frozen_no_go(self):
        self.assertEqual(len(r231.EXPECTED_SHA256),64)
        self.assertEqual(r231.EXPECTED_COUNTS["original_private_migrations_sha256_reverified"],83)
        self.assertEqual(r231.EXPECTED_COUNTS["historical_top_level_do_blocks_reconciled"],12)
        self.assertEqual(len(r231.EXPECTED_PRIORITY_CODES),11)
        self.assertEqual(r231.EXPECTED_CODES["DYNAMIC_EXECUTE_WORD"],2)

if __name__=="__main__":
    unittest.main()
