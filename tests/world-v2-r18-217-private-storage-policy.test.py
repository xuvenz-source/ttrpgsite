"""R217 tests use wholly invented 83-file SQL and fabricated sanitized JSON."""
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
import r154_private_history_audit as original
import r217_validate_owner_r216_receipt as receipt
import r217_private_storage_policy_shape as policy

spec=importlib.util.spec_from_file_location(
    "fictional_r193",ROOT/"tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fixture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

def append_sql(root,index,sql):
    docket_path=root/"r111-private-review-docket.json"
    docket=json.loads(docket_path.read_text())
    item=docket["reviewItems"][index]
    path=root/"r106-original-83-recovery"/"supabase"/"migrations"/item["filename"]
    raw=path.read_text()+"\n"+sql+"\n"
    path.write_text(raw)
    item["sourceBodySha256"]=hashlib.sha256(raw.encode()).hexdigest()
    docket_path.write_text(json.dumps(docket))

def fake_report():
    statements={k:0 for k in receipt.CODES}
    files={k:0 for k in receipt.CODES}
    first=["storage_direct_insert","storage_direct_insert_conflict_word","storage_objects_target_word"]
    second=["storage_objects_target_word","storage_policy_missing_direct_auth_identity_word",
            "storage_policy_missing_with_check_word","storage_policy_select"]
    for row in (first,second):
        for code in row:
            files[code]+=1
            statements[code]+=1
    return {
        **receipt.FIXED,**receipt.GUARDS,
        "original_migrations_sha256_reverified":83,
        "top_level_statements_reconciled":937,
        "r215_storage_direct_dml_statements_reconciled":1,
        "r215_storage_policy_statements_reconciled":1,
        "storage_lexical_statement_indicator_counts":statements,
        "storage_lexical_file_indicator_counts":files,
        "storage_review_file_count":2,
        "first_r111_priority_storage_review_items":[
            {"r111_priority_index":2,"storage_lexical_review_codes":sorted(first)},
            {"r111_priority_index":3,"storage_lexical_review_codes":sorted(second)}
        ],
        "priority_review_items_truncated":False,
        "limitations":receipt.LIMITATIONS[:],
    }

class ReceiptTests(unittest.TestCase):
    def test_safe_shape_keeps_no_go(self):
        result=receipt.validate(fake_report())
        self.assertEqual(result["decision"],"NO_GO")
        self.assertTrue(result["sanitized_r216_receipt_valid"])
        self.assertFalse(result["signed_url_revocation_proven"])
        self.assertFalse(result["qa_or_production_sql_authorized"])
    def test_reject_approval_extra_fields_and_inconsistent_counts(self):
        cases=(("decision","GO"),("qa_sql_install_authorized",True),
               ("no_sql_executed",False),("original_migrations_sha256_reverified",True),
               ("top_level_statements_reconciled",937.0))
        for key,bad in cases:
            data=fake_report();data[key]=bad
            with self.subTest(key=key),self.assertRaises(receipt.Blocked):
                receipt.validate(data)
        data=fake_report();data["SQL"]="SELECT * FROM private.secret"
        with self.assertRaises(receipt.Blocked):receipt.validate(data)
        data=fake_report()
        data["storage_lexical_statement_indicator_counts"]["storage_policy_select"]=2
        with self.assertRaises(receipt.Blocked):receipt.validate(data)
        data=fake_report()
        data["first_r111_priority_storage_review_items"][1]["r111_priority_index"]=1
        with self.assertRaises(receipt.Blocked):receipt.validate(data)
    def test_duplicate_json_nan_and_valid_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"invented-sanitized.json"
            path.write_text(json.dumps(fake_report()))
            self.assertTrue(receipt.validate(receipt.read_sanitized(path))["sanitized_r216_receipt_valid"])
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(receipt.Blocked):receipt.read_sanitized(path)
            path.write_text('{"test":NaN}')
            with self.assertRaises(receipt.Blocked):receipt.read_sanitized(path)

class PrivatePolicyTests(unittest.TestCase):
    def test_lexical_policy_shape_and_safe_uncertainty(self):
        examples=(
            ("CREATE POLICY invented ON storage.objects FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND bucket_id = 'fictional')",
             {"storage_policy_create","storage_policy_role_authenticated_word",
              "storage_policy_as_permissive_or_default_word","storage_policy_bucket_id_word",
              "storage_policy_direct_uid_or_jwt_word"}),
            ("CREATE POLICY invented ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (owner_id = auth.uid()::text)",
             {"storage_policy_as_restrictive_word","storage_policy_role_anon_word",
              "storage_policy_role_authenticated_word","storage_policy_owner_id_word"}),
            ("CREATE POLICY invented ON storage.objects FOR SELECT USING (TRUE)",
             {"storage_policy_role_unspecified_word","storage_policy_using_literal_true_word"}),
            ("ALTER POLICY invented ON storage.objects TO PUBLIC USING (some_helper())",
             {"storage_policy_alter","storage_policy_role_public_word"}),
            ("DROP POLICY invented ON storage.objects",
             {"storage_policy_drop","storage_policy_role_unspecified_word"}),
            ("CREATE POLICY invented ON storage.objects FOR SELECT USING (storage.allow_only_operation('object.list') AND is_campaign_member(id))",
             {"storage_policy_storage_operation_helper_word","storage_policy_campaign_guard_helper_word"}),
        )
        for query,want in examples:
            with self.subTest(query=query[:26]):
                self.assertTrue(want.issubset(set(policy.shape(query))))
        self.assertEqual(policy.shape(
            "CREATE POLICY unrelated ON public.fake FOR SELECT USING (TRUE)"),())
    def test_fictional_83_history_and_no_sql_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);fixture.fixture(root)
            append_sql(root,1,
                "CREATE POLICY invented ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fake' AND auth.uid() IS NOT NULL);")
            append_sql(root,3,
                "CREATE POLICY invented2 ON storage.objects AS RESTRICTIVE FOR INSERT WITH CHECK (owner_id = auth.uid()::text);")
            append_sql(root,28,
                "DROP POLICY invented3 ON storage.objects;")
            out=policy.report(root)
            self.assertEqual(out["decision"],"NO_GO")
            self.assertEqual(out["original_migrations_sha256_reverified"],83)
            self.assertEqual(out["storage_policy_statements_reconciled"],3)
            self.assertEqual(out["storage_policy_lexical_statement_counts"]["storage_policy_create"],2)
            self.assertEqual(out["storage_policy_lexical_statement_counts"]["storage_policy_drop"],1)
            self.assertFalse(out["qa_sql_install_authorized"])
            self.assertFalse(out["role_policy_semantics_and_permissive_composition_verified"])
            numbers=[a["r111_priority_index"] for a in out["first_r111_priority_storage_policy_review_items"]]
            self.assertEqual(numbers,sorted(numbers))
            self.assertTrue({2,4,29}.issubset(set(numbers)))
            serialized=json.dumps(out)
            for secret in ("invented2","owner_id =","bucket_id =","sourceBodySha256",
                           "r111-private-review-docket","storage.objects"):
                self.assertNotIn(secret,serialized)
    def test_mutated_source_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=fixture.fixture(root)
            first=next(folder.glob("*.sql"))
            first.write_text(first.read_text()+"\n--tampered")
            with self.assertRaises(original.AuditBlocked):policy.report(root)

if __name__=="__main__":unittest.main()
