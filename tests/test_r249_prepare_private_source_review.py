"""R249 invented-only tests: never load original SQL or owner-private data."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'release'))
import r249_prepare_private_source_review as gate


class FakeSource(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name) / 'owner'
        self.root.mkdir(mode=0o700)
        self.folder = self.root / 'r106-original-83-recovery' / 'supabase' / 'migrations'
        self.folder.mkdir(parents=True)
        self.records = []
        self.total = 0
        for index in range(83):
            name = f'fictional_{index:03d}.sql'
            raw = f'SELECT {index}; -- fictional source\n'.encode()
            (self.folder / name).write_bytes(raw)
            self.total += len(raw)
            self.records.append({
                'filename': name,
                'sourceBodySha256': hashlib.sha256(raw).hexdigest(),
                'securityApproved': False,
            })
        self.write_docket()

    def write_docket(self):
        (self.root/'r111-private-review-docket.json').write_text(json.dumps({
            'workPackage': 'B10-R18-111',
            'decision': 'NO_GO',
            'reviewItems': self.records,
        }))

    def alter_first(self, sql):
        source = self.folder / self.records[0]['filename']
        raw = sql.encode()
        previous = source.read_bytes()
        source.write_bytes(raw)
        self.total += len(raw) - len(previous)
        self.records[0]['sourceBodySha256'] = hashlib.sha256(raw).hexdigest()
        self.write_docket()

    def evaluate(self):
        with patch.object(gate, 'EXPECTED_SOURCE_BYTES', self.total):
            return gate.evaluate(self.root)

    def prepare(self, candidates):
        return gate.prepare(self.root, candidates)

    def test_fictional_archive_prepares_exactly_83(self):
        candidates, report = self.evaluate()
        self.assertEqual(report['decision'], 'NO_GO')
        self.assertFalse(report['sensitive_content_absence_proven'])
        self.assertFalse(report['private_sql_uploaded_by_script'])
        self.assertNotIn('fictional_001', str(report))
        destination = self.prepare(candidates)
        self.assertEqual(len(list(destination.iterdir())), 83)
        for item in destination.iterdir():
            self.assertEqual(stat.S_IMODE(item.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o700)

    def test_reject_credential_assignment(self):
        self.alter_first("SELECT 'password = fake_example_credential_123';")
        with self.assertRaises(gate.Blocked):
            self.evaluate()

    def test_reject_seeded_auth_user(self):
        self.alter_first("INSERT INTO auth.users VALUES ('a');")
        with self.assertRaises(gate.Blocked):
            self.evaluate()

    def test_reject_seeded_storage_object(self):
        self.alter_first("INSERT INTO storage.objects (name) VALUES ('a');")
        with self.assertRaises(gate.Blocked):
            self.evaluate()

    def test_reject_known_access_key_shape(self):
        self.alter_first("SELECT 'AKIA0000000000000000';")
        with self.assertRaises(gate.Blocked):
            self.evaluate()

    def test_reject_tampered_source(self):
        (self.folder / self.records[0]['filename']).write_text('SELECT 999;')
        with self.assertRaises(gate.r248.Blocked):
            self.evaluate()

    def test_reject_existing_destination_without_overwrite(self):
        candidates, _ = self.evaluate()
        dest = self.root / gate.DESTINATION
        dest.mkdir()
        (dest / 'marker').write_text('do-not-overwrite')
        with self.assertRaises(gate.Blocked):
            self.prepare(candidates)
        self.assertEqual((dest / 'marker').read_text(), 'do-not-overwrite')

    def test_reject_symlink_in_docket(self):
        docket = self.root / 'r111-private-review-docket.json'
        contents = docket.read_text()
        docket.unlink()
        mirror = self.root / 'mirror'
        mirror.write_text(contents)
        docket.symlink_to(mirror)
        with self.assertRaises(OSError):
            self.evaluate()


if __name__ == '__main__':
    unittest.main()
