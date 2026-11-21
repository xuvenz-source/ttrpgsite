#!/usr/bin/env python3
"""R210 fail-closed original/QA schema-readiness evidence; SQL INSTALL NO_GO.

Never connects to any DB. Reads only frozen source-only manifest/SELECT.
Does not need or export private original SQL, identities, bucket names, Auth
records, SQL connections, credentials or any pending signed URL.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-210"
MANIFEST=Path("staging/world-v2-b10-r18-210-qa-schema-readiness/manifest.json")
MANIFEST_BLOB="d50a25dcf37fec75f48b69876729e56f18a7aa1d"
QUERY=Path("scripts/release/r210_readonly_qa_schema_readiness.sql")
QUERY_BLOB="ebf9ea84c35926cfde729c1d45a744d5611dd481"
PARENT={
 "pr":319,"head":"e6dcba03171764ba5ba76c7d298821c15e9cd4f2",
 "focusedCiRun":44923818468,"standardCiRun":44923818494,"draft":True}
ORIGINAL={
 "public_tables":31,"public_views":0,"public_functions":112,
 "auth_schema_present":1,"storage_schema_present":1,
 "public_schema_present":1,"migration_ledger_present":1}
QA={
 "public_tables":0,"public_views":0,"public_functions":0,
 "auth_schema_present":1,"storage_schema_present":1,
 "public_schema_present":1,"migration_ledger_present":0}
QA_COUNTS={"auth_users":0,"storage_buckets":0,"storage_objects":0}
HISTORY={
 "originalMigrationFilesShaVerified":83,
 "sourceExactPrioritizedFunctionBodiesMatched":11,
 "privateMigrationSemanticReviewFullyApproved":False}
STATE={
 "existingQaProjectOnly":True,"qaPublicAppSchemaPresent":False,
 "ownerExplicitQaSqlMutationApprovalReceived":False,
 "ownerExplicitOriginalSqlMutationApprovalReceived":False,
 "ownerExplicitProductionDeployApprovalReceived":False,
 "fullPrivate83MigrationInstallReviewedAndSafe":False,
 "hostedSignedDmP1P2RevokedOutsiderTestsPossibleNow":False,
 "realtimeStorageFullQaFeatureParityVerified":False,
 "qaRlsAndPrivilegedRpcEffectiveAuthApproved":False,
 "all67PrivilegedFunctionCallGraphsApproved":False,
 "all83PrivateHistoryMigrationSemanticsApproved":False
}
STAGES={
 "phase1ReadOnlyQaAndOriginalCatalogBaseline":True,
 "phase2PrivateWsl83SqlSemanticPreflightWithoutExport":False,
 "phase3ExplicitQaOnlyMutationOwnerApproval":False,
 "phase4ReviewedMinimumQaSchemaInstallUsingPrivateLocalWslOnly":False,
 "phase5ReadOnlyPostInstallParityAndIndependentQaActorVerification":False,
 "phase6SeparateProductionChangeApproval":False
}
SAFETY={
 "noOriginalOrQaSqlWritesPerformed":True,"noAuthOrStorageWritesPerformed":True,
 "noPublicFunctionOrMigrationSqlExported":True,
 "noPrivate83MigrationSourcesOrDocketUploaded":True,
 "noOriginalOrQaCredentialsUploaded":True,
 "noProductionPreviewDeployOrEdgeChanges":True,
 "noGitMerge":True,"noPaidResources":True,
 "noHostSchemaInstallWithoutExplicitOwnerApproval":True
}
MANUAL=("Owner must explicitly approve a separately scoped QA-only schema-preparation "
 "and later QA SQL installation path; private 83 historical migrations remain "
 "owner-local WSL, never in GitHub/chat/CI. No production or original schema "
 "action is implied by generic 'Proceed'.")
class Blocked(Exception):pass

def unique(pairs):
 out={}
 for k,v in pairs:
  if k in out:raise Blocked("DUPLICATE_JSON")
  out[k]=v
 return out

def gitblob(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def strict(actual,expected,label):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise Blocked(label)
 for k,v in expected.items():
  if type(actual[k]) is not type(v) or actual[k]!=v:
   raise Blocked(label)

def validate(m:dict,root:Path,raw:bytes|None=None)->dict:
 if raw is None:raw=(root/MANIFEST).read_bytes()
 if gitblob(raw)!=MANIFEST_BLOB:raise Blocked("SOURCE_MANIFEST_DRIFT")
 if not isinstance(m,dict) or set(m)!={
  "schema","workPackage","date","decision","parent","snapshotScope",
  "original","isolatedQa","isolatedQaExistingAccountCounts",
  "ownerPrivateHistoricalSourceContext","immutableQuerySourceGitBlob",
  "qaInstallationState","safePlan","hardRestrictions","manualGate"
 }:raise Blocked("MANIFEST_SCHEMA")
 if type(m["schema"]) is not int or m["schema"]!=1 or m["workPackage"]!=WORK or m["date"]!="2026-11-22" or m["decision"]!="NO_GO":
  raise Blocked("PROVENANCE")
 if m["snapshotScope"]!="READ_ONLY_ORIGINAL_AND_EXISTING_SEPARATE_QA_PG_CATALOG_AND_AGGREGATES":
  raise Blocked("UNAUTHORIZED_SCOPE")
 strict(m["parent"],PARENT,"PARENT")
 strict(m["original"],ORIGINAL,"ORIGINAL_CHANGED")
 strict(m["isolatedQa"],QA,"QA_SCHEMA_CHANGED")
 strict(m["isolatedQaExistingAccountCounts"],QA_COUNTS,"QA_DATA_CHANGED")
 strict(m["ownerPrivateHistoricalSourceContext"],HISTORY,"PRIVATE_HISTORY_OVERCLAIMED")
 if m["immutableQuerySourceGitBlob"]!=QUERY_BLOB:
  raise Blocked("READ_ONLY_SOURCE_INDEX")
 strict(m["qaInstallationState"],STATE,"QA_SQL_APPROVAL_FORGED")
 strict(m["safePlan"],STAGES,"PREMATURE_STEP")
 strict(m["hardRestrictions"],SAFETY,"UNSAFE_HOSTED_SCOPE")
 if m["manualGate"]!=MANUAL:raise Blocked("OWNER_CONSENT_CHANGED")
 p=root/QUERY
 if not p.is_file() or p.is_symlink() or p.stat().st_size>16384:
  raise Blocked("SOURCE_QUERY_MISSING")
 if gitblob(p.read_bytes())!=QUERY_BLOB:raise Blocked("READ_ONLY_QUERY_TAMPER")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "original_public_tables":31,"original_public_functions":112,
  "isolated_qa_public_tables":0,"isolated_qa_public_functions":0,
  "isolated_qa_auth_users":0,"isolated_qa_storage_objects":0,
  "isolated_qa_application_schema_installed":False,
  "qa_only_sql_install_owner_approval_received":False,
  "original_or_production_sql_authorized":False,
  "private_83_migration_install_safe_to_run_proven":False,
  "source_only_readonly_query_verified":True,
  "private_migration_sql_or_credentials_exported":False
 }

def main():
 p=argparse.ArgumentParser(description="R210 QA baseline source-only no-hosted-change gate")
 p.add_argument("--root",type=Path,default=Path.cwd())
 args=p.parse_args()
 try:
  f=args.root/MANIFEST
  if not f.is_file() or f.is_symlink() or f.stat().st_size>16384:
   raise Blocked("MANIFEST_UNAVAILABLE")
  raw=f.read_bytes()
  obj=json.loads(raw,object_pairs_hook=unique,
    parse_constant=lambda _:( _ for _ in ()).throw(Blocked("NONFINITE")))
  print(json.dumps(validate(obj,args.root,raw),sort_keys=True,indent=2))
  return 0
 except (Blocked,OSError,KeyError,IndexError,UnicodeError,TypeError,ValueError):
  print("R210 QA_SCHEMA_READINESS_NO_GO: source or explicit owner gate drift.",
        file=sys.stderr)
  return 2
if __name__=="__main__":raise SystemExit(main())
