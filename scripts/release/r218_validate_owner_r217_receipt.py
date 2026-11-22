#!/usr/bin/env python3
"""R218 validate only owner-sanitized R217 policy-shape JSON; never SQL/DB."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

CODES=(
 "storage_policy_create","storage_policy_alter","storage_policy_drop",
 "storage_policy_unknown_statement_form",
 "storage_policy_role_authenticated_word","storage_policy_role_anon_word",
 "storage_policy_role_public_word","storage_policy_role_unspecified_word",
 "storage_policy_as_restrictive_word","storage_policy_as_permissive_or_default_word",
 "storage_policy_bucket_id_word","storage_policy_owner_id_word",
 "storage_policy_direct_uid_or_jwt_word","storage_policy_campaign_guard_helper_word",
 "storage_policy_storage_operation_helper_word","storage_policy_using_literal_true_word",
 "storage_policy_check_literal_true_word","storage_policy_or_word",
 "storage_policy_user_editable_metadata_word",
)
LIMITS=[
 "This is a lexical source-word audit, NOT PostgreSQL RLS role, helper, permissive-policy OR composition or historical migration semantic proof.",
 "Missing TO, auth.uid, bucket_id, USING or WITH CHECK text is not automatically insecure; quoted text and indirect helpers can skew marker counts.",
 "Signed Storage URLs may remain accessible after membership changes; this report does NOT test tokens, key rotation, revocation or CDN caching.",
 "All original SQL and R111 docket remain owner-private; QA installation and production require separate exact owner approval and rollback.",
]
FIXED={
 "work_package":"B10-R18-217", "decision":"NO_GO",
 "mode":"OWNER_PRIVATE_OFFLINE_STORAGE_POLICY_SHAPE_TRIAGE",
}
GUARDS={
 "role_policy_semantics_and_permissive_composition_verified":False,
 "signed_url_revocation_verified":False,
 "all_83_migrations_semantically_approved":False,
 "qa_sql_install_authorized":False,
 "original_or_production_sql_authorized":False,
 "no_sql_executed":True,"no_network_or_database_access":True,
 "private_sql_migration_names_versions_paths_or_docket_exported":False,
}
KEYS=set(FIXED)|set(GUARDS)|{
 "original_migrations_sha256_reverified","top_level_statements_reconciled",
 "storage_policy_statements_reconciled","storage_policy_lexical_statement_counts",
 "storage_policy_lexical_file_counts","storage_policy_review_file_count",
 "first_r111_priority_storage_policy_review_items","priority_review_items_truncated",
 "limitations",
}
class Blocked(Exception): pass

def noduplicates(pairs):
 out={}
 for key,value in pairs:
  if key in out:raise Blocked("duplicate")
  out[key]=value
 return out

def count(v,maximum):
 if type(v) is not int or not 0<=v<=maximum:raise Blocked("count")
 return v

def load(path:Path):
 if path.is_symlink() or not path.is_file() or not 1<=path.stat().st_size<=32768:
  raise Blocked("sanitized JSON unavailable")
 return json.loads(path.read_text("utf-8"),object_pairs_hook=noduplicates,
                   parse_constant=lambda _:(_ for _ in ()).throw(Blocked("nonfinite")))

def validate(d):
 if type(d) is not dict or set(d)!=KEYS:raise Blocked("private or unexpected keys")
 for key,value in FIXED.items():
  if type(d[key]) is not str or d[key]!=value:raise Blocked("identity")
 for key,value in GUARDS.items():
  if type(d[key]) is not bool or d[key] is not value:raise Blocked("false approval")
 if type(d["original_migrations_sha256_reverified"]) is not int or d["original_migrations_sha256_reverified"]!=83:raise Blocked("source hashes")
 total=count(d["top_level_statements_reconciled"],250000)
 policy=count(d["storage_policy_statements_reconciled"],total)
 files=count(d["storage_policy_review_file_count"],83)
 statements=d["storage_policy_lexical_statement_counts"]
 filecounts=d["storage_policy_lexical_file_counts"]
 for table,limit in ((statements,policy),(filecounts,files)):
  if type(table) is not dict or set(table)!=set(CODES):raise Blocked("category keys")
  for value in table.values():count(value,limit)
 if any(filecounts[k]>statements[k] for k in CODES):raise Blocked("file > statement")
 if sum(statements[k] for k in ("storage_policy_create","storage_policy_alter","storage_policy_drop","storage_policy_unknown_statement_form"))!=policy:
  raise Blocked("policy form totals")
 if (files==0)!=(sum(filecounts.values())==0) or sum(filecounts.values())<files:
  raise Blocked("policy file totals")
 rows=d["first_r111_priority_storage_policy_review_items"]
 truncated=d["priority_review_items_truncated"]
 if type(rows) is not list or type(truncated) is not bool or truncated!=(files>24) or len(rows)!=min(files,24):
  raise Blocked("priority truncation")
 previous=0
 observed={k:0 for k in CODES}
 for row in rows:
  if type(row) is not dict or set(row)!={"r111_priority_index","storage_policy_shape_codes"}:raise Blocked("row keys")
  idx=row["r111_priority_index"]
  if type(idx) is not int or not previous<idx<=83:raise Blocked("priority index")
  previous=idx
  codes=row["storage_policy_shape_codes"]
  if type(codes) is not list or not codes or any(type(x) is not str or x not in CODES for x in codes) or codes!=sorted(set(codes)):
   raise Blocked("risk codes")
  for code in codes:observed[code]+=1
 if any(observed[k]>filecounts[k] for k in CODES) or (not truncated and observed!=filecounts):
  raise Blocked("file category totals")
 if type(d["limitations"]) is not list or d["limitations"]!=LIMITS:raise Blocked("NO_GO limits")
 return {
  "work_package":"B10-R18-218","decision":"NO_GO",
  "r217_sanitized_receipt_valid":True,
  "original_migrations_sha256_reverified":83,
  "lexical_statements_reconciled":total,
  "storage_policy_statements":policy,
  "historical_create_policy_statements":statements["storage_policy_create"],
  "historical_drop_policy_statements":statements["storage_policy_drop"],
  "storage_policy_review_files":files,
  "all_review_indices_included":not truncated,
  "effective_rls_or_signed_url_revocation_verified":False,
  "qa_sql_install_authorized":False,
  "original_or_production_sql_authorized":False,
  "sql_or_network_executed":False,
 }

def main():
 p=argparse.ArgumentParser(description="Strict sanitized R217 report checker")
 p.add_argument("sanitized_r217_json",type=Path); args=p.parse_args()
 try:
  print(json.dumps(validate(load(args.sanitized_r217_json)),sort_keys=True,indent=2))
  return 0
 except Exception:
  print("R218_SANITIZED_R217_NO_GO: fixed shape or approval rejected.",file=sys.stderr)
  return 2

if __name__=="__main__":raise SystemExit(main())
