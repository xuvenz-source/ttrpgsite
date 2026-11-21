#!/usr/bin/env python3
"""R18-185: strictly reconcile an R184 sanitized receipt; never approve a release.

Local input only. No network, DB, subprocess, file writes, source SQL or paths output.
Even a matching receipt is not authenticated provenance or a semantic security audit.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import stat

MAX_BYTES = 4096
RPC_KEYS = frozenset({
    "both_expected_anchor_failures_present",
    "both_rewritten_definitions_executed",
    "dynamic_reads_two_existing_function_definitions",
    "dynamic_targets_monitor_by_signature",
    "dynamic_targets_reference_by_signature",
    "later_monitor_preserves_map_gate",
    "monitor_replacement_introduces_map_gate",
    "prior_monitor_old_guard_exactly_once",
    "prior_reference_owner_anchor_exactly_once",
    "reference_replacement_introduces_owner_plus_map_gate",
    "static_map_helper_has_assignment_relation",
})
REQUIRED_KEYS = frozenset({
    "all_67_privileged_chains_approved", "all_target_structural_indicators_present",
    "chronological_target_files_verified", "database_accessed", "decision",
    "do_block_count_matches_readonly_12", "filenames_exported", "limitations",
    "mode", "network_accessed", "parsed_do_blocks", "parsed_top_level_statements",
    "paths_or_secret_values_exported", "private_history_semantically_approved",
    "production_release_authorized", "real_signed_qa_passed", "rpc_rewrite_parity",
    "sql_bodies_exported", "top_level_statement_count_matches_readonly_937",
    "verified_history_count", "work_package",
})
EXPECTED_LIMITATIONS = [
    "SHA and literal structural parity do not prove PostgreSQL DO semantics, all 83 migrations, grants or policy composition.",
    "A synthetic PG17 rewrite test is not exact original full migration replay.",
    "Manual signed QA and owner authorization remain required before any hosted repair.",
]
TRUE_KEYS = (
    "all_target_structural_indicators_present",
    "do_block_count_matches_readonly_12",
    "top_level_statement_count_matches_readonly_937",
)
FALSE_KEYS = (
    "all_67_privileged_chains_approved", "database_accessed", "filenames_exported",
    "network_accessed", "paths_or_secret_values_exported",
    "private_history_semantically_approved", "production_release_authorized",
    "real_signed_qa_passed", "sql_bodies_exported",
)
COUNTS = {
    "verified_history_count": 83,
    "chronological_target_files_verified": 3,
    "parsed_top_level_statements": 937,
    "parsed_do_blocks": 12,
}

def no_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("duplicate JSON key")
        out[key] = value
    return out

def structurally_matches(receipt: object) -> bool:
    if type(receipt) is not dict or set(receipt) != REQUIRED_KEYS:
        return False
    if (receipt["work_package"] != "B10-R18-184"
        or receipt["decision"] != "NO_GO"
        or receipt["mode"] != "OFFLINE_SHA256_VERIFIED_R111_R106_CHRONOLOGY_STRUCTURAL_PARITY"):
        return False
    if type(receipt["limitations"]) is not list or receipt["limitations"] != EXPECTED_LIMITATIONS:
        return False
    if any(type(receipt[k]) is not bool or receipt[k] is not True for k in TRUE_KEYS):
        return False
    if any(type(receipt[k]) is not bool or receipt[k] is not False for k in FALSE_KEYS):
        return False
    if any(type(receipt[k]) is not int or receipt[k] != expected
           for k, expected in COUNTS.items()):
        return False
    rpc = receipt["rpc_rewrite_parity"]
    return (type(rpc) is dict and set(rpc) == RPC_KEYS
            and all(type(value) is bool and value is True for value in rpc.values()))

def reconcile_bytes(raw: bytes, expected_sha256: str) -> bool:
    if (not 0 < len(raw) <= MAX_BYTES
        or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256)
        or hashlib.sha256(raw).hexdigest() != expected_sha256):
        return False
    try:
        text = raw.decode("utf-8", errors="strict")
        receipt = json.loads(
            text, object_pairs_hook=no_duplicate_keys,
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite JSON"))
        )
    except (UnicodeError, ValueError, TypeError, RecursionError):
        return False
    return structurally_matches(receipt)

def reconcile_path(path: Path, expected_sha256: str) -> bool:
    try:
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_BYTES:
            return False
        with path.open("rb") as handle:
            return reconcile_bytes(handle.read(MAX_BYTES + 1), expected_sha256)
    except (OSError, ValueError):
        return False

def main() -> int:
    parser = argparse.ArgumentParser(description="R185 safe offline R184 receipt gate")
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--expected-sha256", type=str, required=True)
    args = parser.parse_args()
    match = reconcile_path(args.receipt, args.expected_sha256)
    # Fixed shape only: never include arbitrary uploaded values or local paths.
    print(json.dumps({
        "work_package": "B10-R18-185",
        "receipt_structural_match": match,
        "decision": "NO_GO",
        "historical_semantics_approved": False,
        "signed_qa_passed": False,
        "hosted_sql_authorized": False,
        "production_authorized": False,
    }, sort_keys=True))
    return 0 if match else 2

if __name__ == "__main__":
    raise SystemExit(main())
