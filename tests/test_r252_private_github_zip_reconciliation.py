"""R252 tests use 83 invented SQL files and invented GitHub ZIP only."""
from __future__ import annotations
import hashlib
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'release'))
import r249_prepare_private_source_review as r249
import r252_verify_private_github_zip as gate


class FakePrivateZip(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'private-owner'
        self.root.mkdir(mode=0o700)
        self.folder = self.root / 'r106-original-83-recovery' / 'supabase' / 'migrations'
        self.folder.mkdir(parents=True)
        self.items = []
        self.total_bytes = 0
        for i in range(83):
            name = f'fictional_{i:03d}.sql'
            data = f'SELECT {i}::integer; -- invented content only\n'.encode('utf-8')
            (self.folder / name).write_bytes(data)
            self.items.append({'filename': name, 'sourceBodySha256': hashlib.sha256(data).hexdigest(), 'securityApproved': False})
            self.total_bytes += len(data)
        self.save_docket()
        self.zip_path = self.root / 'private-source-review.zip'
        self.zip_content = {f'privttrpg-review-original-83-source-2026-11-23/original-migrations/{x["filename"]}':
                            (self.folder/x['filename']).read_bytes() for x in self.items}
        self.zip_content['privttrpg-review-original-83-source-2026-11-23/README.md'] = b'private repo documentation\n'
        self.save_zip()

    def save_docket(self):
        import json
        (self.root/'r111-private-review-docket.json').write_text(json.dumps({
            'workPackage': 'B10-R18-111', 'decision': 'NO_GO', 'reviewItems': self.items}))

    def save_zip(self):
        with zipfile.ZipFile(self.zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in self.zip_content.items():
                archive.writestr(name, data)
        self.zip_path.chmod(0o600)

    def compare(self):
        with patch.object(gate, 'BYTES', self.total_bytes), patch.object(r249, 'EXPECTED_SOURCE_BYTES', self.total_bytes):
            return gate.compare(self.root, self.zip_path)

    def test_exact_83_fictional_sha256_match_no_sql_executed(self):
        result = self.compare()
        self.assertEqual(result['private_github_zip_sql_files_sha256_matched'], 83)
        self.assertEqual(result['private_github_zip_sql_bytes_sha256_matched'], self.total_bytes)
        self.assertEqual(result['decision'], 'NO_GO')
        self.assertFalse(result['source_proven_free_of_sensitive_content'])
        self.assertFalse(result['network_database_or_sql_execution_performed'])
        self.assertNotIn('fictional_001.sql', str(result))

    def test_zip_sql_one_byte_change_rejected(self):
        key = next(iter(self.zip_content))
        self.zip_content[key] = self.zip_content[key] + b'!'
        self.save_zip()
        with self.assertRaises(gate.Blocked): self.compare()

    def test_zip_missing_one_sql_rejected(self):
        self.zip_content.pop(next(iter(self.zip_content)))
        self.save_zip()
        with self.assertRaises(gate.Blocked): self.compare()

    def test_zip_additional_sql_outside_folder_rejected(self):
        self.zip_content['privttrpg-review-original-83-source-2026-11-23/leak.sql'] = b'SELECT 1;'
        self.save_zip()
        with self.assertRaises(gate.Blocked): self.compare()

    def test_zip_wrong_repo_root_rejected(self):
        self.zip_content = {k.replace('privttrpg-', 'otherrepo-'): v for k,v in self.zip_content.items()}
        self.save_zip()
        with self.assertRaises(gate.Blocked): self.compare()

    def test_zip_traversal_path_rejected(self):
        self.zip_content['privttrpg-review-original-83-source-2026-11-23/../secrets.txt'] = b'INVALID'
        self.save_zip()
        with self.assertRaises(gate.Blocked): self.compare()

    def test_zip_duplicate_entry_rejected(self):
        self.save_zip()
        with zipfile.ZipFile(self.zip_path, 'a') as archive:
            key = next(iter(self.zip_content))
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                archive.writestr(key, b'SELECT 999;')
        with self.assertRaises(gate.Blocked): self.compare()

    def test_local_private_docket_tamper_rejected(self):
        self.items[0]['sourceBodySha256'] = 'f'*64
        self.save_docket()
        with self.assertRaises(gate.r248.Blocked): self.compare()

    def test_zip_symlink_rejected(self):
        bad = 'privttrpg-review-original-83-source-2026-11-23/docs/link.txt'
        with zipfile.ZipFile(self.zip_path, 'a') as archive:
            info = zipfile.ZipInfo(bad)
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, 'local-secret')
        with self.assertRaises(gate.Blocked): self.compare()


if __name__ == '__main__':
    unittest.main()
