#!/usr/bin/env python3
"""R18-187 private offline: focus the historical definer review queue.

Inputs remain in the owner-only R111/R106 workspace. Prints fixed codes,
boolean guards and numeric docket/statement ordinals, never SQL or names.
A priority bucket is NOT a vulnerability verdict or a function approval.
"""
from __future__ import annotations

from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
)
import r186_private_privileged_statement_inventory as previous

WORK_PACKAGE = "B10-R18-187"
MAX_ITEMS = 24
EXPECTED = {
    "history_files_sha256_verified": 83,
    "direct_create_function_statements": 231,
    "direct_security_definer_statements": 182,
    "definer_statements_with_any_review_marker": 158,
    "top_level_public_execute_grant_markers": 0,
}
EXPECTED_MARKERS = {
    "MISSING_FUNCTION_LOCAL_SEARCH_PATH_MARKER": 0,
    "FUNCTION_LOCAL_SEARCH_PATH_PUBLIC_MARKER": 0,
    "MISSING_DIRECT_AUTH_IDENTITY_MARKER": 70,
    "MISSING_CAMPAIGN_MEMBERSHIP_MARKER": 143,
    "DYNAMIC_EXECUTE_MARKER": 0,
    "USER_EDITABLE_AUTH_METADATA_MARKER": 1,
}
BUCKETS = (
    "USER_METADATA_LEXICAL_MARKER",
    "NO_DIRECT_IDENTITY_AND_NO_MEMBERSHIP_MARKER",
    "NO_DIRECT_IDENTITY_MARKER_ONLY",
    "OTHER_LEXICAL_REVIEW_MARKERS",
)

def priority_bucket(markers: tuple[str, ...] | list[str]) -> str:
    codes = frozenset(markers)
    if not codes or not codes.issubset(set(previous.RISK_CODES)):
        raise AuditBlocked("R187_UNKNOWN_MARKERS")
    if "USER_EDITABLE_AUTH_METADATA_MARKER" in codes:
        return BUCKETS[0]
    if "MISSING_DIRECT_AUTH_IDENTITY_MARKER" in codes:
        if "MISSING_CAMPAIGN_MEMBERSHIP_MARKER" in codes:
            return BUCKETS[1]
        return BUCKETS[2]
    return BUCKETS[3]

def prioritized(entries: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """Stable enum bucket then R111 docket/statement position; no source text."""
    counts = Counter()
    for entry in entries:
        counts[entry["triage_bucket"]] += 1
    ordered = sorted(
        entries,
        key=lambda x: (BUCKETS.index(x["triage_bucket"]),
                       x["r111_docket_review_index_not_chronology"],
                       x["executable_statement_ordinal"])
    )
    return ordered, {name: counts[name] for name in BUCKETS}

def report(root: Path) -> dict:
    # Re-verify 83 original source hashes and enforce exact R186 snapshot parity.
    baseline = previous.report(root)
    if any(type(baseline.get(key)) is not int or baseline[key] != expected
           for key, expected in EXPECTED.items()):
        raise AuditBlocked("R187_R186_COUNT_PARITY_MISMATCH")
    if baseline.get("risk_marker_occurrences") != EXPECTED_MARKERS:
        raise AuditBlocked("R187_R186_MARKER_PARITY_MISMATCH")
    if (baseline.get("decision") != "NO_GO"
        or baseline.get("all_83_history_semantics_approved") is not False
        or baseline.get("all_67_live_privileged_call_chains_approved") is not False
        or baseline.get("qa_or_production_sql_authorized") is not False):
        raise AuditBlocked("R187_RELEASE_GUARD_MISMATCH")

    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024*1024))
    items = docket.get("reviewItems")
    if not isinstance(items, list) or len(items) != 83:
        raise AuditBlocked("R187_DOCKET_MISMATCH")
    folder = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")

    entries = []
    marker_counts = Counter()
    for index, item in enumerate(items, 1):
        raw = checked_file(folder / item["filename"], MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R187_ARCHIVE_CHANGED")
        for ordinal, statement in enumerate(statements(raw.decode("utf-8")), 1):
            privileged, markers = previous.flag_definer(statement)
            if not privileged or not markers:
                continue
            for marker in markers:
                marker_counts[marker] += 1
            entries.append({
                "r111_docket_review_index_not_chronology": index,
                "executable_statement_ordinal": ordinal,
                "triage_bucket": priority_bucket(markers),
                "lexical_markers": list(markers),
            })
    if len(entries) != EXPECTED["definer_statements_with_any_review_marker"]:
        raise AuditBlocked("R187_QUEUE_COUNT_PARITY_MISMATCH")
    if {name: marker_counts[name] for name in previous.RISK_CODES} != EXPECTED_MARKERS:
        raise AuditBlocked("R187_QUEUE_MARKER_PARITY_MISMATCH")
    ordered, buckets = prioritized(entries)
    if sum(buckets.values()) != 158:
        raise AuditBlocked("R187_BUCKET_COUNT_PARITY_MISMATCH")
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "mode": "OFFLINE_SHA256_PINNED_PRIORITIZED_HISTORICAL_DEFINER_QUEUE",
        "historical_files_sha256_verified": 83,
        "historical_definer_statements": 182,
        "historical_definer_statements_with_markers": 158,
        "triage_bucket_counts": buckets,
        "bounded_priority_queue": ordered[:MAX_ITEMS],
        "bounded_priority_queue_remaining": max(0, len(ordered) - MAX_ITEMS),
        "queue_order_is_marker_priority_then_r111_docket_not_chronology": True,
        "sql_function_names_paths_or_secret_values_exported": False,
        "network_or_database_accessed": False,
        "effective_privileged_authorization_approved": False,
        "historical_migration_semantics_approved": False,
        "signed_qa_passed": False,
        "hosted_sql_or_production_release_authorized": False,
        "limitations": [
            "Buckets are lexical investigation order only, not severity, vulnerabilities, executed SQL semantics or security approval.",
            "Missing direct identity/membership tokens do not rule out helper authorization; token presence does not prove security.",
            "Historical definitions can be overwritten, and this is not the effective 67-live-function grants/RLS graph."
        ],
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="R187 private historical definer priority queue")
    parser.add_argument("--root", type=Path, default=Path.home() / "ttrpg-history-private")
    args = parser.parse_args()
    try:
        print(json.dumps(report(args.root), sort_keys=True, indent=2))
        return 0
    except (AuditBlocked, OSError, UnicodeError, ValueError, TypeError, KeyError, IndexError):
        print("R18-187 PRIVATE_AUDIT_NO_GO: source integrity or count mismatch; never upload SQL.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
