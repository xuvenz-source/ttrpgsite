#!/usr/bin/env python3
"""R248: offline, owner-local NO_GO preflight of original 83 SQL archive.

Reads only the immutable private R111 docket and recovered SQL migration bytes.
Never exports private SQL, names, versions, hashes, values, credentials or paths;
never executes SQL/commands, writes files, or opens network/database sockets.
Conservative lexical markers are NOT a completeness or safety assessment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

WORK = 'B10-R18-248'
EXPECTED = 83
MAX_SQL_BYTES = 12 * 1024 * 1024
MAX_DOCKET_BYTES = 1024 * 1024
MAX_REPORT_BYTES = 4096
NAME_RE = re.compile(r'[A-Za-z0-9_-]+\.sql\Z', re.ASCII)
HASH_RE = re.compile(r'[a-f0-9]{64}\Z', re.ASCII)

# These indicators can match SQL comments, sample strings or legitimate
# migration logic. Any count requires human investigation; zero is NOT clearance.
SIGNALS = {
    'private_key_header': re.compile(r'-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----', re.I),
    'supabase_secret_key_literal': re.compile(r'\bsb_secret_[A-Za-z0-9_-]{10,}', re.I),
    'jwt_like_literal': re.compile(r'\beyJ[A-Za-z0-9_-]{16,}\.eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}', re.I),
    'credential_assignment_word': re.compile(r'''\\b(?:password|api[_-]?key|service[_-]?role|secret|token|client[_-]?secret)\\b\\s*(?::=|=|:)\\s*['"]?[A-Za-z0-9_-]{8,}'''.replace('\\\\', '\\'), re.I),
    'credential_uri_word': re.compile(r'''\\b(?:postgres(?:ql)?|https?)://[^\\s'"<>@:/]{1,64}:[^\\s'"<>@]{3,}@'''.replace('\\\\', '\\'), re.I),
    'email_like_word': re.compile(r'\b[A-Za-z0-9._%+-]{2,64}@[A-Za-z0-9.-]{2,80}\.[A-Za-z]{2,16}\b'),
    'auth_schema_data_write_word': re.compile(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|COPY|TRUNCATE)\s+auth\s*\.', re.I),
    'storage_schema_data_write_word': re.compile(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|COPY|TRUNCATE)\s+storage\s*\.', re.I),
    'generic_data_write_word': re.compile(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|COPY|TRUNCATE)\b', re.I),
}

class Blocked(Exception):
    pass


def pairs_unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Blocked('DUPLICATE_DOCKET_KEY')
        result[key] = value
    return result


def checked_directory(path: Path, *, owner_private=False):
    details = path.lstat()
    if not stat.S_ISDIR(details.st_mode) or details.st_uid != os.getuid():
        raise Blocked('NOT_OWNER_DIRECTORY')
    if owner_private and stat.S_IMODE(details.st_mode) & 0o077:
        raise Blocked('ROOT_PERMISSIONS_TOO_BROAD')
    return path


def bounded_regular_file(path: Path, max_bytes: int):
    # Open without following a symlink, then inspect the actual descriptor.
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        meta = os.fstat(descriptor)
        if (not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid() or
                meta.st_nlink != 1 or not 1 <= meta.st_size <= max_bytes):
            raise Blocked('INVALID_OWNER_FILE')
        with os.fdopen(os.dup(descriptor), 'rb', closefd=True) as handle:
            raw = handle.read(max_bytes + 1)
        if len(raw) != meta.st_size:
            raise Blocked('CHANGED_OR_OVERSIZE_FILE')
        return raw
    finally:
        os.close(descriptor)


def inspect(root: Path):
    checked_directory(root, owner_private=True)
    docket_raw = bounded_regular_file(root / 'r111-private-review-docket.json', MAX_DOCKET_BYTES)
    docket = json.loads(docket_raw.decode('utf-8'), object_pairs_hook=pairs_unique)
    if type(docket) is not dict or docket.get('workPackage') != 'B10-R18-111' or docket.get('decision') != 'NO_GO':
        raise Blocked('UNEXPECTED_PRIVATE_DOCKET')
    items = docket.get('reviewItems')
    if type(items) is not list or len(items) != EXPECTED:
        raise Blocked('EXPECTED_83_DOCKET_ITEMS')
    folder = root
    for sub in ('r106-original-83-recovery', 'supabase', 'migrations'):
        folder = checked_directory(folder / sub)
    entries = list(folder.iterdir())
    # Even an unexpected auxiliary file/symlink blocks; no unknown data is read.
    if len(entries) != EXPECTED:
        raise Blocked('ARCHIVE_ENTRY_COUNT_DRIFT')
    entry_names = set()
    for item in entries:
        if not NAME_RE.fullmatch(item.name) or item.name in entry_names:
            raise Blocked('UNEXPECTED_ARCHIVE_ENTRY')
        entry_names.add(item.name)
    seen = set()
    signal_file_counts = {key: 0 for key in SIGNALS}
    total_bytes = 0
    for record in items:
        if type(record) is not dict or record.get('securityApproved') is True:
            raise Blocked('DOCKET_NOT_NO_GO')
        name = record.get('filename')
        expected_hash = record.get('sourceBodySha256')
        if (type(name) is not str or not NAME_RE.fullmatch(name) or
                type(expected_hash) is not str or not HASH_RE.fullmatch(expected_hash) or
                name in seen or name not in entry_names):
            raise Blocked('DOCKET_ARCHIVE_MISMATCH')
        seen.add(name)
        raw = bounded_regular_file(folder / name, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != expected_hash:
            raise Blocked('ORIGINAL_SHA_CHANGED')
        total_bytes += len(raw)
        sql = raw.decode('utf-8')
        for label, pattern in SIGNALS.items():
            if pattern.search(sql) is not None:
                signal_file_counts[label] += 1
    if seen != entry_names:
        raise Blocked('UNEXPECTED_ARCHIVE_FILENAMES')
    return {
        'work_package': WORK,
        'decision': 'NO_GO',
        'phase': 'OWNER_WSL_OFFLINE_SOURCE_INTEGRITY_AND_LEXICAL_SIGNALS',
        'original_migrations_sha256_verified': EXPECTED,
        'private_sql_bytes_checked_total': total_bytes,
        'potential_sensitive_or_data_effect_file_counts': signal_file_counts,
        'private_source_review_completed': False,
        'potential_sensitive_content_fully_excluded': False,
        'private_sql_upload_authorized': False,
        'original_sql_executed': False,
        'database_or_network_accessed': False,
        'private_sql_names_paths_hashes_values_and_credentials_exported': False,
        'next_gate': 'REVIEW_SANITIZED_REPORT_THEN_REQUEST_EXPLICIT_OWNER_AUTHORIZATION',
    }


def main():
    parser = argparse.ArgumentParser(description='R248 owner-private read-only archive preflight')
    parser.add_argument('--root', type=Path, default=Path.home() / 'ttrpg-history-private')
    args = parser.parse_args()
    try:
        result = inspect(args.root)
        serialized = json.dumps(result, sort_keys=True, indent=2)
        if len(serialized.encode('utf-8')) > MAX_REPORT_BYTES:
            raise Blocked('BOUNDED_REPORT')
        print(serialized)
        return 0
    except (Blocked, OSError, UnicodeError, ValueError, TypeError, KeyError, OverflowError):
        # No raw exception details: OS and parser exceptions can expose owner paths.
        print('R248_PRIVATE_PREFLIGHT_BLOCKED_NO_GO: local source/docket validation failed; no SQL has been exported.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
