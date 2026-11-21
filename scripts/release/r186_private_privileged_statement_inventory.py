#!/usr/bin/env python3
"""R18-186: private SHA-verified statement-level privileged-function triage.

Only fixed risk codes, counts and R111 docket/statement ordinal numbers leave
the private workspace. This is lexical audit, not RLS or call-chain approval.
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
    AuditBlocked, MAX_SQL_BYTES, audit, checked_dir, checked_file, statements
)

WORK_PACKAGE = "B10-R18-186"
MAX_ITEMS = 24
CREATE_FUNCTION = re.compile(r"^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b", re.I)
DOLLAR = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")
DEF = re.compile(r"\bSECURITY\s+DEFINER\b", re.I)
SEARCH_PATH = re.compile(r"\bSET\s+search_path\s*(?:=|TO)\b", re.I)
PUBLIC_PATH = re.compile(r"\bSET\s+search_path\s*(?:=|TO)\s*(?:public\b|\"public\")", re.I)
IDENTITY = re.compile(r"\bauth\s*\.\s*(?:uid|jwt)\s*\(", re.I)
CAMPAIGN = re.compile(r"\bcampaign_members\b", re.I)
DYNAMIC = re.compile(r"\bEXECUTE\s+(?:format\s*\(|['\"]|\$|[a-z_][a-z_0-9]*)", re.I)
USER_META = re.compile(r"\b(?:raw_user_meta_data|user_metadata)\b", re.I)
GRANT_PUBLIC = re.compile(
    r"^\s*GRANT\s+EXECUTE\s+ON\s+(?:ALL\s+)?FUNCTIONS?\b[\s\S]*\bTO\s+PUBLIC\b", re.I
)
RISK_CODES = (
    "MISSING_FUNCTION_LOCAL_SEARCH_PATH_MARKER",
    "FUNCTION_LOCAL_SEARCH_PATH_PUBLIC_MARKER",
    "MISSING_DIRECT_AUTH_IDENTITY_MARKER",
    "MISSING_CAMPAIGN_MEMBERSHIP_MARKER",
    "DYNAMIC_EXECUTE_MARKER",
    "USER_EDITABLE_AUTH_METADATA_MARKER",
)

def exclude_dollar_bodies(sql: str) -> str:
    """Remove dollar-quoted source from the header check; keep outside attributes.

    Top-level statements have already been split by R154's comment-aware splitter.
    Quoted-string CREATE FUNCTION bodies remain a documented lexical limitation.
    """
    result = []
    position = 0
    while True:
        start = DOLLAR.search(sql, position)
        if start is None:
            result.append(sql[position:])
            return "".join(result)
        result.append(sql[position:start.start()])
        tag = start.group(0)
        end = sql.find(tag, start.end())
        if end < 0:
            raise AuditBlocked("R186_SOURCE_UNBALANCED")
        position = end + len(tag)

def flag_definer(statement: str) -> tuple[bool, tuple[str, ...]]:
    if not CREATE_FUNCTION.search(statement):
        return False, ()
    outside = exclude_dollar_bodies(statement)
    if not DEF.search(outside):
        return False, ()
    code = []
    if not SEARCH_PATH.search(outside):
        code.append(RISK_CODES[0])
    if PUBLIC_PATH.search(outside):
        code.append(RISK_CODES[1])
    if not IDENTITY.search(statement):
        code.append(RISK_CODES[2])
    if not CAMPAIGN.search(statement):
        code.append(RISK_CODES[3])
    if DYNAMIC.search(statement):
        code.append(RISK_CODES[4])
    if USER_META.search(statement):
        code.append(RISK_CODES[5])
    return True, tuple(code)

def report(root: Path) -> dict:
    prior = audit(root)
    if prior.get("files_sha256_verified") != 83 or prior.get("files_security_approved") != 0:
        raise AuditBlocked("R186_SHA_PROVENANCE_NOT_READY")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024*1024))
    items = docket.get("reviewItems")
    if not isinstance(items, list) or len(items) != 83:
        raise AuditBlocked("R186_DOCKET_MISMATCH")
    folder = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")
    counts = Counter()
    all_findings = []
    for index, item in enumerate(items, 1):
        filename = item["filename"]
        raw = checked_file(folder / filename, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R186_MUTABLE_ARCHIVE")
        source = raw.decode("utf-8")
        for ordinal, statement in enumerate(statements(source), 1):
            if GRANT_PUBLIC.search(statement):
                counts["top_level_public_execute_grant_markers"] += 1
            if not CREATE_FUNCTION.search(statement):
                continue
            counts["direct_create_function_statements"] += 1
            privileged, codes = flag_definer(statement)
            if not privileged:
                continue
            counts["direct_security_definer_statements"] += 1
            for code in codes:
                counts[code] += 1
            if codes:
                all_findings.append({
                    "r111_docket_review_index_not_chronology": index,
                    "executable_statement_ordinal": ordinal,
                    "lexical_markers": list(codes),
                })
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "mode": "OFFLINE_PER_STATEMENT_PRIVILEGED_LEXICAL_REVIEW_QUEUE",
        "history_files_sha256_verified": 83,
        "direct_create_function_statements": counts["direct_create_function_statements"],
        "direct_security_definer_statements": counts["direct_security_definer_statements"],
        "top_level_public_execute_grant_markers": counts["top_level_public_execute_grant_markers"],
        "risk_marker_occurrences": {key: counts[key] for key in RISK_CODES},
        "definer_statements_with_any_review_marker": len(all_findings),
        "bounded_review_queue": all_findings[:MAX_ITEMS],
        "bounded_review_queue_remaining": max(0, len(all_findings) - MAX_ITEMS),
        "review_queue_is_r111_docket_priority_order_not_migration_chronology": True,
        "filenames_or_sql_bodies_exported": False,
        "database_or_network_accessed": False,
        "all_67_live_privileged_call_chains_approved": False,
        "all_83_history_semantics_approved": False,
        "real_signed_qa_passed": False,
        "qa_or_production_sql_authorized": False,
        "limitations": [
            "Statements and string markers cannot prove effective RLS, grants, SECURITY DEFINER authorization, helper calls or SQL execution effects.",
            "Historical CREATE FUNCTION statements may redefine the same signature; these counts are not 67 live RPCs or a final catalog inventory.",
            "No private SQL has been executed, no hosted QA has passed, and this report must never approve migration installation."
        ]
    }

def main() -> int:
    p = argparse.ArgumentParser(description="R186 private function statement review queue")
    p.add_argument("--root", type=Path, default=Path.home() / "ttrpg-history-private")
    args = p.parse_args()
    try:
        print(json.dumps(report(args.root), indent=2, sort_keys=True))
        return 0
    except (AuditBlocked, OSError, UnicodeError, ValueError, TypeError, KeyError, IndexError):
        print("R18-186 PRIVATE_AUDIT_NO_GO: input integrity or parser problem; do not share source files.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
