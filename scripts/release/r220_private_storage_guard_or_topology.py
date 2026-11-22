#!/usr/bin/env python3
"""R220 offline, owner-private Storage policy guard OR-topology triage.

Masks SQL strings/comments, then inspects balanced USING / WITH CHECK clauses.
Replays policy lifecycle from original private 83-history, reconciles R219.
This is source-word triage, NOT SQL parsing, RLS evaluation or URL revocation.
No original policy/target/migration names, guard expressions, SQL or hashes
are printed. No SQL execution, network, DB access or filesystem writes.
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
from r218_private_storage_policy_lifecycle import parse_policy, scope
from r219_private_storage_policy_pair_profiles import report as r219_report

WORK = "B10-R18-220"
MAX_REFS = 24
GUARDS = {
    "using": re.compile(r'\bUSING\s*\(', re.I),
    "with_check": re.compile(r'\bWITH\s+CHECK\s*\(', re.I),
}
IDENTITY = re.compile(
    r'\bauth\s*\.\s*(?:uid|jwt)\s*\(|'
    r'\b(?:is_campaign_member|is_campaign_dm|can_view_campaign_map|can_edit_campaign_sheet)\s*\(',
    re.I,
)
BUCKET = re.compile(r'\bbucket_id\b', re.I)
OR = re.compile(r'\bOR\b', re.I)
DOLLAR = re.compile(r'\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$')
CODE_LABELS = (
    "pair_with_guard_top_level_or",
    "pair_with_guard_nested_or",
    "pair_with_guard_or_at_any_depth",
    "pair_with_top_level_or_branch_without_bucket_word",
    "pair_with_top_level_or_branch_without_known_identity_word",
    "pair_with_or_word_only_outside_guards",
)
POLICY_LABELS = (
    "using_clause_present",
    "with_check_clause_present",
    "using_guard_top_level_or",
    "with_check_guard_top_level_or",
    "using_guard_nested_or",
    "with_check_guard_nested_or",
    "guard_top_level_or_branch_without_bucket_word",
    "guard_top_level_or_branch_without_known_identity_word",
)


def mask_literals_and_comments(source: str) -> str:
    """Return same-length SQL with strings/comments replaced by spaces.

    This is deliberately a narrow lexical mask: unsupported/unclosed quoting
    raises AuditBlocked, rather than treating private source as parsed SQL.
    """
    n = len(source)
    out = list(source)
    i = 0

    def hide(start, end):
        for j in range(start,end):
            if source[j] != "\n":
                out[j] = " "

    while i < n:
        if source.startswith("--", i):
            end = source.find("\n", i)
            if end < 0:
                end = n
            hide(i,end)
            i = end
        elif source.startswith("/*",i):
            depth=1
            j=i+2
            while j<n and depth:
                if source.startswith("/*",j):
                    depth+=1;j+=2
                elif source.startswith("*/",j):
                    depth-=1;j+=2
                else:
                    j+=1
            if depth:
                raise AuditBlocked("R220_UNCLOSED_BLOCK_COMMENT")
            hide(i,j)
            i=j
        elif source[i] in ("'", '"'):
            quote=source[i]
            escaping=(quote=="'" and i>0 and source[i-1] in "Ee" and
                      (i<2 or not (source[i-2].isalnum() or source[i-2]=="_")))
            j=i+1
            closed=False
            while j<n:
                if escaping and source[j]=="\\":
                    j+=2
                    continue
                if source[j]==quote:
                    if j+1<n and source[j+1]==quote:
                        j+=2
                        continue
                    j+=1
                    closed=True
                    break
                j+=1
            if not closed:
                raise AuditBlocked("R220_UNCLOSED_LITERAL")
            hide(i,j)
            i=j
        elif source[i]=="$":
            m=DOLLAR.match(source,i)
            if m is None:
                i+=1
                continue
            tag=m.group()
            at=source.find(tag,m.end())
            if at<0:
                raise AuditBlocked("R220_UNCLOSED_DOLLAR_LITERAL")
            end=at+len(tag)
            hide(i,end)
            i=end
        else:
            i+=1
    return "".join(out)


def split_guard_or(masked_expr: str) -> tuple[bool,bool,list[str]]:
    depth=0
    last=0
    top=False
    nested=False
    branches=[]
    for token in re.finditer(r'\bOR\b|[()]',masked_expr,re.I):
        word=token.group().upper()
        if word=="(":
            depth+=1
        elif word==")":
            depth-=1
            if depth<0:
                raise AuditBlocked("R220_GUARD_DEPTH_UNDERFLOW")
        elif depth==0:
            branches.append(masked_expr[last:token.start()])
            last=token.end()
            top=True
        else:
            nested=True
    if depth!=0:
        raise AuditBlocked("R220_UNBALANCED_GUARD_BODY")
    if top:
        branches.append(masked_expr[last:])
    return top,nested,branches


def guard_topology(statement: str) -> dict:
    cleaned=mask_literals_and_comments(statement)
    data={
        "using":False, "with_check":False,
        "top":False, "nested":False,
        "branch_missing_bucket":False,
        "branch_missing_identity":False,
    }
    for name,regex in GUARDS.items():
        m=regex.search(cleaned)
        if not m:
            continue
        data[name]=True
        start=m.end()-1
        if cleaned[start]!="(":
            raise AuditBlocked("R220_GUARD_START")
        depth=0
        end=None
        for j in range(start,len(cleaned)):
            if cleaned[j]=="(":
                depth+=1
            elif cleaned[j]==")":
                depth-=1
                if depth==0:
                    end=j
                    break
                if depth<0:
                    raise AuditBlocked("R220_NEGATIVE_GUARD_DEPTH")
        if end is None:
            raise AuditBlocked("R220_GUARD_NOT_BALANCED")
        body=cleaned[start+1:end]
        outer,inner,branches=split_guard_or(body)
        data[name+"_top"]=outer
        data[name+"_nested"]=inner
        if outer:
            for part in branches:
                if not BUCKET.search(part):
                    data["branch_missing_bucket"]=True
                if not IDENTITY.search(part):
                    data["branch_missing_identity"]=True
        data["top"]|=outer
        data["nested"]|=inner
    return data


def pair_labels(a:dict,b:dict) -> tuple[str,...]:
    ag,bg=a["guard"],b["guard"]
    flags=set()
    if ag["top"] or bg["top"]:
        flags.add("pair_with_guard_top_level_or")
        if ag["branch_missing_bucket"] or bg["branch_missing_bucket"]:
            flags.add("pair_with_top_level_or_branch_without_bucket_word")
        if ag["branch_missing_identity"] or bg["branch_missing_identity"]:
            flags.add("pair_with_top_level_or_branch_without_known_identity_word")
    if ag["nested"] or bg["nested"]:
        flags.add("pair_with_guard_nested_or")
    if ag["top"] or ag["nested"] or bg["top"] or bg["nested"]:
        flags.add("pair_with_guard_or_at_any_depth")
    elif a["raw_or_word"] or b["raw_or_word"]:
        flags.add("pair_with_or_word_only_outside_guards")
    if not flags.issubset(CODE_LABELS):
        raise AuditBlocked("R220_BAD_FIXED_CODE")
    return tuple(sorted(flags))


def report(root: Path):
    previous=r219_report(root)
    if (previous["decision"]!="NO_GO" or
        previous["original_migrations_sha256_reverified"]!=83 or
        previous["qa_sql_install_authorized"] is not False):
        raise AuditBlocked("R220_PRIVATE_R219_GATE_FAILED")
    root=checked_dir(root,private=True)
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024))
    items=docket.get("reviewItems")
    if type(items) is not list or len(items)!=83:
        raise AuditBlocked("R220_ORIGINAL_DOCKET_BAD")
    folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    archive=[]
    versions=set()
    for priority,item in enumerate(items,1):
        filename=item.get("filename")
        version=strict_migration_version(filename)
        if version is None or version in versions:
            raise AuditBlocked("R220_ORIGINAL_VERSION_DRIFT")
        versions.add(version)
        raw=checked_file(folder/filename,MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest()!=item.get("sourceBodySha256"):
            raise AuditBlocked("R220_ORIGINAL_SHA_DRIFT")
        archive.append((version,priority,raw))
    current={}
    top_level=0
    policy_statements=0
    for _,priority,raw in sorted(archive,key=lambda row:row[0]):
        for stmt in statements(raw.decode("utf-8")):
            top_level+=1
            if not shape(stmt):
                continue
            policy_statements+=1
            parsed=parse_policy(stmt)
            if parsed is None:
                raise AuditBlocked("R220_POLICY_UNPARSED")
            action,key,tail=parsed
            if key[0]!="storage":
                raise AuditBlocked("R220_POLICY_NOT_STORAGE")
            if action=="CREATE":
                if key in current:
                    raise AuditBlocked("R220_DUPLICATE_LIFECYCLE_UNRESOLVED")
                ops,roles,restrictive,ambiguous=scope(tail)
                current[key]={
                    "priority":priority, "operations":ops, "roles":roles,
                    "restrictive":restrictive,"ambiguous":ambiguous,
                    "guard":guard_topology(stmt),
                    "raw_or_word":bool(OR.search(stmt)),
                }
            elif action=="DROP":
                if key not in current:
                    raise AuditBlocked("R220_DROP_NOT_ARCHIVED")
                del current[key]
            else:
                raise AuditBlocked("R220_ALTER_POLICY_NOT_SEMANTICALLY_PARSED")

    if (len(versions)!=83 or
        top_level!=previous["top_level_statements_reconciled"] or
        policy_statements!=previous["storage_policy_statements_reconciled"] or
        len(current)!=previous["final_archive_lexical_policy_keys"]):
        raise AuditBlocked("R220_HISTORY_RECONCILIATION")
    policy_counts=Counter()
    for value in current.values():
        g=value["guard"]
        if g["using"]:policy_counts["using_clause_present"]+=1
        if g["with_check"]:policy_counts["with_check_clause_present"]+=1
        for kind in ("using","with_check"):
            if g.get(kind+"_top"):policy_counts[kind+"_guard_top_level_or"]+=1
            if g.get(kind+"_nested"):policy_counts[kind+"_guard_nested_or"]+=1
        if g["branch_missing_bucket"]:policy_counts["guard_top_level_or_branch_without_bucket_word"]+=1
        if g["branch_missing_identity"]:policy_counts["guard_top_level_or_branch_without_known_identity_word"]+=1

    groups=defaultdict(list)
    for (schema,table,_),value in current.items():
        groups[(schema,table)].append(value)
    pair_count=0
    pair_markers=Counter()
    reasons=defaultdict(set)
    affected_targets=0
    or_word_pair_count=0
    for values in groups.values():
        has_pair=False
        for i in range(len(values)):
            for j in range(i+1,len(values)):
                a,b=values[i],values[j]
                if a["restrictive"] or b["restrictive"] or a["ambiguous"] or b["ambiguous"]:
                    continue
                if not a["operations"]&b["operations"] or not a["roles"]&b["roles"]:
                    continue
                pair_count+=1
                has_pair=True
                if a["raw_or_word"] or b["raw_or_word"]:
                    or_word_pair_count+=1
                labels=pair_labels(a,b)
                pair_markers.update(labels)
                for item in (a,b):
                    reasons[item["priority"]].add("possible_overlap_policy_pair")
                    reasons[item["priority"]].update(labels)
        if has_pair:affected_targets+=1

    if (pair_count!=previous["distinct_possible_overlapping_policy_key_pairs"] or
        affected_targets!=previous["possible_overlap_storage_table_targets"] or
        or_word_pair_count!=previous["possible_pair_lexical_cue_counts"]["one_or_both_with_or_word"]):
        raise AuditBlocked("R220_R219_PAIR_RECONCILIATION")
    if pair_markers["pair_with_guard_or_at_any_depth"]>or_word_pair_count:
        raise AuditBlocked("R220_MASKED_OR_COUNTER_GREW")
    priorities=sorted(reasons)
    return {
        "work_package":WORK,
        "decision":"NO_GO",
        "mode":"OWNER_PRIVATE_OFFLINE_STORAGE_GUARD_OR_TOPOLOGY_TRIAGE",
        "original_migrations_sha256_reverified":83,
        "top_level_statements_reconciled":top_level,
        "storage_policy_statements_reconciled":policy_statements,
        "final_archived_policy_keys":len(current),
        "possible_overlapping_policy_key_pairs_reconciled":pair_count,
        "r219_policy_pair_with_or_word_reconciled":or_word_pair_count,
        "policy_guard_lexical_counts":{code:policy_counts[code] for code in POLICY_LABELS},
        "potential_pair_guard_topology_counts":{code:pair_markers[code] for code in CODE_LABELS},
        "priority_review_file_count":len(priorities),
        "first_r111_priority_guard_review_items":[
            {"r111_priority_index":index,"fixed_review_codes":sorted(reasons[index])}
            for index in priorities[:MAX_REFS]
        ],
        "priority_list_truncated":len(priorities)>MAX_REFS,
        "effective_postgresql_rls_or_sql_boolean_semantics_proven":False,
        "hosted_storage_policy_catalog_verified":False,
        "signed_url_revocation_verified":False,
        "all_83_migrations_semantically_approved":False,
        "qa_sql_install_authorized":False,
        "original_or_production_sql_authorized":False,
        "no_sql_executed":True,
        "no_network_or_database_access":True,
        "private_sql_policy_guard_names_versions_paths_or_docket_exported":False,
        "limitations":[
            "Parentheses and SQL literal/comment masking are conservative lexical approximations, not a PostgreSQL AST, resolved helper definition or Boolean security proof.",
            "A branch missing bucket_id or a known helper word can still be secure via other scoped logic; the presence of both words can still be insecure.",
            "Overlapping permissive policies are OR-combined by PostgreSQL; no live RLS, managed policy, privilege or signed bearer URL revocation has been tested.",
            "Original SQL and R111 docket remain owner-private; exact QA-only SQL writes still need separate owner approval, backup and rollback.",
        ],
    }


def main():
    try:
        print(json.dumps(report(Path.home()/"ttrpg-history-private"),sort_keys=True,indent=2))
        return 0
    except Exception:
        print("R220_PRIVATE_STORAGE_GUARD_NO_GO: source integrity or lexical guard check refused.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
