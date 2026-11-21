#!/usr/bin/env python3
"""R18-193 owner-local SHA-verified historical invite RPC definition lineage.

Reads only private R111/R106 originals inside the owner's WSL. No source SQL,
historical filenames, function names/signatures, values or paths are printed.
A source fingerprint match is not authorization/role/rejoin semantic approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked, MAX_SQL_BYTES, audit, checked_dir, checked_file, statements
)
from r191_private_fog_status_lineage import strict_migration_version
import r186_private_privileged_statement_inventory as r186

WORK_PACKAGE = "B10-R18-193"
TARGETS = {
    "JOIN": {
        "name": "join_campaign",
        "body_sha256": "5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655",
        "body_bytes": 742,
    },
    "CREATE": {
        "name": "create_campaign",
        "body_sha256": "0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f",
        "body_bytes": 475,
    },
}
DOLLAR = re.compile(r'\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)', re.I)
SECURITY_DEFINER = re.compile(r'\bSECURITY\s+DEFINER\b', re.I)
LANGUAGE_PLPGSQL = re.compile(r'\bLANGUAGE\s+plpgsql\b', re.I)
IDENTITY = re.compile(r'\bauth\s*\.\s*(?:uid|jwt)\s*\(', re.I)
MEMBERSHIP = re.compile(r'\bcampaign_members\b', re.I)
ON_CONFLICT = re.compile(r'\bON\s+CONFLICT\b', re.I)
USER_METADATA = re.compile(r'\b(?:raw_user_meta_data|user_metadata)\b', re.I)
MAX_HITS_PER_TARGET = 100

def matches_direct(statement: str, name: str) -> bool:
    # Quoted/unquoted simple names in public schema or implicit search_path.
    prefix = (r'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+'
              r'(?:(?:"public"|public)\s*\.\s*)?'
              + r'(?:' + re.escape(name) + r'|"' + re.escape(name) + r'")\s*\(')
    return re.match(prefix, statement, re.I) is not None

def evaluate(statement: str, target: dict) -> dict | None:
    if not matches_direct(statement, target["name"]):
        return None
    outside = r186.exclude_dollar_bodies(statement)
    definer = bool(SECURITY_DEFINER.search(outside))
    language = bool(LANGUAGE_PLPGSQL.search(outside))
    dollar = DOLLAR.search(statement)
    supported = bool(dollar and language)
    body = None
    if supported:
        tag = dollar.group(1)
        end = statement.find(tag, dollar.end())
        if end < 0:
            raise AuditBlocked("R193_UNCLOSED_BODY")
        body = statement[dollar.end():end].encode("utf-8")
        if not body or len(body) > MAX_SQL_BYTES:
            raise AuditBlocked("R193_BODY_SIZE")
    sha = bool(body is not None and hashlib.sha256(body).hexdigest() == target["body_sha256"])
    size = bool(body is not None and len(body) == target["body_bytes"])
    return {
        "explicit_security_definer": definer,
        "plpgsql_dollar_body_supported": supported,
        "sha256_matches_live": sha,
        "byte_length_matches_live": size,
        "direct_identity_marker": bool(IDENTITY.search(statement)),
        "direct_campaign_members_marker": bool(MEMBERSHIP.search(statement)),
        "on_conflict_marker": bool(ON_CONFLICT.search(statement)),
        "user_editable_metadata_marker": bool(USER_METADATA.search(statement)),
    }

def report(root: Path) -> dict:
    verified = audit(root)
    if verified.get("files_sha256_verified") != 83 or verified.get("files_security_approved") != 0:
        raise AuditBlocked("R193_HISTORY_NOT_SHA_VERIFIED")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root/"r111-private-review-docket.json", 1024*1024))
    items = docket.get("reviewItems")
    if not isinstance(items, list) or len(items) != 83:
        raise AuditBlocked("R193_EXPECTED_83_DOCKET_FILES")
    folder = checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    version_seen = set()
    entries = {tag: [] for tag in TARGETS}
    chronology_valid = True
    for index, item in enumerate(items, 1):
        filename = item["filename"]
        version = strict_migration_version(filename)
        if version is None or version in version_seen:
            chronology_valid = False
        else:
            version_seen.add(version)
        raw = checked_file(folder/filename, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R193_PRIVATE_ARCHIVE_DRIFT")
        for ordinal, statement in enumerate(statements(raw.decode("utf-8")), 1):
            for tag, target in TARGETS.items():
                match = evaluate(statement, target)
                if match is not None:
                    entries[tag].append({
                        "version": version,
                        "r111_priority_docket_index_not_chronology": index,
                        "executable_statement_ordinal": ordinal,
                        "markers": match
                    })
                    if len(entries[tag]) > MAX_HITS_PER_TARGET:
                        raise AuditBlocked("R193_TOO_MANY_DEFINITIONS")
    chronology_valid = chronology_valid and len(version_seen) == 83
    reports = {}
    for tag, definitions in entries.items():
        latest = (max(definitions, key=lambda v:(v["version"],v["executable_statement_ordinal"]))
                  if chronology_valid and definitions else None)
        result = {
            "historical_direct_definitions": len(definitions),
            "historical_explicit_definers": sum(1 for d in definitions if d["markers"]["explicit_security_definer"]),
            "historical_supported_plpgsql_bodies": sum(1 for d in definitions if d["markers"]["plpgsql_dollar_body_supported"]),
            "historical_sha256_matches_live_count": sum(1 for d in definitions if d["markers"]["sha256_matches_live"]),
            "historical_byte_length_matches_live_count": sum(1 for d in definitions if d["markers"]["byte_length_matches_live"]),
            "latest_direct_definition_located": latest is not None,
            "latest_r111_priority_docket_index_not_chronology": latest["r111_priority_docket_index_not_chronology"] if latest else None,
            "latest_executable_statement_ordinal": latest["executable_statement_ordinal"] if latest else None,
            "latest_sha256_matches_live": latest["markers"]["sha256_matches_live"] if latest else False,
            "latest_body_length_matches_live": latest["markers"]["byte_length_matches_live"] if latest else False,
            "latest_explicit_security_definer": latest["markers"]["explicit_security_definer"] if latest else False,
            "latest_direct_identity_marker": latest["markers"]["direct_identity_marker"] if latest else False,
            "latest_direct_membership_marker": latest["markers"]["direct_campaign_members_marker"] if latest else False,
            "latest_on_conflict_marker": latest["markers"]["on_conflict_marker"] if latest else False,
            "latest_user_editable_metadata_marker": latest["markers"]["user_editable_metadata_marker"] if latest else False,
        }
        reports[tag] = result
    return {
        "work_package": WORK_PACKAGE,
        "decision": "NO_GO",
        "mode": "OFFLINE_SHA_VERIFIED_ORIGINAL_JOIN_CREATE_PRIVILEGED_FUNCTION_LINEAGE",
        "original_private_history_sha256_verified": 83,
        "all_83_migration_versions_valid_unique_chronology": chronology_valid,
        "targets": reports,
        "historical_latest_signature_identity_proven": False,
        "reused_invite_rejoin_authorization_proven_safe": False,
        "all_67_live_privileged_call_chains_approved": False,
        "all_83_historical_semantics_approved": False,
        "real_signed_qa_passed": False,
        "qa_or_production_sql_authorized": False,
        "original_sql_filenames_signatures_paths_or_secrets_exported": False,
        "network_or_database_accessed": False,
        "limitations": [
            "Only direct top-level CREATE FUNCTION statements are analyzed; dynamic DO SQL or later installation may differ.",
            "SHA256 and byte-length parity with live pg_proc.prosrc do not establish effective signature, role, ACL, RLS or safe invitation reuse.",
            "The current-source synthetic invite-reuse behavior needs its own exact authored candidate and signed DM/revoked/outsider QA; never approve production from lexical flags."
        ]
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="R193 private original join/create source lineage")
    parser.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args = parser.parse_args()
    try:
        print(json.dumps(report(args.root),indent=2,sort_keys=True))
        return 0
    except (AuditBlocked,OSError,UnicodeError,ValueError,TypeError,KeyError,IndexError):
        print("R18-193 PRIVATE_JOIN_CREATE_NO_GO: parser/archive integrity failure; do not upload SQL.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
