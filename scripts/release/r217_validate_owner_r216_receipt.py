#!/usr/bin/env python3
"""R217 fixed-schema validation of owner-sanitized R216 report; NO_GO always.

Never reads private SQL, original docket, secrets or database/network.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

WORK = "B10-R18-217"
CODES = (
    "storage_direct_insert", "storage_direct_update",
    "storage_direct_delete", "storage_direct_truncate",
    "storage_direct_other_unparsed", "storage_direct_update_delete_without_where_word",
    "storage_direct_insert_conflict_word", "storage_policy_select",
    "storage_policy_insert", "storage_policy_update", "storage_policy_delete",
    "storage_policy_all_or_unspecified", "storage_policy_missing_using_word",
    "storage_policy_missing_with_check_word",
    "storage_policy_missing_direct_auth_identity_word",
    "storage_policy_editable_user_metadata_word", "storage_objects_target_word",
    "storage_buckets_target_word", "storage_other_target_word",
)
LIMITATIONS = [
    "Markers describe only top-level source words and cannot prove actual Storage data changes, effective RLS policy composition or signed bearer URL revocation.",
    "A missing USING, WITH CHECK, WHERE or direct auth.uid marker is context dependent, not automatically an unsafe SQL statement; helper calls and other policies may apply.",
    "Function/DO/trigger bodies, dynamic SQL, managed permissions and historical state are not semantically evaluated; all 83 migrations still need private review.",
    "R111 priority references are not migration chronology; QA SQL writes require a separate exact owner-approved target/backup/rollback plan.",
]
FIXED = {
    "work_package": "B10-R18-216",
    "decision": "NO_GO",
    "mode": "OWNER_PRIVATE_OFFLINE_STORAGE_EFFECT_WORD_TRIAGE",
}
GUARDS = {
    "policy_or_storage_semantics_approved": False,
    "effective_rls_or_signed_url_revocation_verified": False,
    "all_83_migrations_semantically_approved": False,
    "qa_sql_install_authorized": False,
    "original_or_production_sql_authorized": False,
    "no_sql_executed": True,
    "no_network_or_database_access": True,
    "private_sql_names_versions_paths_or_docket_exported": False,
}
FIELDS = set(FIXED) | set(GUARDS) | {
    "original_migrations_sha256_reverified", "top_level_statements_reconciled",
    "r215_storage_direct_dml_statements_reconciled",
    "r215_storage_policy_statements_reconciled",
    "storage_lexical_statement_indicator_counts",
    "storage_lexical_file_indicator_counts",
    "storage_review_file_count", "first_r111_priority_storage_review_items",
    "priority_review_items_truncated", "limitations",
}
class Blocked(Exception): pass

def no_duplicates(pairs):
    output = {}
    for k,v in pairs:
        if k in output: raise Blocked("duplicate key")
        output[k] = v
    return output

def bounded(n, maximum):
    if type(n) is not int or not 0 <= n <= maximum: raise Blocked("invalid count")
    return n

def read_sanitized(path: Path):
    if path.is_symlink() or not path.is_file() or not 1 <= path.stat().st_size <= 32768:
        raise Blocked("sanitized JSON unavailable")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates,
        parse_constant=lambda _: (_ for _ in ()).throw(Blocked("nonfinite JSON")))

def validate(d):
    if type(d) is not dict or set(d) != FIELDS: raise Blocked("unexpected field")
    for k,v in FIXED.items():
        if type(d[k]) is not str or d[k] != v: raise Blocked("identity changed")
    for k,v in GUARDS.items():
        if type(d[k]) is not bool or d[k] is not v: raise Blocked("authority forged")
    if type(d["original_migrations_sha256_reverified"]) is not int or d["original_migrations_sha256_reverified"] != 83:
        raise Blocked("archive integrity changed")
    total = bounded(d["top_level_statements_reconciled"], 250000)
    direct = bounded(d["r215_storage_direct_dml_statements_reconciled"], total)
    policies = bounded(d["r215_storage_policy_statements_reconciled"], total)
    flagged = bounded(d["storage_review_file_count"], 83)
    statements = d["storage_lexical_statement_indicator_counts"]
    files = d["storage_lexical_file_indicator_counts"]
    for table,maximum in ((statements,total),(files,flagged)):
        if type(table) is not dict or set(table) != set(CODES): raise Blocked("wrong categories")
        for value in table.values(): bounded(value, maximum)
    if any(files[k] > statements[k] for k in CODES):
        raise Blocked("file count exceeds statement count")
    if sum(statements[x] for x in ("storage_direct_insert","storage_direct_update","storage_direct_delete",
                                 "storage_direct_truncate","storage_direct_other_unparsed")) != direct:
        raise Blocked("Storage DML breakdown mismatch")
    if sum(statements[x] for x in ("storage_policy_select","storage_policy_insert","storage_policy_update",
                                  "storage_policy_delete","storage_policy_all_or_unspecified")) != policies:
        raise Blocked("Storage policy operation breakdown mismatch")
    if (flagged == 0) != (sum(files.values()) == 0) or sum(files.values()) < flagged:
        raise Blocked("flagged file categories mismatch")
    rows = d["first_r111_priority_storage_review_items"]
    truncated = d["priority_review_items_truncated"]
    if type(rows) is not list or type(truncated) is not bool or truncated != (flagged > 24) or len(rows) != min(flagged,24):
        raise Blocked("priority truncation mismatch")
    previous = 0
    counted = dict.fromkeys(CODES, 0)
    for row in rows:
        if type(row) is not dict or set(row) != {"r111_priority_index","storage_lexical_review_codes"}:
            raise Blocked("unexpected row detail")
        index = row["r111_priority_index"]
        if type(index) is not int or not previous < index <= 83: raise Blocked("invalid priority index")
        previous = index
        codes = row["storage_lexical_review_codes"]
        if type(codes) is not list or not codes or codes != sorted(set(codes)) or any(type(c) is not str or c not in CODES for c in codes):
            raise Blocked("unapproved code")
        for c in codes: counted[c] += 1
    if any(counted[c] > files[c] for c in CODES): raise Blocked("row exceeds file total")
    if not truncated and counted != files: raise Blocked("untruncated file code disagreement")
    if type(d["limitations"]) is not list or d["limitations"] != LIMITATIONS:
        raise Blocked("NO_GO limitations omitted")
    return {
        "work_package": WORK, "source_work_package": "B10-R18-216", "decision": "NO_GO",
        "sanitized_r216_receipt_valid": True, "historical_sha_count": 83,
        "lexical_top_level_statements": total, "storage_direct_dml_statements": direct,
        "storage_policy_statements": policies, "storage_review_files": flagged,
        "priority_references_complete": not truncated,
        "storage_semantics_approved": False, "signed_url_revocation_proven": False,
        "qa_or_production_sql_authorized": False, "sql_or_network_executed": False,
    }

def main():
    p=argparse.ArgumentParser(description="R217 owner sanitized R216 receipt only")
    p.add_argument("report", type=Path)
    args=p.parse_args()
    try:
        print(json.dumps(validate(read_sanitized(args.report)),indent=2,sort_keys=True))
        return 0
    except Exception:
        print("R217_SANITIZED_R216_NO_GO: receipt rejected.",file=sys.stderr)
        return 2

if __name__=="__main__": raise SystemExit(main())
