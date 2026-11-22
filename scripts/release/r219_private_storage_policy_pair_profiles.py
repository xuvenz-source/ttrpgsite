#!/usr/bin/env python3
"""R219 private offline policy-key pair profiles, not effective RLS proof.

Rechecks prior R218 private source SHA/permissions/chronology gates. Uses real
policy names, guards and Storage table identifiers only inside owner memory.
Emits fixed codes/numeric aggregates and bounded R111 priority positions only.
No SQL executed, no network/database use, no source files written by script.
"""
from __future__ import annotations
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
from r191_private_fog_status_lineage import strict_migration_version
from r217_private_storage_policy_shape import shape
from r218_private_storage_policy_lifecycle import (
    report as r218_report, parse_policy, scope, OPERATION_SET,
)

WORK = "B10-R18-219"
MAX_ITEMS = 24
PAIR_CODES = (
    "one_or_both_without_bucket_id_word",
    "one_or_both_without_direct_auth_or_known_campaign_helper_word",
    "one_or_both_with_or_word",
    "one_or_both_with_literal_true_guard_word",
    "same_r111_priority_index_pair",
)
BUCKET = re.compile(r"\bbucket_id\b", re.I)
DIRECT_AUTH = re.compile(r"\bauth\s*\.\s*(?:uid|jwt)\s*\(", re.I)
CAMPAIGN_GUARD = re.compile(
    r"\b(?:is_campaign_member|is_campaign_dm|can_view_campaign_map|can_edit_campaign_sheet)\s*\(",
    re.I,
)
OR_WORD = re.compile(r"\bOR\b", re.I)
LITERAL_TRUE = re.compile(r"\b(?:USING|WITH\s+CHECK)\s*\(\s*TRUE\s*\)", re.I)


def cues(stmt: str) -> dict[str, bool]:
    # Lexical words inside SQL remain private; never serialize source clauses.
    return {
        "bucket": bool(BUCKET.search(stmt)),
        "identity_or_guard": bool(DIRECT_AUTH.search(stmt) or CAMPAIGN_GUARD.search(stmt)),
        "or": bool(OR_WORD.search(stmt)),
        "true": bool(LITERAL_TRUE.search(stmt)),
    }


def matched_pair_categories(a: dict, b: dict) -> tuple[str, ...]:
    codes = []
    if not a["cues"]["bucket"] or not b["cues"]["bucket"]:
        codes.append("one_or_both_without_bucket_id_word")
    if not a["cues"]["identity_or_guard"] or not b["cues"]["identity_or_guard"]:
        codes.append("one_or_both_without_direct_auth_or_known_campaign_helper_word")
    if a["cues"]["or"] or b["cues"]["or"]:
        codes.append("one_or_both_with_or_word")
    if a["cues"]["true"] or b["cues"]["true"]:
        codes.append("one_or_both_with_literal_true_guard_word")
    if a["priority"] == b["priority"]:
        codes.append("same_r111_priority_index_pair")
    return tuple(sorted(codes))


