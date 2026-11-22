#!/usr/bin/env python3
"""R215 strict JSON-only verification of sanitized R214 owner preflight.

No access to original SQL, private docket, network, database or credentials.
A valid lexical report never implies approval to run migrations.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

FIELDS = {
    'work_package', 'decision', 'mode', 'original_migrations_sha256_reverified',
    'lexical_top_level_statements_reconciled', 'structural_target_statement_counts',
    'public_target_order_review_file_count', 'first_r111_priority_order_review_indices',
    'priority_order_review_indices_truncated', 'unknown_or_dynamic_dependencies_fully_parsed',
    'postgresql_parser_or_execution_used', 'all_83_migration_semantics_approved',
    'qa_sql_install_authorized', 'original_or_production_sql_authorized',
    'no_sql_executed', 'no_network_or_database_access',
    'private_migration_names_versions_sql_or_docket_exported', 'limitations',
}
COUNTS = (
    'structural_statements', 'structural_target_unparsed',
    'unqualified_table_targets', 'nonpublic_explicit_table_targets',
    'explicit_public_table_targets', 'explicit_public_table_creates',
    'explicit_public_table_references', 'explicit_public_table_drops',
    'duplicate_public_create_markers', 'public_target_without_earlier_archive_create',
)
GUARDS = {
    'unknown_or_dynamic_dependencies_fully_parsed': False,
    'postgresql_parser_or_execution_used': False,
    'all_83_migration_semantics_approved': False,
    'qa_sql_install_authorized': False,
    'original_or_production_sql_authorized': False,
    'no_sql_executed': True,
    'no_network_or_database_access': True,
    'private_migration_names_versions_sql_or_docket_exported': False,
}
LIMITS = [
    'Chronological regex table-target checks are conservative lexical indicators, not a PostgreSQL semantic or transitive dependency graph.',
    'Unqualified targets, renames, schema search_path, dynamic SQL, DO/function bodies, triggers, permissions, managed Auth/Storage objects and migration effects are not resolved.',
    'An earlier archived CREATE TABLE word does NOT prove QA installation is safe, and a missing earlier public CREATE is not proof of an exploit.',
    'All 83 original migrations and 67 live privileged graphs remain security NO_GO; owner must separately authorize an exact QA-only write plan.',
]
class Blocked(Exception): pass

def no_duplicates(pairs):
    d = {}
    for key, value in pairs:
        if key in d: raise Blocked('duplicate JSON key')
        d[key] = value
    return d

def bounded(value, limit):
    if type(value) is not int or not 0 <= value <= limit: raise Blocked('invalid numeric count')
    return value

def load(path: Path):
    if path.is_symlink() or not path.is_file() or not 1 <= path.stat().st_size <= 32768:
        raise Blocked('receipt not regular bounded file')
    return json.loads(path.read_text('utf-8'), object_pairs_hook=no_duplicates,
        parse_constant=lambda _: (_ for _ in ()).throw(Blocked('invalid number')))

def validate(d):
    if type(d) is not dict or set(d) != FIELDS: raise Blocked('unexpected or missing field')
    if (d['work_package'] != 'B10-R18-214' or d['decision'] != 'NO_GO'
        or d['mode'] != 'OWNER_PRIVATE_OFFLINE_QA_TABLE_TARGET_ORDER_TRIAGE'):
        raise Blocked('wrong report/source decision')
    for key, value in GUARDS.items():
        if type(d[key]) is not bool or d[key] is not value: raise Blocked('guard drift')
    if type(d['original_migrations_sha256_reverified']) is not int or d['original_migrations_sha256_reverified'] != 83:
        raise Blocked('historical source count drift')
    stmts = bounded(d['lexical_top_level_statements_reconciled'], 250000)
    counts = d['structural_target_statement_counts']
    if type(counts) is not dict or set(counts) != set(COUNTS): raise Blocked('count keys')
    for value in counts.values(): bounded(value, stmts)
    if counts['structural_statements'] != sum(counts[k] for k in (
        'structural_target_unparsed', 'unqualified_table_targets',
        'nonpublic_explicit_table_targets', 'explicit_public_table_targets')):
        raise Blocked('structural count mismatch')
    if counts['explicit_public_table_targets'] != sum(counts[k] for k in (
        'explicit_public_table_creates', 'explicit_public_table_references',
        'explicit_public_table_drops')):
        raise Blocked('public count mismatch')
    if counts['duplicate_public_create_markers'] > counts['explicit_public_table_creates']:
        raise Blocked('create count mismatch')
    if counts['public_target_without_earlier_archive_create'] > (
        counts['explicit_public_table_references'] + counts['explicit_public_table_drops']):
        raise Blocked('missing prior create count')
    flagged = bounded(d['public_target_order_review_file_count'], 83)
    ids = d['first_r111_priority_order_review_indices']
    truncated = d['priority_order_review_indices_truncated']
    if type(ids) is not list or type(truncated) is not bool or truncated != (flagged > 24):
        raise Blocked('priority selection malformed')
    if (len(ids) != min(flagged, 24) or
        any(type(idx) is not int or not 1 <= idx <= 83 for idx in ids) or
        ids != sorted(set(ids))):
        raise Blocked('priority IDs malformed')
    if type(d['limitations']) is not list or d['limitations'] != LIMITS:
        raise Blocked('disclaimer drift')
    return {
      'work_package': 'B10-R18-215', 'source_work_package':'B10-R18-214',
      'decision':'NO_GO', 'sanitized_r214_receipt_valid':True,
      'original_migrations_sha256_reverified':83,
      'lexical_statements_reconciled':stmts,
      'explicit_public_table_creations':counts['explicit_public_table_creates'],
      'explicit_public_table_references':counts['explicit_public_table_references'],
      'potential_public_table_order_review_files':flagged,
      'priority_list_complete':not truncated,
      'private_migration_semantics_approved':False,
      'qa_sql_installation_authorized':False,
      'production_write_authorized':False,
      'sql_or_network_executed':False,
    }

def main():
    parser = argparse.ArgumentParser(description='R215 sanitized R214 receipt verification only')
    parser.add_argument('sanitized_r214_json', type=Path)
    args=parser.parse_args()
    try:
        print(json.dumps(validate(load(args.sanitized_r214_json)), indent=2, sort_keys=True))
        return 0
    except Exception:
        print('R215_SANITIZED_RECEIPT_NO_GO: unexpected or altered receipt.', file=sys.stderr)
        return 2

if __name__ == '__main__': raise SystemExit(main())
