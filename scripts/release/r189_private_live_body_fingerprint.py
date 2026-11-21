#!/usr/bin/env python3
"""R18-189 read-only private original SQL body vs live catalogue digest check.

No raw SQL, function names/signatures, file paths or user data leave WSL.
Fingerprint equivalence is not proof of permissions, SQL semantics or safe RLS.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
)
import r186_private_privileged_statement_inventory as r186
import r188_private_metadata_context as prior

WORK_PACKAGE = "B10-R18-189"
TARGET_DOCKET_INDEX = 31
TARGET_STATEMENT_ORDINAL = 1

# Read-only original live pg_catalog snapshot, 21 November 2026.
# SHA-256 is of pg_proc.prosrc only; no SQL body or identifiers were exported.
LIVE_BODY_SHA256 = "bd98b2ec061445b828724d0830f1da245b845a3e9c83fcf7c1a17bd34343c9a6"
LIVE_BODY_BYTES = 378

AS_DOLLAR = re.compile(r"\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)", re.I)
SQL_LANGUAGE = re.compile(r"\bLANGUAGE\s+sql\b", re.I)

def extract_dollar_quoted_sql_body(statement: str) -> str:
    # R188 already validates the target's historical explicit definer markers.
    is_definer, markers = r186.flag_definer(statement)
    if not is_definer or markers != ("USER_EDITABLE_AUTH_METADATA_MARKER",):
        raise AuditBlocked("R189_TARGET_MARKER_MISMATCH")
    header = r186.exclude_dollar_bodies(statement)
    if not SQL_LANGUAGE.search(header):
        raise AuditBlocked("R189_NON_SQL_FUNCTION_LANGUAGE")
    starts = list(AS_DOLLAR.finditer(header))
    if len(starts) != 1:
        raise AuditBlocked("R189_UNSUPPORTED_FUNCTION_BODY_FORM")
    opening = starts[0]
    # exclude_dollar_bodies shortens the outside source. Locate AS directly in
    # the original unchanged statement rather than trusting its offsets.
    direct = AS_DOLLAR.search(statement)
    if direct is None or direct.group(1) != opening.group(1):
        raise AuditBlocked("R189_DOLLAR_BODY_MISMATCH")
    tag = direct.group(1)
    end = statement.find(tag, direct.end())
    if end < 0:
        raise AuditBlocked("R189_UNCLOSED_DOLLAR_BODY")
    body = statement[direct.end():end]
    if not body or len(body.encode("utf-8")) > MAX_SQL_BYTES:
        raise AuditBlocked("R189_BODY_LIMIT")
    return body

def body_checks(body: str, expected_sha256: str, expected_bytes: int) -> dict[str, bool]:
    content = body.encode("utf-8")
    sha_match = hashlib.sha256(content).hexdigest() == expected_sha256
    byte_match = len(content) == expected_bytes
    return {
        "historical_source_body_sha256_matches_live_catalogue": sha_match,
        "historical_source_body_length_matches_live_catalogue": byte_match,
        "body_fingerprint_and_length_both_match": sha_match and byte_match,
    }

def report(root: Path) -> dict:
    evidence = prior.report(root)  # Exact R188 target + all 83 verified SHA sources.
    context = evidence.get("bounded_source_context")
    if (evidence.get("decision") != "NO_GO"
        or evidence.get("historical_files_sha256_verified") != 83
        or evidence.get("r111_docket_review_index_not_chronology") != TARGET_DOCKET_INDEX
        or evidence.get("executable_statement_ordinal") != TARGET_STATEMENT_ORDINAL
        or not isinstance(context, dict)
        or context.get("metadata_markers_unquoted_code") != 2
        or context.get("metadata_markers_single_quoted_literals") != 0
        or context.get("metadata_markers_comments_or_noncode_difference") != 0
        or context.get("authorization_use_of_user_metadata_determined") is not False
        or evidence.get("all_67_live_call_chains_approved") is not False
        or evidence.get("all_83_history_semantics_approved") is not False
        or evidence.get("qa_or_production_sql_authorized") is not False):
        raise AuditBlocked("R189_R188_REPORT_PARITY_MISMATCH")

    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024 * 1024))
    items = docket.get("reviewItems")
    if not isinstance(items, list) or len(items) != 83:
        raise AuditBlocked("R189_DOCKET_INVALID")
    item = items[TARGET_DOCKET_INDEX - 1]
    archive = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")
    raw = checked_file(archive / item["filename"], MAX_SQL_BYTES)
    if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
        raise AuditBlocked("R189_SOURCE_CHANGED")
    pieces = statements(raw.decode("utf-8"))
    if len(pieces) < TARGET_STATEMENT_ORDINAL:
        raise AuditBlocked("R189_TARGET_MISSING")
    body = extract_dollar_quoted_sql_body(pieces[TARGET_STATEMENT_ORDINAL - 1])
    checks = body_checks(body, LIVE_BODY_SHA256, LIVE_BODY_BYTES)
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "mode": "OFFLINE_ORIGINAL_BODY_SHA256_VS_READONLY_LIVE_PG_PROC_PROSRC",
        "historical_sources_sha256_verified": 83,
        "target_r111_priority_docket_index_not_chronology": TARGET_DOCKET_INDEX,
        "target_executable_statement_ordinal": TARGET_STATEMENT_ORDINAL,
        "single_dollar_quoted_sql_function_body_verified": True,
        "source_body_comparison": checks,
        "live_reference_catalogue_public_definer_count": 85,
        "live_reference_authenticated_callable_definer_count": 67,
        "live_reference_user_metadata_definer_candidates": 1,
        "live_reference_user_metadata_candidate_anonymous_executable": False,
        "live_reference_user_metadata_candidate_authenticated_executable": True,
        "no_function_signatures_sql_identifiers_paths_or_secret_values_exported": True,
        "network_or_database_accessed_by_offline_script": False,
        "function_signature_identity_proven": False,
        "metadata_authorization_dataflow_proven_safe": False,
        "metadata_authorization_dataflow_proven_unsafe": False,
        "all_83_historical_semantics_approved": False,
        "all_67_live_privileged_call_chains_approved": False,
        "signed_qa_passed": False,
        "qa_or_production_sql_authorized": False,
        "limitations": [
            "Identical SQL body bytes, if found, are not proof of function identity, current owner/ACL/RLS or correct authorization.",
            "A source mismatch may mean later replacement, normalization differences or a distinct function; investigate without sharing original SQL.",
            "User-editable metadata must never supply authorization authority, even when the same function checks auth.uid or campaign membership."
        ],
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="R189 private function body SHA parity")
    parser.add_argument("--root", type=Path, default=Path.home() / "ttrpg-history-private")
    args = parser.parse_args()
    try:
        print(json.dumps(report(args.root), sort_keys=True, indent=2))
        return 0
    except (AuditBlocked, OSError, UnicodeError, ValueError, TypeError, KeyError, IndexError):
        print("R18-189 PRIVATE_AUDIT_NO_GO: integrity/unsupported source form; do not upload SQL.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
