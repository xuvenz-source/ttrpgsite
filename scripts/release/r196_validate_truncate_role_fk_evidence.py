#!/usr/bin/env python3
"""R18-196: fixed-field original ACL/FK evidence and synthetic PG17 replay NO_GO.

No hosted connections, data records, function SQL bodies or original private
migration files. This script validates files only and is never release authority.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-196"
MANIFEST=Path("staging/world-v2-b10-r18-196-membership-truncate-cascade/manifest.json")
FROZEN={
 "staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql":
    "300421215fce40f1cfcfacbe3d3762413f218343",
 "tests/world-v2-r18-196-postgres/run.sh":
    "28eb6765529ca359f3e443c1d7a9989ceadfce4e",
}
SNAPSHOT={
 "membership_tables":1,
 "service_roles":1,
 "service_role_superuser":False,
 "service_role_inherits":True,
 "service_role_bypasses_rls":True,
 "campaign_members_rls":True,
 "service_inherits_table_owner":False,
 "direct_service_truncate_grant_entries":1,
 "public_truncate_grant_entries":0,
 "inherited_other_role_truncate_grants":0,
 "truncate_grant_options_count":0,
 "enabled_user_truncate_triggers":0,
 "enabled_user_delete_triggers":0,
 "inbound_referencing_tables":2,
 "service_role_truncate_on_referencing_tables":2,
 "authenticated_truncate_on_referencing_tables":2,
 "function_source_total_in_scanned_schemas":142,
 "any_truncate_word":0,
 "both_truncate_and_campaign_members_words":0,
 "any_execute_and_membership_words":0,
 "any_membership_words":22,
}
CANNOT_APPROVE=(
 "verifiedOnHosted",
 "actualExternalServiceRoleUsageAudited",
 "dynamicSqlAndOutsideDatabaseOperationsExcluded",
 "original83HistorySemanticsApproved",
 "all67PrivilegedCallChainsApproved",
 "signedQaMultiaccountPassed",
 "qaDbSqlAuthorized",
 "productionDeployAuthorized",
)
RESTRICTIONS=(
 "currentAuditReadOnly",
 "scriptOnlyReproducesSyntheticSql",
 "noOriginalOrQaSqlWrites",
 "noActiveMigration",
 "noRuntimeChange",
 "noMerge",
 "noDeploy",
 "noPaidResources",
 "noPrivateSqlOrCampaignRecordsExported",
)
EXPECTED_NEXT=("Verify exact-head scratch PG17 with two inbound FKs and cascading "
 "revocation-bypass denial, then independently review admin workflow and role grants "
 "before any QA schema install.")

class AuditBlocked(Exception):
 pass

def strict_json(pairs):
 out={}
 for k,v in pairs:
  if k in out:raise AuditBlocked("DUPLICATE_KEY")
  out[k]=v
 return out

def blob_sha1(content:bytes)->str:
 return hashlib.sha1(f"blob {len(content)}\0".encode()+content).hexdigest()

def verify(data:dict,root:Path)->dict:
 if not isinstance(data,dict) or set(data)!={
  "schema","workPackage","date","decision","parent",
  "originalProjectLiveReadOnlySnapshot","exactSources",
  "interpretation","restrictions","nextGate",
 }:
  raise AuditBlocked("SCHEMA_MISMATCH")
 if (type(data["schema"]) is not int or data["schema"]!=1
     or data["workPackage"]!=WORK or data["date"]!="2026-11-21"
     or data["decision"]!="NO_GO"
     or data["parent"]!={"pr":304,
       "head":"0b12a69936fce26941f1c06a28100e0b192ebab7",
       "dedicatedSuccessRun":44900934673,
       "generalSuccessRun":44900934662}):
  raise AuditBlocked("PARENT_OR_SOURCE_PROVENANCE_CHANGED")
 actual=data["originalProjectLiveReadOnlySnapshot"]
 if (not isinstance(actual,dict) or set(actual)!=set(SNAPSHOT)
     or any(actual[k]!=v or type(actual[k]) is not type(v) for k,v in SNAPSHOT.items())):
  raise AuditBlocked("READONLY_ORIGINAL_CATALOG_CHANGED")
 if data["exactSources"]!={ 
  "priorR195Candidate":{"path":"staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql",
     "gitBlob":FROZEN["staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql"]},
  "newIsolatedRunner":{"path":"tests/world-v2-r18-196-postgres/run.sh",
     "gitBlob":FROZEN["tests/world-v2-r18-196-postgres/run.sh"]},
 }:
  raise AuditBlocked("FROZEN_CANDIDATE_OR_RUNNER_DRIFT")
 interpret=data["interpretation"]
 if (not isinstance(interpret,dict)
     or set(interpret)!=set(CANNOT_APPROVE) | {
        "directRevokeAloneExpectedToRemoveServiceRoleEffectiveTruncate",
        "noCurrentlyInstalledTruncateTrigger",
        "noKnownFunctionLiteralTruncateWords"
     }):
  raise AuditBlocked("INTERPRETATION_FIELDS_CHANGED")
 if any(interpret[k] is not False for k in CANNOT_APPROVE):
  raise AuditBlocked("PREMATURE_SECURITY_APPROVAL")
 if any(interpret[k] is not True for k in (
     "directRevokeAloneExpectedToRemoveServiceRoleEffectiveTruncate",
     "noCurrentlyInstalledTruncateTrigger",
     "noKnownFunctionLiteralTruncateWords")):
  raise AuditBlocked("SOURCE_BASED_CONCLUSION_MISMATCH")
 restrict=data["restrictions"]
 if (not isinstance(restrict,dict) or set(restrict)!=set(RESTRICTIONS)
     or any(restrict[k] is not True for k in RESTRICTIONS)
     or data["nextGate"]!=EXPECTED_NEXT):
  raise AuditBlocked("HOSTED_RELEASE_GATE_BYPASSED")
 for rel,sha in FROZEN.items():
  p=root/rel
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise AuditBlocked("FROZEN_SOURCE_UNAVAILABLE")
  if blob_sha1(p.read_bytes())!=sha:
   raise AuditBlocked("FROZEN_SOURCE_BYTES_MUTATED")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "original_direct_only_truncate_acl_verified":True,
  "two_inbound_foreign_keys_verified":True,
  "frozen_r195_guard_and_r196_synthetic_runner_verified":True,
  "simulated_fk_cascade_security_qa_not_real_hosted":True,
  "all_83_history_semantics_approved":False,
  "all_67_privileged_call_chains_approved":False,
  "external_privileged_admin_workflows_fully_reviewed":False,
  "signed_multiactor_qa_passed":False,
  "hosted_sql_or_prod_release_authorized":False,
  "original_private_sql_or_user_data_exported":False,
 }

def main()->int:
 parser=argparse.ArgumentParser(description="R196 source-only original privilege lineage")
 parser.add_argument("--root",type=Path,default=Path.cwd())
 args=parser.parse_args()
 try:
  p=args.root/MANIFEST
  if not p.is_file() or p.is_symlink() or p.stat().st_size>8192:
   raise AuditBlocked("MANIFEST_INVALID")
  content=p.read_text(encoding="utf8")
  data=json.loads(content,object_pairs_hook=strict_json,
   parse_constant=lambda _:(_ for _ in ()).throw(AuditBlocked("NONFINITE_JSON")))
  print(json.dumps(verify(data,args.root),indent=2,sort_keys=True))
  return 0
 except (AuditBlocked,OSError,TypeError,KeyError,IndexError,ValueError,UnicodeError):
  print("R18-196 READONLY_ORIGINAL_TRUNCATE_NO_GO: source/role evidence mismatch.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
