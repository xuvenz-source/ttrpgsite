#!/usr/bin/env python3
"""R18-156 local-only structural verification of one R111 Storage policy.

No network, subprocess, DB, writes, SQL/body/name/path/account output.
Reports only approved booleans, indexes and known categories. Never approves SQL.
"""
from __future__ import annotations
from pathlib import Path
import argparse
import json
import re
import sys
from r154_private_history_audit import AuditBlocked, checked_file, statements, MAX_SQL_BYTES
from r155_private_policy_focus import report as r155_report, check_policy

INDEX=29

def has(text, pattern):
    return re.search(pattern,text,re.I|re.S) is not None

def structural_flags(sql):
    """Lexical *indicators*, not SQL parser, AST, privilege or semantic proof."""
    # Match a well-scoped battle_maps alias without leaking the alias itself.
    m=re.search(r'\bFROM\s+(?:public\s*\.\s*)?"?battle_maps"?\s+(?:AS\s+)?([A-Za-z_]\w*)\b',sql,re.I)
    alias=m.group(1) if m else None
    if alias and alias.lower() in ("where","on","join","inner","left","right","full","cross"):
        alias=None
    a=(r'"?'+re.escape(alias)+r'"?\s*\.\s*') if alias else r'(?!)'
    src=(r'(?:\"?objects\"?\s*\.\s*)?\"?name\"?')
    b=bool(alias) and has(sql,
        r'\b'+a+r'\"?storage_path\"?\s*=\s*'+src+r'\b|'
        +src+r'\s*=\s*'+a+r'\"?storage_path\"?\b')
    # Same map alias ID + same map alias campaign ID passed into helper.
    call=bool(alias) and has(sql,
      r'\b(?:public\s*\.\s*)?can_view_campaign_map\s*\(\s*'
      +a+r'\"?campaign_id\"?\s*,\s*'+a+r'\"?id\"?\s*\)')
    cid=bool(alias) and has(sql,
      r'\b'+a+r'\"?campaign_id\"?\b')
    obj=bool(alias) and has(sql,r'\b'+a+r'\"?storage_path\"?\b')
    return {
      "authenticated_scope":has(sql,r'\bTO\s+authenticated\b'),
      "select_scope":has(sql,r'\bFOR\s+SELECT\b'),
      "bucket_id_predicate":has(sql,r'\bbucket_id\b'),
      "storage_object_name_predicate":has(sql,r'\b(?:objects\s*\.\s*)?name\b'),
      "battle_maps_source_and_alias":bool(alias),
      "same_alias_storage_path_equals_requested_object_name":bool(b),
      "same_alias_campaign_id_and_map_id_to_helper":bool(call),
      "same_alias_campaign_id_reference":bool(cid),
      "same_alias_storage_path_reference":bool(obj),
      "exists_subquery_marker":has(sql,r'\bEXISTS\s*\('),
      "direct_auth_uid_or_jwt":has(sql,r'\bauth\s*\.\s*(?:uid|jwt)\s*\('),
      "literal_unconditional_true":has(sql,r'\b(?:USING|WITH\s+CHECK)\s*\(\s*TRUE\s*\)'),
      "or_text_marker":has(sql,r'\bOR\b'),
    }

def audit(root):
    previous=r155_report(root)
    if previous.get("r111_review_index")!=INDEX or previous.get("target_policy_count")!=1:
        raise AuditBlocked("R156 PRIVATE_AUDIT_NO_GO")
    # The R155 report has already verified all 83 hashes and identified the
    # exact priority-sorted R111 docket item.
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024).decode("utf-8"))
    item=docket["reviewItems"][INDEX-1]
    path=root/"r106-original-83-recovery"/"supabase"/"migrations"/item["filename"]
    sql=checked_file(path,MAX_SQL_BYTES).decode("utf-8")
    matches=[s for s in statements(sql) if check_policy(s)]
    if len(matches)!=1:
        raise AuditBlocked("R156 PRIVATE_AUDIT_NO_GO")
    flags=structural_flags(matches[0])
    return {
      "work_package":"B10-R18-156",
      "decision":"NO_GO",
      "r111_review_index":INDEX,
      "source_fingerprints_verified":83,
      "policy_count":1,
      "historical_policy_structural_indicators":flags,
      "all_expected_binding_markers_present":all(flags[k] for k in (
          "authenticated_scope","select_scope","bucket_id_predicate",
          "storage_object_name_predicate","battle_maps_source_and_alias",
          "same_alias_storage_path_equals_requested_object_name",
          "same_alias_campaign_id_and_map_id_to_helper",
          "exists_subquery_marker")),
      "policy_semantically_approved":False,
      "private_sql_exported":False,
      "names_or_paths_exported":False,
      "live_database_accessed":False,
      "real_signed_qa_executed":False,
      "issued_url_revocation_verified":False,
      "production_release_authorized":False,
      "limitations":[
       "Text-pattern evidence is not full PostgreSQL parsing: aliases in comments, quoted values, ALTER POLICY and dynamic SQL need semantic review.",
       "Historical index29 identity and chronological equivalence to current deployed policy remain unproven.",
       "Even with matching relation patterns, other PERMISSIVE policies or definer functions may authorize additional access."
      ]
    }

def main():
    p=argparse.ArgumentParser(description="R156 private Storage map-binding indicator check")
    p.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=p.parse_args()
    try:
        print(json.dumps(audit(args.root),sort_keys=True,indent=2))
        return 0
    except (AuditBlocked,OSError,UnicodeError,ValueError,KeyError,TypeError,IndexError):
        print("R18-156 PRIVATE_AUDIT_NO_GO: integrity or structure mismatch; do not upload SQL or raw logs.",file=sys.stderr)
        return 2
if __name__=="__main__":
    sys.exit(main())
