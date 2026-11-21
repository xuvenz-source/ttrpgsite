#!/usr/bin/env python3
"""R197: strict source-only five-table authenticated TRUNCATE NO_GO contract.

No SQL execution, no hosted connections, no user/campaign records and no
private original historical migration SQL. Only validates pinned Git sources.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-197"
MANIFEST=Path("staging/world-v2-b10-r18-197-authenticated-truncate/manifest.json")
TABLES=(
 "public.campaign_map_views",
 "public.campaign_player_maps",
 "public.map_environments",
 "public.tabletop_macros",
 "public.tabletop_menu_preferences",
)
BLOBS={
 "staging/world-v2-b10-r18-197-authenticated-truncate/unapplied-five-table-revoke.sql":
   "c62edbe2958adc48ab6e3dd60f1bdfde5982f69a",
 "tests/world-v2-r18-197-postgres/run.sh":
   "ea628638d8808bb4dde628bdd48c9cb6aab26124",
 "scripts/release/r197_readonly_public_authenticated_truncate.sql":
   "4d10c5508efb31a83d25e0b3186743d4b0a3b9e3",
}
CATALOG={
 "public_tables":31,
 "authenticated_effective_truncate_tables":5,
 "chosen_tables":5,
 "chosen_rls_enabled":5,
 "chosen_postgres_owned":5,
 "chosen_authenticated_schema_usage":5,
 "chosen_effective_auth_truncate":5,
 "chosen_effective_auth_select":5,
 "chosen_effective_auth_insert":5,
 "chosen_effective_auth_update":5,
 "chosen_effective_auth_delete":5,
 "direct_auth_truncate_entries":5,
 "public_truncate_entries":0,
 "inherited_auth_truncate_entries":0,
 "inherits_owner_on_chosen":0,
 "any_truncate_grant_option_entries":0,
 "auth_superuser":False,
 "auth_bypassrls":False,
 "auth_inherits_roles":True,
 "anon_truncate_public_tables":0,
 "service_role_truncate_public_tables":31,
}
INTERPRET={
 "directDatabasePrivilegePresent":True,
 "authenticatedCanExecuteArbitrarySqlViaNormalRestApiProven":False,
 "signedWebsiteExploitObserved":False,
 "externalSqlOrInjectionPathsAudited":False,
 "all83OriginalHistorySemanticsApproved":False,
 "all67PrivilegedCallChainsApproved":False,
 "realSignedQaPassed":False,
 "qaMigrationInstallApproved":False,
 "productionDeploymentApproved":False,
}
RESTRICT={
 "unappliedScratchSqlOnly":True,
 "noOriginalOrQaWrites":True,
 "noRealUserDataOrOriginalPrivateSqlExported":True,
 "noLiveRuntimeOrActiveMigrationChanges":True,
 "noMerge":True,
 "noDeploy":True,
 "noPaidResources":True,
}
EXPECTED_POSTCONDITION=(
 "Revoke only authenticated TRUNCATE on five pinned public tables; "
 "rollback entire statement on residual inherited/PUBLIC grant; "
 "leave service_role and ordinary CRUD grants alone."
)

class AuditBlocked(Exception):
 pass

def unique(pairs):
 obj={}
 for k,v in pairs:
  if k in obj:raise AuditBlocked("DUPLICATE_JSON_KEY")
  obj[k]=v
 return obj

def git_blob(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def strict_equal(actual,expected,code):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise AuditBlocked(code)
 for k,v in expected.items():
  if actual[k]!=v or type(actual[k]) is not type(v):
   raise AuditBlocked(code)

def validate(data:dict,root:Path)->dict:
 if not isinstance(data,dict) or set(data)!={
  "schema","workPackage","date","decision","parent","issue","fivePublicTables",
  "readOnlyOriginalCatalog","frozenSourceBlobs","expectedPostcondition",
  "interpretation","restrictions"
 }:
  raise AuditBlocked("MANIFEST_SCHEMA_CHANGED")
 if (type(data["schema"]) is not int or data["schema"]!=1
     or data["workPackage"]!=WORK or data["date"]!="2026-11-21"
     or data["decision"]!="NO_GO"
     or type(data["issue"]) is not int or data["issue"]!=306):
  raise AuditBlocked("SOURCE_PROVENANCE_CHANGED")
 strict_equal(data["parent"],{
   "pr":305,"head":"d22674818b05ae1f40f0439e1f2be7a954c611fb",
   "dedicatedSuccessRun":44902645538,"generalSuccessRun":44902645528},
   "PARENT_MISMATCH")
 if data["fivePublicTables"]!=list(TABLES):
  raise AuditBlocked("TARGET_TABLES_CHANGED")
 strict_equal(data["readOnlyOriginalCatalog"],CATALOG,"READ_ONLY_CATALOG_CHANGED")
 strict_equal(data["frozenSourceBlobs"],BLOBS,"FROZEN_SOURCE_INDEX_CHANGED")
 strict_equal(data["interpretation"],INTERPRET,"PREMATURE_SECURITY_APPROVAL")
 strict_equal(data["restrictions"],RESTRICT,"RELEASE_GATES_ESCALATED")
 if data["expectedPostcondition"]!=EXPECTED_POSTCONDITION:
  raise AuditBlocked("POSTCONDITION_MISMATCH")
 for path,sha in BLOBS.items():
  p=root/path
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise AuditBlocked("MISSING_FROZEN_SOURCE")
  if git_blob(p.read_bytes())!=sha:
   raise AuditBlocked("FROZEN_SOURCE_DRIFT")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "original_five_direct_auth_truncate_grants_verified":True,
  "source_frozen_unapplied_revoke_verified":True,
  "synthetic_pg17_test_source_verified":True,
  "normal_rest_sql_execution_path_proven":False,
  "hosted_auth_grants_repaired":False,
  "all_83_history_semantics_approved":False,
  "all_67_privileged_call_chains_approved":False,
  "signed_multiaccount_qa_passed":False,
  "hosted_sql_or_production_release_authorized":False,
  "no_original_private_sql_or_user_data_exported":True,
 }

def main()->int:
 parser=argparse.ArgumentParser(description="R197 authenticated table TRUNCATE risk source guard")
 parser.add_argument("--root",type=Path,default=Path.cwd())
 args=parser.parse_args()
 try:
  p=args.root/MANIFEST
  if not p.is_file() or p.is_symlink() or p.stat().st_size>8192:
   raise AuditBlocked("MANIFEST_UNAVAILABLE")
  obj=json.loads(p.read_text(encoding="utf8"),object_pairs_hook=unique,
    parse_constant=lambda _:( _ for _ in ()).throw(AuditBlocked("NONFINITE")))
  print(json.dumps(validate(obj,args.root),indent=2,sort_keys=True))
  return 0
 except (AuditBlocked,OSError,ValueError,TypeError,KeyError,IndexError,UnicodeError):
  print("R18-197 AUTHENTICATED_TRUNCATE_NO_GO: source/ACL drift, no release.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
