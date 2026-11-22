#!/usr/bin/env python3
"""R213 owner-only offline risk classes for R211 flagged private migrations.

Never print original SQL, filenames, versions, docket contents, source hashes,
Auth data or secrets. Up to 24 numeric R111 priority references are exported.
Lexical classes NEVER certify semantic correctness or allow QA installation.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

from r154_private_history_audit import AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
from r211_private_qa_migration_effects import report as r211_report, classify

WORK = "B10-R18-213"
MAX_INDEX_ITEMS = 24
CLASS_CODES = (
  "unparsed_or_unusual_ddl", "privileged_definition_header",
  "function_dynamic_or_network", "policy_storage_or_unconditional",
  "privilege_public_anon_or_truncate", "auth_or_storage_data_write",
  "do_copy_or_top_level_destructive", "role_extension_or_publication",
)

def codes_for(kind: str, hits: dict, risk: bool) -> list[str]:
    if not risk:
        return []
    flags = set()
    if kind in {"create_other", "alter_other", "drop_other", "other"}:
        flags.add("unparsed_or_unusual_ddl")
    if kind in {"create_function", "alter_function"} and hits["definer_without_local_search_path"]:
        flags.add("privileged_definition_header")
    if kind in {"create_function", "alter_function"} and (hits["dynamic_format_word"] or hits["network_side_effect_word"]):
        flags.add("function_dynamic_or_network")
    if kind in {"create_policy", "alter_policy", "drop_policy"} and (hits["storage_schema_word"] or hits["literal_true_policy_word"]):
        flags.add("policy_storage_or_unconditional")
    if kind in {"grant", "revoke"} and (hits["grant_to_public_word"] or hits["grant_anon_word"] or hits["grant_truncate_word"]):
        flags.add("privilege_public_anon_or_truncate")
    if hits["auth_data_write_word"] or hits["storage_data_write_word"]:
        flags.add("auth_or_storage_data_write")
    if kind in {"do_block", "copy", "truncate", "drop_table", "drop_function", "drop_policy", "drop_view"}:
        flags.add("do_copy_or_top_level_destructive")
    if kind in {"extension_change", "role_change", "publication_change", "default_privileges"}:
        flags.add("role_extension_or_publication")
    # Conservative R211 signal may be in an unexpected statement context.
    if not flags:
        flags.add("unparsed_or_unusual_ddl")
    return sorted(flags)

def report(root: Path) -> dict:
    # Re-run original private 83-file source SHA, chrono and permissions audit.
    previous = r211_report(root)
    if previous["decision"] != "NO_GO" or previous["original_migrations_sha256_reverified"] != 83:
        raise AuditBlocked("R213_BASELINE_INVALID")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024 * 1024))
    items = docket["reviewItems"]
    folder = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")
    if len(items) != 83:
        raise AuditBlocked("R213_DOCKET_COUNT_INVALID")
    risk_rows = []
    counts = Counter()
    for priority, item in enumerate(items, 1):
        name = item["filename"]
        raw = checked_file(folder / name, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R213_SOURCE_DRIFT")
        flags = set()
        for stmt in statements(raw.decode("utf-8")):
            kind, hits, risk = classify(stmt)
            flags.update(codes_for(kind, hits, risk))
        if flags:
            risk_rows.append({"r111_priority_index": priority, "lexical_risk_codes": sorted(flags)})
            for code in flags:
                counts[code] += 1
    if len(risk_rows) != previous["risk_flagged_original_file_count"]:
        raise AuditBlocked("R213_RISK_CENSUS_DISAGREES_WITH_R211")
    if set(counts) - set(CLASS_CODES):
        raise AuditBlocked("R213_UNRECOGNISED_CLASS")
    # R111 priority order is enumeration order. Never use chronology here.
    return {
        "work_package": WORK,
        "decision": "NO_GO",
        "mode": "OWNER_PRIVATE_OFFLINE_QA_LEXICAL_RISK_CATEGORIES",
        "original_migrations_sha256_reverified": 83,
        "r211_lexical_statements_reconciled": previous["lexical_top_level_statements"],
        "risk_flagged_original_file_count": len(risk_rows),
        "risk_category_file_counts": {key: counts[key] for key in CLASS_CODES},
        "priority_ordered_first_r111_risk_items": risk_rows[:MAX_INDEX_ITEMS],
        "priority_risk_items_truncated": len(risk_rows) > MAX_INDEX_ITEMS,
        "complete_semantic_review_proven": False,
        "dynamic_sql_effects_fully_known": False,
        "qa_sql_install_authorized": False,
        "original_or_production_sql_authorized": False,
        "no_sql_executed": True,
        "no_network_or_database_access": True,
        "private_sql_docket_paths_versions_secrets_exported": False,
        "limitations": [
            "Risk classes are lexical indicators, NOT SQL execution, parser-proven semantic dependencies, or approval for QA migration installation.",
            "Only the first 24 flagged R111 priority references are shown; every one of 83 historical migrations still requires private semantic review.",
            "Do not upload private migrations, docket, filenames/versions, SQL bodies or credentials. Owner must separately approve exact QA-only SQL write plan.",
        ],
    }

def main():
    try:
        print(json.dumps(report(Path.home() / "ttrpg-history-private"),
                         indent=2, sort_keys=True))
        return 0
    except Exception:
        print("R213_PRIVATE_QA_RISK_NO_GO: local source integrity or classification rejected.",
              file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
