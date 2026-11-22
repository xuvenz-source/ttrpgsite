#!/usr/bin/env python3
"""R214 owner-private, read-only chronological public table-target preflight.

No SQL execution, network, database use, or original SQL/name/version export.
Only a bounded *lexical* target-order check. NOT a PostgreSQL semantic graph.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
from r191_private_fog_status_lineage import strict_migration_version
from r211_private_qa_migration_effects import kind_of
from r213_private_qa_risk_categories import report as r213_report

WORK = "B10-R18-214"
MAX_IDS = 24
IDENT = r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)'
TARGET = rf'(?P<target>{IDENT}(?:\s*\.\s*{IDENT})?)'
BOUND = r'(?=\s|\(|;|$)'
TARGET_RULES = (
    ("create", re.compile(rf'^\s*CREATE\s+(?:(?:UNLOGGED|TEMP|TEMPORARY)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{TARGET}{BOUND}', re.I | re.S)),
    ("drop", re.compile(rf'^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?{TARGET}{BOUND}', re.I | re.S)),
    ("reference", re.compile(rf'^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?{TARGET}{BOUND}', re.I | re.S)),
    ("reference", re.compile(rf'^\s*(?:CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?{IDENT}\s+ON\s+(?:TABLE\s+)?{TARGET}{BOUND}', re.I | re.S)),
    ("reference", re.compile(rf'^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?{IDENT}\s+ON\s+(?:ONLY\s+)?{TARGET}{BOUND}', re.I | re.S)),
    ("reference", re.compile(rf'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+{IDENT}\s+[\s\S]{{0,2048}}?\bON\s+(?:TABLE\s+)?{TARGET}{BOUND}', re.I | re.S)),
    ("reference", re.compile(rf'^\s*DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?{IDENT}\s+ON\s+(?:TABLE\s+)?{TARGET}{BOUND}', re.I | re.S)),
)
STRUCTURAL_KINDS = {
    "create_table", "alter_table", "drop_table",
    "create_policy", "alter_policy", "drop_policy",
    "create_index", "create_trigger", "drop_trigger",
}
QUALIFIED = re.compile(rf'^\s*(?:(?P<schema>{IDENT})\s*\.\s*)?(?P<table>{IDENT})\s*$', re.I | re.S)

def label(value: str) -> str:
    return value[1:-1].replace('""', '"') if value.startswith('"') else value.lower()

def parse_target(text: str):
    match = QUALIFIED.fullmatch(text)
    if match is None:
        raise AuditBlocked("R214_UNEXPECTED_TARGET_GRAMMAR")
    schema = match.group("schema")
    return (None if schema is None else label(schema), label(match.group("table")))

def target_of(statement: str):
    # Every possible match stays private in process memory. Public output has counts only.
    for operation, rule in TARGET_RULES:
        match = rule.match(statement)
        if match:
            return operation, parse_target(match.group("target"))
    return None

def report(root: Path) -> dict:
    prior = r213_report(root)
    if (prior["decision"] != "NO_GO" or
        prior["original_migrations_sha256_reverified"] != 83 or
        prior["qa_sql_install_authorized"] is not False):
        raise AuditBlocked("R214_BASELINE_R213_NOT_READY")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root / "r111-private-review-docket.json", 1024 * 1024))
    items = docket.get("reviewItems")
    if not isinstance(items, list) or len(items) != 83:
        raise AuditBlocked("R214_PRIVATE_DOCKET_INVALID")
    folder = checked_dir(root / "r106-original-83-recovery" / "supabase" / "migrations")
    ordered = []
    for pos, item in enumerate(items, 1):
        name = item["filename"]
        version = strict_migration_version(name)
        raw = checked_file(folder / name, MAX_SQL_BYTES)
        if version is None or hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R214_SOURCE_VERSION_OR_SHA_CHANGED")
        ordered.append((version, pos, raw))
    if len({version for version, _, _ in ordered}) != 83:
        raise AuditBlocked("R214_CHRONOLOGY_INVALID")

    public_seen = set()
    totals = Counter()
    affected = set()
    count_statements = 0
    for _, priority, raw in sorted(ordered, key=lambda item: item[0]):
        for statement in statements(raw.decode("utf-8")):
            count_statements += 1
            kind = kind_of(statement)
            if kind not in STRUCTURAL_KINDS:
                continue
            totals["structural_statements"] += 1
            target = target_of(statement)
            if target is None:
                totals["structural_target_unparsed"] += 1
                affected.add(priority)
                continue
            operation, (schema, table) = target
            if schema is None:
                totals["unqualified_table_targets"] += 1
                affected.add(priority)
                continue
            if schema != "public":
                totals["nonpublic_explicit_table_targets"] += 1
                continue
            totals["explicit_public_table_targets"] += 1
            if operation == "create":
                totals["explicit_public_table_creates"] += 1
                if table in public_seen:
                    totals["duplicate_public_create_markers"] += 1
                    affected.add(priority)
                public_seen.add(table)
                continue
            if table not in public_seen:
                totals["public_target_without_earlier_archive_create"] += 1
                affected.add(priority)
            if operation == "drop":
                totals["explicit_public_table_drops"] += 1
                public_seen.discard(table)
            else:
                totals["explicit_public_table_references"] += 1
    if count_statements != prior["r211_lexical_statements_reconciled"]:
        raise AuditBlocked("R214_STATEMENTS_DRIFT_FROM_R211_R213")
    if totals["structural_statements"] != (
        totals["structural_target_unparsed"] +
        totals["unqualified_table_targets"] +
        totals["nonpublic_explicit_table_targets"] +
        totals["explicit_public_table_targets"]
    ):
        raise AuditBlocked("R214_CLASSIFICATION_COUNTER_DRIFT")

    # Numerical R111 references only, in true priority order, never chronology.
    review_ids = sorted(affected)
    return {
        "work_package": WORK,
        "decision": "NO_GO",
        "mode": "OWNER_PRIVATE_OFFLINE_QA_TABLE_TARGET_ORDER_TRIAGE",
        "original_migrations_sha256_reverified": 83,
        "lexical_top_level_statements_reconciled": count_statements,
        "structural_target_statement_counts": {
            code: int(totals[code]) for code in (
                "structural_statements", "structural_target_unparsed",
                "unqualified_table_targets", "nonpublic_explicit_table_targets",
                "explicit_public_table_targets", "explicit_public_table_creates",
                "explicit_public_table_references", "explicit_public_table_drops",
                "duplicate_public_create_markers",
                "public_target_without_earlier_archive_create",
            )
        },
        "public_target_order_review_file_count": len(review_ids),
        "first_r111_priority_order_review_indices": review_ids[:MAX_IDS],
        "priority_order_review_indices_truncated": len(review_ids) > MAX_IDS,
        "unknown_or_dynamic_dependencies_fully_parsed": False,
        "postgresql_parser_or_execution_used": False,
        "all_83_migration_semantics_approved": False,
        "qa_sql_install_authorized": False,
        "original_or_production_sql_authorized": False,
        "no_sql_executed": True,
        "no_network_or_database_access": True,
        "private_migration_names_versions_sql_or_docket_exported": False,
        "limitations": [
            "Chronological regex table-target checks are conservative lexical indicators, not a PostgreSQL semantic or transitive dependency graph.",
            "Unqualified targets, renames, schema search_path, dynamic SQL, DO/function bodies, triggers, permissions, managed Auth/Storage objects and migration effects are not resolved.",
            "An earlier archived CREATE TABLE word does NOT prove QA installation is safe, and a missing earlier public CREATE is not proof of an exploit.",
            "All 83 original migrations and 67 live privileged graphs remain security NO_GO; owner must separately authorize an exact QA-only write plan.",
        ],
    }

def main():
    try:
        print(json.dumps(report(Path.home() / "ttrpg-history-private"),
                         sort_keys=True, indent=2))
        return 0
    except Exception:
        print("R214_PRIVATE_QA_TARGET_ORDER_NO_GO: owner-private source integrity or lexical constraints rejected.", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
