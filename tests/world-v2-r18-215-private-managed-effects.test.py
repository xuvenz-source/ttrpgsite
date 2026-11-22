"""R215 uses only fictional 83-file migration histories and sanitized aggregates."""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/release'))
import r154_private_history_audit as previous
import r215_validate_owner_r214_receipt as receipts
import r215_private_managed_effect_scope as audit

spec=importlib.util.spec_from_file_location(
    'fake_r193',ROOT/'tests/world-v2-r18-193-private-invite-source-lineage.test.py')
fictional=importlib.util.module_from_spec(spec)
spec.loader.exec_module(fictional)

def append_fixture(root,index,statement):
    dpath=root/'r111-private-review-docket.json'
    docket=json.loads(dpath.read_text())
    item=docket['reviewItems'][index]
    path=root/'r106-original-83-recovery'/'supabase'/'migrations'/item['filename']
    contents=path.read_text()+'\n'+statement+'\n'
    path.write_text(contents)
    item['sourceBodySha256']=hashlib.sha256(contents.encode()).hexdigest()
    dpath.write_text(json.dumps(docket))

def r214_fabricated():
    counts={key:0 for key in receipts.COUNTS}
    counts.update(structural_statements=4,explicit_public_table_targets=4,
                  explicit_public_table_creates=1,explicit_public_table_references=3)
    return {
        'work_package':'B10-R18-214','decision':'NO_GO',
        'mode':'OWNER_PRIVATE_OFFLINE_QA_TABLE_TARGET_ORDER_TRIAGE',
        'original_migrations_sha256_reverified':83,
        'lexical_top_level_statements_reconciled':937,
        'structural_target_statement_counts':counts,
        'public_target_order_review_file_count':0,
        'first_r111_priority_order_review_indices':[],
        'priority_order_review_indices_truncated':False,
        **receipts.GUARDS,
        'limitations':list(receipts.LIMITS),
    }

class ReceiptTests(unittest.TestCase):
    def test_safe_sanitized_form(self):
        v=receipts.validate(r214_fabricated())
        self.assertTrue(v['sanitized_r214_receipt_valid'])
        self.assertEqual(v['decision'],'NO_GO')
        self.assertFalse(v['qa_sql_installation_authorized'])
    def test_forgery_and_inconsistency_rejected(self):
        for key,bad in (
            ('decision','GO'),('qa_sql_install_authorized',True),
            ('no_sql_executed',False),('original_migrations_sha256_reverified',True),
            ('lexical_top_level_statements_reconciled',937.0),
        ):
            with self.subTest(key=key):
                v=r214_fabricated();v[key]=bad
                with self.assertRaises(receipts.Blocked):receipts.validate(v)
        v=r214_fabricated();v['original_sql']='CREATE TABLE private.secret(id integer)'
        with self.assertRaises(receipts.Blocked):receipts.validate(v)
        v=r214_fabricated();v['structural_target_statement_counts']['explicit_public_table_creates']=2
        with self.assertRaises(receipts.Blocked):receipts.validate(v)
        v=r214_fabricated();v['first_r111_priority_order_review_indices']=[1]
        with self.assertRaises(receipts.Blocked):receipts.validate(v)
    def test_duplicate_json_and_nan_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'sanitized.json'
            path.write_text(json.dumps(r214_fabricated()))
            self.assertTrue(receipts.validate(receipts.load(path))['sanitized_r214_receipt_valid'])
            path.write_text('{"decision":"NO_GO","decision":"GO"}')
            with self.assertRaises(receipts.Blocked):receipts.load(path)
            path.write_text('{"decision":NaN}')
            with self.assertRaises(receipts.Blocked):receipts.load(path)

class ManagedEffectsTests(unittest.TestCase):
    def test_statement_category_detection(self):
        cases=(
          ('INSERT INTO storage.objects(id) VALUES(1)','managed_storage_direct_dml'),
          ('UPDATE auth.users SET email=email','managed_auth_direct_dml'),
          ('DELETE FROM storage.buckets WHERE id=0','managed_storage_direct_dml'),
          ('CREATE POLICY fake_policy ON storage.objects USING (true)','managed_storage_policy_target'),
          ('GRANT SELECT ON storage.objects TO authenticated','managed_schema_grant_or_revoke'),
          ('CREATE EXTENSION IF NOT EXISTS pg_net','extension_or_role_change'),
          ('ALTER PUBLICATION supabase_realtime ADD TABLE public.fake','publication_change'),
          ('DO $fake$ BEGIN NULL; END $fake$','opaque_do_block'),
        )
        for stmt,expected in cases:
            with self.subTest(code=expected):
                self.assertIn(expected,audit.statement_codes(stmt))
        self.assertNotIn('managed_auth_direct_dml', audit.statement_codes(
             "DO $fake$ BEGIN EXECUTE 'UPDATE auth.users SET id=id'; END $fake$"))
    def test_fictional_archive_is_private_and_priority_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            fictional.fixture(root)
            append_fixture(root,2,'INSERT INTO storage.objects(id) VALUES(1);')
            append_fixture(root,0,'CREATE POLICY fake ON storage.objects USING (TRUE);')
            append_fixture(root,12,'CREATE EXTENSION IF NOT EXISTS pg_net;')
            append_fixture(root,24,'DO $test$ BEGIN NULL; END $test$;')
            report=audit.report(root)
            self.assertEqual(report['decision'],'NO_GO')
            self.assertEqual(report['original_migrations_sha256_reverified'],83)
            self.assertEqual(report['managed_effect_lexical_statement_counts']['managed_storage_direct_dml'],1)
            indices=[row['r111_priority_index'] for row in report['first_r111_priority_order_managed_review_items']]
            self.assertEqual(indices,sorted(indices))
            self.assertIn(1,indices)
            self.assertFalse(report['qa_sql_install_authorized'])
            for private in ('fake_policy','storage.objects','r111-private-review-docket','pg_net','sourceBodySha256'):
                self.assertNotIn(private,json.dumps(report))
    def test_source_tamper_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);directory=fictional.fixture(root)
            path=next(directory.glob('*.sql'))
            path.write_text(path.read_text()+'\n--tampered')
            with self.assertRaises(previous.AuditBlocked):audit.report(root)

if __name__=='__main__':unittest.main()
