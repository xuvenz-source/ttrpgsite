#!/usr/bin/env python3
"""R235: design-only validator of proposed disposable owner-local replay plan.

NO SQL execution, subprocess, database client, network, cloud access or file
writes. This script can only return an accepted NO_GO design; it does NOT
authorize execution and must not be treated as an isolation attestation.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

WORK="B10-R18-235"
MAX_BYTES=12000
CHECKS=(
 "OWNER_SEPARATELY_APPROVES_EXACT_DISPOSABLE_SQL_REPLAY",
 "OWNER_LOCAL_RUNTIME_ISOLATION_AND_NO_REMOTE_LINK_PROVEN",
 "LOCAL_SUPABASE_MANAGED_SCHEMA_ROLE_EXTENSION_PARITY_VERIFIED",
 "LOCAL_ENGINE_VERSION_AND_CLIENT_COMMAND_TARGETS_VERIFIED",
 "ALL_83_PRIVATE_SHA_CHRONOLOGY_AND_PERMISSIONS_REVERIFIED",
 "83_SEMANTIC_DEPENDENCIES_AND_DANGEROUS_EFFECTS_REVIEWED",
 "HISTORICAL_12_DO_BLOCK_DEPENDENCIES_REVIEWED",
 "NO_ORIGINAL_QA_PRODUCTION_CREDENTIALS_OR_USER_DATA_PRESENT",
 "NO_PAID_RESOURCES_AND_NO_NETWORK_EGRESS_CONFIRMED",
 "EPHEMERAL_VOLUME_ID_AND_DELETION_SCOPE_RECORDED_PRIVATELY",
 "REPLAY_TEST_PLAN_AND_EXPECTED_ASSERTIONS_APPROVED",
 "PRIVATE_SANITIZED_RESULTS_FORMAT_AND_STOP_RULES_APPROVED"
)
EXPECTED_SOURCE={
 "original_migration_files_expected":83,
 "original_top_level_sql_statements_expected":937,
 "historical_top_level_do_blocks_expected":12,
 "do_containing_migrations_expected":11,
 "history_sha_verified_by_prior_owner_offline_tool":True,
 "all_83_semantically_approved":False,
 "all_67_privileged_functions_approved":False
}
EXPECTED_EXECUTION={
 "environment":"UNPROVISIONED_OWNER_LOCAL_ISOLATED_SUPABASE_COMPATIBLE_SANDBOX",
 "execution_enabled":False,
 "original_project_allowed":False,
 "qa_project_allowed":False,
 "production_allowed":False,
 "remote_connection_allowed":False,
 "network_egress_during_replay_allowed":False,
 "real_user_data_allowed":False,
 "private_sql_to_git_or_chat_allowed":False,
 "cloud_resource_provisioning_allowed":False,
 "maximum_approved_cost_usd":0,
 "owner_permission_to_execute_original_migrations":False
}
GATES=(
 "signed_dm_p1_p2_removed_outsider_qa_passed",
 "security_issue_remediation_approved",
 "qa_hosted_install_authorized",
 "original_production_install_authorized",
 "merge_authorized",
 "deploy_authorized"
)
class Blocked(Exception):pass

def unique_pairs(pairs):
 out={}
 for key,value in pairs:
  if key in out:raise Blocked("DUPLICATE_PROPERTY")
  out[key]=value
 return out

def exact_dict(value,expected):
 if type(value) is not dict or set(value)!=set(expected):
  raise Blocked("SCHEMA_DRIFT")
 for key,match in expected.items():
  val=value[key]
  if type(val) is not type(match) or val!=match:
   raise Blocked("UNAPPROVED_SCOPE_OR_FALSE_AUTHORITY")

def validate(obj):
 if type(obj) is not dict or set(obj)!={
   "schema","work_package","decision","phase","source_only",
   "source_evidence","proposed_execution","status_checks","release_gates"
 }:
  raise Blocked("SCHEMA_DRIFT")
 exact_dict({k:obj[k] for k in ("schema","work_package","decision","phase","source_only")},
            {"schema":1,"work_package":WORK,"decision":"NO_GO",
             "phase":"PRE_APPROVAL_DESIGN_ONLY","source_only":True})
 exact_dict(obj["source_evidence"],EXPECTED_SOURCE)
 exact_dict(obj["proposed_execution"],EXPECTED_EXECUTION)
 checks=obj["status_checks"]
 if type(checks) is not list or len(checks)!=len(CHECKS):
  raise Blocked("PRECONDITION_COUNT_DRIFT")
 for item,label in zip(checks,CHECKS):
  exact_dict(item,{"id":label,"approved":False})
 exact_dict(obj["release_gates"],{key:False for key in GATES})
 return True

def validate_file(path:Path):
 if path.is_symlink() or not path.is_file():
  raise Blocked("NO_REGULAR_FILE")
 raw=path.read_bytes()
 if not 100<len(raw)<MAX_BYTES:
  raise Blocked("FILE_BOUNDARY")
 try:
  obj=json.loads(raw,object_pairs_hook=unique_pairs)
 except (UnicodeError,ValueError) as exc:
  raise Blocked("MALFORMED_JSON") from None
 return validate(obj)

def main():
 p=argparse.ArgumentParser(description="R235 static NO_GO replay gate, no SQL")
 p.add_argument("manifest",type=Path)
 args=p.parse_args()
 try:
  validate_file(args.manifest)
  print("R235_SOURCE_DESIGN_VALID_NO_GO: no SQL execution authorized; owner-local sandbox does not exist.")
  return 0
 except (Blocked,OSError):
  print("R235_REPLAY_PLAN_BLOCKED_NO_GO",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
