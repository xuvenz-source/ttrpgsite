#!/usr/bin/env python3
"""R214 offline strict shape/cross-counter validation of sanitized R213 JSON.

This never reads or accepts private SQL, original file paths, versions, source
hashes, private R111 docket, network connections or hosted database credentials.
No validation outcome constitutes approval to install SQL.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

WORK = "B10-R18-214"
RISK_CODES = (
    "unparsed_or_unusual_ddl", "privileged_definition_header",
    "function_dynamic_or_network", "policy_storage_or_unconditional",
    "privilege_public_anon_or_truncate", "auth_or_storage_data_write",
    "do_copy_or_top_level_destructive", "role_extension_or_publication",
)
LIMITATIONS = (
    "Risk classes are lexical indicators, NOT SQL execution, parser-proven semantic dependencies, or approval for QA migration installation.",
    "Only the first 24 flagged R111 priority references are shown; every one of 83 historical migrations still requires private semantic review.",
    "Do not upload private migrations, docket, filenames/versions, SQL bodies or credentials. Owner must separately approve exact QA-only SQL write plan.",
)
SCALARS = {
    "work_package": "B10-R18-213",
    "decision": "NO_GO",
    "mode": "OWNER_PRIVATE_OFFLINE_QA_LEXICAL_RISK_CATEGORIES",
}
GUARDS = {
    "complete_semantic_review_proven": False,
    "dynamic_sql_effects_fully_known": False,
    "original_or_production_sql_authorized": False,
    "qa_sql_install_authorized": False,
    "no_sql_executed": True,
    "no_network_or_database_access": True,
    "private_sql_docket_paths_versions_secrets_exported": False,
}
KEYS = set(SCALARS) | set(GUARDS) | {
    "limitations", "original_migrations_sha256_reverified",
    "r211_lexical_statements_reconciled", "risk_flagged_original_file_count",
    "risk_category_file_counts", "priority_ordered_first_r111_risk_items",
    "priority_risk_items_truncated",
}

class Blocked(Exception):
    pass

def pairs_no_duplicates(pairs):
    output = {}
    for name, value in pairs:
        if name in output:
            raise Blocked("duplicate JSON key")
        output[name] = value
    return output

def bounded(value, limit):
    if type(value) is not int or not 0 <= value <= limit:
        raise Blocked("non-integer or out-of-range count")
    return value

def read_sanitized(path: Path):
    if (not path.is_file() or path.is_symlink() or
        not 1 <= path.stat().st_size <= 32768):
        raise Blocked("sanitized receipt unavailable")
    return json.loads(path.read_text(encoding="utf-8"),
        object_pairs_hook=pairs_no_duplicates,
        parse_constant=lambda _: (_ for _ in ()).throw(Blocked("non-finite JSON")))

def validate(report):
    if type(report) is not dict or set(report) != KEYS:
        raise Blocked("unexpected fields, possibly private content")
    for name, value in SCALARS.items():
        if type(report[name]) is not str or report[name] != value:
            raise Blocked("incorrect receipt identity/release")
    for name, value in GUARDS.items():
        if type(report[name]) is not bool or report[name] is not value:
            raise Blocked("guard or SQL authority changed")
    if (type(report["original_migrations_sha256_reverified"]) is not int or
        report["original_migrations_sha256_reverified"] != 83):
        raise Blocked("source provenance count")
    statements = bounded(report["r211_lexical_statements_reconciled"], 250000)
    flagged = bounded(report["risk_flagged_original_file_count"], 83)
    counts = report["risk_category_file_counts"]
    if type(counts) is not dict or set(counts) != set(RISK_CODES):
        raise Blocked("unexpected risk category")
    for value in counts.values():
        bounded(value, flagged)
    if (flagged == 0) != (sum(counts.values()) == 0):
        raise Blocked("risk category total does not match flagged files")
    if sum(counts.values()) < flagged:
        raise Blocked("risky file missing all category codes")
    rows = report["priority_ordered_first_r111_risk_items"]
    truncated = report["priority_risk_items_truncated"]
    if (type(rows) is not list or type(truncated) is not bool or
        truncated != (flagged > 24) or len(rows) != min(flagged, 24)):
        raise Blocked("invalid priority selection/truncation")
    seen = set()
    covered = {name: 0 for name in RISK_CODES}
    for row in rows:
        if type(row) is not dict or set(row) != {"r111_priority_index", "lexical_risk_codes"}:
            raise Blocked("unexpected private row detail")
        pos = row["r111_priority_index"]
        if (type(pos) is not int or not 1 <= pos <= 83 or
            pos in seen or (seen and pos <= max(seen))):
            raise Blocked("invalid R111 priority index ordering")
        seen.add(pos)
        flags = row["lexical_risk_codes"]
        if (type(flags) is not list or not flags or
            any(type(x) is not str or x not in RISK_CODES for x in flags) or
            flags != sorted(set(flags))):
            raise Blocked("unexpected/duplicated lexical risk codes")
        for code in flags:
            covered[code] += 1
    if any(covered[name] > counts[name] for name in RISK_CODES):
        raise Blocked("individual risk counts inconsistent")
    if not truncated and covered != counts:
        raise Blocked("non-truncated category counts differ from rows")
    if type(report["limitations"]) is not list or tuple(report["limitations"]) != LIMITATIONS:
        raise Blocked("NO_GO limitations changed")
    return {
        "work_package": WORK,
        "source_work_package": "B10-R18-213",
        "decision": "NO_GO",
        "r213_sanitized_receipt_valid": True,
        "historical_migration_sha_count": 83,
        "lexical_statements_reconciled": statements,
        "priority_ordered_risk_files": flagged,
        "risk_index_selection_complete": not truncated,
        "risk_category_total_indicators": sum(counts.values()),
        "auth_storage_write_files": counts["auth_or_storage_data_write"],
        "storage_policy_review_files": counts["policy_storage_or_unconditional"],
        "roles_extensions_publication_review_files": counts["role_extension_or_publication"],
        "destructive_or_do_review_files": counts["do_copy_or_top_level_destructive"],
        "migration_semantics_approved": False,
        "qa_or_original_sql_write_authorized": False,
        "sql_or_network_executed": False,
    }

def main():
    parser = argparse.ArgumentParser(description="R214 fixed-shape sanitized R213 validation only")
    parser.add_argument("sanitized_r213_json", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(read_sanitized(args.sanitized_r213_json)),
                         indent=2, sort_keys=True))
        return 0
    except Exception:
        print("R214_SANITIZED_RECEIPT_NO_GO: invalid or altered private-source receipt.",
              file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
