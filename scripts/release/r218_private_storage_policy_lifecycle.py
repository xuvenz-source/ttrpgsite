#!/usr/bin/env python3
"""R218 owner-private, offline Storage policy lifecycle/order/overlap triage.

Re-verifies prior 83 private source files. Policy/target names are used ONLY
in memory for lexical matching. Outputs fixed risk codes, counts, numeric R111
priority indices; NO source identifiers, source hashes, versions or SQL.
Never executes SQL, calls network/database, writes files or approves QA install.
"""
from __future__ import annotations
from collections import Counter, defaultdict
import hashlib, json, re, sys
from pathlib import Path

from r154_private_history_audit import AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
from r191_private_fog_status_lineage import strict_migration_version
from r217_private_storage_policy_shape import report as r217_report, shape

WORK="B10-R18-218"
MAX_ROWS=24
IDENT=r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)'
NAME=rf'(?P<name>{IDENT})'
SCHEMA=rf'(?P<schema>{IDENT})'
TARGET=rf'(?P<table>{IDENT})'
PREFIX=re.compile(
 rf'^\s*(?P<action>CREATE|ALTER|DROP)\s+POLICY\s+'
 rf'(?:IF\s+EXISTS\s+)?{NAME}\s+ON\s+(?:TABLE\s+)?'
 rf'{SCHEMA}\s*\.\s*{TARGET}(?=\s|;|$)',re.I|re.S,
)
GUARD=re.compile(r'\b(?:USING|WITH\s+CHECK)\s*\(',re.I)
FOR=re.compile(r'\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b',re.I)
ROLE=re.compile(r'\bTO\s+([\s\S]+)$',re.I)
RESTRICTIVE=re.compile(r'\bAS\s+RESTRICTIVE\b',re.I)
OPERATION_SET=("SELECT","INSERT","UPDATE","DELETE")
CODES=(
 "policy_name_or_target_unparsed",
 "duplicate_create_before_drop",
 "drop_without_prior_archive_create",
 "alter_without_prior_archive_create",
 "alter_effect_unparsed",
 "recreated_after_drop",
 "ambiguous_explicit_role_scope",
 "possible_permissive_policy_overlap",
)

def ident(value):
    # Quoted identifiers preserve case; unquoted fold to lowercase.
    return value[1:-1].replace('""','"') if value.startswith('"') else value.lower()

def parse_policy(statement):
    matched=PREFIX.match(statement)
    if not matched: return None
    return (matched.group("action").upper(),
            (ident(matched.group("schema")),ident(matched.group("table")),ident(matched.group("name"))),
            statement[matched.end():])

def scope(tail):
    header=GUARD.split(tail,maxsplit=1)[0]
    found=FOR.search(header)
    op=found.group(1).upper() if found else "ALL"
    operations=set(OPERATION_SET) if op=="ALL" else {op}
    restrictive=bool(RESTRICTIVE.search(header))
    to=ROLE.search(header)
    if not to: return operations,{"anon","authenticated"},restrictive,False
    text=to.group(1)
    roles=set()
    if re.search(r'\bPUBLIC\b',text,re.I): roles.update(("anon","authenticated"))
    if re.search(r'\banon\b',text,re.I):roles.add("anon")
    if re.search(r'\bauthenticated\b',text,re.I):roles.add("authenticated")
    other=not roles or bool(re.search(r'\bservice_role\b',text,re.I))
    return operations,roles,restrictive,other

