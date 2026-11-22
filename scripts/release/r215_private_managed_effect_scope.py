#!/usr/bin/env python3
"""R215 owner-private source-only managed schema / indirect effect review queue.

No remote services, SQL execution, data writes or original identifiers emitted.
Every finding is LEXICAL triage; no semantic SQL approval is possible here.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
from r191_private_fog_status_lineage import strict_migration_version
from r211_private_qa_migration_effects import classify
from r214_private_qa_table_target_order import report as r214_report

WORK='B10-R18-215'
MAX_LIST=24
CODES=(
    'managed_auth_direct_dml',
    'managed_storage_direct_dml',
    'managed_storage_policy_target',
    'managed_schema_ddl_word_marker',
    'managed_schema_grant_or_revoke',
    'extension_or_role_change',
    'publication_change',
    'opaque_do_block',
    'function_dynamic_execute_marker',
)
DATA_WRITE=re.compile(r'^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:ONLY\s+)?(?P<schema>"?auth"?|"?storage"?)\s*\.',re.I|re.S)
POLICY_ON_STORAGE=re.compile(r'\bON\s+(?:TABLE\s+)?"?storage"?\s*\.',re.I|re.S)
SCHEMA_DDL=re.compile(r'^\s*(?:CREATE|ALTER|DROP)\s+(?:TABLE|VIEW|SCHEMA|FUNCTION|TRIGGER|INDEX|SEQUENCE)\b',re.I|re.S)
TARGET_SCHEMA=re.compile(r'\b"?(?:auth|storage)"?\s*\.',re.I|re.S)
SCHEMA_STANDALONE=re.compile(r'^\s*(?:CREATE|ALTER|DROP)\s+SCHEMA\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?"?(?:auth|storage)"?\b',re.I|re.S)
GRANT_REVOKE_ON=re.compile(r'^\s*(?:GRANT|REVOKE)\b[\s\S]{0,4096}?\bON\b[\s\S]{0,4096}?\b"?(?:auth|storage)"?\s*\.',re.I|re.S)

def statement_codes(stmt: str) -> tuple[str,...]:
    kind, markers, _ = classify(stmt)
    codes=set()
    direct=DATA_WRITE.match(stmt)
    if direct:
        schema=direct.group('schema').strip('"').lower()
        codes.add('managed_auth_direct_dml' if schema=='auth' else 'managed_storage_direct_dml')
    if kind in {'create_policy','alter_policy','drop_policy'} and POLICY_ON_STORAGE.search(stmt):
        codes.add('managed_storage_policy_target')
    if SCHEMA_DDL.match(stmt) and (SCHEMA_STANDALONE.match(stmt) or TARGET_SCHEMA.search(stmt)):
        # This word marker can occur inside a quoted function body.
        # It is never a confirmed DDL target or proof of SQL execution.
        codes.add('managed_schema_ddl_word_marker')
    if kind in {'grant','revoke'} and GRANT_REVOKE_ON.search(stmt):
        codes.add('managed_schema_grant_or_revoke')
    if kind in {'extension_change','role_change'}:
        codes.add('extension_or_role_change')
    if kind=='publication_change':
        codes.add('publication_change')
    if kind=='do_block':
        codes.add('opaque_do_block')
    if kind=='create_function' and markers['dollar_execute_word']:
        codes.add('function_dynamic_execute_marker')
    return tuple(sorted(codes))

def report(root:Path):
    prev=r214_report(root)
    if (prev['decision']!='NO_GO' or prev['original_migrations_sha256_reverified']!=83 or
        prev['qa_sql_install_authorized'] is not False):
        raise AuditBlocked('R215_PREVIOUS_OWNER_LOCAL_GATE_FAILED')
    root=checked_dir(root, private=True)
    docket=json.loads(checked_file(root/'r111-private-review-docket.json',1024*1024))
    items=docket.get('reviewItems')
    if type(items) is not list or len(items)!=83:
        raise AuditBlocked('R215_DOCKET_COUNT')
    folder=checked_dir(root/'r106-original-83-recovery'/'supabase'/'migrations')
    versions=set()
    totals=Counter()
    file_totals=Counter()
    flagged=[]
    top_statements=0
    for index,item in enumerate(items,1):
        name=item.get('filename')
        version=strict_migration_version(name)
        if version is None or version in versions:
            raise AuditBlocked('R215_MIGRATION_VERSION')
        versions.add(version)
        source=checked_file(folder/name,MAX_SQL_BYTES)
        if hashlib.sha256(source).hexdigest()!=item.get('sourceBodySha256'):
            raise AuditBlocked('R215_SOURCE_HASH')
        file_codes=set()
        for stmt in statements(source.decode('utf-8')):
            top_statements+=1
            codes=statement_codes(stmt)
            totals.update(codes)
            file_codes.update(codes)
        if file_codes:
            for code in file_codes:file_totals[code]+=1
            flagged.append({'r111_priority_index':index,
                            'lexical_review_codes':sorted(file_codes)})
    if top_statements != prev['lexical_top_level_statements_reconciled']:
        raise AuditBlocked('R215_STATEMENT_COUNT_DRIFT')
    if len(versions)!=83 or any(v not in CODES for v in totals):
        raise AuditBlocked('R215_INTERNAL_COUNTER_DRIFT')
    return {
       'work_package':WORK,
       'decision':'NO_GO',
       'mode':'OWNER_PRIVATE_OFFLINE_MANAGED_SCHEMA_EFFECT_SCOPE_TRIAGE',
       'original_migrations_sha256_reverified':83,
       'r214_top_level_statements_reconciled':top_statements,
       'managed_effect_lexical_statement_counts':{c:totals[c] for c in CODES},
       'managed_effect_lexical_file_counts':{c:file_totals[c] for c in CODES},
       'managed_effect_flagged_migration_count':len(flagged),
       'first_r111_priority_order_managed_review_items':flagged[:MAX_LIST],
       'priority_items_truncated':len(flagged)>MAX_LIST,
       'dynamic_or_indirect_sql_effects_fully_known':False,
       'managed_schema_changes_semantically_approved':False,
       'all_83_migrations_semantically_approved':False,
       'qa_sql_install_authorized':False,
       'original_or_production_sql_authorized':False,
       'no_sql_executed':True,
       'no_network_or_database_access':True,
       'private_sql_names_versions_paths_or_docket_exported':False,
       'limitations':[
         'All class counts are lexical source markers only. Function/DO/dynamic effects, privilege chains and effective policies are NOT semantically parsed or verified.',
         'No direct top-level managed write marker does NOT rule out writes inside functions, triggers, DO blocks or dynamic SQL.',
         'R111 references are owner-private priority positions, not chronological migration numbers; rows are limited to 24 and may be truncated.',
         'No SQL may be installed in QA or original/production without separate owner approval of an exact SQL plan, backup and rollback.',
       ],
    }

def main():
    try:
        print(json.dumps(report(Path.home()/'ttrpg-history-private'),sort_keys=True,indent=2))
        return 0
    except Exception:
        print('R215_PRIVATE_MANAGED_EFFECT_NO_GO: owner archive integrity or source classification rejected.',file=sys.stderr)
        return 2

if __name__=='__main__': raise SystemExit(main())
