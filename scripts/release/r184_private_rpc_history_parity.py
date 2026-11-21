#!/usr/bin/env python3
"""R18-184 private OFFLINE history chronology parity. No SQL/name/path exports.

Read-only, no network, subprocesses, database, file writes or credentials.
Requires the existing local private R111/R106 archive and R154 SHA auditor.
All results remain structural NO_GO; signed QA is NOT performed.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked, audit, checked_dir, checked_file, statements, MAX_SQL_BYTES
)

WORK_PACKAGE="B10-R18-184"
HISTORY=83
EXECUTABLE_STATEMENTS=937
DO_BLOCKS=12
VERSIONS=("20261106074748","20261106074754","20261107110539")

def find_statement(text: str, pattern: str) -> str:
    matches=[s for s in statements(text) if re.search(pattern,s,re.I)]
    if len(matches)!=1:
        raise AuditBlocked("R184_SOURCE_MISMATCH")
    return matches[0]

def analyse_sources(before: str, patched: str, later: str) -> dict[str,bool]:
    """Public booleans only. Never return a SQL excerpt or arbitrary identifier."""
    prior_monitor=find_statement(before,
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.get_token_monitor_values\s*\(")
    prior_reference=find_statement(before,
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.post_token_reference\s*\(")
    map_helper=find_statement(patched,
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.can_view_campaign_map\s*\(")
    dynamic=find_statement(patched,r"^\s*DO\s+\$[A-Za-z_0-9]*\$[\s\S]*pg_get_functiondef")
    later_monitor=find_statement(later,
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.get_token_monitor_values\s*\(")
    normalized_dynamic=re.sub(r"\s+"," ",dynamic.lower())
    return {
        "prior_monitor_old_guard_exactly_once":prior_monitor.count("c.active_map_id=p_map")==1,
        "prior_reference_owner_anchor_exactly_once":prior_reference.count("v_token.owner_id=auth.uid()")==1,
        "static_map_helper_has_assignment_relation":bool(re.search(r"campaign_player_maps",map_helper,re.I)),
        "dynamic_reads_two_existing_function_definitions":len(re.findall(r"\bpg_get_functiondef\s*\(",dynamic,re.I))==2,
        "dynamic_targets_monitor_by_signature":bool(re.search(
            r"proname\s*=\s*'get_token_monitor_values'[\s\S]{0,220}pg_get_function_identity_arguments",dynamic,re.I)),
        "dynamic_targets_reference_by_signature":bool(re.search(
            r"proname\s*=\s*'post_token_reference'[\s\S]{0,220}pg_get_function_identity_arguments",dynamic,re.I)),
        "monitor_replacement_introduces_map_gate":"public.can_view_campaign_map(c.id,p_map)" in dynamic,
        "reference_replacement_introduces_owner_plus_map_gate":
            "v_token.owner_id=auth.uid() and public.can_view_campaign_map(v_token.campaign_id,v_token.map_id)" in dynamic,
        "both_expected_anchor_failures_present":
            normalized_dynamic.count("if amended=definition then raise exception")==2,
        "both_rewritten_definitions_executed":
            len(re.findall(r"\bEXECUTE\s+amended\s*;",dynamic,re.I))==2,
        "later_monitor_preserves_map_gate":bool(re.search(
            r"public\.can_view_campaign_map\s*\(",later_monitor,re.I)),
    }

def select_version_files(root: Path) -> tuple[Path,list[Path]]:
    folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    found=[]
    for version in VERSIONS:
        matches=[p for p in folder.iterdir()
            if p.name.startswith(version+"_") and p.suffix==".sql"]
        if len(matches)!=1:
            raise AuditBlocked("R184_VERSION_MISMATCH")
        found.append(matches[0])
    return folder,found

def report(root: Path) -> dict:
    # R154 verifies directory privacy, all 83 exact SHA256 fingerprints and
    # no existing authorization of historical scripts.
    previous=audit(root)
    if previous.get("files_sha256_verified")!=HISTORY or previous.get("files_security_approved")!=0:
        raise AuditBlocked("R184_SHA_INTEGRITY_MISMATCH")
    folder,parts=select_version_files(root)
    sql=[checked_file(p,MAX_SQL_BYTES).decode("utf-8") for p in parts]
    flags=analyse_sources(*sql)
    # Re-parse hash-verified private files but never export their contents,
    # filenames, paths, snippets or arbitrary identifiers.
    parsed_statements=0
    parsed_do_blocks=0
    for file in folder.iterdir():
        if file.suffix!=".sql":
            continue
        source=checked_file(file,MAX_SQL_BYTES).decode("utf-8")
        pieces=statements(source)
        parsed_statements+=len(pieces)
        parsed_do_blocks+=sum(bool(re.match(r"^\s*DO\b",s,re.I)) for s in pieces)
    return {
        "work_package":WORK_PACKAGE,
        "decision":"NO_GO",
        "mode":"OFFLINE_SHA256_VERIFIED_R111_R106_CHRONOLOGY_STRUCTURAL_PARITY",
        "verified_history_count":previous["files_sha256_verified"],
        "chronological_target_files_verified":len(parts),
        "parsed_top_level_statements":parsed_statements,
        "top_level_statement_count_matches_readonly_937":parsed_statements==EXECUTABLE_STATEMENTS,
        "parsed_do_blocks":parsed_do_blocks,
        "do_block_count_matches_readonly_12":parsed_do_blocks==DO_BLOCKS,
        "rpc_rewrite_parity":flags,
        "all_target_structural_indicators_present":all(flags.values()),
        "sql_bodies_exported":False,
        "filenames_exported":False,
        "paths_or_secret_values_exported":False,
        "database_accessed":False,
        "network_accessed":False,
        "private_history_semantically_approved":False,
        "all_67_privileged_chains_approved":False,
        "real_signed_qa_passed":False,
        "production_release_authorized":False,
        "limitations":[
            "SHA and literal structural parity do not prove PostgreSQL DO semantics, all 83 migrations, grants or policy composition.",
            "A synthetic PG17 rewrite test is not exact original full migration replay.",
            "Manual signed QA and owner authorization remain required before any hosted repair."
        ]
    }

def main() -> int:
    parser=argparse.ArgumentParser(description="R184 private local sanitized chronology")
    parser.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=parser.parse_args()
    try:
        print(json.dumps(report(args.root),sort_keys=True,indent=2))
        return 0
    except (AuditBlocked,OSError,UnicodeError,ValueError,TypeError,KeyError,IndexError):
        print("R18-184 PRIVATE_AUDIT_NO_GO: integrity or chronology mismatch; never upload original SQL.",file=sys.stderr)
        return 2

if __name__=="__main__":
    sys.exit(main())