def report(root:Path):
    prev=r217_report(root)
    if (prev["decision"]!="NO_GO" or
        prev["original_migrations_sha256_reverified"]!=83 or
        prev["qa_sql_install_authorized"] is not False):
        raise AuditBlocked("R218_PRIOR_OWNER_PRIVATE_GATE_FAILED")
    root=checked_dir(root,private=True)
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024))
    items=docket.get("reviewItems")
    if type(items) is not list or len(items)!=83:
        raise AuditBlocked("R218_PRIVATE_DOCKET_MISMATCH")
    directory=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    archive=[]
    versions=set()
    for priority,item in enumerate(items,1):
        name=item.get("filename")
        version=strict_migration_version(name)
        if version is None or version in versions:
            raise AuditBlocked("R218_CHRONOLOGY_CHANGED")
        versions.add(version)
        raw=checked_file(directory/name,MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest()!=item.get("sourceBodySha256"):
            raise AuditBlocked("R218_PRIVATE_HASH_CHANGED")
        archive.append((version,priority,raw))
    current={}
    ever_dropped=set()
    occurrences=Counter()
    reason_by_priority=defaultdict(set)
    total=0; policy_count=0
    for _,priority,raw in sorted(archive,key=lambda item:item[0]):
        for statement in statements(raw.decode("utf-8")):
            total+=1
            marks=shape(statement)
            if not marks:continue
            policy_count+=1
            parsed=parse_policy(statement)
            if parsed is None:
                occurrences["policy_name_or_target_unparsed"]+=1
                reason_by_priority[priority].add("policy_name_or_target_unparsed")
                continue
            action,key,tail=parsed
            if key[0]!="storage":
                raise AuditBlocked("R218_NON_STORAGE_MATCH")
            if action=="CREATE":
                ops,roles,restrictive,other=scope(tail)
                if other:
                    occurrences["ambiguous_explicit_role_scope"]+=1
                    reason_by_priority[priority].add("ambiguous_explicit_role_scope")
                if key in current:
                    occurrences["duplicate_create_before_drop"]+=1
                    reason_by_priority[priority].add("duplicate_create_before_drop")
                else:
                    if key in ever_dropped:
                        occurrences["recreated_after_drop"]+=1
                        reason_by_priority[priority].add("recreated_after_drop")
                    current[key]=(priority,ops,roles,restrictive,other)
            elif action=="DROP":
                if key not in current:
                    occurrences["drop_without_prior_archive_create"]+=1
                    reason_by_priority[priority].add("drop_without_prior_archive_create")
                else:
                    del current[key]
                ever_dropped.add(key)
            elif action=="ALTER":
                if key not in current:
                    occurrences["alter_without_prior_archive_create"]+=1
                    reason_by_priority[priority].add("alter_without_prior_archive_create")
                occurrences["alter_effect_unparsed"]+=1
                reason_by_priority[priority].add("alter_effect_unparsed")
            else:
                raise AuditBlocked("R218_BAD_ACTION")
    if (total!=prev["top_level_statements_reconciled"] or
        policy_count!=prev["storage_policy_statements_reconciled"] or
        len(versions)!=83):
        raise AuditBlocked("R218_LEXICAL_COUNTS_DRIFT")
    targets=defaultdict(list)
    for (schema,table,_name),info in current.items():
        targets[(schema,table)].append(info)
    pairs=set(); target_count=0
    for values in targets.values():
        target_has_overlap=False
        for i in range(len(values)):
            for j in range(i+1,len(values)):
                a,b=values[i],values[j]
                if (not a[3] and not b[3] and not a[4] and not b[4] and
                    a[1]&b[1] and a[2]&b[2]):
                    pairs.add(tuple(sorted((a[0],b[0]))))
                    for priority in (a[0],b[0]):
                        reason_by_priority[priority].add("possible_permissive_policy_overlap")
                    target_has_overlap=True
        if target_has_overlap:target_count+=1
    occurrences["possible_permissive_policy_overlap"]=len(pairs)
    flags=sorted(reason_by_priority)
    return {
        "work_package":WORK,
        "decision":"NO_GO",
        "mode":"OWNER_PRIVATE_OFFLINE_STORAGE_POLICY_LEXICAL_LIFECYCLE",
        "original_migrations_sha256_reverified":83,
        "top_level_statements_reconciled":total,
        "storage_policy_statements_reconciled":policy_count,
        "historical_policy_create_statements":prev["storage_policy_lexical_statement_counts"]["storage_policy_create"],
        "historical_policy_drop_statements":prev["storage_policy_lexical_statement_counts"]["storage_policy_drop"],
        "parsed_final_archive_policy_key_count":len(current),
        "possible_permissive_overlap_target_count":target_count,
        "fixed_review_event_counts":{code:int(occurrences[code]) for code in CODES},
        "owner_priority_review_file_count":len(flags),
        "first_r111_priority_review_items":[{"r111_priority_index":i,
            "lexical_review_codes":sorted(reason_by_priority[i])} for i in flags[:MAX_ROWS]],
        "priority_review_items_truncated":len(flags)>MAX_ROWS,
        "external_preexisting_policies_ruled_out":False,
        "complete_final_hosted_storage_policy_set_proven":False,
        "effective_permissive_rls_composition_verified":False,
        "signed_url_revocation_verified":False,
        "all_83_migrations_semantically_approved":False,
        "qa_sql_install_authorized":False,
        "original_or_production_sql_authorized":False,
        "no_sql_executed":True,
        "no_network_or_database_access":True,
        "private_sql_policy_names_versions_paths_and_docket_exported":False,
        "limitations":[
            "Policy name matching, apparent lifetime and overlap are chronological lexical simulations; not PostgreSQL execution, dependencies or effective RLS.",
            "Role and operation extraction is conservative; roles inherited from other grants, existing managed policies, dynamic SQL and helper calls remain unresolved.",
            "A possible permissive overlap is not a proven leak, and zero overlaps cannot certify access control or signed Storage URL revocation.",
            "All original SQL and R111 docket remain private; exact QA-only SQL writes require separate owner consent, backup and rollback.",
        ],
    }

def main():
    try:
        print(json.dumps(report(Path.home()/"ttrpg-history-private"),indent=2,sort_keys=True))
        return 0
    except Exception:
        print("R218_PRIVATE_STORAGE_LIFECYCLE_NO_GO: owner source integrity or policy triage refused.",file=sys.stderr)
        return 2

if __name__=="__main__":raise SystemExit(main())
