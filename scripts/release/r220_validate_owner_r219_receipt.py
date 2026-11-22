#!/usr/bin/env python3
"""R220 validate ONLY owner-sanitized R219 JSON: NO_GO, never source SQL."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

EXPECTED = {
    "work_package": "B10-R18-219",
    "decision": "NO_GO",
    "mode": "OWNER_PRIVATE_OFFLINE_STORAGE_POLICY_PAIR_LEXICAL_PROFILES",
}
GUARDS = {
    "actual_hosted_policy_catalog_or_rls_verified": False,
    "policy_guards_semantically_proven": False,
    "signed_url_revocation_verified": False,
    "all_83_migrations_semantically_approved": False,
    "qa_sql_install_authorized": False,
    "original_or_production_sql_authorized": False,
    "no_sql_executed": True,
    "no_network_or_database_access": True,
    "private_sql_policy_names_versions_paths_or_docket_exported": False,
}
PAIR_CODES = (
    "one_or_both_without_bucket_id_word",
    "one_or_both_without_direct_auth_or_known_campaign_helper_word",
    "one_or_both_with_or_word",
    "one_or_both_with_literal_true_guard_word",
    "same_r111_priority_index_pair",
)
REVIEW_CODES = set(PAIR_CODES) | {"possible_overlap_policy_pair"}
LIMITS = [
    "Actual unique policy-key pairs, not duplicate R111 migration-index pair labels, are counted; only lexical same-target/role/operation combinations are observed.",
    "Word markers for bucket_id, auth, helper, OR and TRUE cannot prove correct policy guards, tenant isolation or PostgreSQL permissive-policy RLS composition.",
    "Only the replayed archived CREATE/DROP text is considered; preexisting managed policies, grants, dynamic SQL and live policies are unknown.",
    "Signed Storage bearer URLs and revocation are not tested; no QA or original SQL write is authorized without separate exact owner approval.",
]
FIELDS = set(EXPECTED) | set(GUARDS) | {
    "original_migrations_sha256_reverified",
    "top_level_statements_reconciled", "storage_policy_statements_reconciled",
    "final_archive_lexical_policy_keys", "possible_overlap_storage_table_targets",
    "distinct_possible_overlapping_policy_key_pairs",
    "r218_legacy_unique_r111_priority_pair_count",
    "possible_pair_operation_counts", "possible_pair_role_counts",
    "possible_pair_lexical_cue_counts", "priority_review_file_count",
    "first_r111_priority_review_items", "priority_review_items_truncated",
    "limitations",
}

class Blocked(Exception):
    pass


def unique(pairs):
    out = {}
    for k,v in pairs:
        if k in out:
            raise Blocked("duplicate JSON field")
        out[k] = v
    return out


def bounded(n, upper):
    if type(n) is not int or not 0 <= n <= upper:
        raise Blocked("bad numeric count")
    return n


def read_sanitized(path: Path):
    if path.is_symlink() or not path.is_file() or not 1 <= path.stat().st_size <= 32768:
        raise Blocked("invalid sanitized receipt")
    return json.loads(path.read_text("utf-8"), object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(Blocked("nonfinite JSON")))


def validate(d):
    if type(d) is not dict or set(d) != FIELDS:
        raise Blocked("unexpected, private or missing field")
    for k,v in EXPECTED.items():
        if type(d[k]) is not str or d[k] != v:
            raise Blocked("identity drift")
    for k,v in GUARDS.items():
        if type(d[k]) is not bool or d[k] is not v:
            raise Blocked("approval or privacy drift")
    if type(d["original_migrations_sha256_reverified"]) is not int or d["original_migrations_sha256_reverified"] != 83:
        raise Blocked("original SHA count")
    total = bounded(d["top_level_statements_reconciled"], 250000)
    policies = bounded(d["storage_policy_statements_reconciled"], total)
    final = bounded(d["final_archive_lexical_policy_keys"], policies)
    targets = bounded(d["possible_overlap_storage_table_targets"], final)
    pairs = bounded(d["distinct_possible_overlapping_policy_key_pairs"], final * (final - 1) // 2)
    priority_pairs = bounded(d["r218_legacy_unique_r111_priority_pair_count"], pairs)
    if (pairs == 0) != (targets == 0) or priority_pairs > pairs:
        raise Blocked("pair/target contradiction")
    operations = d["possible_pair_operation_counts"]
    roles = d["possible_pair_role_counts"]
    cues = d["possible_pair_lexical_cue_counts"]
    if (type(operations) is not dict or set(operations) != {"select","insert","update","delete"} or
        type(roles) is not dict or set(roles) != {"anon","authenticated"} or
        type(cues) is not dict or set(cues) != set(PAIR_CODES)):
        raise Blocked("count categories not fixed")
    for table in (operations,roles,cues):
        for value in table.values():
            bounded(value, pairs)
    if (pairs and (sum(operations.values()) < pairs or sum(roles.values()) < pairs) or
        not pairs and (sum(operations.values()) or sum(roles.values()) or sum(cues.values()))):
        raise Blocked("pair count mismatch")
    # An overlap pair can apply to several operation types / roles.
    rows = d["first_r111_priority_review_items"]
    files = bounded(d["priority_review_file_count"], 83)
    truncated = d["priority_review_items_truncated"]
    if type(rows) is not list or type(truncated) is not bool or truncated != (files > 24) or len(rows) != min(files,24):
        raise Blocked("priority list count or truncation")
    prev = 0
    for row in rows:
        if type(row) is not dict or set(row) != {"r111_priority_index","lexical_review_codes"}:
            raise Blocked("unapproved row data")
        index = row["r111_priority_index"]
        if type(index) is not int or not prev < index <= 83:
            raise Blocked("priority order")
        prev = index
        codes = row["lexical_review_codes"]
        if (type(codes) is not list or "possible_overlap_policy_pair" not in codes or
            any(type(c) is not str or c not in REVIEW_CODES for c in codes) or
            codes != sorted(set(codes))):
            raise Blocked("row risk codes")
    if files > 0 and pairs == 0:
        raise Blocked("review file without overlap")
    if (type(d["limitations"]) is not list or d["limitations"] != LIMITS):
        raise Blocked("missing NO_GO limits")
    return {
        "work_package": "B10-R18-220",
        "source_work_package": "B10-R18-219",
        "decision": "NO_GO",
        "sanitized_r219_receipt_valid": True,
        "original_migration_sha_count": 83,
        "top_level_statements": total,
        "historical_storage_policy_statements": policies,
        "potential_policy_key_pairs": pairs,
        "possible_pair_with_or_word": cues["one_or_both_with_or_word"],
        "priority_refs_complete": not truncated,
        "effective_rls_or_signed_url_revocation_verified": False,
        "qa_or_original_sql_install_authorized": False,
        "sql_or_network_executed": False,
    }


def main():
    p = argparse.ArgumentParser(description="R220 fixed sanitized R219 evidence gate")
    p.add_argument("sanitized_r219_json",type=Path)
    args = p.parse_args()
    try:
        print(json.dumps(validate(read_sanitized(args.sanitized_r219_json)),indent=2,sort_keys=True))
        return 0
    except Exception:
        print("R220_SANITIZED_R219_NO_GO: malformed, changed or unapproved receipt.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
