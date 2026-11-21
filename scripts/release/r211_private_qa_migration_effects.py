#!/usr/bin/env python3
"""R211 owner-only, offline migration-effects preflight for isolated QA planning.

Read-only; no SQL execution, network, database connection or file writes.
All 83 original migration bodies and R111 docket stay in private owner WSL.
Output contains only fixed numeric aggregates, bounded R111 priority-sorted
indices (NOT chronological migration positions), booleans and NO_GO claims.
Lexical classification is not semantic review or authorization to install.
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
    AuditBlocked, MAX_SQL_BYTES, audit, checked_dir, checked_file, statements
)
from r191_private_fog_status_lineage import strict_migration_version
from r186_private_privileged_statement_inventory import exclude_dollar_bodies

WORK="B10-R18-211"
EXPECTED=83
MAX_REVIEW_INDICES=24

# Top-level category from SQL statement's opening only, never by a word
# occurring in a quoted function body. OTHER is an explicit unknown, NO_GO.
KINDS=(
 ("create_table",r"CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\b"),
 ("alter_table",r"ALTER\s+TABLE\b"),
 ("drop_table",r"DROP\s+TABLE\b"),
 ("create_function",r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b"),
 ("alter_function",r"ALTER\s+FUNCTION\b"),
 ("drop_function",r"DROP\s+FUNCTION\b"),
 ("create_policy",r"CREATE\s+POLICY\b"),
 ("alter_policy",r"ALTER\s+POLICY\b"),
 ("drop_policy",r"DROP\s+POLICY\b"),
 ("create_trigger",r"CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b"),
 ("drop_trigger",r"DROP\s+TRIGGER\b"),
 ("create_index",r"CREATE\s+(?:UNIQUE\s+)?INDEX\b"),
 ("drop_index",r"DROP\s+INDEX\b"),
 ("create_view",r"CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\b"),
 ("alter_view",r"ALTER\s+(?:MATERIALIZED\s+)?VIEW\b"),
 ("drop_view",r"DROP\s+(?:MATERIALIZED\s+)?VIEW\b"),
 ("create_type",r"CREATE\s+TYPE\b"),
 ("alter_type",r"ALTER\s+TYPE\b"),
 ("create_schema",r"CREATE\s+SCHEMA\b"),
 ("alter_schema",r"ALTER\s+SCHEMA\b"),
 ("create_sequence",r"CREATE\s+SEQUENCE\b"),
 ("alter_sequence",r"ALTER\s+SEQUENCE\b"),
 ("extension_change",r"(?:CREATE|ALTER|DROP)\s+EXTENSION\b"),
 ("role_change",r"(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER)\b"),
 ("publication_change",r"(?:CREATE|ALTER|DROP)\s+PUBLICATION\b"),
 ("default_privileges",r"ALTER\s+DEFAULT\s+PRIVILEGES\b"),
 ("grant",r"GRANT\b"),
 ("revoke",r"REVOKE\b"),
 ("comment",r"COMMENT\s+ON\b"),
 ("do_block",r"DO\b"),
 ("insert",r"INSERT\s+INTO\b"),
 ("update",r"UPDATE\b"),
 ("delete",r"DELETE\s+FROM\b"),
 ("truncate",r"TRUNCATE\b"),
 ("copy",r"COPY\b"),
 ("select",r"SELECT\b"),
 ("set",r"(?:SET|RESET)\b"),
 ("transaction",r"(?:BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\b"),
 ("create_other",r"CREATE\b"),
 ("alter_other",r"ALTER\b"),
 ("drop_other",r"DROP\b"),
 ("other",r".*"),
)
STARTS=tuple((kind,re.compile(r"^\s*(?:"+rx+r")",re.I|re.S)) for kind,rx in KINDS)
KIND_NAMES=tuple(kind for kind,_ in KINDS)

# Conservative text markers only. May match a literal string or a comment
# inside a dollar-quoted body; that is intentionally reported as a *signal*.
# No exact SQL, object identifier, bucket name or migration filename leaves WSL.
MARKERS=(
 ("security_definer_definition",r"\bSECURITY\s+DEFINER\b"),
 ("definer_without_local_search_path",r"\bSECURITY\s+DEFINER\b"),
 ("auth_schema_word",r"\bauth\s*\."),
 ("storage_schema_word",r"\bstorage\s*\."),
 ("storage_objects_word",r"\bstorage\s*\.\s*objects\b"),
 ("storage_buckets_word",r"\bstorage\s*\.\s*buckets\b"),
 ("realtime_publication_word",r"\bPUBLICATION\b|\bREPLICA\s+IDENTITY\b"),
 ("dollar_execute_word",r"\bEXECUTE\b"),
 ("dynamic_format_word",r"\bEXECUTE\s+format\s*\(|\bEXECUTE\s+['\"]"),
 ("network_side_effect_word",r"\b(?:http_get|http_post|net\s*\.|dblink|pg_notify|pg_net)\b"),
 ("user_editable_metadata_word",r"\b(?:raw_user_meta_data|user_metadata)\b"),
 ("grant_to_public_word",r"\bTO\s+PUBLIC\b"),
 ("grant_authenticated_word",r"\bTO\s+authenticated\b"),
 ("grant_anon_word",r"\bTO\s+anon\b"),
 ("grant_truncate_word",r"\bGRANT\b[\s\S]*\bTRUNCATE\b"),
 ("literal_true_policy_word",r"\b(?:USING|WITH\s+CHECK)\s*\(\s*TRUE\s*\)"),
 ("permissive_or_word",r"\bOR\b"),
 ("rls_toggle_word",r"\b(?:ENABLE|DISABLE|FORCE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b"),
 ("auth_data_write_word",r"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+auth\s*\."),
 ("storage_data_write_word",r"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+storage\s*\."),
)
REX={k:re.compile(rx,re.I|re.S) for k,rx in MARKERS}
AGG_KEYS=tuple(k for k,_ in MARKERS)
REVIEW_KINDS={
 "extension_change","role_change","publication_change",
 "default_privileges","do_block","truncate","copy","drop_table",
 "drop_function","drop_policy","drop_view","create_other","alter_other",
 "drop_other","other"
}

def kind_of(statement:str)->str:
    for name,pattern in STARTS:
        if pattern.match(statement):
            return name
    raise AuditBlocked("R211_NO_STATEMENT_CATEGORY")

def classify(statement:str)->tuple[str,dict[str,bool],bool]:
    kind=kind_of(statement)
    hit={name:bool(rx.search(statement)) for name,rx in REX.items()}
    # Function SECURITY DEFINER and SET search_path are HEADER attributes.
    # A quoted SQL/body containing "SET search_path" is not a valid local
    # function search_path and must never clear the warning.
    if kind!="create_function":
        hit["security_definer_definition"]=False
        hit["definer_without_local_search_path"]=False
    else:
        header=exclude_dollar_bodies(statement)
        hit["security_definer_definition"]=bool(
            re.search(r"\bSECURITY\s+DEFINER\b",header,re.I))
        hit["definer_without_local_search_path"]=(
            hit["security_definer_definition"] and not bool(
                re.search(r"\bSET\s+search_path\s*(?:=|\bTO\b)",header,re.I)))
    risk=kind in REVIEW_KINDS
    if kind in ("create_function","alter_function") and (
        hit["definer_without_local_search_path"] or
        hit["dynamic_format_word"] or hit["network_side_effect_word"]):
        risk=True
    if kind in ("create_policy","alter_policy","drop_policy") and (
        hit["storage_schema_word"] or hit["literal_true_policy_word"]):
        risk=True
    if kind in ("grant","revoke") and (
        hit["grant_to_public_word"] or hit["grant_truncate_word"] or
        hit["grant_anon_word"]):
        risk=True
    if hit["auth_data_write_word"] or hit["storage_data_write_word"]:
        risk=True
    if hit["network_side_effect_word"]:
        risk=True
    return kind,hit,risk

def report(root:Path)->dict:
    # Re-run prior R154 owner-private all-83 archive SHA and restrictive
    # permission checks rather than trusting old report JSON.
    prior=audit(root)
    if (prior.get("decision")!="NO_GO" or
        prior.get("files_sha256_verified")!=EXPECTED or
        prior.get("files_security_approved")!=0):
        raise AuditBlocked("R211_PREVIOUS_ORIGINAL_HASH_CHECK_NOT_READY")
    root=checked_dir(root,private=True)
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024))
    items=docket.get("reviewItems")
    if (not isinstance(items,list) or len(items)!=EXPECTED or
        docket.get("decision")!="NO_GO"):
        raise AuditBlocked("R211_ORIGINAL_DOCKET_INVALID")
    folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    filenames=set(p.name for p in folder.iterdir() if p.suffix==".sql")
    if len(filenames)!=EXPECTED:
        raise AuditBlocked("R211_ORIGINAL_ARCHIVE_COUNT_CHANGED")

    ordered=[]
    versions=set()
    for priority,item in enumerate(items,1):
        name=item.get("filename")
        if (not isinstance(name,str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.sql",name)
            or Path(name).name!=name or name not in filenames):
            raise AuditBlocked("R211_PRIVATE_FILE_INTEGRITY")
        ver=strict_migration_version(name)
        if ver is None or ver in versions:
            raise AuditBlocked("R211_MIGRATION_TIMESTAMP_INVALID_OR_DUPLICATE")
        versions.add(ver)
        raw=checked_file(folder/name,MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest()!=item.get("sourceBodySha256"):
            raise AuditBlocked("R211_ARCHIVE_SHA_CHANGED")
        ordered.append((ver,priority,raw))
    if len(versions)!=EXPECTED:
        raise AuditBlocked("R211_INCOMPLETE_CHRONOLOGY")

    kinds=Counter()
    indicators=Counter()
    high_risk=[]
    total=0
    empty_files=0
    for _,priority,raw in sorted(ordered,key=lambda x:x[0]):
        sql=statements(raw.decode("utf-8"))
        if len(sql)>25000:raise AuditBlocked("R211_EXCESSIVE_STATEMENTS")
        if not sql:empty_files+=1
        needs_review=False
        for stmt in sql:
            total+=1
            if total>250000:raise AuditBlocked("R211_EXCESSIVE_TOTAL")
            kind,hits,risk=classify(stmt)
            kinds[kind]+=1
            for label,yes in hits.items():
                if yes:indicators[label]+=1
            if risk:needs_review=True
        if needs_review:high_risk.append(priority)
    # No names, original SQL, versions, hash of private SQL or absolute paths
    # in the output. Review indices are R111 PRIORITY order, not chronology.
    return {
      "work_package":WORK,
      "decision":"NO_GO",
      "mode":"OWNER_PRIVATE_OFFLINE_QA_MIGRATION_EFFECT_CLASSIFICATION",
      "original_migrations_sha256_reverified":EXPECTED,
      "original_migration_chronology_unique_valid":True,
      "lexical_top_level_statements":total,
      "empty_statement_migration_count":empty_files,
      "top_level_statement_kinds":{k:int(kinds[k]) for k in KIND_NAMES},
      "conservative_word_markers":{k:int(indicators[k]) for k in AGG_KEYS},
      "risk_flagged_original_file_count":len(high_risk),
      "first_r111_priority_review_indices_not_chronology":
        high_risk[:MAX_REVIEW_INDICES],
      "r111_priority_review_index_count_truncated":
        len(high_risk)>MAX_REVIEW_INDICES,
      "unclassified_top_level_statements":int(kinds["other"]),
      "known_dynamic_sql_fully_parsed":False,
      "all_83_migrations_semantically_reviewed":False,
      "private_source_safe_for_qa_install_proven":False,
      "qa_sql_write_authorized":False,
      "original_or_production_write_authorized":False,
      "no_sql_executed":True,
      "no_network_or_database_access":True,
      "private_sql_filenames_migration_versions_paths_and_secrets_exported":False,
      "limitations":[
       "This is lexical statement-classification and conservative word-marker triage, not a PostgreSQL execution or semantic dependency graph.",
       "Function and DO bodies, dynamic EXECUTE, COPY, role/security/Storage effects, default privileges, and indirect side effects require manual private source review.",
       "R111 docket indices are priority sorted and are not timestamp chronology; changes have not been applied to QA or original.",
       "A matching source hash or zero risk-marker count NEVER authorizes installing private SQL; owner must separately approve an exact QA-only SQL-write plan."
      ]
    }

def main()->int:
    parser=argparse.ArgumentParser(description="R211 owner-only offline private QA migration-effects preflight")
    parser.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=parser.parse_args()
    try:
        print(json.dumps(report(args.root),indent=2,sort_keys=True))
        return 0
    except Exception:
        # Never echo path, private SQL token, filename, exception details or
        # traceback; stop rather than partially certify an unsafe install.
        print("R211 PRIVATE_QA_PREFLIGHT_NO_GO: source integrity, archive or parser restriction.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
