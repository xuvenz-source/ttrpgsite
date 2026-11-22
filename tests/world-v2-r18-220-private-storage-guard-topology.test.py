"""R220: entirely fictional historical SQL and fabricated sanitized JSON tests."""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
import r154_private_history_audit as older
import r220_validate_owner_r219_receipt as receipt
import r220_private_storage_guard_or_topology as audit

spec=importlib.util.spec_from_file_location(
    "fake_r193",ROOT/"tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fixture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def append(root,index,sql):
    docket_path=root/"r111-private-review-docket.json"
    docket=json.loads(docket_path.read_text())
    item=docket["reviewItems"][index]
    source=root/"r106-original-83-recovery"/"supabase"/"migrations"/item["filename"]
    body=source.read_text()+"\n"+sql+"\n"
    source.write_text(body)
    item["sourceBodySha256"]=hashlib.sha256(body.encode()).hexdigest()
    docket_path.write_text(json.dumps(docket))


def synthetic_receipt():
    return {
        **receipt.EXPECTED,**receipt.GUARDS,
        "original_migrations_sha256_reverified":83,
        "top_level_statements_reconciled":937,
        "storage_policy_statements_reconciled":3,
        "final_archive_lexical_policy_keys":3,
        "possible_overlap_storage_table_targets":1,
        "distinct_possible_overlapping_policy_key_pairs":3,
        "r218_legacy_unique_r111_priority_pair_count":2,
        "possible_pair_operation_counts":{"select":3,"insert":0,"update":0,"delete":0},
        "possible_pair_role_counts":{"anon":0,"authenticated":3},
        "possible_pair_lexical_cue_counts":{
           "one_or_both_without_bucket_id_word":0,
           "one_or_both_without_direct_auth_or_known_campaign_helper_word":0,
           "one_or_both_with_or_word":2,
           "one_or_both_with_literal_true_guard_word":0,
           "same_r111_priority_index_pair":1,
        },
        "priority_review_file_count":2,
        "first_r111_priority_review_items":[
           {"r111_priority_index":1,"lexical_review_codes":["possible_overlap_policy_pair"]},
           {"r111_priority_index":2,"lexical_review_codes":["possible_overlap_policy_pair"]},
        ],
        "priority_review_items_truncated":False,
        "limitations":receipt.LIMITS[:],
    }


class ReceiptTests(unittest.TestCase):
    def test_sanitized_only_keeps_all_no_go_flags(self):
        d=receipt.validate(synthetic_receipt())
        self.assertEqual(d["decision"],"NO_GO")
        self.assertTrue(d["sanitized_r219_receipt_valid"])
        self.assertFalse(d["qa_or_original_sql_install_authorized"])
    def test_reject_approval_count_drift_private_payload(self):
        for key,value in (
           ("decision","GO"),("qa_sql_install_authorized",True),
           ("no_network_or_database_access",False),
           ("original_migrations_sha256_reverified",True),
           ("distinct_possible_overlapping_policy_key_pairs",3.0),
        ):
            with self.subTest(key=key):
                d=synthetic_receipt();d[key]=value
                with self.assertRaises(receipt.Blocked):receipt.validate(d)
        d=synthetic_receipt();d["raw_policy"]="USING (secret)"
        with self.assertRaises(receipt.Blocked):receipt.validate(d)
        d=synthetic_receipt()
        d["possible_pair_operation_counts"]["select"]=0
        with self.assertRaises(receipt.Blocked):receipt.validate(d)
        d=synthetic_receipt()
        d["first_r111_priority_review_items"][1]["r111_priority_index"]=1
        with self.assertRaises(receipt.Blocked):receipt.validate(d)
    def test_json_duplicated_keys_and_nonfinite_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"synthetic.json"
            path.write_text(json.dumps(synthetic_receipt()))
            self.assertTrue(receipt.validate(receipt.read_sanitized(path))["sanitized_r219_receipt_valid"])
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(receipt.Blocked):receipt.read_sanitized(path)
            path.write_text('{"result":NaN}')
            with self.assertRaises(receipt.Blocked):receipt.read_sanitized(path)


class GuardTopologyTests(unittest.TestCase):
    def test_quoted_or_comment_or_not_boolean_guard_or(self):
        query=(
          "CREATE POLICY sample ON storage.objects FOR SELECT TO authenticated "
          "USING (bucket_id = 'OR' AND auth.uid() IS NOT NULL /* OR */);"
        )
        g=audit.guard_topology(query)
        self.assertTrue(g["using"])
        self.assertFalse(g["top"])
        self.assertFalse(g["nested"])
        self.assertFalse(g["branch_missing_bucket"])
        self.assertFalse(g["branch_missing_identity"])
        self.assertNotIn(" OR ", audit.mask_literals_and_comments(query))
        self.assertTrue(audit.OR.search(query))
    def test_parentheses_top_level_and_nested_or(self):
        top=audit.guard_topology(
            "CREATE POLICY sample ON storage.objects FOR SELECT "
            "USING ((bucket_id = 'fiction' AND auth.uid() IS NOT NULL) OR TRUE)"
        )
        self.assertTrue(top["top"])
        self.assertFalse(top["nested"])
        self.assertTrue(top["branch_missing_bucket"])
        self.assertTrue(top["branch_missing_identity"])
        nested=audit.guard_topology(
            "CREATE POLICY sample ON storage.objects FOR SELECT "
            "USING (bucket_id = 'fiction' AND (is_campaign_member(id) OR is_campaign_dm(id)))"
        )
        self.assertTrue(nested["nested"])
        self.assertFalse(nested["top"])
        self.assertFalse(nested["branch_missing_bucket"])
    def test_check_clause_and_unterminated_source_fail_closed(self):
        g=audit.guard_topology(
            "CREATE POLICY sample ON storage.objects FOR INSERT TO authenticated "
            "WITH CHECK (bucket_id = 'fake' OR auth.uid() IS NOT NULL)"
        )
        self.assertTrue(g["with_check"])
        self.assertTrue(g["with_check_top"])
        self.assertTrue(g["branch_missing_bucket"])
        with self.assertRaises(older.AuditBlocked):
            audit.mask_literals_and_comments("USING ('not closed)")
        with self.assertRaises(older.AuditBlocked):
            audit.mask_literals_and_comments("USING (true /* unfinished)")
        with self.assertRaises(older.AuditBlocked):
            audit.guard_topology("CREATE POLICY sample ON storage.objects USING (auth.uid()")

    def test_private_fake_83_sql_counts_and_no_source_export(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);fixture.fixture(root)
            append(root,0,"""
CREATE POLICY invented_sample_a ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'first' AND (is_campaign_member(id) OR is_campaign_dm(id)));
CREATE POLICY invented_sample_b ON storage.objects FOR SELECT TO authenticated
USING ((bucket_id = 'second' AND auth.uid() IS NOT NULL) OR TRUE);
""")
            append(root,1,"""
CREATE POLICY invented_sample_c ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'third' AND auth.uid() IS NOT NULL);
""")
            r=audit.report(root)
            self.assertEqual(r["decision"],"NO_GO")
            self.assertEqual(r["original_migrations_sha256_reverified"],83)
            self.assertEqual(r["possible_overlapping_policy_key_pairs_reconciled"],3)
            self.assertEqual(r["r219_policy_pair_with_or_word_reconciled"],3)
            self.assertEqual(r["potential_pair_guard_topology_counts"]["pair_with_guard_top_level_or"],2)
            self.assertEqual(r["potential_pair_guard_topology_counts"]["pair_with_guard_nested_or"],2)
            self.assertEqual(r["potential_pair_guard_topology_counts"]["pair_with_guard_or_at_any_depth"],3)
            self.assertEqual(r["potential_pair_guard_topology_counts"]["pair_with_top_level_or_branch_without_bucket_word"],2)
            self.assertEqual(r["policy_guard_lexical_counts"]["using_guard_top_level_or"],1)
            self.assertEqual(r["policy_guard_lexical_counts"]["using_guard_nested_or"],1)
            self.assertFalse(r["qa_sql_install_authorized"])
            self.assertFalse(r["effective_postgresql_rls_or_sql_boolean_semantics_proven"])
            priorities=[item["r111_priority_index"] for item in r["first_r111_priority_guard_review_items"]]
            self.assertEqual(priorities,[1,2])
            sanitized=json.dumps(r)
            for secret in ("invented_sample_a","invented_sample_b","invented_sample_c",
                           "storage.objects","sourceBodySha256","r111-private-review-docket"):
                self.assertNotIn(secret,sanitized)
    def test_raw_or_in_quoted_string_only_is_not_guard_or(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);fixture.fixture(root)
            append(root,0,"""
CREATE POLICY invented_a ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'OR' AND auth.uid() IS NOT NULL);
CREATE POLICY invented_b ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fiction' AND auth.uid() IS NOT NULL);
""")
            r=audit.report(root)
            self.assertEqual(r["possible_overlapping_policy_key_pairs_reconciled"],1)
            self.assertEqual(r["r219_policy_pair_with_or_word_reconciled"],1)
            self.assertEqual(r["potential_pair_guard_topology_counts"]["pair_with_guard_or_at_any_depth"],0)
            self.assertEqual(r["potential_pair_guard_topology_counts"]["pair_with_or_word_only_outside_guards"],1)
    def test_source_sha_drift_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);private=fixture.fixture(root)
            path=next(private.glob("*.sql"))
            path.write_text(path.read_text()+"\n-- changed")
            with self.assertRaises(older.AuditBlocked):audit.report(root)


if __name__=="__main__":
    unittest.main()
