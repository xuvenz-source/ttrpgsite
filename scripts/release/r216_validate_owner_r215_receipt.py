#!/usr/bin/env python3
"""R216 strict validation of owner-uploaded sanitized R215 evidence, NO_GO only.

Reads ONLY fixed-shape aggregate JSON; rejects extra fields, duplicate keys,
unbounded values, unapproved authority and inconsistent priority / class rows.
Never reads historical SQL, R111 docket, network or a database.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

WORK = "B10-R18-216"
CODES = (
    "managed_auth_direct_dml", "managed_storage_direct_dml",
    "managed_storage_policy_target", "managed_schema_ddl_word_marker",
    "managed_schema_grant_or_revoke", "extension_or_role_change",
    "publication_change", "opaque_do_block", "function_dynamic_execute_marker",
)
FIXED = {
    "work_package": "B10-R18-215",
    "decision": "NO_GO",
    "mode": "OWNER_PRIVATE_OFFLINE_MANAGED_SCHEMA_EFFECT_SCOPE_TRIAGE",
}
GUARDS = {
    "dynamic_or_indirect_sql_effects_fully_known": False,
    "managed_schema_changes_semantically_approved": False,
    "all_83_migrations_semantically_approved": False,
    "qa_sql_install_authorized": False,
    "original_or_production_sql_authorized": False,
    "no_sql_executed": True,
    "no_network_or_database_access": True,
    "private_sql_names_versions_paths_or_docket_exported": False,
}
LIMITATIONS = [
    "All class counts are lexical source markers only. Function/DO/dynamic effects, privilege chains and effective policies are NOT semantically parsed or verified.",
    "No direct top-level managed write marker does NOT rule out writes inside functions, triggers, DO blocks or dynamic SQL.",
    "R111 references are owner-private priority positions, not chronological migration numbers; rows are limited to 24 and may be truncated.",
    "No SQL may be installed in QA or original/production without separate owner approval of an exact SQL plan, backup and rollback.",
]
FIELDS = set(FIXED) | set(GUARDS) | {
    "original_migrations_sha256_reverified",
    "r214_top_level_statements_reconciled",
    "managed_effect_lexical_statement_counts",
    "managed_effect_lexical_file_counts",
    "managed_effect_flagged_migration_count",
    "first_r111_priority_order_managed_review_items",
    "priority_items_truncated", "limitations",
}

class Blocked(Exception):
    pass

def pairs_no_duplicates(pairs):
    result = {}
    for k, v in pairs:
        if k in result:
            raise Blocked("duplicate JSON key")
        result[k] = v
    return result

def bounded(v, limit):
    if type(v) is not int or not 0 <= v <= limit:
        raise Blocked("non-integer or out-of-range count")
    return v

def read_sanitized(path: Path):
    if path.is_symlink() or not path.is_file() or not 1 <= path.stat().st_size <= 32768:
        raise Blocked("receipt unavailable or oversize")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=pairs_no_duplicates,
        parse_constant=lambda _: (_ for _ in ()).throw(Blocked("nonfinite JSON")))

def validate(report):
    if type(report) is not dict or set(report) != FIELDS:
        raise Blocked("unexpected or missing fields")
    for k, v in FIXED.items():
        if type(report[k]) is not str or report[k] != v:
            raise Blocked("source identity / approval drift")
    for k, v in GUARDS.items():
        if type(report[k]) is not bool or report[k] is not v:
            raise Blocked("authority / private-scope drift")
    if (type(report["original_migrations_sha256_reverified"]) is not int or
        report["original_migrations_sha256_reverified"] != 83):
        raise Blocked("source count mismatch")
    statements = bounded(report["r214_top_level_statements_reconciled"], 250000)
    files = bounded(report["managed_effect_flagged_migration_count"], 83)
    statement_counts = report["managed_effect_lexical_statement_counts"]
    file_counts = report["managed_effect_lexical_file_counts"]
    for counters, cap in ((statement_counts, statements), (file_counts, files)):
        if type(counters) is not dict or set(counters) != set(CODES):
            raise Blocked("risk code shape changed")
        for value in counters.values():
            bounded(value, cap)
    for code in CODES:
        if file_counts[code] > statement_counts[code]:
            raise Blocked("file count exceeds statement count")
    if (files == 0) != (sum(file_counts.values()) == 0) or sum(file_counts.values()) < files:
        raise Blocked("flagged file/class mismatch")
    rows = report["first_r111_priority_order_managed_review_items"]
    truncated = report["priority_items_truncated"]
    if (type(rows) is not list or type(truncated) is not bool or
        truncated != (files > 24) or len(rows) != min(files, 24)):
        raise Blocked("priority boundedness mismatch")
    seen = set()
    counted = dict.fromkeys(CODES, 0)
    for row in rows:
        if type(row) is not dict or set(row) != {"r111_priority_index", "lexical_review_codes"}:
            raise Blocked("unexpected private detail")
        index = row["r111_priority_index"]
        if type(index) is not int or not 1 <= index <= 83 or index in seen or (seen and index <= max(seen)):
            raise Blocked("invalid R111 priority order")
        seen.add(index)
        codes = row["lexical_review_codes"]
        if (type(codes) is not list or not codes or
            any(type(c) is not str or c not in CODES for c in codes) or
            codes != sorted(set(codes))):
            raise Blocked("invalid review codes")
        for code in codes:
            counted[code] += 1
    if any(counted[c] > file_counts[c] for c in CODES):
        raise Blocked("row counts exceed total file counts")
    if not truncated and counted != file_counts:
        raise Blocked("untruncated file category inconsistency")
    if type(report["limitations"]) is not list or report["limitations"] != LIMITATIONS:
        raise Blocked("safety limitations changed")
    return {
        "work_package": WORK,
        "source_work_package": "B10-R18-215",
        "decision": "NO_GO",
        "sanitized_r215_receipt_valid": True,
        "original_migrations_sha256_reverified": 83,
        "lexical_statements_reconciled": statements,
        "managed_effect_flagged_migrations": files,
        "risk_priority_list_complete": not truncated,
        "direct_storage_dml_statement_count": statement_counts["managed_storage_direct_dml"],
        "storage_policy_statement_count": statement_counts["managed_storage_policy_target"],
        "opaque_do_statement_count": statement_counts["opaque_do_block"],
        "publication_statement_count": statement_counts["publication_change"],
        "managed_migration_semantics_approved": False,
        "qa_sql_install_authorized": False,
        "original_or_production_sql_authorized": False,
        "sql_or_network_executed": False,
    }

def main():
    parser = argparse.ArgumentParser(description="Validate sanitized R215 JSON only")
    parser.add_argument("sanitized_r215_json", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(read_sanitized(args.sanitized_r215_json)),
                         indent=2, sort_keys=True))
        return 0
    except Exception:
        print("R216_SANITIZED_R215_NO_GO: missing, malformed or altered receipt.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
