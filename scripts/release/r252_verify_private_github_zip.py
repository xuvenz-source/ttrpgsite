#!/usr/bin/env python3
"""R252: offline, no-extraction, 83-source private GitHub ZIP integrity check.

Owner downloads ZIP independently from the private original-source branch.
Compare every ZIP SQL byte stream to locally SHA256-verified original R111
docket, without exporting SQL text, paths, filenames, hashes or secrets.
No git CLI, network, subprocess, database, SQL execution or uploads.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

import r248_owner_private_review_preflight as r248
import r249_prepare_private_source_review as r249

WORK = 'B10-R18-252'
COUNT = 83
BYTES = 710102
MAX_ZIP_BYTES = 16 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024
MAX_ENTRIES = 160
MAX_REPORT_BYTES = 2600
BRANCH = 'review/original-83-source-2026-11-23'
REPO = 'xuvenz-source/privttrpg'


class Blocked(Exception):
    pass


def _zip_entries(zipstream):
    infos = zipstream.infolist()
    if len(infos) < COUNT or len(infos) > MAX_ENTRIES:
        raise Blocked('ARCHIVE_ENTRY_COUNT_INVALID')
    total = 0
    seen = set()
    prefix = None
    sql = {}
    for info in infos:
        path = info.filename
        if (not isinstance(path, str) or '\x00' in path or '\\' in path or
                path.startswith('/') or path.startswith('./') or
                any(component in ('', '.', '..') for component in path.rstrip('/').split('/')) or
                path in seen):
            raise Blocked('UNSAFE_OR_DUPLICATED_ZIP_PATH')
        seen.add(path)
        parts = PurePosixPath(path).parts
        if not parts or not re.fullmatch(r'privttrpg-[A-Za-z0-9._-]+', parts[0]):
            raise Blocked('INCORRECT_REPOSITORY_ZIP_ROOT')
        if prefix is None:
            prefix = parts[0]
        elif prefix != parts[0]:
            raise Blocked('MULTIPLE_ZIP_ROOTS')
        kind = stat.S_IFMT(info.external_attr >> 16)
        if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise Blocked('UNEXPECTED_ZIP_ENTRY_TYPE')
        if info.is_dir():
            continue
        if kind == stat.S_IFDIR:
            raise Blocked('DIRECTORY_LABELED_AS_FILE')
        if info.file_size < 0 or info.file_size > r248.MAX_SQL_BYTES:
            raise Blocked('EXCESSIVE_ZIP_ENTRY')
        total += info.file_size
        if total > MAX_UNCOMPRESSED_BYTES:
            raise Blocked('TOTAL_ZIP_EXPANSION_LIMIT')
        # Examine only the 83 scoped SQL files. Other repository files
        # are not opened, extracted, copied or interpreted.
        if path.endswith('.sql'):
            if len(parts) != 3 or parts[1] != 'original-migrations' or not r248.NAME_RE.fullmatch(parts[2]):
                raise Blocked('SQL_OUTSIDE_REVIEW_DIRECTORY')
            sql[parts[2]] = info
    if len(sql) != COUNT or len(set(sql)) != COUNT:
        raise Blocked('EXPECTED_83_ZIPPED_SQL')
    return sql


def compare(root: Path, zip_path: Path):
    root = r248.checked_directory(root, owner_private=True)
    baseline = r248.inspect(root)
    if (baseline.get('original_migrations_sha256_verified') != COUNT
            or baseline.get('private_sql_bytes_checked_total') != BYTES
            or baseline.get('decision') != 'NO_GO'):
        raise Blocked('OWNER_LOCAL_INTEGRITY_OR_TOTAL_DRIFT')
    # Re-run R249 high-confidence identity/credential indicator gate.
    _, sensitive_gate = r249.evaluate(root)
    if sensitive_gate.get('blocking_credential_identity_literal_signals') != 0:
        raise Blocked('SENSITIVE_SOURCE_GATE_FAILED')
    raw = r248.bounded_regular_file(zip_path, MAX_ZIP_BYTES)
    docket_raw = r248.bounded_regular_file(root/'r111-private-review-docket.json', r248.MAX_DOCKET_BYTES)
    docket = json.loads(docket_raw.decode('utf-8'), object_pairs_hook=r248.pairs_unique)
    if docket.get('workPackage') != 'B10-R18-111' or docket.get('decision') != 'NO_GO':
        raise Blocked('INVALID_OWNER_SOURCE_DOCKET')
    records = docket.get('reviewItems')
    if type(records) is not list or len(records) != COUNT:
        raise Blocked('INVALID_OWNER_SOURCE_COUNT')
    bytes_total = 0
    with zipfile.ZipFile(io.BytesIO(raw), 'r') as archive:
        sql_infos = _zip_entries(archive)
        for record in records:
            if type(record) is not dict:
                raise Blocked('INVALID_DOCKET_ITEM')
            name = record.get('filename')
            digest = record.get('sourceBodySha256')
            if (type(name) is not str or not r248.NAME_RE.fullmatch(name)
                    or type(digest) is not str or not r248.HASH_RE.fullmatch(digest)
                    or name not in sql_infos):
                raise Blocked('SOURCE_FILENAME_DIFFERENCE')
            info = sql_infos[name]
            data = archive.read(info)
            if len(data) != info.file_size or hashlib.sha256(data).hexdigest() != digest:
                raise Blocked('PRIVATE_GITHUB_SQL_SHA256_DIFFERENCE')
            bytes_total += len(data)
    if bytes_total != BYTES:
        raise Blocked('PRIVATE_GITHUB_TOTAL_BYTES_CHANGED')
    return {
        'work_package': WORK,
        'decision': 'NO_GO',
        'operation': 'OFFLINE_PRIVATE_GITHUB_ZIP_TO_ORIGINAL_DOCKET_SHA256_RECONCILIATION',
        'repository': REPO,
        'expected_source_branch': BRANCH,
        'owner_original_sha256_reverified': COUNT,
        'private_github_zip_sql_files_sha256_matched': COUNT,
        'private_github_zip_sql_bytes_sha256_matched': bytes_total,
        'credential_identity_gate_r249_rechecked': True,
        'private_sql_paths_contents_hashes_or_secrets_exported': False,
        'source_proven_free_of_sensitive_content': False,
        'all_sql_semantically_approved': False,
        'network_database_or_sql_execution_performed': False,
        'github_api_or_sql_upload_performed': False,
        'qa_prod_or_merge_approved': False,
    }


def main():
    parser = argparse.ArgumentParser(description='R252 owner-only offline remote ZIP integrity check')
    parser.add_argument('--root', type=Path, default=Path.home() / 'ttrpg-history-private')
    parser.add_argument('--zip', type=Path, required=True)
    args = parser.parse_args()
    try:
        result = compare(args.root, args.zip)
        output = json.dumps(result, sort_keys=True, indent=2)
        if len(output.encode('utf-8')) > MAX_REPORT_BYTES:
            raise Blocked('REPORT_SIZE_BOUND')
        print(output)
        return 0
    except Exception:
        print('R252_PRIVATE_REMOTE_ZIP_RECONCILIATION_BLOCKED_NO_GO: compare failed; never share the ZIP or original SQL.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
