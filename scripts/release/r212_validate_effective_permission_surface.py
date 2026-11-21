#!/usr/bin/env python3
"""R212 original/QA effective permission count strict source-only NO_GO.

This does not read original SQL, contact hosted DB, or mutate any resource.
The five authenticated TRUNCATE grants are CURRENT ORIGINAL ACLs despite
the R211 original private history containing ZERO literal GRANT TRUNCATE
word markers. Absence of text is not absence of effective privileges.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-212"
MANIFEST=Path("staging/world-v2-b10-r18-212-effective-permission-surface/manifest.json")
MANIFEST_BLOB="606dd1500e269fa3be25cb460fb8b6cb8526fe3c"
SOURCES={
 "scripts/release/r212_readonly_qa_effective_permission_surface.sql":
 "d89cbebeed96ef119afaf216fa6a360f18d63705",
 "tests/world-v2-r18-212-postgres/run.sh":
 "38b4b807411c2c0f832678b0fe806b033d87e630",
}
PARENT={"pr":321,"head":"eafc1a42a44a95642303ec5b018833f69f29fc1d",
 "focusedCiRun":44927400163,"standardCiRun":44927400138,"draft":True}
REPORT={"sha256":"d718a19fab36778a3360a4ee9f514a9e728c8d2772d4f31e4704d02e1eea03f3",
 "bytes":3342,"migrationsVerified":83,"statementCount":937,
 "riskFlaggedFiles":22,"unknownStatements":0,"literalGrantTruncateMarkers":0,
 "securitySemanticsApproved":False}
ORIGINAL={
 "public_tables":31,"public_rls_enabled_tables":31,
 "public_force_rls_tables":0,"public_rls_disabled_tables":0,
 "public_anon_select_granted_tables":0,
 "public_authenticated_select_granted_tables":29,
 "public_authenticated_insert_granted_tables":20,
 "public_authenticated_update_granted_tables":20,
 "public_authenticated_delete_granted_tables":18,
 "public_authenticated_truncate_granted_tables":5,
 "public_policy_count":77,"public_permissive_policies":77,
 "public_restrictive_policies":0,"public_select_policies":27,
 "public_update_policies":16,"public_insert_policies":17,
 "public_delete_policies":13,"public_functions":112,
 "public_security_definer_functions":85,
 "public_authenticated_callable_definers":67,
 "public_anon_callable_definers":0,"public_empty_path_definers":85,
 "storage_object_policies":8,
 "storage_object_permissive_policies":8,
 "storage_object_select_policies":3,
 "public_noninternal_triggers":45,"installed_extension_count":5,
 "publication_relation_count":18,
}
QA={k:(5 if k=="installed_extension_count" else 0) for k in ORIGINAL}
INTERPRETATION=(
 "literalGrantTruncateMarkerIsNotEffectiveAclEvidence",
 "originalAuthenticatedTruncateOnFivePublicTablesVerified",
 "all31PublicTablesRlsEnabled",
 "all77OriginalPublicPoliciesPermissive",
 "all8OriginalStorageObjectsPoliciesPermissive",
 "activeFiveTableTruncateGrantsUnremediated",
 "rlsNeverMakesTruncateRowScoped",
 "qaBaselineIsEmptyApplicationSchemaNotFullEquivalence",
 "originalVsQaFiveExtensionCountDoesNotProveSameExtensionIdentity",
 "sourceLexicalClassifierNotFull83MigrationSemanticReview")
APPROVALS=(
 "qaSqlInstallApproved","originalDbWritesApproved","productionReleaseApproved",
 "all83MigrationSemanticsApproved","all67PrivilegedCallGraphsApproved",
 "realSignedQaCompleted","authenticatedTruncateIssue306Repaired")
GUARDS=(
 "noOriginalOrQaSqlWrites","noOriginalOrQaAuthOrStorageWrites",
 "noLiveAppOrEdgeOrActiveMigrationChanges","noPrivate83SqlOrDocketUploaded",
 "noMerge","noDeploy","noPaidResources","onlySyntheticLocalPostgres17Writes")
NEXT=("Use owner-private review of the 22 R211 flagged R111 priority indices "
 "(not migration chronological indices) to build an exact dependency and "
 "effective grant/RLS effect plan. No QA SQL installation or original/production "
 "changes without separately approved exact write window.")
class Blocked(Exception):pass

def no_duplicate(pairs):
 data={}
 for key,value in pairs:
  if key in data:raise Blocked("DUPLICATE_JSON_KEY")
  data[key]=value
 return data

def gitblob(data:bytes)->str:
 return hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()

def strict(obj,expected,label):
 if type(obj) is not dict or set(obj)!=set(expected):raise Blocked(label)
 for key,value in expected.items():
  if type(obj[key]) is not type(value) or obj[key]!=value:raise Blocked(label)

def validate(m:dict,root:Path,raw:bytes|None=None)->dict:
 if raw is None:raw=(root/MANIFEST).read_bytes()
 if gitblob(raw)!=MANIFEST_BLOB:raise Blocked("MANIFEST_CHANGED")
 if type(m) is not dict or set(m)!={
  "schema","workPackage","date","decision","parent",
  "ownerR211PrivateSanitizedReport","originalEffectivePermissions",
  "isolatedQaEffectivePermissions","auditInterpretation",
  "approvals","immutableGitBlobs","restrictions","nextGate"
 }:raise Blocked("SCHEMA_CHANGED")
 if (type(m["schema"]) is not int or m["schema"]!=1 or
     m["workPackage"]!=WORK or m["date"]!="2026-11-22" or
     m["decision"]!="NO_GO"):
  raise Blocked("PROVENANCE_OR_GO")
 strict(m["parent"],PARENT,"PARENT")
 strict(m["ownerR211PrivateSanitizedReport"],REPORT,"OWNER_REPORT")
 strict(m["originalEffectivePermissions"],ORIGINAL,"ORIGINAL_EFFECTIVE_ACL")
 strict(m["isolatedQaEffectivePermissions"],QA,"ISOLATED_QA_PERMISSIONS")
 strict(m["immutableGitBlobs"],SOURCES,"SOURCE_GIT_INDEX")
 strict(m["auditInterpretation"],{k:True for k in INTERPRETATION},"OVERCLAIM")
 strict(m["approvals"],{"qaOnlyPreparationApproved":True,
                          **{k:False for k in APPROVALS}},"FORGED_APPROVAL")
 strict(m["restrictions"],{k:True for k in GUARDS},"HOSTED_ACTION_SCOPE")
 if m["nextGate"]!=NEXT:raise Blocked("NEXT_GATE")
 for rel,sha in SOURCES.items():
  p=root/rel
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise Blocked("SOURCE_UNAVAILABLE")
  if gitblob(p.read_bytes())!=sha:raise Blocked("SOURCE_HASH_CHANGED")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "owner_83_private_migration_sources_verified":True,
  "historical_literal_grant_truncate_count":0,
  "original_authenticated_truncate_table_acl_count":5,
  "all_original_public_tables_rls_enabled":True,
  "original_public_policies_permissive_count":77,
  "original_storage_policies_permissive_count":8,
  "isolated_qa_application_tables_and_functions":0,
  "synthetic_grant_all_truncate_regression_only":True,
  "original_five_table_truncate_grants_repaired":False,
  "qa_sql_installation_authorized":False,
  "production_security_release_authorized":False,
  "raw_private_sql_exported":False,
 }

def main():
 ap=argparse.ArgumentParser(description="R212 QA current effective permissions NO_GO")
 ap.add_argument("--root",type=Path,default=Path.cwd())
 args=ap.parse_args()
 try:
  p=args.root/MANIFEST
  if not p.is_file() or p.is_symlink() or p.stat().st_size>16384:
   raise Blocked("MANIFEST_UNAVAILABLE")
  raw=p.read_bytes()
  obj=json.loads(raw,object_pairs_hook=no_duplicate,
     parse_constant=lambda _:( _ for _ in ()).throw(Blocked("NONFINITE")))
  print(json.dumps(validate(obj,args.root,raw),sort_keys=True,indent=2))
  return 0
 except (Blocked,OSError,TypeError,UnicodeError,KeyError,ValueError):
  print("R212 EFFECTIVE_PERMISSION_NO_GO: source or owner approval drift.",file=sys.stderr)
  return 2
if __name__=="__main__":raise SystemExit(main())
