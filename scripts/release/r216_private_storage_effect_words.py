#!/usr/bin/env python3
"""R216 owner-private offline Storage policy and direct DML *lexical* preflight.

Rechecks the original archive using R215's existing private SHA/chronology gates.
Reports only fixed category counts and numerical R111 priority references.
Never exports SQL, table/bucket names, original versions, paths or secrets.
Never executes SQL, uses network/database or writes files.
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
from r215_private_managed_effect_scope import report as r215_report, statement_codes

WORK = "B10-R18-216"
MAX_ITEMS = 24

# Fixed labels; never serialize source-derived object names.
CODES = (
    "storage_direct_insert", "storage_direct_update",
    "storage_direct_delete", "storage_direct_truncate",
    "storage_direct_other_unparsed", "storage_direct_update_delete_without_where_word",
    "storage_direct_insert_conflict_word", "storage_policy_select",
    "storage_policy_insert", "storage_policy_update",
    "storage_policy_delete", "storage_policy_all_or_unspecified",
    "storage_policy_missing_using_word", "storage_policy_missing_with_check_word",
    "storage_policy_missing_direct_auth_identity_word",
    "storage_policy_editable_user_metadata_word",
    "storage_objects_target_word", "storage_buckets_target_word",
    "storage_other_target_word",
)
IDENT = r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)'
STORAGE_DML = re.compile(
    rf'^\s*(?P<verb>INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+'
    rf'(?:ONLY\s+)?(?:"storage"|storage)\s*\.\s*(?P<table>{IDENT})(?=\s|\(|;|$)',
    re.I | re.S,
)
POLICY_TARGET = re.compile(
    rf'\bON\s+(?:TABLE\s+)?(?:"storage"|storage)\s*\.\s*(?P<table>{IDENT})(?=\s|\(|;|$)',
    re.I | re.S,
)
POLICY_COMMAND = re.compile(r'\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b', re.I)
AUTH_WORD = re.compile(r'\bauth\s*\.\s*(?:uid|jwt)\s*\(', re.I)
USER_META = re.compile(r'\b(?:raw_user_meta_data|user_metadata)\b', re.I)
USING_WORD = re.compile(r'\bUSING\s*\(', re.I)
CHECK_WORD = re.compile(r'\bWITH\s+CHECK\s*\(', re.I)
WHERE_WORD = re.compile(r'\bWHERE\b', re.I)
CONFLICT_WORD = re.compile(r'\bON\s+CONFLICT\b', re.I)

def target_category(value: str) -> str:
    value = value[1:-1].replace('""', '"') if value.startswith('"') else value.lower()
    if value == "objects":
        return "storage_objects_target_word"
    if value == "buckets":
        return "storage_buckets_target_word"
    return "storage_other_target_word"

def check_statement(stmt: str):
    markers = set(statement_codes(stmt))
    codes = set()
    if "managed_storage_direct_dml" in markers:
        match = STORAGE_DML.match(stmt)
        if not match:
            codes.add("storage_direct_other_unparsed")
        else:
            verb = re.sub(r'\s+', ' ', match.group("verb").upper())
            if verb.startswith("INSERT"):
                codes.add("storage_direct_insert")
                if CONFLICT_WORD.search(stmt):
                    codes.add("storage_direct_insert_conflict_word")
            elif verb.startswith("UPDATE"):
                codes.add("storage_direct_update")
                if not WHERE_WORD.search(stmt):
                    codes.add("storage_direct_update_delete_without_where_word")
            elif verb.startswith("DELETE"):
                codes.add("storage_direct_delete")
                if not WHERE_WORD.search(stmt):
                    codes.add("storage_direct_update_delete_without_where_word")
            elif verb.startswith("TRUNCATE"):
                codes.add("storage_direct_truncate")
            else:
                codes.add("storage_direct_other_unparsed")
            codes.add(target_category(match.group("table")))
    if "managed_storage_policy_target" in markers:
        target = POLICY_TARGET.search(stmt)
        if target is None:
            codes.add("storage_other_target_word")
        else:
            codes.add(target_category(target.group("table")))
        command = POLICY_COMMAND.search(stmt)
        choice = command.group(1).lower() if command else "all_or_unspecified"
        codes.add("storage_policy_" + choice if choice != "all" else "storage_policy_all_or_unspecified")
        if not USING_WORD.search(stmt):
            codes.add("storage_policy_missing_using_word")
        if not CHECK_WORD.search(stmt):
            codes.add("storage_policy_missing_with_check_word")
        if not AUTH_WORD.search(stmt):
            codes.add("storage_policy_missing_direct_auth_identity_word")
        if USER_META.search(stmt):
            codes.add("storage_policy_editable_user_metadata_word")
    if not codes.issubset(set(CODES)):
        raise AuditBlocked("R216_UNKNOWN_LEXICAL_CODE")
    return tuple(sorted(codes))

def report(root: Path):
    previous = r215_report(root)
    if (previous["decision"] != "NO_GO" or
        previous["original_migrations_sha256_reverified"] != 83 or
        previous["qa_sql_install_authorized"] is not False):
        raise AuditBlocked("R216_PREVIOUS_PRIVATE_GATE_FAILED")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024 * 1024))
    items = docket.get("reviewItems")
    if type(items) is not list or len(items) != 83:
        raise AuditBlocked("R216_DOCKET_COUNT_INVALID")
    folder = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")
    versions = set()
    statements_total = 0
    dml_reconciled = 0
    policies_reconciled = 0
    counts = Counter()
    file_counts = Counter()
    priority = []
    for pos, item in enumerate(items, 1):
        filename = item["filename"]
        version = strict_migration_version(filename)
        if version is None or version in versions:
            raise AuditBlocked("R216_INVALID_CHRONOLOGY")
        versions.add(version)
        raw = checked_file(folder / filename, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R216_SOURCE_CHANGED")
        file_codes = set()
        for statement in statements(raw.decode("utf-8")):
            statements_total += 1
            parent_codes = statement_codes(statement)
            dml_reconciled += int("managed_storage_direct_dml" in parent_codes)
            policies_reconciled += int("managed_storage_policy_target" in parent_codes)
            codes = check_statement(statement)
            counts.update(codes)
            file_codes.update(codes)
        if file_codes:
            priority.append({"r111_priority_index": pos, "storage_lexical_review_codes": sorted(file_codes)})
            for code in file_codes:
                file_counts[code] += 1
    if (len(versions) != 83 or
        statements_total != previous["r214_top_level_statements_reconciled"] or
        dml_reconciled != previous["managed_effect_lexical_statement_counts"]["managed_storage_direct_dml"] or
        policies_reconciled != previous["managed_effect_lexical_statement_counts"]["managed_storage_policy_target"]):
        raise AuditBlocked("R216_R215_COUNTS_DO_NOT_RECONCILE")
    return {
        "work_package": WORK,
        "decision": "NO_GO",
        "mode": "OWNER_PRIVATE_OFFLINE_STORAGE_EFFECT_WORD_TRIAGE",
        "original_migrations_sha256_reverified": 83,
        "top_level_statements_reconciled": statements_total,
        "r215_storage_direct_dml_statements_reconciled": dml_reconciled,
        "r215_storage_policy_statements_reconciled": policies_reconciled,
        "storage_lexical_statement_indicator_counts": {code: counts[code] for code in CODES},
        "storage_lexical_file_indicator_counts": {code: file_counts[code] for code in CODES},
        "storage_review_file_count": len(priority),
        "first_r111_priority_storage_review_items": priority[:MAX_ITEMS],
        "priority_review_items_truncated": len(priority) > MAX_ITEMS,
        "policy_or_storage_semantics_approved": False,
        "effective_rls_or_signed_url_revocation_verified": False,
        "all_83_migrations_semantically_approved": False,
        "qa_sql_install_authorized": False,
        "original_or_production_sql_authorized": False,
        "no_sql_executed": True,
        "no_network_or_database_access": True,
        "private_sql_names_versions_paths_or_docket_exported": False,
        "limitations": [
            "Markers describe only top-level source words and cannot prove actual Storage data changes, effective RLS policy composition or signed bearer URL revocation.",
            "A missing USING, WITH CHECK, WHERE or direct auth.uid marker is context dependent, not automatically an unsafe SQL statement; helper calls and other policies may apply.",
            "Function/DO/trigger bodies, dynamic SQL, managed permissions and historical state are not semantically evaluated; all 83 migrations still need private review.",
            "R111 priority references are not migration chronology; QA SQL writes require a separate exact owner-approved target/backup/rollback plan.",
        ],
    }

def main():
    try:
        print(json.dumps(report(Path.home() / "ttrpg-history-private"),
                         indent=2, sort_keys=True))
        return 0
    except Exception:
        print("R216_PRIVATE_STORAGE_WORDS_NO_GO: private source or lexical preflight rejected.",
              file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
