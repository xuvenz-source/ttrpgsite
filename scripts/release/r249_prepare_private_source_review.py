#!/usr/bin/env python3
"""R249: prepare a private, local-only 83-source upload candidate, never upload.

Owner explicitly approved static review in xuvenz-source/privttrpg.
NO network/GitHub/SQL/subprocess calls. No source files, names, hashes, or
secrets are printed. Must run after the pinned R248 script in owner WSL.
A heuristic zero-hit result is NOT proof that source is free of secrets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys

import r248_owner_private_review_preflight as r248

WORK = 'B10-R18-249'
TARGET = 'xuvenz-source/privttrpg'
EXPECTED_SOURCE_BYTES = 710102  # R248 owner-private sanitized result
EXPECTED_COUNT = 83
MAX_REPORT_BYTES = 3072
DESTINATION = 'r249-private-upload-ready'

# Additional high-confidence secret/identity indicators; lexical only.
# Report only category counts, NEVER a match value or the source file name.
EXTRA_MARKERS = {
    'aws_access_key_shape': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'google_api_key_shape': re.compile(r'\bAIza[0-9A-Za-z_-]{35}\b'),
    'stripe_live_secret_shape': re.compile(r'\bsk_live_[A-Za-z0-9]{16,}\b'),
    'github_token_shape': re.compile(r'\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b'),
    'github_fine_grained_token_shape': re.compile(r'\bgithub_pat_[A-Za-z0-9_]{30,}\b'),
    'pem_private_key_shape': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'),
    'postgres_password_uri_shape': re.compile(r'\bpostgres(?:ql)?://[^\s:@]{1,64}:[^\s@]{3,}@[^\s;\'"]{3,}', re.I),
    'auth_user_seed_shape': re.compile(r'\b(?:INSERT\s+INTO|COPY)\s+(?:auth\.users|auth\.identities)\b', re.I),
    'storage_object_seed_shape': re.compile(r'\b(?:INSERT\s+INTO|COPY)\s+storage\.objects\b', re.I),
    'copy_from_stdin_shape': re.compile(r'\bCOPY\b[\s\S]{0,512}?\bFROM\s+STDIN\b', re.I),
}
# R248 signals that require blocking (not generic DML or storage schema
# changes: those are expected in migrations but still demand semantic review).
BLOCK_R248 = frozenset({
    'private_key_header',
    'supabase_secret_key_literal',
    'jwt_like_literal',
    'credential_assignment_word',
    'credential_uri_word',
    'email_like_word',
})


class Blocked(Exception):
    pass


def evaluate(root: Path):
    report = r248.inspect(root)
    if (report.get('decision') != 'NO_GO'
            or report.get('original_migrations_sha256_verified') != EXPECTED_COUNT
            or report.get('private_sql_bytes_checked_total') != EXPECTED_SOURCE_BYTES
            or report.get('private_sql_upload_authorized') is not False):
        raise Blocked('R248_INTEGRITY_OR_TOTAL_DRIFT')
    findings = report['potential_sensitive_or_data_effect_file_counts']
    if any(findings.get(key, -1) != 0 for key in BLOCK_R248):
        raise Blocked('R248_SENSITIVE_CONTENT_CANDIDATE')

    docket_raw = r248.bounded_regular_file(
        root / 'r111-private-review-docket.json', r248.MAX_DOCKET_BYTES)
    docket = json.loads(docket_raw.decode('utf-8'), object_pairs_hook=r248.pairs_unique)
    records = docket.get('reviewItems')
    if type(records) is not list or len(records) != EXPECTED_COUNT:
        raise Blocked('INVALID_DOCKET')
    folder = root
    for name in ('r106-original-83-recovery', 'supabase', 'migrations'):
        folder = r248.checked_directory(folder / name)

    candidates = []
    total = 0
    for record in records:
        name = record['filename']
        data = r248.bounded_regular_file(folder / name, r248.MAX_SQL_BYTES)
        if hashlib.sha256(data).hexdigest() != record['sourceBodySha256']:
            raise Blocked('SOURCE_DRIFT')
        sql = data.decode('utf-8')
        if '\x00' in sql:
            raise Blocked('NUL_IN_SQL')
        if any(marker.search(sql) for marker in EXTRA_MARKERS.values()):
            raise Blocked('SENSITIVE_CONTENT_CANDIDATE')
        total += len(data)
        candidates.append((name, data))
    if len(candidates) != EXPECTED_COUNT or total != EXPECTED_SOURCE_BYTES:
        raise Blocked('SOURCE_COUNT_OR_BYTES_DRIFT')
    return candidates, {
        'work_package': WORK,
        'decision': 'NO_GO',
        'operation': 'OWNER_LOCAL_PRIVATE_REVIEW_TRANSFER_PREPARATION',
        'destination_repository': TARGET,
        'source_migrations_verified': EXPECTED_COUNT,
        'source_bytes_verified': total,
        'blocking_credential_identity_literal_signals': 0,
        'possible_data_write_files': findings['generic_data_write_word'],
        'possible_storage_data_write_files': findings['storage_schema_data_write_word'],
        'sensitive_content_absence_proven': False,
        'static_semantic_review_completed': False,
        'original_sql_executed': False,
        'network_or_database_accessed': False,
        'private_sql_uploaded_by_script': False,
        'private_sql_names_hashes_or_contents_printed': False,
    }


def prepare(root: Path, candidates):
    # The destination is deliberately outside all Git repos, in owner WSL.
    # Never overwrite any existing candidate directory.
    destination = root / DESTINATION
    if destination.exists() or destination.is_symlink():
        raise Blocked('CANDIDATE_ALREADY_EXISTS')
    try:
        destination.mkdir(mode=0o700)
        if stat.S_IMODE(destination.stat().st_mode) & 0o077:
            raise Blocked('UNSAFE_OUTPUT_PERMISSIONS')
        for name, data in candidates:
            if not r248.NAME_RE.fullmatch(name):
                raise Blocked('INVALID_SQL_NAME')
            fd = os.open(destination / name, os.O_WRONLY | os.O_CREAT |
                         os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(data)
        actual = tuple(destination.iterdir())
        if len(actual) != EXPECTED_COUNT or any(p.suffix != '.sql' for p in actual):
            raise Blocked('OUTPUT_INCOMPLETE')
        for name, raw in candidates:
            copied = r248.bounded_regular_file(destination / name, r248.MAX_SQL_BYTES)
            if copied != raw:
                raise Blocked('COPY_VERIFICATION_FAILED')
        return destination
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise


def main():
    p = argparse.ArgumentParser(description='R249 offline owner-only private source upload preflight')
    p.add_argument('--root', type=Path, default=Path.home()/'ttrpg-history-private')
    p.add_argument('--prepare', action='store_true', help='make an offline copy of vetted SQL sources')
    args = p.parse_args()
    try:
        root = r248.checked_directory(args.root, owner_private=True)
        candidates, summary = evaluate(root)
        if args.prepare:
            prepare(root, candidates)
        summary['offline_candidate_directory_prepared'] = bool(args.prepare)
        summary['next_manual_step'] = ('OPEN_LOCAL_CANDIDATE_FOLDER_AND_UPLOAD_ONLY_83_SQL_TO_PRIVATE_REPO'
                                       if args.prepare else 'RUN_WITH_PREPARE_AFTER_REVIEW')
        encoded = json.dumps(summary, indent=2, sort_keys=True)
        if len(encoded.encode('utf-8')) > MAX_REPORT_BYTES:
            raise Blocked('REPORT_TOO_LARGE')
        print(encoded)
        return 0
    except Exception:
        # NEVER print source names, file paths, values, URLs, or OS exceptions.
        print('R249_BLOCKED_NO_GO: offline source inspection or safe candidate preparation failed; nothing uploaded.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
