"""R218 fictional policy history only; no original SQL, docket or report in CI."""
from __future__ import annotations
import hashlib,importlib.util,json,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
import r154_private_history_audit as baseline
import r218_validate_owner_r217_receipt as receipt
import r218_private_storage_policy_lifecycle as audit

spec=importlib.util.spec_from_file_location("fake_r193",ROOT/"tests/world-v2-r18-193-private-invite-source-lineage.test.py")
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

def append(root,index,sql):
    docket_path=root/"r111-private-review-docket.json"
    d=json.loads(docket_path.read_text())
    item=d["reviewItems"][index]
    path=root/"r106-original-83-recovery"/"supabase"/"migrations"/item["filename"]
    body=path.read_text()+"\n"+sql+"\n"
    path.write_text(body)
    item["sourceBodySha256"]=hashlib.sha256(body.encode()).hexdigest()
    docket_path.write_text(json.dumps(d))

def mock_receipt():
    counts={x:0 for x in receipt.CODES}
    file_counts={x:0 for x in receipt.CODES}
    a=["storage_policy_create","storage_policy_as_permissive_or_default_word","storage_policy_bucket_id_word"]
    b=["storage_policy_drop","storage_policy_as_permissive_or_default_word","storage_policy_role_unspecified_word"]
    for row in (a,b):
        for key in row:
            counts[key]+=1
            file_counts[key]+=1
    return {
       **receipt.FIXED,**receipt.GUARDS,
       "original_migrations_sha256_reverified":83,
       "top_level_statements_reconciled":937,
       "storage_policy_statements_reconciled":2,
       "storage_policy_lexical_statement_counts":counts,
       "storage_policy_lexical_file_counts":file_counts,
       "storage_policy_review_file_count":2,
       "first_r111_priority_storage_policy_review_items":[
           {"r111_priority_index":2,"storage_policy_shape_codes":sorted(a)},
           {"r111_priority_index":50,"storage_policy_shape_codes":sorted(b)}
       ],
       "priority_review_items_truncated":False,
       "limitations":receipt.LIMITS[:],
    }

class ReceiptTests(unittest.TestCase):
    def test_sanitized_only_no_go(self):
        result=receipt.validate(mock_receipt())
        self.assertEqual(result["decision"],"NO_GO")
        self.assertTrue(result["r217_sanitized_receipt_valid"])
        self.assertFalse(result["qa_sql_install_authorized"])
    def test_forged_privileges_and_count_drift(self):
        for k,bad in (
            ("decision","GO"),("qa_sql_install_authorized",True),
            ("no_sql_executed",False),
            ("original_migrations_sha256_reverified",True),
            ("storage_policy_statements_reconciled",2.0),
        ):
            with self.subTest(key=k):
                sample=mock_receipt();sample[k]=bad
                with self.assertRaises(receipt.Blocked):receipt.validate(sample)
        x=mock_receipt();x["raw_sql"]="CREATE POLICY private"
        with self.assertRaises(receipt.Blocked):receipt.validate(x)
        x=mock_receipt()
        x["storage_policy_lexical_statement_counts"]["storage_policy_create"]=2
        with self.assertRaises(receipt.Blocked):receipt.validate(x)
    def test_duplicate_json_and_nan(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"mock.json"
            path.write_text(json.dumps(mock_receipt()))
            self.assertTrue(receipt.validate(receipt.load(path))["r217_sanitized_receipt_valid"])
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(receipt.Blocked):receipt.load(path)
            path.write_text('{"decision":NaN}')
            with self.assertRaises(receipt.Blocked):receipt.load(path)

class PolicyLifecycleTests(unittest.TestCase):
    def test_parse_quoted_identifiers_and_roles(self):
        x=audit.parse_policy('CREATE POLICY "My Policy" ON "storage"."objects" FOR SELECT TO authenticated USING (true)')
        self.assertEqual(x[0],"CREATE")
        self.assertEqual(x[1],("storage","objects","My Policy"))
        y=audit.scope(x[2])
        self.assertEqual(y[0],{"SELECT"})
        self.assertEqual(y[1],{"authenticated"})
        self.assertFalse(y[2])
        z=audit.scope(" AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (true)")
        self.assertTrue(z[2])
        self.assertEqual(z[0],{"INSERT"})
        self.assertEqual(z[1],{"anon"})
    def test_fictional_policy_replacement_and_overlap_flagged_no_go(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);fictional.fixture(root)
            append(root,0,"""
CREATE POLICY invented_private_alpha ON storage.objects FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY invented_private_beta ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invented');
DROP POLICY invented_private_alpha ON storage.objects;
CREATE POLICY invented_private_alpha ON storage.objects FOR SELECT TO authenticated USING (true);
CREATE POLICY invented_private_beta ON storage.objects FOR SELECT TO authenticated USING (true);
DROP POLICY missing_private_policy ON storage.objects;
ALTER POLICY missing_private_policy ON storage.objects TO authenticated USING (true);
""")
            result=audit.report(root)
            self.assertEqual(result["decision"],"NO_GO")
            self.assertEqual(result["original_migrations_sha256_reverified"],83)
            self.assertEqual(result["historical_policy_create_statements"],4)
            self.assertEqual(result["historical_policy_drop_statements"],2)
            self.assertEqual(result["storage_policy_statements_reconciled"],7)
            self.assertGreaterEqual(result["fixed_review_event_counts"]["recreated_after_drop"],1)
            self.assertGreaterEqual(result["fixed_review_event_counts"]["drop_without_prior_archive_create"],1)
            self.assertGreaterEqual(result["fixed_review_event_counts"]["duplicate_create_before_drop"],1)
            self.assertGreaterEqual(result["fixed_review_event_counts"]["possible_permissive_policy_overlap"],1)
            self.assertFalse(result["effective_permissive_rls_composition_verified"])
            self.assertFalse(result["qa_sql_install_authorized"])
            out=json.dumps(result)
            for forbidden in ("invented_private_alpha","invented_private_beta","missing_private_policy",
                              "storage.objects","sourceBodySha256","r111-private-review-docket"):
                self.assertNotIn(forbidden,out)
    def test_different_roles_not_counted_as_overlap(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);fictional.fixture(root)
            append(root,0,"""
CREATE POLICY invented_alpha ON storage.objects FOR SELECT TO anon USING (true);
CREATE POLICY invented_beta ON storage.objects FOR SELECT TO authenticated USING (true);
""")
            result=audit.report(root)
            self.assertEqual(result["possible_permissive_overlap_target_count"],0)
    def test_sha_change_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=fictional.fixture(root)
            source=next(folder.glob("*.sql"))
            source.write_text(source.read_text()+"\n-- tamper")
            with self.assertRaises(baseline.AuditBlocked):audit.report(root)

if __name__=="__main__":unittest.main()
