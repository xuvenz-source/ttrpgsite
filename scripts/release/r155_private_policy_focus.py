#!/usr/bin/env python3
"""R18-155: safe *local* analysis of one R111-docket-indexed private RLS policy.

Reports only predeclared boolean categories and bounded aggregate counts.
No SQL, migration names, arbitrary identifiers or credentials may be printed.
Uses R154's exact-source SHA verification. No network, writes or DB calls.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys
from r154_private_history_audit import (
 AuditBlocked,audit,checked_file,classify_file,statements,MAX_SQL_BYTES
)

INDEX=29
TARGET="storage_policy_no_known_identity_helper"
OPS=("SELECT","INSERT","UPDATE","DELETE","ALL")
KNOWN_HELPERS=("can_view_campaign_map","is_campaign_dm","is_campaign_member")
KNOWN_TABLES=("battle_maps","campaign_members","campaigns")
def has(s,pattern):
 return re.search(pattern,s,re.I|re.S) is not None

def check_policy(statement):
 if not has(statement,r"\b(?:CREATE|ALTER)\s+POLICY\b"):return False
 if not has(statement,r"\bON\s+(?:\"?storage\"?\s*\.\s*)?\"?objects\"?\b"):
  return False
 if has(statement,r"\bauth\s*\.\s*(?:uid|jwt)\s*\(|\bis_campaign_(?:dm|member)\s*\("):
  return False
 return True

def safe_header_roles(statement):
 # Do not mistake occurrence of TO inside the USING expression for the policy role.
 head=re.split(r"\b(?:USING|WITH\s+CHECK)\s*\(",statement,maxsplit=1,flags=re.I)[0]
 m=re.search(r"\bTO\s+([^\(]+)$",head,re.I)
 if not m:return "UNSPECIFIED_DEFAULT_PUBLIC"
 roles=m.group(1).strip()
 if re.fullmatch(r"authenticated\s*",roles,re.I):return "AUTHENTICATED"
 if re.fullmatch(r"anon\s*",roles,re.I):return "ANON"
 if re.fullmatch(r"public\s*",roles,re.I):return "PUBLIC"
 return "OTHER_OR_UNDETERMINED"

def describe(statement):
 match=re.search(r"\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b",statement,re.I)
 op=match.group(1).upper() if match else "UNSPECIFIED_DEFAULT_ALL"
 return {
  "operation":op if op in OPS else "UNDETERMINED",
  "role_scope":safe_header_roles(statement),
  "using_clause":has(statement,r"\bUSING\s*\("),
  "with_check_clause":has(statement,r"\bWITH\s+CHECK\s*\("),
  "exists_condition":has(statement,r"\bEXISTS\s*\("),
  "or_text_marker":has(statement,r"\bOR\b"),
  "bucket_id_reference":has(statement,r"\bbucket_id\b"),
  "object_name_reference":has(statement,r"\bname\b"),
  "campaign_id_reference":has(statement,r"\bcampaign_id\b"),
  "literal_true_clause":has(statement,r"\b(?:USING|WITH\s+CHECK)\s*\(\s*TRUE\s*\)"),
  "folder_extraction_reference":has(statement,r"\bstorage\s*\.\s*foldername\s*\(|\bsplit_part\s*\("),
  "known_helpers_referenced":[x for x in KNOWN_HELPERS if
           has(statement,r"\b"+re.escape(x)+r"\s*\(")],
  "known_tables_referenced":[x for x in KNOWN_TABLES if
           has(statement,r"\b"+re.escape(x)+r"\b")],
  "direct_auth_identity_reference":has(statement,r"\bauth\s*\.\s*(?:uid|jwt)\s*\("),
  "requires_exact_sql_review":True
 }

def report(root):
 preceding=audit(root)
 if preceding["files_sha256_verified"]!=83 or preceding["files_security_approved"]!=0:
  raise AuditBlocked("PRIVATE_AUDIT_NO_GO")
 hits=preceding["priority_review_markers"]
 if (len(hits)!=1 or hits[0]["review_index"]!=INDEX or
   hits[0]["markers"]!=[TARGET] or hits[0]["marker_occurrences"]!=1 or
   preceding["priority_review_markers_truncated"]!=0):
  raise AuditBlocked("PRIVATE_AUDIT_NO_GO")
 dossier=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024).decode("utf8"))
 item=dossier["reviewItems"][INDEX-1]
 name=item["filename"]
 sql=(checked_file(root/"r106-original-83-recovery"/"supabase"/"migrations"/name,MAX_SQL_BYTES)).decode("utf8")
 targets=[s for s in statements(sql) if check_policy(s)]
 if len(targets)!=1:
  raise AuditBlocked("PRIVATE_AUDIT_NO_GO")
 details=describe(targets[0])
 return {
  "work_package":"B10-R18-155",
  "decision":"NO_GO",
  "mode":"READ_ONLY_R111_INDEX29_PRIVATE_SQL_STRUCTURE_NOT_SECURITY_APPROVAL",
  "verified_migrations":83,
  "r111_review_index":INDEX,
  "target_policy_count":1,
  "policy":details,
  "sql_bodies_exported":False,
  "filenames_exported":False,
  "unrecognized_identifiers_exported":False,
  "database_accessed":False,
  "private_sql_semantic_approval":False,
  "original_signed_multi_actor_qa_passed":False,
  "issued_signed_url_revocation_verified":False,
  "production_release_authorized":False,
  "limitations":[
   "The chosen entry is R111 docket index 29 (priority-sorted), NOT migration chronological position 29.",
   "Structural boolean indicators cannot establish the actual JOIN binding, helper behavior, effective RLS or permissive policy composition.",
   "One historical policy must not be equated with any current live policy without exact identity and chronology reconciliation."
  ]
 }

def main():
 p=argparse.ArgumentParser(description="R155 secure local policy structure")
 p.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
 args=p.parse_args()
 try:
  print(json.dumps(report(args.root),sort_keys=True,indent=2))
  return 0
 except (AuditBlocked,OSError,UnicodeError,ValueError,KeyError,TypeError,IndexError):
  print("R18-155 PRIVATE_AUDIT_NO_GO: integrity or target mismatch; do not share SQL or raw logs.",file=sys.stderr)
  return 2

if __name__=="__main__":
 sys.exit(main())
