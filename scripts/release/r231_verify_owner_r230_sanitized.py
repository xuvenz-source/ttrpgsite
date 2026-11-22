#!/usr/bin/env python3
"""R231: strict local validation of one R230 sanitized JSON receipt.

Never opens private SQL or docket, uses no network/database, prints no source
contents. A receipt proves lexical accounting only, never semantic QA approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-231"
EXPECTED_SHA256="345f30ee49d853c9fa8ccefa7679e4a5acb04993f73e40451df7b5cdf3079e01"
MAX_JSON_BYTES=8192
EXPECTED_COUNTS={
    "historical_statements_reconciled":937,
    "historical_top_level_do_blocks_reconciled":12,
    "original_private_migrations_sha256_reverified":83,
    "original_do_containing_migration_count":11
}
EXPECTED_CODES={
    "CONDITIONAL_LOOP_WORD":12,
    "DDL_POLICY_GRANT_WORD":9,
    "DML_OR_TRUNCATE_WORD":2,
    "DOLLAR_OR_QUOTED_DYNAMIC_WORD":12,
    "DYNAMIC_EXECUTE_WORD":2,
    "EXCEPTION_HANDLER_WORD":4,
    "MANAGED_AUTH_STORAGE_WORD":1,
    "NETWORK_OR_NOTIFY_WORD":0,
    "OPAQUE_UNCLASSIFIED_WORDS":0,
    "ROLE_OR_EXTENSION_WORD":7
}
EXPECTED_PRIORITY_CODES={
    7:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","DYNAMIC_EXECUTE_WORD","ROLE_OR_EXTENSION_WORD"),
    12:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","ROLE_OR_EXTENSION_WORD"),
    19:("CONDITIONAL_LOOP_WORD","DML_OR_TRUNCATE_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD"),
    29:("CONDITIONAL_LOOP_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","DYNAMIC_EXECUTE_WORD","EXCEPTION_HANDLER_WORD","MANAGED_AUTH_STORAGE_WORD"),
    43:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DML_OR_TRUNCATE_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","EXCEPTION_HANDLER_WORD"),
    46:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","ROLE_OR_EXTENSION_WORD"),
    47:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","ROLE_OR_EXTENSION_WORD"),
    48:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","ROLE_OR_EXTENSION_WORD"),
    49:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","ROLE_OR_EXTENSION_WORD"),
    54:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD"),
    61:("CONDITIONAL_LOOP_WORD","DDL_POLICY_GRANT_WORD","DOLLAR_OR_QUOTED_DYNAMIC_WORD","EXCEPTION_HANDLER_WORD","ROLE_OR_EXTENSION_WORD")
}
EXPECTED_TOP={
    "any_sql_executed","decision","dynamic_sql_effects_proven_safe",
    "every_do_body_semantically_reviewed","historical_migrations_approved_for_qa",
    "historical_statements_reconciled","historical_top_level_do_blocks_reconciled",
    "limitations","mode","network_or_database_accessed",
    "original_do_containing_migration_count","original_private_migrations_sha256_reverified",
    "priority_indices_truncated","private_sql_or_identifiers_exported",
    "qa_or_original_sql_write_authorized",
    "r111_priority_review_items_not_chronological","risk_marker_counts_by_do_block",
    "work_package"
}
FALSE_KEYS={
    "any_sql_executed","dynamic_sql_effects_proven_safe",
    "every_do_body_semantically_reviewed","historical_migrations_approved_for_qa",
    "network_or_database_accessed","priority_indices_truncated",
    "private_sql_or_identifiers_exported","qa_or_original_sql_write_authorized"
}
class InvalidReceipt(Exception): pass

def no_duplicate_keys(pairs):
    out={}
    for k,v in pairs:
        if k in out:
            raise InvalidReceipt("DUPLICATE_JSON_PROPERTY")
        out[k]=v
    return out

def reject(msg):
    raise InvalidReceipt(msg)

def validate(d):
    if type(d) is not dict or set(d)!=EXPECTED_TOP:
        reject("TOP_LEVEL_SCHEMA_DRIFT")
    if (d["work_package"]!="B10-R18-230" or
        d["mode"]!="OWNER_PRIVATE_OFFLINE_OPAQUE_DO_EFFECT_WORD_REVIEW" or
        d["decision"]!="NO_GO"):
        reject("FALSIFIED_SCOPE_OR_APPROVAL")
    if any(d[k] is not False for k in FALSE_KEYS):
        reject("MISSING_FAIL_CLOSED_BOUNDARY")
    for k,v in EXPECTED_COUNTS.items():
        if type(d[k]) is not int or d[k]!=v:
            reject("MIGRATION_COUNTS_CHANGED")
    markers=d["risk_marker_counts_by_do_block"]
    if type(markers) is not dict or set(markers)!=set(EXPECTED_CODES):
        reject("RISK_SCHEMA_CHANGED")
    if any(type(markers[k]) is not int or markers[k]!=v for k,v in EXPECTED_CODES.items()):
        reject("RISK_COUNTERS_CHANGED")
    rows=d["r111_priority_review_items_not_chronological"]
    if type(rows) is not list or len(rows)!=len(EXPECTED_PRIORITY_CODES):
        reject("PRIORITY_COUNT_CHANGED")
    seen={}
    for row in rows:
        if type(row) is not dict or set(row)!={"r111_priority_index_not_migration_chronology","risk_codes"}:
            reject("PRIORITY_ROW_LEAK")
        ix=row["r111_priority_index_not_migration_chronology"]
        codes=row["risk_codes"]
        if type(ix) is not int or ix in seen or ix not in EXPECTED_PRIORITY_CODES:
            reject("PRIORITY_INDEX_DRIFT")
        if type(codes) is not list or codes!=list(EXPECTED_PRIORITY_CODES[ix]):
            reject("PRIORITY_CODE_DRIFT")
        seen[ix]=codes
    if list(seen)!=sorted(EXPECTED_PRIORITY_CODES):
        reject("R111_PRIORITY_NOT_SORTED")
    if type(d["limitations"]) is not list or len(d["limitations"])!=4:
        reject("MISSING_LEXICAL_LIMITATIONS")
    if any(type(x) is not str or len(x)<40 or len(x)>500 for x in d["limitations"]):
        reject("LIMITATION_CONTENT_INVALID")
    # A duplicated DO in one original migration is why 12 DO blocks
    # correspond to 11 numeric priority indices; marker totals must be at
    # least the distinct priority-index totals for each code.
    for code,count in markers.items():
        distinct=sum(code in row["risk_codes"] for row in rows)
        if count<distinct or count>12:
            reject("IMPOSSIBLE_DO_COUNTER")
    return True

def validate_file(path,require_exact_sha=True):
    if path.is_symlink() or not path.is_file() or path.stat().st_size>MAX_JSON_BYTES:
        reject("NOT_A_SMALL_REGULAR_JSON")
    raw=path.read_bytes()
    if len(raw)>MAX_JSON_BYTES or len(raw)<100:
        reject("INVALID_REPORT_LENGTH")
    if require_exact_sha and hashlib.sha256(raw).hexdigest()!=EXPECTED_SHA256:
        reject("ORIGINAL_OWNER_RECEIPT_HASH_CHANGED")
    try:
        data=json.loads(raw,object_pairs_hook=no_duplicate_keys)
    except (ValueError,UnicodeError) as exc:
        raise InvalidReceipt("INVALID_JSON") from None
    return validate(data)

def main():
    parser=argparse.ArgumentParser(description="R231 sanitized-only R230 owner receipt gate")
    parser.add_argument("report",type=Path)
    args=parser.parse_args()
    try:
        validate_file(args.report)
        print("R231_SANITIZED_RECEIPT_ACCEPTED_NO_GO: 83 sources; 937 statements; 12 DO blocks across 11 migrations; next step is private semantic review.")
        return 0
    except (InvalidReceipt,OSError):
        print("R231_SANITIZED_RECEIPT_REJECTED_NO_GO",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
