#!/usr/bin/env python3
"""R18-188: one SHA-pinned original statement's metadata-token context, offline.

Never exports migration SQL, identifiers, function names, files or literal values.
Lexical findings cannot establish data flow, effective grants or authorization.
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
import r186_private_privileged_statement_inventory as definer
import r187_private_privileged_priority_queue as prior

WORK_PACKAGE = "B10-R18-188"
TARGET_DOCKET = 31
TARGET_STATEMENT = 1
TARGET_MARKERS = ("USER_EDITABLE_AUTH_METADATA_MARKER",)
META = re.compile(r"\b(?:raw_user_meta_data|user_metadata)\b", re.I)
APP_META = re.compile(r"\b(?:raw_app_meta_data|app_metadata)\b", re.I)
JWT = re.compile(r"\bauth\s*\.\s*jwt\s*\(", re.I)
UID = re.compile(r"\bauth\s*\.\s*uid\s*\(", re.I)
AUTH_USERS = re.compile(r"\bauth\s*\.\s*users\b", re.I)
CAMPAIGN_MEMBERS = re.compile(r"\bcampaign_members\b", re.I)
MAX_MARKERS = 64

def split_code_and_literals(source: str) -> tuple[str, str, int]:
    """Strip SQL-style comments (including inside dollar-quoted function bodies).

    Preserve double-quoted identifiers in the code stream. Separate single-
    quoted literal contents, whose role could be a JSON key OR dynamic SQL.
    Never infer that a string literal is inert. Reject unterminated input.
    """
    code, literals = [], []
    i, n, comments = 0, len(source), 0
    while i < n:
        if source.startswith("--", i):
            comments += 1
            end = source.find("\n", i + 2)
            code.append(" ")
            i = n if end < 0 else end
            continue
        if source.startswith("/*", i):
            comments += 1
            depth = 1
            i += 2
            while i < n and depth:
                if source.startswith("/*", i):
                    depth += 1
                    i += 2
                elif source.startswith("*/", i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            if depth:
                raise AuditBlocked("R188_UNCLOSED_BLOCK_COMMENT")
            code.append(" ")
            continue
        if source[i] == "'":
            i += 1
            literal = []
            closed = False
            while i < n:
                if source[i] == "'":
                    if i + 1 < n and source[i + 1] == "'":
                        literal.append("'")
                        i += 2
                        continue
                    i += 1
                    closed = True
                    break
                literal.append(source[i])
                i += 1
            if not closed:
                raise AuditBlocked("R188_UNCLOSED_SQL_LITERAL")
            literals.append("".join(literal))
            code.append(" ")
            continue
        if source[i] == '"':
            start = i
            i += 1
            closed = False
            while i < n:
                if source[i] == '"':
                    if i + 1 < n and source[i + 1] == '"':
                        i += 2
                        continue
                    i += 1
                    closed = True
                    break
                i += 1
            if not closed:
                raise AuditBlocked("R188_UNCLOSED_QUOTED_IDENTIFIER")
            code.append(source[start:i])
            continue
        code.append(source[i])
        i += 1
    return "".join(code), " ".join(literals), comments

def assess_statement(statement: str) -> dict:
    privileged, markers = definer.flag_definer(statement)
    if not privileged or markers != TARGET_MARKERS:
        raise AuditBlocked("R188_TARGET_NOT_EXACT_R187_MARKERS")
    code, literals, comments = split_code_and_literals(statement)
    unquoted = len(META.findall(code))
    quoted = len(META.findall(literals))
    raw = len(META.findall(statement))
    if raw < 1 or raw > MAX_MARKERS or unquoted + quoted > raw:
        raise AuditBlocked("R188_METADATA_MARKER_COUNT_MISMATCH")
    return {
        "target_privileged_statement_identified": True,
        "metadata_markers_unquoted_code": unquoted,
        "metadata_markers_single_quoted_literals": quoted,
        "metadata_markers_comments_or_noncode_difference": raw - unquoted - quoted,
        "sql_style_comment_blocks_or_lines": comments,
        "auth_uid_token_in_code": bool(UID.search(code)),
        "auth_jwt_token_in_code": bool(JWT.search(code)),
        "auth_users_relation_token_in_code": bool(AUTH_USERS.search(code)),
        "campaign_members_token_in_code": bool(CAMPAIGN_MEMBERS.search(code)),
        "app_metadata_reference_token_present": bool(APP_META.search(code) or APP_META.search(literals)),
        "authorization_use_of_user_metadata_determined": False,
        "effective_latest_function_definition_determined": False,
        "manual_semantic_review_required": True,
    }

def report(root: Path) -> dict:
    base = prior.report(root)  # Rehash and recount all 83 source files.
    if (base.get("decision") != "NO_GO"
        or base.get("historical_files_sha256_verified") != 83
        or base.get("historical_definer_statements_with_markers") != 158
        or base.get("triage_bucket_counts") != {
            "USER_METADATA_LEXICAL_MARKER": 1,
            "NO_DIRECT_IDENTITY_AND_NO_MEMBERSHIP_MARKER": 56,
            "NO_DIRECT_IDENTITY_MARKER_ONLY": 14,
            "OTHER_LEXICAL_REVIEW_MARKERS": 87,
        }
        or base.get("hosted_sql_or_production_release_authorized") is not False
        or base.get("historical_migration_semantics_approved") is not False
        or base.get("effective_privileged_authorization_approved") is not False
        or base.get("signed_qa_passed") is not False):
        raise AuditBlocked("R188_R187_PARITY_FAILED")
    queue = base.get("bounded_priority_queue")
    if not isinstance(queue, list) or not queue:
        raise AuditBlocked("R188_PRIORITY_QUEUE_EMPTY")
    target = queue[0]
    if (target.get("r111_docket_review_index_not_chronology") != TARGET_DOCKET
        or target.get("executable_statement_ordinal") != TARGET_STATEMENT
        or target.get("triage_bucket") != "USER_METADATA_LEXICAL_MARKER"
        or target.get("lexical_markers") != list(TARGET_MARKERS)):
        raise AuditBlocked("R188_TARGET_ORDER_MISMATCH")

    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024 * 1024))
    items = docket.get("reviewItems")
    if not isinstance(items, list) or len(items) != 83:
        raise AuditBlocked("R188_PRIVATE_DOCKET_INVALID")
    entry = items[TARGET_DOCKET - 1]
    file = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations") / entry["filename"]
    raw = checked_file(file, MAX_SQL_BYTES)
    if hashlib.sha256(raw).hexdigest() != entry["sourceBodySha256"]:
        raise AuditBlocked("R188_TARGET_SHA_CHANGED")
    parsed = statements(raw.decode("utf-8"))
    if len(parsed) < TARGET_STATEMENT:
        raise AuditBlocked("R188_TARGET_STATEMENT_MISSING")
    context = assess_statement(parsed[TARGET_STATEMENT - 1])
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "mode": "OFFLINE_EXACT_R187_METADATA_MARKER_CONTEXT_NOT_AUTHORIZATION_AUDIT",
        "historical_files_sha256_verified": 83,
        "r111_docket_review_index_not_chronology": TARGET_DOCKET,
        "executable_statement_ordinal": TARGET_STATEMENT,
        "bounded_source_context": context,
        "sql_function_names_paths_identifiers_or_secrets_exported": False,
        "network_or_database_accessed": False,
        "all_83_history_semantics_approved": False,
        "all_67_live_call_chains_approved": False,
        "signed_qa_passed": False,
        "qa_or_production_sql_authorized": False,
        "limitations": [
            "Token context is not semantic SQL control/data flow, policy composition or privilege review.",
            "Single-quoted text may be a JSON field key or dynamic SQL; metadata use is NOT certified safe.",
            "Historical function statements may be replaced later; no current effective-function equivalence is established."
        ]
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="R188 private metadata marker context")
    parser.add_argument("--root", type=Path, default=Path.home() / "ttrpg-history-private")
    args = parser.parse_args()
    try:
        print(json.dumps(report(args.root), sort_keys=True, indent=2))
        return 0
    except (AuditBlocked, OSError, UnicodeError, ValueError, TypeError, KeyError, IndexError):
        print("R18-188 PRIVATE_AUDIT_NO_GO: source/target context mismatched; never upload source SQL.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
