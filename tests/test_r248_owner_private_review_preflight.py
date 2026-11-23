"""R248: fabricated-only source integrity tests; no real private migration data."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'release'))
import r248_owner_private_review_preflight as preflight


class TestSourcePreflight(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'owner-only'
        self.root.mkdir(mode=0o700)
        self.folder = self.root / 'r106-original-83-recovery' / 'supabase' / 'migrations'
        self.folder.mkdir(parents=True)
        self.items = []
        for i in range(83):
            name = f'fictional_{i:03d}.sql'
            raw = f'SELECT {i}; -- fictional, not an actual owner migration\n'.encode()
            (self.folder / name).write_bytes(raw)
            self.items.append({
                'filename': name,
                'sourceBodySha256': hashlib.sha256(raw).hexdigest(),
                'securityApproved': False,
            })
        self.save_docket()

    def save_docket(self):
        (self.root / 'r111-private-review-docket.json').write_text(json.dumps({
            'workPackage': 'B10-R18-111',
            'decision': 'NO_GO',
            'reviewItems': self.items,
        }))

    def test_83_fictional_hashes_do_not_approve_upload(self):
        result = preflight.inspect(self.root)
        self.assertEqual(result['original_migrations_sha256_verified'], 83)
        self.assertEqual(result['decision'], 'NO_GO')
        self.assertFalse(result['private_sql_upload_authorized'])
        self.assertFalse(result['private_source_review_completed'])
        self.assertNotIn('fictional_001', str(result))

    def test_signal_counts_never_expose_secret_candidate(self):
        name = self.items[0]['filename']
        fake = 'sb_' + 'secret_' + 'FICTIONALNEVERVALID0123456789'
        raw = f"SELECT '{fake}'; INSERT INTO auth.users VALUES (1);".encode()
        (self.folder / name).write_bytes(raw)
        self.items[0]['sourceBodySha256'] = hashlib.sha256(raw).hexdigest()
        self.save_docket()
        result = preflight.inspect(self.root)
        hits = result['potential_sensitive_or_data_effect_file_counts']
        self.assertEqual(hits['supabase_secret_key_literal'], 1)
        self.assertEqual(hits['auth_schema_data_write_word'], 1)
        self.assertNotIn(fake, str(result))

    def test_tampered_content_rejected(self):
        (self.folder / self.items[0]['filename']).write_text('SELECT 999')
        with self.assertRaises(preflight.Blocked):
            preflight.inspect(self.root)

    def test_unknown_extra_entry_rejected(self):
        (self.folder / 'extra.sql').write_text('SELECT 1')
        with self.assertRaises(preflight.Blocked):
            preflight.inspect(self.root)

    def test_symbolic_link_rejected(self):
        first = self.folder / self.items[0]['filename']
        first.unlink()
        first.symlink_to(self.folder / self.items[1]['filename'])
        with self.assertRaises((OSError, preflight.Blocked)):
            preflight.inspect(self.root)

    def test_hard_link_rejected(self):
        first = self.folder / self.items[0]['filename']
        os.link(first, self.folder.parent / 'other-link')
        with self.assertRaises(preflight.Blocked):
            preflight.inspect(self.root)

    def test_too_permissive_workspace_rejected(self):
        self.root.chmod(0o755)
        with self.assertRaises(preflight.Blocked):
            preflight.inspect(self.root)

    def test_duplicate_docket_key_rejected(self):
        (self.root / 'r111-private-review-docket.json').write_text(
            '{"workPackage":"B10-R18-111","workPackage":"B10-R18-111"}'
        )
        with self.assertRaises(preflight.Blocked):
            preflight.inspect(self.root)

    def test_false_security_approval_rejected(self):
        self.items[0]['securityApproved'] = True
        self.save_docket()
        with self.assertRaises(preflight.Blocked):
            preflight.inspect(self.root)


if __name__ == '__main__':
    unittest.main()
