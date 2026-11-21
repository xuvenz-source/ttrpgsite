#!/usr/bin/env python3
"""R206 source-only immutable private 11-function WSL script delivery gate.

Never opens owner's original 83 migration SQL files. No hosted connection.
Source SHA and release flags must match the exact reviewed package before
telling the user to execute the owner-private offline script.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

import r206_private_privileged_function_lineage as audit

WORK="B10-R18-206"
MANIFEST=Path("staging/world-v2-b10-r18-206-private-function-lineage/manifest.json")
MANIFEST_BLOB="a0dfc805eaea12bcaeb15c5f0f0e51183dc5de44"
SOURCE_BLOBS={
 "scripts/release/r206_private_privileged_function_lineage.py":"ba5092d0051da44540d843933947e320321471e3",
 "tests/world-v2-r18-206-private-privileged-function-lineage.test.py":"5a411013e367248bc07391e0ef8dfa92dd8e7529",
 "scripts/release/r200_private_storage_policy_lineage.py":"bdfbd1e88756141848250796ac2f8aca6d81b827",
 "scripts/release/r198_private_sheet_auth_lineage.py":"8c005a517decd2cc1d39ee28c69d4b349afa171a",
 "scripts/release/r193_private_invite_source_lineage.py":"4630d13557aa59298325269fe3bc4b6062f2655d"
}
RELEASE_FLAGS=(
 "elevenTargetFunctionSourceSemanticsApproved",
 "all67PrivilegedCallableRpcCallGraphsApproved",
 "all83PrivateOriginalMigrationsSemanticallyReviewed",
 "fogStatusOriginalRemediated",
 "revokedSheetOwnerOriginalRemediated",
 "realSignedMultiaccountQaPassed",
 "qaSqlInstallAuthorized","productionDeployAuthorized"
)
SAFETY=(
 "noHistoricalPrivateSqlUploaded","noOriginalOrQaDbWrites",
 "noLiveRuntimeOrEdgeOrActiveMigrations","noMerge","noDeploy",
 "noPaidResources","onlyFictional83FileGitHubCi",
 "reportNeverIncludesPrivateSqlFunctionNamesOrMigrationPaths"
)
PRIVATE_DEPENDENCIES=[
 "r154_private_history_audit.py",
 "r186_private_privileged_statement_inventory.py",
 "r191_private_fog_status_lineage.py",
 "r193_private_invite_source_lineage.py",
 "r198_private_sheet_auth_lineage.py",
 "r200_private_storage_policy_lineage.py",
]
NEXT=("After exact-head GitHub CI, owner uses private WSL $HOME/ttrpg-history-private "
 "to run commit-pinned r206_private_privileged_function_lineage.py and uploads ONLY "
 "r206-sanitized-report.json. Never share raw SQL, original migration filenames, "
 "docket, function signatures, object paths, JWTs or credentials.")

class Blocked(Exception):pass

def no_duplicate_json(pairs):
 result={}
 for k,v in pairs:
  if k in result:raise Blocked("DUPLICATE_JSON_KEY")
  result[k]=v
 return result

def sha_blob(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def strict(actual,reference):
 if not isinstance(actual,dict) or set(actual)!=set(reference):
  raise Blocked("UNEXPECTED_KEYS")
 for key,value in reference.items():
  if type(actual[key]) is not type(value) or actual[key]!=value:
   raise Blocked("EXPECTED_SOURCE_VALUE_CHANGED")

def validate(data:dict,root:Path,raw:bytes|None=None)->dict:
 if raw is None:raw=(root/MANIFEST).read_bytes()
 if sha_blob(raw)!=MANIFEST_BLOB:raise Blocked("MANIFEST_NOT_EXACT_GIT_BLOB")
 if not isinstance(data,dict) or set(data)!={
  "schema","workPackage","date","decision","parent",
  "ownerPrivateR200Receipt","liveKnownFunctionTargets","frozenSourceBlobs",
  "privateDependencies","nextManualGate","releaseApprovals","restrictions"
 }:raise Blocked("MANIFEST_SCHEMA_DRIFT")
 if (type(data["schema"]) is not int or data["schema"]!=1
  or data["workPackage"]!=WORK or data["date"]!="2026-11-22"
  or data["decision"]!="NO_GO"):
  raise Blocked("PROVENANCE")
 strict(data["parent"],{
   "pr":315,"head":"60cb549fe7f8278a2d7a5c0b6c185e333a6d91ee",
   "focusedCiRun":44917276034,"standardCiRun":44917276050,
   "sourceOnly":True
 })
 strict(data["ownerPrivateR200Receipt"],{
   "bytes":3183,
   "sha256":"4d9f09d70ff13208700e4428b33910039029a4ac2d823c429bcce0ff500c2b53",
   "verifiedOriginalMigrationFiles":83,"storagePolicyEvents":12,
   "policyCreates":10,"policyDrops":2,"mapHelperBodyMatched":True
 })
 expected=[{"slot":index+1,"known_public_function_name":target[0],
           "body_sha256":target[2],"body_bytes":target[1]}
           for index,target in enumerate(audit.TARGETS)]
 if data["liveKnownFunctionTargets"]!=expected or len(expected)!=11:
  raise Blocked("LIVE_11_FUNCTION_SOURCES")
 strict(data["frozenSourceBlobs"],SOURCE_BLOBS)
 if data["privateDependencies"]!=PRIVATE_DEPENDENCIES:
  raise Blocked("PRIVATE_AUDITOR_CHAIN_CHANGED")
 if data["nextManualGate"]!=NEXT:raise Blocked("UNSAFE_OPERATOR_INSTRUCTIONS")
 strict(data["releaseApprovals"],{key:False for key in RELEASE_FLAGS})
 strict(data["restrictions"],{key:True for key in SAFETY})
 for filename,expected_sha in SOURCE_BLOBS.items():
  p=root/filename
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise Blocked("SOURCE_FILE_UNAVAILABLE")
  if sha_blob(p.read_bytes())!=expected_sha:
   raise Blocked("SOURCE_SHA_MISMATCH")
 return {
   "work_package":WORK,"decision":"NO_GO",
   "source_pinned_owner_private_script_verified":True,
   "prior_private_history_83_file_provenance_pinned":True,
   "eleven_known_public_live_function_fingerprints_pinned":True,
   "fictional_83_file_tests_only":True,
   "owner_private_r206_report_received":False,
   "all_83_private_historical_semantics_approved":False,
   "all_67_live_function_call_chains_approved":False,
   "real_signed_qa_approved":False,
   "hosted_sql_or_production_release_authorized":False,
   "no_raw_private_sql_or_secrets_exported":True,
 }

def main()->int:
 p=argparse.ArgumentParser(description="R206 private original function lineage script provenance")
 p.add_argument("--root",type=Path,default=Path.cwd())
 args=p.parse_args()
 try:
  manifest=args.root/MANIFEST
  if not manifest.is_file() or manifest.is_symlink() or manifest.stat().st_size>16384:
   raise Blocked("MANIFEST_MISSING")
  raw=manifest.read_bytes()
  data=json.loads(raw,object_pairs_hook=no_duplicate_json,
    parse_constant=lambda _:( _ for _ in ()).throw(Blocked("NONFINITE")))
  print(json.dumps(validate(data,args.root,raw),indent=2,sort_keys=True))
  return 0
 except (Blocked,OSError,UnicodeError,ValueError,TypeError,KeyError,IndexError):
  print("R18-206 PRIVATE_PACKAGE_NO_GO: unexpected SQL/history/approval drift.",file=sys.stderr)
  return 2

if __name__=="__main__":raise SystemExit(main())
