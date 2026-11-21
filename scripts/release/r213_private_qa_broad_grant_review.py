#!/usr/bin/env python3
"""R213 owner-WSl-only private broad-grant and risky QA effects review.

ONLY reads the original 83 private SQL files and R111 docket from their
already-verified owner-only location. No network, DB, SQL execution, uploads
or file writes. Report: fixed counts/codes and NUMERIC R111 priority indices.
Never outputs SQL, private filenames, dates/versions, function/policy/table
names, argument signatures, Storage paths, user data or secrets.

Lexical flags are NOT SQL dependency parsing or an install authorization.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import AuditBlocked,MAX_SQL_BYTES,checked_dir,checked_file,statements
from r191_private_fog_status_lineage import strict_migration_version
import r211_private_qa_migration_effects as earlier

WORK="B10-R18-213"
MIGRATIONS=83
EXPECTED_PRIOR_STATEMENTS=937
EXPECTED_PRIOR_RISK_FILES=22
EXPECTED_PRIOR_TRUNCATE_WORDS=0
MAX_REVIEW=83
# Explicit SQL grammar markers for top-level GRANT/REVOKE; these intentionally
# DO NOT parse nested dynamic SQL or prove an effective installed ACL.
GRANT_ALL=re.compile(r"^\s*GRANT\s+ALL(?:\s+PRIVILEGES)?\s+ON\b",re.I|re.S)
GRANT_TRUNCATE=re.compile(r"^\s*GRANT\s+[\w\s,]*\bTRUNCATE\b[\w\s,]*\bON\b",re.I|re.S)
REVOKE_TRUNCATE=re.compile(r"^\s*REVOKE\s+[\w\s,]*\bTRUNCATE\b[\w\s,]*\bON\b",re.I|re.S)
TARGET_AUTH=re.compile(r"\bTO\s+(?:\"authenticated\"|authenticated)(?![A-Za-z_0-9])",re.I)
TARGET_ANON=re.compile(r"\bTO\s+(?:\"anon\"|anon)(?![A-Za-z_0-9])",re.I)
TARGET_PUBLIC=re.compile(r"\bTO\s+PUBLIC\b",re.I)
REVOKE_FROM_AUTH=re.compile(r"\bFROM\s+(?:\"authenticated\"|authenticated)\b",re.I)
# Table-target markers are conservative and not a full Postgres GRANT parser.
TABLE_GRANT=re.compile(r"\bON\s+(?:(?:ALL\s+)?TABLES?\b|(?:(?:\"public\"|public)\s*\.\s*))",re.I)
NON_TABLE_GRANT=re.compile(r"\bON\s+(?:FUNCTIONS?|SEQUENCES?|SCHEMAS?|TYPES?|DATABASES?)\b",re.I)
DO_EXECUTE=re.compile(r"\bEXECUTE\b",re.I)
NETWORK=re.compile(r"\b(?:http_get|http_post|net\s*\.|dblink|pg_net)\b",re.I)
MANAGED=re.compile(r"\b(?:auth|storage)\s*\.",re.I)
BROAD_GRANT_AUTH_CODE="BROAD_TABLE_GRANT_AUTH_CANDIDATE"
RISK_CODES=(
 "EXPLICIT_AUTH_TRUNCATE_GRANT",
 "EXPLICIT_AUTH_TRUNCATE_REVOKE",
 "BROAD_TABLE_GRANT_AUTH_CANDIDATE",
 "BROAD_TABLE_GRANT_ANON_OR_PUBLIC_CANDIDATE",
 "BROAD_OTHER_GRANT",
 "DO_OR_DYNAMIC_EXECUTE",
 "FUNCTION_DEFINER_MISSING_LOCAL_PATH",
 "STORAGE_POLICY_CHANGE",
 "RLS_OR_PUBLIC_POLICY",
 "AUTH_OR_STORAGE_WRITE",
 "NETWORK_FUNCTION_WORD",
 "EXTENSION_OR_ROLE_CHANGE",
 "PUBLICATION_CHANGE",
 "DROP_OR_TRUNCATE_OR_COPY",
 "UNCLASSIFIED_SQL"
)
CODE_SET=set(RISK_CODES)

def grant_markers(sql:str,kind:str)->dict:
 if kind not in ("grant","revoke"):
  return {"all_auth":False,"all_anon_public":False,"all_other":False,
          "auth_truncate_grant":False,"auth_truncate_revoke":False}
 table=bool(TABLE_GRANT.search(sql)) and not bool(NON_TABLE_GRANT.search(sql))
 broad=bool(GRANT_ALL.match(sql)) and table
 return {
   "all_auth":bool(broad and TARGET_AUTH.search(sql)),
   "all_anon_public":bool(broad and (TARGET_ANON.search(sql) or TARGET_PUBLIC.search(sql))),
   "all_other":bool(GRANT_ALL.match(sql) and not
                    (broad and (TARGET_AUTH.search(sql) or
                     TARGET_ANON.search(sql) or TARGET_PUBLIC.search(sql)))),
   "auth_truncate_grant":bool(kind=="grant" and table and GRANT_TRUNCATE.match(sql)
                             and TARGET_AUTH.search(sql)),
   "auth_truncate_revoke":bool(kind=="revoke" and table and REVOKE_TRUNCATE.match(sql)
                              and REVOKE_FROM_AUTH.search(sql))
 }

def codes_for(sql:str,kind:str,mark:dict,broad:dict)->set[str]:
 codes=set()
 if broad["all_auth"]:codes.add("BROAD_TABLE_GRANT_AUTH_CANDIDATE")
 if broad["all_anon_public"]:codes.add("BROAD_TABLE_GRANT_ANON_OR_PUBLIC_CANDIDATE")
 if broad["all_other"]:codes.add("BROAD_OTHER_GRANT")
 if broad["auth_truncate_grant"]:codes.add("EXPLICIT_AUTH_TRUNCATE_GRANT")
 if broad["auth_truncate_revoke"]:codes.add("EXPLICIT_AUTH_TRUNCATE_REVOKE")
 if kind=="do_block" or mark["dynamic_format_word"]:
  codes.add("DO_OR_DYNAMIC_EXECUTE")
 if mark["definer_without_local_search_path"]:
  codes.add("FUNCTION_DEFINER_MISSING_LOCAL_PATH")
 if kind in ("create_policy","alter_policy","drop_policy") and mark["storage_schema_word"]:
  codes.add("STORAGE_POLICY_CHANGE")
 if kind in ("create_policy","alter_policy") and (
    mark["literal_true_policy_word"] or mark["permissive_or_word"]):
  codes.add("RLS_OR_PUBLIC_POLICY")
 if mark["auth_data_write_word"] or mark["storage_data_write_word"]:
  codes.add("AUTH_OR_STORAGE_WRITE")
 if NETWORK.search(sql):codes.add("NETWORK_FUNCTION_WORD")
 if kind in ("extension_change","role_change"):
  codes.add("EXTENSION_OR_ROLE_CHANGE")
 if kind=="publication_change" or mark["realtime_publication_word"]:
  codes.add("PUBLICATION_CHANGE")
 if kind in ("truncate","copy","drop_table","drop_function","drop_policy",
             "drop_trigger","drop_view","drop_other"):
  codes.add("DROP_OR_TRUNCATE_OR_COPY")
 if kind=="other":codes.add("UNCLASSIFIED_SQL")
 return codes

def report(root:Path)->dict:
 prior=earlier.report(root)
 if (prior.get("decision")!="NO_GO" or
     prior.get("original_migrations_sha256_reverified")!=MIGRATIONS or
     prior.get("original_migration_chronology_unique_valid") is not True or
     prior.get("lexical_top_level_statements")!=EXPECTED_PRIOR_STATEMENTS or
     prior.get("risk_flagged_original_file_count")!=EXPECTED_PRIOR_RISK_FILES or
     prior.get("conservative_word_markers",{}).get("grant_truncate_word")
       !=EXPECTED_PRIOR_TRUNCATE_WORDS or
     prior.get("unclassified_top_level_statements")!=0 or
     prior.get("qa_sql_write_authorized") is not False):
  raise AuditBlocked("R213_PREVIOUS_OWNER_R211_SOURCE_DRIFT")
 root=checked_dir(root,private=True)
 docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024))
 items=docket.get("reviewItems")
 if not isinstance(items,list) or len(items)!=83:
  raise AuditBlocked("R213_DOCKET_INVALID")
 folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
 flagged=set(prior["first_r111_priority_review_indices_not_chronology"])
 if len(flagged)!=EXPECTED_PRIOR_RISK_FILES or prior[
     "r111_priority_review_index_count_truncated"] is not False:
  raise AuditBlocked("R213_REVIEW_PRIORITY_LIST_DRIFT")
 history=[]
 seen=set()
 for ix,item in enumerate(items,1):
  name=item.get("filename")
  if (not isinstance(name,str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.sql",name)
      or Path(name).name!=name):
   raise AuditBlocked("R213_FILENAME_INVALID")
  version=strict_migration_version(name)
  if version is None or version in seen:
   raise AuditBlocked("R213_DATE_DUPLICATE_OR_INVALID")
  seen.add(version)
  raw=checked_file(folder/name,MAX_SQL_BYTES)
  if hashlib.sha256(raw).hexdigest()!=item.get("sourceBodySha256"):
   raise AuditBlocked("R213_MIGRATION_SHA_DRIFT")
  history.append((version,ix,raw))
 if len(seen)!=83:raise AuditBlocked("R213_CHRONOLOGY_COUNT")
 by_index={}
 totals=Counter()
 broad_files=set()
 total_sql=0
 for _,priority,raw in sorted(history,key=lambda row:row[0]):
  stmts=statements(raw.decode("utf-8"))
  codes=set()
  this_broad=0
  for sql in stmts:
   total_sql+=1
   kind,mark,_=earlier.classify(sql)
   b=grant_markers(sql,kind)
   for label,yes in b.items():
    if yes:totals[label]+=1
   these=codes_for(sql,kind,mark,b)
   codes.update(these)
   if b["all_auth"]:
    broad_files.add(priority)
    this_broad+=1
  by_index[priority]={
   "r111_priority_index_not_migration_chronology":priority,
   "statement_count":len(stmts),
   "risk_codes":sorted(codes),
   "broad_authenticated_table_grant_candidate_count":this_broad
  }
 if total_sql!=EXPECTED_PRIOR_STATEMENTS:
  raise AuditBlocked("R213_PARSED_STATEMENT_TOTAL_CHANGED")
 if len(by_index)!=83 or any(not set(v["risk_codes"])<=CODE_SET for v in by_index.values()):
  raise AuditBlocked("R213_UNEXPECTED_REVIEW_CATEGORY")
 new_broad=sorted(broad_files-flagged)
 return {
  "work_package":WORK,"decision":"NO_GO",
  "mode":"PRIVATE_SHA_VERIFIED_QA_BROAD_ACL_AND_RISK_FILE_FOCUS",
  "original_private_migrations_verified":83,
  "r211_historical_statement_total_reconciled":total_sql,
  "r211_risk_flagged_files_reconciled":len(flagged),
  "review_items": [by_index[i] for i in sorted(flagged)],
  "additional_broad_grant_priority_indices_not_r211_flagged":new_broad,
  "historical_direct_top_level_grant_marker_totals":{
    key:int(totals[key]) for key in
    ("all_auth","all_anon_public","all_other",
     "auth_truncate_grant","auth_truncate_revoke")
  },
  "original_effective_authenticated_truncate_tables_observed":5,
  "historical_keyword_absence_proves_no_effective_truncate":False,
  "broad_grant_marker_proves_actual_acl_origin":False,
  "sql_dependency_graph_completed":False,
  "all_83_original_migrations_semantically_approved":False,
  "qa_sql_installation_authorized":False,
  "production_or_original_sql_authorized":False,
  "network_or_database_accessed":False,
  "sql_executed":False,
  "private_sql_policy_function_table_names_versions_or_paths_exported":False,
  "limitations":[
    "A lexically broad GRANT candidate is not proof it caused any currently effective table privilege; actual historical grant semantics may differ.",
    "Fixed risk codes and R111 numeric priority indices are NOT a chronological migration position or complete executable SQL/PLpgSQL/DO dependency review.",
    "Only original private SQL kept in the owner WSL was read; NO private SQL, names, timestamps, signatures, asset paths, identities or secrets leave the computer.",
    "Explicit separate QA-only SQL-write plan approval and real signed-user QA remain mandatory; original and production remain NO_GO."
  ]
 }

def main():
 ap=argparse.ArgumentParser(description="R213 owner-private 22-risk-file + broad GRANT ALL preflight")
 ap.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
 args=ap.parse_args()
 try:
  print(json.dumps(report(args.root),sort_keys=True,indent=2))
  return 0
 except Exception:
  print("R213 PRIVATE_GRANT_LINEAGE_NO_GO: archive, source, role-lexical or parser drift.",file=sys.stderr)
  return 2
if __name__=="__main__":raise SystemExit(main())
