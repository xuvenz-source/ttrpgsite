#!/usr/bin/env python3
"""R18-192: fail-closed linkage of private R191 report and sealed PG17 fog guard.

Source-only guard. NO source SQL is fetched from original/QA or private WSL.
Does not interpret a sanitized report as independent security approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

WORK_PACKAGE = "B10-R18-192"
MANIFEST = Path("staging/world-v2-b10-r18-192-fog-guard-original-lineage-regression/manifest.json")
MAX_MANIFEST_BYTES = 8192
EXPECTED_R191 = {
    "bytes": 1820,
    "sha256": "2087f092686f6243bd0210cb9de2fca408739abc638bd1d68bd1faf0a7bcf377",
    "source_sha256_verified_count": 83,
    "chronology_valid": True,
    "direct_fog_status_definition_count": 1,
    "r111_priority_docket_index_not_chronology": 50,
    "executable_statement_ordinal": 57,
    "latest_body_sha256_matches_current": True,
    "latest_body_size_matches_current": True,
    "latest_has_direct_identity_marker": False,
    "latest_has_membership_or_map_helper_marker": False,
}
EXPECTED_CURRENT = {
    "sha256": "767cbcd8bd4813c0a535fa71bf1ecc3a9cf8a6dd02c239499c0be1737a28c96f",
    "bytes": 102,
}
EXPECTED_BLOBS = {
    "staging/world-v2-b10-r18-104-fog-guard/unapplied-fog-status-guard.sql":
        "c84d7cf8b0958621f11ec273cb36361e2501a77f",
    "tests/world-v2-r18-105-postgres/extract_sources.py":
        "e4a1dc6b0bae612dfe6e4c74aa54851824ba1d36",
    "tests/world-v2-r18-105-postgres/run.sh":
        "e6a92d934fef4905216f86e18e77e5dba4f17503",
    "tests/world-v2-r18-105-postgres/post-candidate.sql":
        "fe9c2a4045048661469166f517ca0cdc9296c4ed",
}
PERMISSIONS = (
    "all_83_original_sql_semantics_approved",
    "all_67_authenticated_privileged_call_chains_approved",
    "real_signed_dm_p1_p2_revoked_outsider_qa_passed",
    "owner_qa_install_authorized",
    "production_release_authorized",
)
RESTRICT = (
    "no_hosted_original_or_qa_sql_changes",
    "no_runtime_changes",
    "no_versioned_migrations",
    "no_merge",
    "no_deploy",
    "no_paid_resources",
)
NO_REPAIR_AUTOMATIC = (
    "no_revert_to_original_unsafe_function_as_rollback",
)
BLOB_SHA1 = re.compile(r"^[0-9a-f]{40}$")

class AuditBlocked(Exception):
    pass

def unique_pairs(pairs: list[tuple[str, object]]) -> dict:
    data = {}
    for key, val in pairs:
        if key in data:
            raise AuditBlocked("DUPLICATE_JSON")
        data[key] = val
    return data

def git_blob_sha1(source: bytes) -> str:
    return hashlib.sha1(f"blob {len(source)}\0".encode() + source).hexdigest()

def source_integrity(root: Path) -> None:
    for path, expected in EXPECTED_BLOBS.items():
        candidate = root / path
        if not candidate.is_file() or candidate.is_symlink():
            raise AuditBlocked("SOURCE_NOT_A_REGULAR_FILE")
        # All are small text security fixtures, not external SQL or network inputs.
        if candidate.stat().st_size > 256 * 1024:
            raise AuditBlocked("SOURCE_OVERSIZE")
        if git_blob_sha1(candidate.read_bytes()) != expected:
            raise AuditBlocked("SEALED_FOG_REPAIR_OR_REGRESSION_CHANGED")

def check(data: dict, root: Path) -> dict:
    if not isinstance(data, dict) or data.get("schema") != 1 or type(data.get("schema")) is not int:
        raise AuditBlocked("SCHEMA")
    if set(data) != {
        "schema", "work_package", "date", "decision", "direct_parent",
        "owner_private_r191_receipt", "current_live_fog_body",
        "frozen_prior_unapplied_repair", "known_fixture_result",
        "no_revert_to_original_unsafe_function_as_rollback",
        "permissions", "no_hosted_original_or_qa_sql_changes",
        "no_runtime_changes", "no_versioned_migrations", "no_merge",
        "no_deploy", "no_paid_resources", "next_requisite",
    }:
        raise AuditBlocked("UNEXPECTED_FIELDS")
    if (data["work_package"] != WORK_PACKAGE
        or data["decision"] != "NO_GO"
        or data["date"] != "2026-11-21"
        or data["direct_parent"] != {
            "pr": 300, "commit": "8cb0da0758659df7584f102daf5eb365b765012f"
        }):
        raise AuditBlocked("SOURCE_LINEAGE")
    if data["owner_private_r191_receipt"] != EXPECTED_R191 or any(
        type(data["owner_private_r191_receipt"][key]) is not type(expected)
        for key, expected in EXPECTED_R191.items()
    ):
        raise AuditBlocked("PRIVATE_R191_SNAPSHOT_DRIFT")
    if data["current_live_fog_body"] != EXPECTED_CURRENT:
        raise AuditBlocked("LIVE_CATALOG_DIGEST_DRIFT")
    frozen = data["frozen_prior_unapplied_repair"]
    if not isinstance(frozen, dict) or set(frozen) != {
        "pr","candidate_path","git_blob_sha1","fixture_pr",
        "pg17_source_extractor","pg17_runner","pg17_post_candidate"
    } or frozen["pr"] != 206 or frozen["fixture_pr"] != 207:
        raise AuditBlocked("UNAPPROVED_FOG_REPAIR_REPLACEMENT")
    if (frozen["candidate_path"] != next(iter(EXPECTED_BLOBS))
        or frozen["git_blob_sha1"] != EXPECTED_BLOBS[frozen["candidate_path"]]):
        raise AuditBlocked("FOG_REPAIR_SHA_DRIFT")
    for key in ("pg17_source_extractor", "pg17_runner", "pg17_post_candidate"):
        ref = frozen[key]
        if not isinstance(ref, dict) or set(ref) != {"path","git_blob_sha1"}:
            raise AuditBlocked("PG17_FIXTURE_SCHEMA")
        if ref["path"] not in EXPECTED_BLOBS or ref["git_blob_sha1"] != EXPECTED_BLOBS[ref["path"]]:
            raise AuditBlocked("PG17_FIXTURE_MUTATED")
    if (not isinstance(data["permissions"], dict)
        or set(data["permissions"]) != set(PERMISSIONS)
        or any(data["permissions"][p] is not False for p in PERMISSIONS)):
        raise AuditBlocked("RELEASE_APPROVAL_CANNOT_BE_GRANTED")
    if any(data[key] is not True for key in (*RESTRICT, *NO_REPAIR_AUTOMATIC)):
        raise AuditBlocked("RESTRICTED_ACTION_NOT_PROHIBITED")
    if data["known_fixture_result"] != (
        "Synthetic signed-actor simulation in disposable PG17 reproduced baseline fog status oracle, "
        "candidate denied cross-campaign and revoked actor while preserving legitimate combat roster RLS; "
        "no real hosted signed QA."
    ):
        raise AuditBlocked("FIXTURE_PROVENANCE_DRIFT")
    if data["next_requisite"] != (
        "Independent historical semantic review and signed QA; only owner can separately authorize QA "
        "schema install and production release."
    ):
        raise AuditBlocked("NEXT_GATES_CHANGED")
    source_integrity(root)
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "owner_private_r191_structurally_reconciled": True,
        "original_to_live_fog_body_sha256_matches": True,
        "frozen_unapplied_repair_candidate_git_blob_verified": True,
        "existing_disposable_pg17_regression_sources_verified": True,
        "restore_original_unsecured_fog_function_as_rollback_allowed": False,
        "full_83_historical_semantics_approved": False,
        "all_67_live_privileged_call_chains_approved": False,
        "real_signed_qa_passed": False,
        "hosted_sql_or_production_release_authorized": False,
        "database_accessed_or_modified": False,
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="R192 source-only fog guarded-candidate R191 linkage")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    try:
        p = args.root / MANIFEST
        if p.is_symlink() or not p.is_file() or p.stat().st_size > MAX_MANIFEST_BYTES:
            raise AuditBlocked("INVALID_MANIFEST_FILE")
        data = json.loads(p.read_text(), object_pairs_hook=unique_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(AuditBlocked("NONFINITE")))
        print(json.dumps(check(data, args.root), indent=2, sort_keys=True))
        return 0
    except (AuditBlocked, OSError, TypeError, ValueError, KeyError, IndexError):
        print("R18-192 FOG_GUARD_LINEAGE_NO_GO: private evidence/fixture drift; no release.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
