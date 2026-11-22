#!/usr/bin/env python3
"""R212 strict validation of an owner-uploaded sanitized R211 report only.

No migration archive, SQL, network, database access or private source needed.
Always NO_GO; no approval can be derived from lexical marker counts.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

WORK = "B10-R18-212"
SOURCE = "B10-R18-211"
R111_COUNT = 83
MAX_PRIORITY_IDS = 24
MAX_BYTES = 32 * 1024

STATEMENT_KINDS = (
    "alter_function", "alter_other", "alter_policy", "alter_schema",
    "alter_sequence", "alter_table", "alter_type", "alter_view", "comment",
    "copy", "create_function", "create_index", "create_other",
    "create_policy", "create_schema", "create_sequence", "create_table",
    "create_trigger", "create_type", "create_view", "default_privileges",
    "delete", "do_block", "drop_function", "drop_index", "drop_other",
    "drop_policy", "drop_table", "drop_trigger", "drop_view",
    "extension_change", "grant", "insert", "other", "publication_change",
    "revoke", "role_change", "select", "set", "transaction", "truncate",
    "update",
)
MARKERS = (
    "auth_data_write_word", "auth_schema_word",
    "definer_without_local_search_path", "dollar_execute_word",
    "dynamic_format_word", "grant_anon_word", "grant_authenticated_word",
    "grant_to_public_word", "grant_truncate_word", "literal_true_policy_word",
    "network_side_effect_word", "permissive_or_word",
    "realtime_publication_word", "rls_toggle_word",
    "security_definer_definition", "storage_buckets_word",
    "storage_data_write_word", "storage_objects_word",
    "storage_schema_word", "user_editable_metadata_word",
)
FIXED_STRINGS = {
    "work_package": SOURCE,
    "decision": "NO_GO",
    "mode": "OWNER_PRIVATE_OFFLINE_QA_MIGRATION_EFFECT_CLASSIFICATION",
}
FIXED_BOOLEANS = {
    "original_migration_chronology_unique_valid": True,
    "known_dynamic_sql_fully_parsed": False,
    "all_83_migrations_semantically_reviewed": False,
    "private_source_safe_for_qa_install_proven": False,
    "qa_sql_write_authorized": False,
    "original_or_production_write_authorized": False,
    "no_sql_executed": True,
    "no_network_or_database_access": True,
    "private_sql_filenames_migration_versions_paths_and_secrets_exported": False,
}
LIMITATIONS = (
    "This is lexical statement-classification and conservative word-marker triage, not a PostgreSQL execution or semantic dependency graph.",
    "Function and DO bodies, dynamic EXECUTE, COPY, role/security/Storage effects, default privileges, and indirect side effects require manual private source review.",
    "R111 docket indices are priority sorted and are not timestamp chronology; changes have not been applied to QA or original.",
    "A matching source hash or zero risk-marker count NEVER authorizes installing private SQL; owner must separately approve an exact QA-only SQL-write plan.",
)
FIELDS = set(FIXED_STRINGS) | set(FIXED_BOOLEANS) | {
    "original_migrations_sha256_reverified", "lexical_top_level_statements",
    "empty_statement_migration_count", "top_level_statement_kinds",
    "conservative_word_markers", "risk_flagged_original_file_count",
    "first_r111_priority_review_indices_not_chronology",
    "r111_priority_review_index_count_truncated",
    "unclassified_top_level_statements", "limitations",
}

class Blocked(Exception):
    pass

def no_duplicates(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise Blocked("duplicate key")
        out[key] = value
    return out

def count(value, maximum):
    if type(value) is not int or not 0 <= value <= maximum:
        raise Blocked("invalid bounded count")
    return value

def counter_map(obj, keys, upper):
    if type(obj) is not dict or set(obj) != set(keys):
        raise Blocked("invalid counter shape")
    return {key: count(obj[key], upper) for key in keys}

def validate(report):
    if type(report) is not dict or set(report) != FIELDS:
        raise Blocked("unexpected report field")
    for key, expected in FIXED_STRINGS.items():
        if type(report[key]) is not str or report[key] != expected:
            raise Blocked("report identity or release drift")
    for key, expected in FIXED_BOOLEANS.items():
        if type(report[key]) is not bool or report[key] is not expected:
            raise Blocked("unproven approval or private scope drift")
    if (type(report["original_migrations_sha256_reverified"]) is not int or
        report["original_migrations_sha256_reverified"] != R111_COUNT):
        raise Blocked("source integrity count")
    total = count(report["lexical_top_level_statements"], 250000)
    empty = count(report["empty_statement_migration_count"], R111_COUNT)
    kinds = counter_map(report["top_level_statement_kinds"], STATEMENT_KINDS, total)
    markers = counter_map(report["conservative_word_markers"], MARKERS, total)
    if total != sum(kinds.values()) or (empty == R111_COUNT) != (total == 0):
        raise Blocked("statement count mismatch")
    if (type(report["unclassified_top_level_statements"]) is not int or
        report["unclassified_top_level_statements"] != kinds["other"]):
        raise Blocked("unclassified mismatch")
    if (markers["security_definer_definition"] > kinds["create_function"] or
        markers["definer_without_local_search_path"] > markers["security_definer_definition"]):
        raise Blocked("definition marker mismatch")
    risky = count(report["risk_flagged_original_file_count"], R111_COUNT)
    ids = report["first_r111_priority_review_indices_not_chronology"]
    if (type(ids) is not list or len(ids) != min(risky, MAX_PRIORITY_IDS) or
        any(type(x) is not int or not 1 <= x <= R111_COUNT for x in ids) or
        len(ids) != len(set(ids))):
        raise Blocked("priority docket references malformed")
    truncated = report["r111_priority_review_index_count_truncated"]
    if type(truncated) is not bool or truncated != (risky > MAX_PRIORITY_IDS):
        raise Blocked("risk reference truncation mismatch")
    if (type(report["limitations"]) is not list or
        tuple(report["limitations"]) != LIMITATIONS):
        raise Blocked("missing NO_GO limitations")
    # R211 enumerated numeric R111 priority IDs in chronological encounter order.
    # For <=24 risk files, sorting is complete. For >24, its chronological
    # truncation MAY omit top-priority IDs; sorting does not repair selection.
    complete = not truncated
    return {
        "work_package": WORK,
        "source_work_package": SOURCE,
        "decision": "NO_GO",
        "r211_sanitized_report_schema_valid": True,
        "original_migrations_sha256_reverified": R111_COUNT,
        "lexical_statement_count": total,
        "risk_flagged_migrations": risky,
        "risk_indices_complete": complete,
        "r111_priority_indices_sorted_within_available_selection": sorted(ids),
        "r211_indices_originally_sorted_by_priority": ids == sorted(ids),
        "r211_first_24_selection_guaranteed_top_priority": complete,
        "security_definer_lexical_declarations": markers["security_definer_definition"],
        "unknown_top_level_statements": kinds["other"],
        "qa_sql_install_authorized": False,
        "all_83_migrations_semantically_approved": False,
        "network_or_database_access_performed": False,
        "private_sql_or_docket_exported": False,
    }

def read_report(path: Path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > MAX_BYTES:
        raise Blocked("sanitized source report unavailable")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates,
                      parse_constant=lambda _: (_ for _ in ()).throw(Blocked("invalid numeric constant")))

def main():
    parser = argparse.ArgumentParser(description="Read sanitized R211 JSON only; never SQL")
    parser.add_argument("sanitized_r211_json", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(read_report(args.sanitized_r211_json)),
                         sort_keys=True, indent=2))
        return 0
    except Exception:
        print("R212_SANITIZED_REPORT_NO_GO: invalid, incomplete or changed receipt.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