def report(root: Path) -> dict:
    parent = r218_report(root)
    if (parent["decision"] != "NO_GO" or
        parent["original_migrations_sha256_reverified"] != 83 or
        parent["qa_sql_install_authorized"] is not False):
        raise AuditBlocked("R219_ORIGINAL_PRIVATE_GATE_NO_GO")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024 * 1024))
    items = docket.get("reviewItems")
    if type(items) is not list or len(items) != 83:
        raise AuditBlocked("R219_DOCKET_COUNT")
    folder = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")
    versions = set()
    chronology = []
    for idx, item in enumerate(items, 1):
        name = item.get("filename")
        version = strict_migration_version(name)
        if version is None or version in versions:
            raise AuditBlocked("R219_HISTORY_CHRONOLOGY")
        versions.add(version)
        raw = checked_file(folder / name, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item.get("sourceBodySha256"):
            raise AuditBlocked("R219_HISTORY_SHA_DRIFT")
        chronology.append((version, idx, raw))

    # Replay lexical Storage policy names in chronological order, private only.
    current = {}
    statement_count = 0
    policy_count = 0
    unparsed = 0
    for _, priority, raw in sorted(chronology, key=lambda x: x[0]):
        for statement in statements(raw.decode("utf-8")):
            statement_count += 1
            if not shape(statement):
                continue
            policy_count += 1
            parsed = parse_policy(statement)
            if parsed is None:
                unparsed += 1
                continue
            action, key, tail = parsed
            if key[0] != "storage":
                raise AuditBlocked("R219_UNEXPECTED_POLICY_TARGET")
            if action == "CREATE":
                if key not in current:
                    operations, roles, restrictive, ambiguous = scope(tail)
                    current[key] = {
                        "priority": priority,
                        "operations": operations,
                        "roles": roles,
                        "restrictive": restrictive,
                        "ambiguous": ambiguous,
                        "cues": cues(statement),
                    }
            elif action == "DROP":
                current.pop(key, None)
            elif action == "ALTER":
                # R218 flags altered policies but does not parse their effects.
                # Never quietly report exactness if an ALTER was encountered.
                raise AuditBlocked("R219_ALTER_POLICY_REQUIRES_PRIVATE_SEMANTIC_REVIEW")
            else:
                raise AuditBlocked("R219_POLICY_FORM")

    if (statement_count != parent["top_level_statements_reconciled"] or
        policy_count != parent["storage_policy_statements_reconciled"] or
        len(current) != parent["parsed_final_archive_policy_key_count"] or
        unparsed != parent["fixed_review_event_counts"]["policy_name_or_target_unparsed"] or
        len(versions) != 83):
        raise AuditBlocked("R219_PREVIOUS_PRIVATE_COUNTER_DRIFT")

    groups = defaultdict(list)
    for (schema, table, _policy), info in current.items():
        groups[(schema, table)].append(info)

    pairs = 0
    target_with_pairs = 0
    unique_priority_pairs = set()
    operation_pair_counts = Counter()
    role_pair_counts = Counter()
    pair_categories = Counter()
    reason_by_priority = defaultdict(set)
    for policies in groups.values():
        has_overlap = False
        for i in range(len(policies)):
            for j in range(i + 1, len(policies)):
                a, b = policies[i], policies[j]
                if (a["restrictive"] or b["restrictive"] or
                    a["ambiguous"] or b["ambiguous"]):
                    continue
                overlap_ops = a["operations"] & b["operations"]
                overlap_roles = a["roles"] & b["roles"]
                if not overlap_ops or not overlap_roles:
                    continue
                has_overlap = True
                pairs += 1  # UNIQUE policy-name pair; NOT a R111 migration-index pair.
                unique_priority_pairs.add(tuple(sorted((a["priority"], b["priority"]))))
                for op in overlap_ops:
                    operation_pair_counts[op.lower()] += 1
                for role in overlap_roles:
                    if role not in {"anon", "authenticated"}:
                        raise AuditBlocked("R219_ROLE_OUTSIDE_FIXED_CODES")
                    role_pair_counts[role] += 1
                categories = matched_pair_categories(a, b)
                pair_categories.update(categories)
                for source in (a, b):
                    reason_by_priority[source["priority"]].add(
                        "possible_overlap_policy_pair")
                    reason_by_priority[source["priority"]].update(categories)
        if has_overlap:
            target_with_pairs += 1

    if (target_with_pairs != parent["possible_permissive_overlap_target_count"] or
        len(unique_priority_pairs) !=
        parent["fixed_review_event_counts"]["possible_permissive_policy_overlap"]):
        raise AuditBlocked("R219_LEGACY_PRIORITY_PAIR_RECONCILIATION")

    flagged = sorted(reason_by_priority)
    return {
        "work_package": WORK,
        "decision": "NO_GO",
        "mode": "OWNER_PRIVATE_OFFLINE_STORAGE_POLICY_PAIR_LEXICAL_PROFILES",
        "original_migrations_sha256_reverified": 83,
        "top_level_statements_reconciled": statement_count,
        "storage_policy_statements_reconciled": policy_count,
        "final_archive_lexical_policy_keys": len(current),
        "possible_overlap_storage_table_targets": target_with_pairs,
        "distinct_possible_overlapping_policy_key_pairs": pairs,
        "r218_legacy_unique_r111_priority_pair_count": len(unique_priority_pairs),
        "possible_pair_operation_counts": {op.lower(): operation_pair_counts[op.lower()] for op in OPERATION_SET},
        "possible_pair_role_counts": {role: role_pair_counts[role] for role in ("anon", "authenticated")},
        "possible_pair_lexical_cue_counts": {code: pair_categories[code] for code in PAIR_CODES},
        "priority_review_file_count": len(flagged),
        "first_r111_priority_review_items": [
            {"r111_priority_index": index, "lexical_review_codes": sorted(reason_by_priority[index])}
            for index in flagged[:MAX_ITEMS]
        ],
        "priority_review_items_truncated": len(flagged) > MAX_ITEMS,
        "actual_hosted_policy_catalog_or_rls_verified": False,
        "policy_guards_semantically_proven": False,
        "signed_url_revocation_verified": False,
        "all_83_migrations_semantically_approved": False,
        "qa_sql_install_authorized": False,
        "original_or_production_sql_authorized": False,
        "no_sql_executed": True,
        "no_network_or_database_access": True,
        "private_sql_policy_names_versions_paths_or_docket_exported": False,
        "limitations": [
            "Actual unique policy-key pairs, not duplicate R111 migration-index pair labels, are counted; only lexical same-target/role/operation combinations are observed.",
            "Word markers for bucket_id, auth, helper, OR and TRUE cannot prove correct policy guards, tenant isolation or PostgreSQL permissive-policy RLS composition.",
            "Only the replayed archived CREATE/DROP text is considered; preexisting managed policies, grants, dynamic SQL and live policies are unknown.",
            "Signed Storage bearer URLs and revocation are not tested; no QA or original SQL write is authorized without separate exact owner approval.",
        ],
    }


def main():
    try:
        print(json.dumps(report(Path.home() / "ttrpg-history-private"),
                         indent=2, sort_keys=True))
        return 0
    except Exception:
        print("R219_PRIVATE_STORAGE_PAIRS_NO_GO: owner-private history integrity or policy analysis blocked.",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
