#!/usr/bin/env python3
"""R18-191: read-only private history lineage of one live fog-status RPC.

Rechecks R154's 83 source hashes, scans direct CREATE FUNCTION statements,
and emits only bounded counts/boolean flags and R111 docket ordinals.
Never prints original SQL, private migration names, function signatures or keys.
Historical equivalence is NOT authorization approval or a repair.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked, MAX_SQL_BYTES, audit, checked_dir, checked_file, statements
)
import r186_private_privileged_statement_inventory as r186

WORK_PACKAGE = "B10-R18-191"
LIVE_BODY_SHA256 = "767cbcd8bd4813c0a535fa71bf1ecc3a9cf8a6dd02c239499c0be1737a28c96f"
LIVE_BODY_BYTES = 102
MAX_HISTORICAL_DEFINITIONS = 100
DIRECT_TARGET = re.compile(
    r'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+'
    r'(?:(?:"public"|public)\s*\.\s*)?'
    r'(?:"is_map_fog_published"|is_map_fog_published)\s*\(', re.I
)
DOLLAR_BODY = re.compile(r'\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)', re.I)
LANGUAGE_SQL = re.compile(r'\bLANGUAGE\s+sql\b', re.I)
SECURITY_DEFINER = re.compile(r'\bSECURITY\s+DEFINER\b', re.I)
IDENTITY = re.compile(r'\bauth\s*\.\s*(?:uid|jwt)\s*\(', re.I)
MEMBERSHIP = re.compile(r'\bcampaign_members\b', re.I)
MAP_HELPER = re.compile(r'\bcan_view_campaign_map\b', re.I)
VERSION = re.compile(r'^(\d{14})_.+\.sql$', re.I)

def strict_migration_version(filename: str) -> datetime | None:
    hit = VERSION.fullmatch(filename)
    if not hit:
        return None
    try:
        return datetime.strptime(hit.group(1), "%Y%m%d%H%M%S")
    except ValueError:
        return None

def examine_direct_definition(statement: str) -> dict | None:
    if not DIRECT_TARGET.match(statement):
        return None
    outside = r186.exclude_dollar_bodies(statement)
    if not SECURITY_DEFINER.search(outside):
        # Other direct definitions still count, since invoker may overwrite
        # the existing privileged function and make old lineage noncurrent.
        privileged = False
    else:
        privileged = True
    if not LANGUAGE_SQL.search(outside):
        return {
            "explicit_definer": privileged, "supported_sql_dollar_body": False,
            "sha256_matches_live": False, "byte_length_matches_live": False,
            "direct_identity_marker": bool(IDENTITY.search(statement)),
            "direct_membership_or_map_helper_marker":
                bool(MEMBERSHIP.search(statement) or MAP_HELPER.search(statement)),
        }
    mark = DOLLAR_BODY.search(statement)
    if mark is None:
        return {
            "explicit_definer": privileged, "supported_sql_dollar_body": False,
            "sha256_matches_live": False, "byte_length_matches_live": False,
            "direct_identity_marker": bool(IDENTITY.search(statement)),
            "direct_membership_or_map_helper_marker":
                bool(MEMBERSHIP.search(statement) or MAP_HELPER.search(statement)),
        }
    tag = mark.group(1)
    close = statement.find(tag, mark.end())
    if close < 0:
        raise AuditBlocked("R191_UNTERMINATED_TARGET_BODY")
    raw = statement[mark.end():close].encode("utf-8")
    if not raw or len(raw) > MAX_SQL_BYTES:
        raise AuditBlocked("R191_TARGET_BODY_LIMIT")
    return {
        "explicit_definer": privileged,
        "supported_sql_dollar_body": True,
        "sha256_matches_live": hashlib.sha256(raw).hexdigest() == LIVE_BODY_SHA256,
        "byte_length_matches_live": len(raw) == LIVE_BODY_BYTES,
        "direct_identity_marker": bool(IDENTITY.search(statement)),
        "direct_membership_or_map_helper_marker":
            bool(MEMBERSHIP.search(statement) or MAP_HELPER.search(statement)),
    }

def report(root: Path) -> dict:
    evidence = audit(root)
    if evidence.get("files_sha256_verified") != 83 or evidence.get("files_security_approved") != 0:
        raise AuditBlocked("R191_HISTORY_SHA_GUARD_NOT_READY")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024*1024))
    items = docket.get("reviewItems")
    if not isinstance(items, list) or len(items) != 83:
        raise AuditBlocked("R191_DOCKET_83_REQUIRED")
    folder = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")
    entries = []
    chronology = {}
    for index, item in enumerate(items, 1):
        filename = item["filename"]
        version = strict_migration_version(filename)
        if version is None or version in chronology:
            chronology_valid = False
        else:
            chronology_valid = True
            chronology[version] = index
        raw = checked_file(folder / filename, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R191_HISTORY_MUTATED")
        for ordinal, statement in enumerate(statements(raw.decode("utf-8")), 1):
            context = examine_direct_definition(statement)
            if context is not None:
                entries.append({
                    "r111_priority_docket_index_not_chronology": index,
                    "executable_statement_ordinal": ordinal,
                    "version": version,
                    "context": context,
                })
                if len(entries) > MAX_HISTORICAL_DEFINITIONS:
                    raise AuditBlocked("R191_TOO_MANY_TARGET_DEFINITIONS")
    # Validate all 83 timestamps, not just the target entries. Never publish dates.
    chronology_complete = len(chronology) == 83 and all(
        strict_migration_version(item["filename"]) is not None for item in items
    )
    direct = len(entries)
    ordered = sorted(entries, key=lambda e: (e["version"] or datetime.min, e["executable_statement_ordinal"]))
    latest = ordered[-1] if ordered and chronology_complete else None
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "mode": "OFFLINE_SHA_PINNED_PRIVATE_FOG_STATUS_DIRECT_DEFINITION_LINEAGE",
        "original_historical_sources_sha256_verified": 83,
        "historical_direct_target_definitions": direct,
        "historical_explicit_security_definer_definitions": sum(e["context"]["explicit_definer"] for e in entries),
        "historical_supported_sql_dollar_bodies": sum(e["context"]["supported_sql_dollar_body"] for e in entries),
        "historical_body_sha256_matches_live_count": sum(e["context"]["sha256_matches_live"] for e in entries),
        "historical_body_length_matches_live_count": sum(e["context"]["byte_length_matches_live"] for e in entries),
        "all_83_migration_filenames_validated_unique_timestamp_chronology": chronology_complete,
        "latest_direct_target_definition_identified": latest is not None,
        "latest_direct_target_r111_priority_docket_index_not_chronology":
            latest["r111_priority_docket_index_not_chronology"] if latest else None,
        "latest_direct_target_executable_statement_ordinal":
            latest["executable_statement_ordinal"] if latest else None,
        "latest_direct_target_explicit_definer": latest["context"]["explicit_definer"] if latest else False,
        "latest_direct_target_body_sha256_matches_live": latest["context"]["sha256_matches_live"] if latest else False,
        "latest_direct_target_body_length_matches_live": latest["context"]["byte_length_matches_live"] if latest else False,
        "latest_direct_target_has_direct_identity_marker": latest["context"]["direct_identity_marker"] if latest else False,
        "latest_direct_target_has_membership_or_map_helper_marker":
            latest["context"]["direct_membership_or_map_helper_marker"] if latest else False,
        "current_overload_signature_identity_proven": False,
        "effective_revoke_and_outsider_authorization_proven": False,
        "all_67_live_privileged_call_chains_approved": False,
        "all_83_history_semantics_approved": False,
        "real_signed_qa_passed": False,
        "qa_or_production_sql_authorized": False,
        "function_sql_filenames_signatures_paths_or_secrets_exported": False,
        "network_or_database_accessed": False,
        "limitations": [
            "Only direct top-level CREATE FUNCTION statements are detected; dynamic SQL and later installation may differ.",
            "Historical timestamps permit ordering only if every original filename has a unique valid version; signature identity is not proven.",
            "Byte-exact historical/latest live body alone does not establish caller authentication, campaign authorization or revocation safety."
        ]
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="R191 private fog publication source lineage")
    parser.add_argument("--root", type=Path, default=Path.home() / "ttrpg-history-private")
    args = parser.parse_args()
    try:
        print(json.dumps(report(args.root), indent=2, sort_keys=True))
        return 0
    except (AuditBlocked, OSError, UnicodeError, ValueError, TypeError, KeyError, IndexError):
        print("R18-191 PRIVATE_HISTORY_NO_GO: history/parser error; do not export SQL.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
