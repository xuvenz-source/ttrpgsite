#!/usr/bin/env python3
"""R18-154 private offline read-only SQL triage. No SQL/name/content export.

This is lexical triage, NOT a SQL parser, signed QA, or independent review.
No network; no file writes; R111 approval flags remain unchanged.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import stat
import sys

WORK_PACKAGE="B10-R18-154"
MAX_SQL_BYTES=12*1024*1024
EXPECTED=83

class AuditBlocked(Exception):
    pass

def reject():
    raise AuditBlocked("PRIVATE_AUDIT_NO_GO")

def checked_dir(path,private=False):
    if path.is_symlink() or not path.is_dir():reject()
    if private and stat.S_IMODE(path.stat().st_mode)&0o077:reject()
    return path

def checked_file(path,limit):
    if path.is_symlink() or not path.is_file():reject()
    st=path.stat()
    if st.st_nlink!=1 or st.st_size<1 or st.st_size>limit:reject()
    return path.read_bytes()

def statements(source):
    """Split top-level semicolons outside nested comments and dollar-quoted bodies.

    Quoted SQL/dollar bodies remain opaque to splitting; this is not a parser.
    """
    out,buf=[],[]
    i,n,state,tag,level=0,len(source),"normal","",0
    while i<n:
        ch=source[i]
        pair=source[i:i+2]
        if state=="line":
            if ch=="\n":
                buf.append("\n")
                state="normal"
            i+=1
            continue
        if state=="block":
            if pair=="/*":
                level+=1
                i+=2
            elif pair=="*/":
                level-=1
                i+=2
                if level==0:
                    state="normal"
                    buf.append(" ")
            else:i+=1
            continue
        if state=="single":
            buf.append(ch)
            i+=1
            if ch=="'":
                if i<n and source[i]=="'":
                    buf.append("'")
                    i+=1
                else:state="normal"
            continue
        if state=="double":
            buf.append(ch)
            i+=1
            if ch=='"':
                if i<n and source[i]=='"':
                    buf.append('"')
                    i+=1
                else:state="normal"
            continue
        if state=="dollar":
            if source.startswith(tag,i):
                buf.append(tag)
                i+=len(tag)
                state="normal"
            else:
                buf.append(ch)
                i+=1
            continue
        if pair=="--":
            state="line"
            i+=2
            continue
        if pair=="/*":
            state="block"
            level=1
            i+=2
            continue
        if ch=="'":
            state="single"
            buf.append(ch)
            i+=1
            continue
        if ch=='"':
            state="double"
            buf.append(ch)
            i+=1
            continue
        if ch=="$":
            match=re.match(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$",source[i:])
            if match:
                tag=match.group(0)
                state="dollar"
                buf.append(tag)
                i+=len(tag)
                continue
        if ch==";":
            item="".join(buf).strip()
            if item:out.append(item)
            buf.clear()
            i+=1
            continue
        buf.append(ch)
        i+=1
    if state in ("single","double","dollar","block"):reject()
    tail="".join(buf).strip()
    if tail:out.append(tail)
    return out

def has(sql,pattern):
    return re.search(pattern,sql,re.I|re.S) is not None

def classify_file(text):
    counts=Counter()
    for st in statements(text):
        if has(st,r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b"):
            counts["function_definitions"]+=1
            if has(st,r"\bSECURITY\s+DEFINER\b"):
                counts["security_definer_functions"]+=1
                if not has(st,r"\bSET\s+search_path\b"):
                    counts["definer_without_local_search_path"]+=1
                if has(st,r"\bSET\s+search_path\s*(?:=|TO)\s*(?:public\b|\"public\")"):
                    counts["definer_with_public_search_path"]+=1
                if not has(st,r"\bauth\s*\.\s*(?:uid|jwt)\s*\("):
                    counts["definer_without_direct_auth_identity"]+=1
                if has(st,r"\bEXECUTE\s+(?:FORMAT\s*\(|['\"]|\$|[a-z_][\w]*)"):
                    counts["definer_dynamic_execute_marker"]+=1
                if has(st,r"\bcampaign_members\b"):
                    counts["definer_membership_reference"]+=1
        if has(st,r"\b(?:CREATE|ALTER)\s+POLICY\b"):
            counts["policy_definitions"]+=1
            if has(st,r"\bON\s+(?:\"?storage\"?\s*\.\s*)?\"?objects\"?\b"):
                counts["storage_object_policies"]+=1
                if has(st,r"\bFOR\s+SELECT\b"):
                    counts["storage_select_policies"]+=1
                if not has(st,r"\bauth\s*\.\s*(?:uid|jwt)\s*\(|\bis_campaign_(?:dm|member)\s*\("):
                    counts["storage_policy_no_known_identity_helper"]+=1
                if has(st,r"\bOR\b"):
                    counts["storage_policy_or_marker"]+=1
                if has(st,r"\b(?:USING|WITH\s+CHECK)\s*\(\s*TRUE\s*\)"):
                    counts["storage_policy_literal_true"]+=1
                if not has(st,r"\bbucket_id\b"):
                    counts["storage_policy_no_bucket_marker"]+=1
        if has(st,r"\bGRANT\s+EXECUTE\s+ON\s+(?:ALL\s+)?FUNCTIONS?\b"):
            if has(st,r"\bTO\s+PUBLIC\b|\bTO\s+[^;]*,\s*PUBLIC\b"):
                counts["public_execute_grants"]+=1
            if has(st,r"\bTO\s+authenticated\b"):
                counts["authenticated_execute_grants"]+=1
        if has(st,r"\bALTER\s+DEFAULT\s+PRIVILEGES\b"):
            counts["default_privilege_changes"]+=1
        for label,rx in (
            ("membership_truncate_statements",r"\bTRUNCATE\s+(?:TABLE\s+)?(?:public\s*\.\s*)?campaign_members\b"),
            ("membership_update_statements",r"\bUPDATE\s+(?:public\s*\.\s*)?campaign_members\b"),
            ("membership_insert_statements",r"\bINSERT\s+INTO\s+(?:public\s*\.\s*)?campaign_members\b"),
            ("membership_delete_statements",r"\bDELETE\s+FROM\s+(?:public\s*\.\s*)?campaign_members\b"),
            ("campaign_owner_update_markers",r"\bUPDATE\s+(?:public\s*\.\s*)?campaigns\b[\s\S]*?\bowner_id\s*="),
            ("realtime_publication_changes",r"\b(?:CREATE|ALTER)\s+PUBLICATION\b|\bREPLICA\s+IDENTITY\b"),
            ("extension_or_role_changes",r"\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|EXTENSION)\b"),
            ("auth_schema_writes",r"\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+auth\s*\.\s*(?:users|identities|sessions)\b"),
            ("storage_data_or_bucket_writes",r"\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+storage\s*\.\s*(?:objects|buckets)\b")
        ):
            if has(st,rx):counts[label]+=1
    return dict(counts)

SUMMARY_KEYS=(
 "function_definitions","security_definer_functions",
 "definer_without_local_search_path","definer_with_public_search_path",
 "definer_without_direct_auth_identity","definer_dynamic_execute_marker",
 "definer_membership_reference","policy_definitions","storage_object_policies",
 "storage_select_policies","storage_policy_no_known_identity_helper",
 "storage_policy_or_marker","storage_policy_literal_true",
 "storage_policy_no_bucket_marker","public_execute_grants",
 "authenticated_execute_grants","default_privilege_changes",
 "membership_truncate_statements","membership_update_statements",
 "membership_insert_statements","membership_delete_statements",
 "campaign_owner_update_markers","realtime_publication_changes",
 "extension_or_role_changes","auth_schema_writes","storage_data_or_bucket_writes"
)
PRIORITY_MARKERS=(
 "definer_without_local_search_path","definer_with_public_search_path",
 "definer_dynamic_execute_marker","storage_policy_no_known_identity_helper",
 "storage_policy_literal_true","storage_policy_no_bucket_marker",
 "public_execute_grants","membership_truncate_statements",
 "campaign_owner_update_markers","auth_schema_writes"
)

def audit(root):
    root=checked_dir(root,private=True)
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024).decode("utf-8"))
    if docket.get("workPackage")!="B10-R18-111" or docket.get("decision")!="NO_GO":
        reject()
    items=docket.get("reviewItems")
    if not isinstance(items,list) or len(items)!=EXPECTED:reject()
    folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    actual_names=set(p.name for p in folder.iterdir() if p.suffix==".sql")
    if len(actual_names)!=EXPECTED:reject()
    total,flagged,seen=Counter(),[],set()
    for idx,item in enumerate(items,1):
        name=item.get("filename")
        expected_hash=item.get("sourceBodySha256")
        if (not isinstance(name,str) or Path(name).name!=name or
            not re.fullmatch(r"[A-Za-z0-9_-]+\.sql",name) or name in seen or
            name not in actual_names or not isinstance(expected_hash,str) or
            not re.fullmatch(r"[0-9a-f]{64}",expected_hash)):
            reject()
        seen.add(name)
        raw=checked_file(folder/name,MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest()!=expected_hash:reject()
        counts=classify_file(raw.decode("utf-8"))
        total.update(counts)
        marked=[k for k in PRIORITY_MARKERS if counts.get(k)]
        if marked:
            flagged.append({"review_index":idx,"markers":marked,
                            "marker_occurrences":sum(counts[k] for k in marked)})
    if seen!=actual_names:reject()
    if any(i.get("securityApproved") is True for i in items):reject()
    return {
        "work_package":WORK_PACKAGE,"decision":"NO_GO",
        "mode":"OFFLINE_HEURISTIC_TRIAGE_NOT_SEMANTIC_APPROVAL",
        "files_sha256_verified":len(seen),"files_security_approved":0,
        "statement_counts":{k:total[k] for k in SUMMARY_KEYS},
        "files_requiring_focused_review":len(flagged),
        "priority_review_markers":flagged[:18],
        "priority_review_markers_truncated":max(0,len(flagged)-18),
        "private_sql_exported":False,"filenames_exported":False,
        "live_database_accessed":False,
        "independent_security_review_completed":False,
        "signed_qa_completed":False,"production_release_authorized":False,
        "limitations":[
            "Lexical SQL triage only; dynamic SQL, SQL semantics and multi-migration state require deeper review.",
            "Report cannot certify 83 migrations, campaign isolation, signed URL revocation or real Auth sessions.",
            "No R111 approval flags are changed and no hosted SQL is executed."
        ]
    }

def main():
    parser=argparse.ArgumentParser(description="R18-154 offline sanitized private SQL triage")
    parser.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=parser.parse_args()
    try:
        print(json.dumps(audit(args.root),sort_keys=True,indent=2))
        return 0
    except (AuditBlocked,OSError,UnicodeError,ValueError,KeyError,TypeError):
        print("R18-154 PRIVATE_AUDIT_NO_GO: local path, integrity or parser check failed; never share raw files.",file=sys.stderr)
        return 2

if __name__=="__main__":
    sys.exit(main())
