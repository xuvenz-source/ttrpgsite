#!/usr/bin/env python3
"""R230 owner-private only: offline, SHA-verified opaque DO-block effect triage.

NEVER runs SQL, imports DB/network clients, exports SQL, raw identifiers,
private filenames/versions, hashes, Auth rows, URLs or credential fragments.
The report is fixed-schema counts, category codes and numeric R111 PRIORITY
indices only. This lexical scanner is NOT a PG parser or semantic approval.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
)
from r191_private_fog_status_lineage import strict_migration_version
import r211_private_qa_migration_effects as r211

WORK = "B10-R18-230"
EXPECTED_MIGRATIONS = 83
EXPECTED_STATEMENTS = 937
EXPECTED_DO = 12
EXPECTED_RISK_FILES = 22
MAX_PRIORITY_ITEMS = 24
CODES = {
    "DYNAMIC_EXECUTE_WORD": r"\bEXECUTE\b|\bformat\s*\(",
    "DML_OR_TRUNCATE_WORD": r"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\b",
    "DDL_POLICY_GRANT_WORD": r"\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|POLICY)\b",
    "MANAGED_AUTH_STORAGE_WORD": r"\b(?:auth|storage)\s*\.",
    "NETWORK_OR_NOTIFY_WORD": r"\b(?:dblink|http_get|http_post|pg_notify|pg_net)\b|\bnet\s*\.",
    "ROLE_OR_EXTENSION_WORD": r"\b(?:ROLE|USER|EXTENSION|PUBLICATION|REPLICA\s+IDENTITY)\b",
    "EXCEPTION_HANDLER_WORD": r"\bEXCEPTION\b|\bRAISE\b",
    "CONDITIONAL_LOOP_WORD": r"\b(?:IF|CASE|LOOP|FOREACH|WHILE|FOR)\b",
    "DOLLAR_OR_QUOTED_DYNAMIC_WORD": r"\$[A-Za-z_0-9]*\$|\bquote_ident\b|\bquote_literal\b",
}
REX = {code: re.compile(rx, re.I|re.S) for code,rx in CODES.items()}
ALLOWED_CODES = set(CODES)|{"OPAQUE_UNCLASSIFIED_WORDS"}

def analyze_do(stmt: str) -> set[str]:
    # This intentionally includes words in comments and SQL strings.
    # False positives are acceptable; any suspicious signal stays NO_GO.
    if r211.kind_of(stmt) != "do_block":
        raise AuditBlocked("R230_NOT_A_TOP_LEVEL_DO_BLOCK")
    codes = {code for code,rx in REX.items() if rx.search(stmt)}
    if not codes:
        codes.add("OPAQUE_UNCLASSIFIED_WORDS")
    return codes

def report(root: Path) -> dict:
    prior = r211.report(root)
    if (prior.get("decision") != "NO_GO" or
        prior.get("original_migrations_sha256_reverified") != EXPECTED_MIGRATIONS or
        prior.get("original_migration_chronology_unique_valid") is not True or
        prior.get("lexical_top_level_statements") != EXPECTED_STATEMENTS or
        prior.get("risk_flagged_original_file_count") != EXPECTED_RISK_FILES or
        prior.get("top_level_statement_kinds",{}).get("do_block") != EXPECTED_DO or
        prior.get("unclassified_top_level_statements") != 0 or
        prior.get("qa_sql_write_authorized") is not False):
        raise AuditBlocked("R230_PRIVATE_83_HISTORY_DRIFT")

    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024*1024))
    items = docket.get("reviewItems")
    if not isinstance(items,list) or len(items) != EXPECTED_MIGRATIONS or docket.get("decision") != "NO_GO":
        raise AuditBlocked("R230_PRIVATE_DOCKET_INVALID")
    folder = checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")

    ordered=[]
    versions=set()
    for ix,item in enumerate(items, 1):
        name=item.get("filename")
        if (not isinstance(name,str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.sql",name)
            or Path(name).name!=name):
            raise AuditBlocked("R230_PRIVATE_FILE_INVALID")
        ver=strict_migration_version(name)
        if ver is None or ver in versions:
            raise AuditBlocked("R230_PRIVATE_CHRONOLOGY_INVALID")
        versions.add(ver)
        raw=checked_file(folder/name,MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest()!=item.get("sourceBodySha256"):
            raise AuditBlocked("R230_PRIVATE_SHA_MISMATCH")
        ordered.append((ver,ix,raw))
    if len(versions)!=EXPECTED_MIGRATIONS:
        raise AuditBlocked("R230_PRIVATE_MIGRATION_COUNT_DRIFT")

    code_counts=Counter()
    flagged_priority=set()
    priority_codes={}
    do_total=0
    for _,priority,raw in sorted(ordered, key=lambda item:item[0]):
        for stmt in statements(raw.decode("utf-8")):
            if r211.kind_of(stmt)!="do_block":
                continue
            do_total+=1
            codes=analyze_do(stmt)
            flagged_priority.add(priority)
            priority_codes.setdefault(priority,set()).update(codes)
            for code in codes:
                code_counts[code]+=1
    if do_total!=EXPECTED_DO or len(flagged_priority)>EXPECTED_DO:
        raise AuditBlocked("R230_ORIGINAL_DO_COUNT_DRIFT")
    refs=sorted(flagged_priority)  # R111 priority, NOT migration chronology.
    rows=[{
      "r111_priority_index_not_migration_chronology":ix,
      "risk_codes":sorted(priority_codes[ix])
    } for ix in refs[:MAX_PRIORITY_ITEMS]]
    if any(not set(row["risk_codes"])<=ALLOWED_CODES for row in rows):
        raise AuditBlocked("R230_UNEXPECTED_CODE")

    return {
       "work_package":WORK,
       "decision":"NO_GO",
       "mode":"OWNER_PRIVATE_OFFLINE_OPAQUE_DO_EFFECT_WORD_REVIEW",
       "original_private_migrations_sha256_reverified":83,
       "historical_statements_reconciled":937,
       "historical_top_level_do_blocks_reconciled":do_total,
       "original_do_containing_migration_count":len(flagged_priority),
       "risk_marker_counts_by_do_block":{
         k:int(code_counts[k]) for k in sorted(ALLOWED_CODES)
       },
       "r111_priority_review_items_not_chronological":rows,
       "priority_indices_truncated":len(refs)>MAX_PRIORITY_ITEMS,
       "every_do_body_semantically_reviewed":False,
       "dynamic_sql_effects_proven_safe":False,
       "historical_migrations_approved_for_qa":False,
       "qa_or_original_sql_write_authorized":False,
       "private_sql_or_identifiers_exported":False,
       "network_or_database_accessed":False,
       "any_sql_executed":False,
       "limitations":[
         "Only lexical patterns in owner-private original DO statement text were inspected. Comments, string literals and dynamic SQL can cause false positives or false negatives.",
         "Even if no risk words are found, effects of PL/pgSQL, helper calls, triggers, RLS, roles and transaction state remain unproven.",
         "R111 numeric priority references are not chronological migration order or original private file identifiers.",
         "No original or QA SQL may be installed until independent complete 83-file semantic assessment, exact QA-only scope, backup/rollback and signed multi-role verification are approved."
       ]
    }

def main()->int:
    parser=argparse.ArgumentParser(description="R230 private 12 DO-block NO_GO reader")
    parser.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=parser.parse_args()
    try:
        print(json.dumps(report(args.root),sort_keys=True,indent=2))
        return 0
    except Exception:
        print("R230_PRIVATE_DO_NO_GO: source integrity, parsing or permission gate failed.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
