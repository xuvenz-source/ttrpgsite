#!/usr/bin/env python3
"""R190: fail-closed NO_GO validation of fixed read-only catalog evidence.

This does not inspect or export database SQL, invoke RPCs, or authorize release.
It checks that the captured original-catalog indicators retain their exact
bounded structure; lexical markers are not semantic authorization.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

WORK_PACKAGE = "B10-R18-190"
MAX_RECEIPT_BYTES = 8192
COUNTS = {
    "public_definers": 85,
    "authenticated_callable_definers": 67,
    "direct_identity_markers": 60,
    "missing_direct_identity_markers": 7,
    "anonymous_callable_definers": 0,
    "user_metadata_definer_candidates": 1,
    "metadata_total_words": 2,
    "metadata_words_before_first_from": 2,
    "metadata_words_at_or_after_first_where": 0,
    "metadata_function_uid_words_at_or_after_where": 1,
    "fog_status_authenticated_callable_overloads": 1,
}
BOOLEANS = {
    "metadata_candidate_returns_setof_record": True,
    "fog_status_returns_boolean": True,
    "fog_status_has_direct_identity_marker": False,
    "fog_status_has_literal_campaign_member_marker": False,
    "fog_status_has_map_view_helper_marker": False,
    "fog_status_anonymous_callable": False,
}
NO_APPROVAL = (
    "metadata_authorization_semantics_proven_safe",
    "metadata_authorization_semantics_proven_unsafe",
    "metadata_projection_only_ast_proven",
    "fog_status_caller_authorization_proven",
    "live_privileged_call_graph_approved",
    "full_original_83_migration_semantics_approved",
    "real_signed_qa_passed",
    "hosted_qa_installation_authorized",
    "production_release_authorized",
)
LIMITATIONS = (
    "Token positions relative to the first FROM and WHERE words are not an AST, cannot prove projections or effective authorization.",
    "Direct auth.uid/campaign membership string markers are heuristic and cannot validate helper call graphs or revoked-user enforcement.",
    "A pg_catalog snapshot is time-specific; no real signed DM/P1/P2/removed/outsider QA was performed.",
)
FIELDS = frozenset((
    "work_package", "mode", "decision", "original_project_status",
    "snapshot_date", "r189_sanitized_receipt_sha256", "evidence_provenance",
    "aggregate", "interpretation", "source_sql_bodies_or_user_data_exported",
    "sql_or_network_mutations_performed", "limitations"
))

class AuditBlocked(Exception):
    pass

def unique_pairs(pairs: list[tuple[str, object]]) -> dict:
    value = {}
    for key, item in pairs:
        if key in value:
            raise AuditBlocked("DUPLICATE_JSON_KEY")
        value[key] = item
    return value

def validate(data: dict) -> dict:
    if not isinstance(data, dict) or set(data) != FIELDS:
        raise AuditBlocked("RECEIPT_SCHEMA_DRIFT")
    expected_fixed = {
        "work_package": WORK_PACKAGE,
        "mode": "READONLY_ORIGINAL_PUBLIC_DEFINER_CATALOG_LEXICAL_SNAPSHOT",
        "decision": "NO_GO",
        "original_project_status": "ACTIVE_HEALTHY",
        "snapshot_date": "2026-11-21",
        "r189_sanitized_receipt_sha256": "48468e18b5deb53350cbefb75b29e984505fa99d90804e346d98a818caa3cb57",
        "evidence_provenance": "Supabase pg_catalog read-only aggregate; source not exported; reported current only at capture",
        "source_sql_bodies_or_user_data_exported": False,
        "sql_or_network_mutations_performed": False,
        "limitations": list(LIMITATIONS),
    }
    for key, target in expected_fixed.items():
        if data.get(key) != target or type(data.get(key)) is not type(target):
            raise AuditBlocked("PROVENANCE_OR_RELEASE_GUARD_CHANGED")
    aggregate = data["aggregate"]
    if not isinstance(aggregate, dict) or set(aggregate) != set(COUNTS) | set(BOOLEANS):
        raise AuditBlocked("CATALOGUE_FIELDS_CHANGED")
    for field, target in (COUNTS | BOOLEANS).items():
        if type(aggregate[field]) is not type(target) or aggregate[field] != target:
            raise AuditBlocked("CATALOGUE_COUNT_OR_FLAG_CHANGED")
    if aggregate["direct_identity_markers"] + aggregate["missing_direct_identity_markers"] != aggregate["authenticated_callable_definers"]:
        raise AuditBlocked("PRIVILEGED_COUNTS_INVALID")
    risk = data["interpretation"]
    if not isinstance(risk, dict) or set(risk) != set(NO_APPROVAL):
        raise AuditBlocked("RISK_SCHEMA_CHANGED")
    if any(risk[key] is not False for key in NO_APPROVAL):
        raise AuditBlocked("APPROVAL_MUST_REMAIN_FALSE")
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "readonly_catalog_evidence_reconciled": True,
        "historical_r189_sha_body_parity_reconciled": True,
        "authenticated_privileged_function_count": 67,
        "missing_direct_identity_marker_review_count": 7,
        "metadata_appears_in_pre_from_selection_not_where": True,
        "fog_status_has_no_direct_identity_or_map_helper_marker": True,
        "authorization_semantics_approved": False,
        "real_signed_qa_passed": False,
        "hosted_sql_or_production_authorized": False,
        "no_original_sql_or_user_data_exported": True,
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="R190 read-only catalog NO_GO snapshot validator")
    parser.add_argument("--receipt", type=Path,
        default=Path("staging/world-v2-b10-r18-190-live-catalog-authorization-triage/sanitized-catalog-snapshot.json"))
    args = parser.parse_args()
    try:
        raw = args.receipt.read_bytes()
        if len(raw) > MAX_RECEIPT_BYTES:
            raise AuditBlocked("RECEIPT_TOO_BIG")
        data = json.loads(raw, object_pairs_hook=unique_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(AuditBlocked("NONFINITE")))
        print(json.dumps(validate(data), indent=2, sort_keys=True))
        return 0
    except (AuditBlocked, OSError, UnicodeError, TypeError, ValueError, KeyError, IndexError):
        print("R18-190 CATALOGUE_RECONCILIATION_NO_GO: drift/invalid data; no release.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
