#!/usr/bin/env python3
"""R219: validate owner R218 sanitized lifecycle receipt only; never original SQL.

No file other than one strict JSON receipt is read. No network or DB access.
This is a schema/invariant check, not semantic SQL authentication.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

EXPECTED = {
    "work_package": "B10-R18-218",
    "decision": "NO_GO",
    "mode": "OWNER_PRIVATE_OFFLINE_STORAGE_POLICY_LEXICAL_LIFECYCLE",
}
GUARDS = {
    "external_preexisting_policies_ruled_out": False,
    "complete_final_hosted_storage_policy_set_proven": False,
    "effective_permissive_rls_composition_verified": False,
    "signed_url_revocation_verified": False,
    "all_83_migrations_semantically_approved": False,
    "qa_sql_install_authorized": False,
    "original_or_production_sql_authorized": False,
    "no_sql_executed": True,
    "no_network_or_database_access": True,
    "private_sql_policy_names_versions_paths_and_docket_exported": False,
}
CODES = (
    "policy_name_or_target_unparsed", "duplicate_create_before_drop",
    "drop_without_prior_archive_create", "alter_without_prior_archive_create",
    "alter_effect_unparsed", "recreated_after_drop",
    "ambiguous_explicit_role_scope", "possible_permissive_policy_overlap",
)
LIMITS = [
    "Policy name matching, apparent lifetime and overlap are chronological lexical simulations; not PostgreSQL execution, dependencies or effective RLS.",
    "Role and operation extraction is conservative; roles inherited from other grants, existing managed policies, dynamic SQL and helper calls remain unresolved.",
    "A possible permissive overlap is not a proven leak, and zero overlaps cannot certify access control or signed Storage URL revocation.",
    "All original SQL and R111 docket remain private; exact QA-only SQL writes require separate owner consent, backup and rollback.",
]
FIELDS = set(EXPECTED) | set(GUARDS) | {
    "original_migrations_sha256_reverified", "top_level_statements_reconciled",
    "storage_policy_statements_reconciled", "historical_policy_create_statements",
    "historical_policy_drop_statements", "parsed_final_archive_policy_key_count",
    "possible_permissive_overlap_target_count", "fixed_review_event_counts",
    "owner_priority_review_file_count", "first_r111_priority_review_items",
    "priority_review_items_truncated", "limitations",
}
class Blocked(Exception):
    pass

def unique_keys(pairs):
    d = {}
    for k,v in pairs:
        if k in d:
            raise Blocked("duplicate key")
        d[k] = v
    return d

def number(value, cap):
    if type(value) is not int or not 0 <= value <= cap:
        raise Blocked("invalid bounded integer")
    return value

def read_sanitized(path: Path):
    if path.is_symlink() or not path.is_file() or not 1 <= path.stat().st_size <= 32768:
        raise Blocked("receipt not a regular bounded JSON file")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_keys,
                      parse_constant=lambda _: (_ for _ in ()).throw(Blocked("nonfinite JSON")))

def validate(d):
    if type(d) is not dict or set(d) != FIELDS:
        raise Blocked("unexpected or missing receipt keys")
    for k,v in EXPECTED.items():
        if type(d[k]) is not str or d[k] != v:
            raise Blocked("source identity or decision changed")
    for k,v in GUARDS.items():
        if type(d[k]) is not bool or d[k] is not v:
            raise Blocked("forged SQL or privacy authority")
    if type(d["original_migrations_sha256_reverified"]) is not int or d["original_migrations_sha256_reverified"] != 83:
        raise Blocked("wrong private migration verification count")
    statement_total = number(d["top_level_statements_reconciled"], 250000)
    policies = number(d["storage_policy_statements_reconciled"], statement_total)
    creates = number(d["historical_policy_create_statements"], policies)
    drops = number(d["historical_policy_drop_statements"], policies)
    final = number(d["parsed_final_archive_policy_key_count"], policies)
    targets = number(d["possible_permissive_overlap_target_count"], policies)
    if creates + drops > policies or final > creates or targets > final:
        raise Blocked("lifecycle aggregate inconsistency")
    counts = d["fixed_review_event_counts"]
    if type(counts) is not dict or set(counts) != set(CODES):
        raise Blocked("unexpected event codes")
    for k in CODES:
        number(counts[k], 10000 if k == "possible_permissive_policy_overlap" else policies)
    files = number(d["owner_priority_review_file_count"], 83)
    refs = d["first_r111_priority_review_items"]
    truncated = d["priority_review_items_truncated"]
    if (type(refs) is not list or type(truncated) is not bool or
        truncated != (files > 24) or len(refs) != min(files, 24)):
        raise Blocked("priority list length/truncation mismatch")
    last = 0
    seen = {k: 0 for k in CODES}
    for item in refs:
        if type(item) is not dict or set(item) != {"r111_priority_index", "lexical_review_codes"}:
            raise Blocked("unexpected row data")
        idx = item["r111_priority_index"]
        if type(idx) is not int or not last < idx <= 83:
            raise Blocked("priority order changed")
        last = idx
        risks = item["lexical_review_codes"]
        if (type(risks) is not list or not risks or
            any(type(x) is not str or x not in CODES for x in risks) or
            risks != sorted(set(risks))):
            raise Blocked("unsupported risk codes")
        for risk in risks:
            seen[risk] += 1
    if (counts["possible_permissive_policy_overlap"] == 0 and
        targets != 0):
        raise Blocked("overlap target without overlap event")
    if counts["possible_permissive_policy_overlap"] > 0 and targets == 0:
        raise Blocked("overlap event without overlap target")
    if (type(d["limitations"]) is not list or d["limitations"] != LIMITS):
        raise Blocked("NO_GO limitations altered")
    return {
        "work_package": "B10-R18-219",
        "source_work_package": "B10-R18-218",
        "decision": "NO_GO",
        "r218_sanitized_receipt_schema_valid": True,
        "source_sha_verified_count": 83,
        "top_level_statements_reconciled": statement_total,
        "historical_policy_statements": policies,
        "historical_create_policy_statements": creates,
        "historical_drop_policy_statements": drops,
        "remaining_archived_policy_key_count": final,
        "potential_overlap_target_count": targets,
        # R218 deduplicates by migration priority, not private policy keys.
        "r218_unique_migration_priority_pair_markers_not_policy_pairs": counts["possible_permissive_policy_overlap"],
        "recreated_policy_word_markers": counts["recreated_after_drop"],
        "all_review_indices_included": not truncated,
        "effective_rls_verified": False,
        "signed_url_revocation_verified": False,
        "qa_or_production_sql_authorized": False,
        "network_or_sql_executed": False,
    }

def main():
    parser = argparse.ArgumentParser(description="Strict sanitized R218 receipt only")
    parser.add_argument("r218_sanitized_json", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(read_sanitized(args.r218_sanitized_json)),
                         sort_keys=True, indent=2))
        return 0
    except Exception:
        print("R219_SANITIZED_R218_NO_GO: changed or invalid sanitized owner report.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
