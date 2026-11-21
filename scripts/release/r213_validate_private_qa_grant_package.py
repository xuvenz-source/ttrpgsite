#!/usr/bin/env python3
"""R213 immutable all-83 private broad-GRANT owner-local audit delivery gate.

No original migrations, SQL text, original filenames, R111 docket or secrets
are ever needed by CI; no hosted connection or SQL is executed here.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-213"
MANIFEST=Path("staging/world-v2-b10-r18-213-private-qa-grant-lineage/manifest.json")
MANIFEST_BLOB="17c86b062b84bac4208cb650344e44aa42d7b483"
SOURCES={
 "scripts/release/r213_private_qa_broad_grant_review.py":
    "05d92ba996c2763b8f444c13d9194a0c8d1b833f",
 "tests/world-v2-r18-213-private-qa-grants.test.py":
    "e34f8347dd255d0e396f953e40bd9415524003c6",
 "scripts/release/r211_private_qa_migration_effects.py":
    "bb36d7e720f7d787fd758b726144a9addf389ab4",
 "scripts/release/r154_private_history_audit.py":
    "47a69ccbaa27c9c326a767c6d64b8268eef09a6f",
 "scripts/release/r191_private_fog_status_lineage.py":
    "bc2b039ec2cb2172659ef5c7df07306eb8c5ae84",
 "scripts/release/r186_private_privileged_statement_inventory.py":
    "12a685f94773c23054d0edd23bf3612a3e8ed8a5",
 "tests/world-v2-r18-193-private-invite-source-lineage.test.py":
    "1fcee465b0a9e7c153cc7874c97940afc53e8751",
 "tests/world-v2-r18-187-private-priority-queue.test.py":
    "6304cac7bcfe1fcfdaf0fe91c2c43c7160bd4d08"
}
PARENT={"pr":322,"head":"3f9cf13cf5d09af5be53a1ccfe6a323712cd92eb",
        "focusedCiRun":44935882465,"standardCiRun":44935882476,"draft":True}
RECEIPT={"bytes":3342,"sha256":"d718a19fab36778a3360a4ee9f514a9e728c8d2772d4f31e4704d02e1eea03f3",
         "verifiedOriginalMigrations":83,"topLevelStatementCount":937,
         "flaggedOriginalFiles":22,"literalGrantTruncateMarkers":0,
         "fullySemanticReviewed":False}
LIVE={"publicTables":31,"rlsEnabledTables":31,
      "authenticatedTruncateTables":5,"permissivePublicPolicies":77,
      "permissiveStoragePolicies":8}
SCOPE={
 "ownerApprovedQaSchemaPreparationOnly":True,
 "ownerApprovedQaSqlInstallation":False,
 "ownerApprovedOriginalSqlMutation":False,
 "ownerApprovedProductionRelease":False,
 "onlyExistingFreeQaProject":True
}
HOLD={
 "currentOriginalFiveAuthenticatedTruncatePrivilegesRemain":True,
 "broadGrantLexicalMarkerAloneProvesActualGrantCause":False,
 "all83PrivateMigrationsSemanticallyReviewed":False,
 "all67CallablePrivilegedFunctionChainsApproved":False,
 "signedDmP1P2RevokedOutsiderQaPassed":False,
 "storageBearerIssueResolved":False
}
RESTRICTIONS=(
 "onlyInvented83MigrationsInGitHubCi",
 "noPrivateOriginalSqlDocketNamesOrVersionsExport",
 "noOriginalOrQaSqlWrite","noAuthStorageUserDataWrite",
 "noRuntimeOrEdgeOrActiveMigrationChanges",
 "noMerge","noDeploy","noPaidResources",
 "noNetworkOrDatabaseInOwnerLocalScript"
)
OWNER=("After exact-head CI, owner uses private Ubuntu WSL "
 "$HOME/ttrpg-history-private to run commit-pinned "
 "r213_private_qa_broad_grant_review.py and uploads ONLY "
 "r213-sanitized-report.json. No original SQL, R111 docket, filenames, "
 "timestamps, policy/function names/signatures, credentials, URLs or raw "
 "logs leave WSL. This is read-only risk triage, not permission to execute migrations.")
NEXT=("Reconcile all 83 historical direct table GRANT ALL candidates, explicit "
 "TRUNCATE grants/revokes and any extra risky numeric docket indices outside "
 "the original 22 with current original five-table effective TRUNCATE ACL; "
 "prepare a separately reviewed minimal QA app schema dependency plan but "
 "do not install SQL without explicit owner QA-write approval.")
class Blocked(Exception):pass

def unique(pairs):
 d={}
 for k,v in pairs:
  if k in d:raise Blocked("R213_DUPLICATE_KEY")
  d[k]=v
 return d

def gitblob(raw:bytes):
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def strict(m,expected,label):
 if type(m) is not dict or set(m)!=set(expected):
  raise Blocked(label)
 for k,v in expected.items():
  if type(m[k]) is not type(v) or m[k]!=v:
   raise Blocked(label)

def validate(m:dict,root:Path,raw:bytes|None=None):
 if raw is None:raw=(root/MANIFEST).read_bytes()
 if gitblob(raw)!=MANIFEST_BLOB:raise Blocked("R213_MANIFEST_BLOB_CHANGED")
 if type(m) is not dict or set(m)!={
  "schema","workPackage","date","decision","parent",
  "ownerR211SanitizedReceipt","currentOriginalReadOnlyEffectiveAcl",
  "sourceBlobs","scope","securityHold","restrictions","ownerNextStep","nextGate"
 }:raise Blocked("R213_UNEXPECTED_MANIFEST_SCHEMA")
 if (type(m["schema"]) is not int or m["schema"]!=1 or
     m["workPackage"]!=WORK or m["date"]!="2026-11-22" or
     m["decision"]!="NO_GO"):
  raise Blocked("R213_PROVENANCE")
 strict(m["parent"],PARENT,"R213_PARENT")
 strict(m["ownerR211SanitizedReceipt"],RECEIPT,"R213_OWNER_RECEIPT")
 strict(m["currentOriginalReadOnlyEffectiveAcl"],LIVE,"R213_CURRENT_ACL")
 strict(m["sourceBlobs"],SOURCES,"R213_SOURCE_PIN_INDEX")
 strict(m["scope"],SCOPE,"R213_SCOPE")
 strict(m["securityHold"],HOLD,"R213_FALSE_SECURITY_GO")
 strict(m["restrictions"],{k:True for k in RESTRICTIONS},"R213_SQL_SCOPE")
 if m["ownerNextStep"]!=OWNER or m["nextGate"]!=NEXT:
  raise Blocked("R213_OWNER_GATE")
 for relative,sha in SOURCES.items():
  p=root/relative
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise Blocked("R213_SOURCE_MISSING")
  if gitblob(p.read_bytes())!=sha:raise Blocked("R213_SOURCE_TAMPER")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "owner_r211_83_source_sha_and_937_statement_preflight_pinned":True,
  "previous_r211_flagged_files":22,
  "original_current_authenticated_truncate_table_count":5,
  "original_historical_literal_grant_truncate_marker_count":0,
  "new_private_all_83_grant_lineage_report_received":False,
  "owner_private_r213_script_sha_pinned":True,
  "ci_tests_only_synthetic_83_file_history":True,
  "qa_sql_installation_approved":False,
  "original_or_production_write_approved":False,
  "all_83_migrations_semantically_approved":False,
  "all_67_privileged_call_graphs_approved":False,
  "no_original_sql_or_docket_exported":True
 }

def main():
 ap=argparse.ArgumentParser(description="R213 offline all-83 private GRANT review source-only NO_GO")
 ap.add_argument("--root",type=Path,default=Path.cwd())
 args=ap.parse_args()
 try:
  p=args.root/MANIFEST
  if not p.is_file() or p.is_symlink() or p.stat().st_size>16384:
   raise Blocked("R213_MANIFEST_UNAVAILABLE")
  raw=p.read_bytes()
  obj=json.loads(raw,object_pairs_hook=unique,
    parse_constant=lambda _:( _ for _ in ()).throw(Blocked("R213_NONFINITE")))
  print(json.dumps(validate(obj,args.root,raw),indent=2,sort_keys=True))
  return 0
 except Exception:
  print("R213 PRIVATE_GRANT_SOURCE_NO_GO: source, consent or fingerprint drift.",file=sys.stderr)
  return 2
if __name__=="__main__":raise SystemExit(main())
