#!/usr/bin/env python3
"""R203: immutable read-only original Storage bucket-root AST audit, NO_GO.

No network, DB, signed URLs, private migration SQL, policy SQL, bucket
names, object paths, user data or secret export. Structural proof is bounded.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-203"
MANIFEST=Path("staging/world-v2-b10-r18-203-live-bucket-root-guard/manifest.json")
PARENT={"pr":312,"head":"4135d0bc277a5f1d8a23c4bbc5f2c04bd34b4da1",
        "focusedCiSuccess":44907082875,"generalCiSuccess":44907082791,"draft":True}
HISTORY={"sha256":"4d9f09d70ff13208700e4428b33910039029a4ac2d823c429bcce0ff500c2b53",
 "originalMigrationHashesVerified":83,
 "historicalDirectStorageCreate":10,
 "historicalDirectStorageDrop":2,
 "latestMapHelperBodyCurrentShaMatches":True}
SLOTS=(
 (1,True,3,True,False,False,True,3),
 (2,True,2,True,False,True,True,3),
 (3,True,2,True,False,False,True,3),
)
SLOT_FIELDS=("anonymous_slot","root_and","root_and_children",
 "first_child_bucket_equality_constant","first_child_contains_or",
 "nested_or_only_beyond_first","has_bucket_literal",
 "distinct_private_bucket_values")
BLOBS={
 "scripts/release/r203_readonly_storage_bucket_root_guards.sql":"fbb03a1a4fcc2b8e6962ae2bb639ec2ae3bcbb38",
 "tests/world-v2-r18-203-postgres/run.sh":"eea9a3ddce8a0f4554be87bd352425e710426bc4",
 "tests/world-v2-r18-202-postgres/run.sh":"f06ecd6a728ea645bc46cfc0fe5306229a890fe3",
}
TRUE_CLAIMS=(
 "allThreeCurrentPolicyRootsHaveSeparateBucketComparison",
 "allThreeBucketLiteralsDiffer",
 "nestedOrNotInFirstBucketComparator",
 "currentInstalledBucketIsolationPassesThisConservativeAstMarker",
)
FALSE_CLAIMS=(
 "allEffectiveStoragePolicySemanticsApproved",
 "allNestedSqlHelperAccessGraphsAudited",
 "revokedCampaignMemberFreshUrlIssuanceDeniedInSignedQa",
 "oneHourExistingBearerLinksRevoked",
 "all83HistoricalMigrationSemanticsApproved",
 "all67PrivilegedCallChainsApproved",
 "signedDmP1P2RemovedOutsiderStorageQaPassed",
 "qaOrProductionSqlAuthorized",
)
RESTRICTIONS=(
 "readOnlyOriginalPgCatalogOnly","onlyLoopbackDisposablePg17SyntheticFixture",
 "noOriginalPolicySqlOrBucketNamesOrObjectPathsExported","noOriginalOrQaSqlWrites",
 "noAppRuntimeOrActiveMigrationsEdited","noMerge","noDeploy","noPaidResources"
)
NEXT=("Review current helper SQL authorization and Storage operation-specific SELECT behavior, "
 "then real signed removed-user URL issuance and already-issued 3600-second bearer expiry "
 "controls after separate QA authorization.")

class AuditBlocked(Exception):pass

def unique_json(pairs):
 result={}
 for k,v in pairs:
  if k in result:raise AuditBlocked("DUPLICATE_JSON")
  result[k]=v
 return result

def strict_dict(actual,expected,reason):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise AuditBlocked(reason)
 for k,v in expected.items():
  if type(actual[k]) is not type(v) or actual[k]!=v:
   raise AuditBlocked(reason)

def git_blob(raw:bytes):
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def validate(record:dict,root:Path)->dict:
 if not isinstance(record,dict) or set(record)!={
   "schema","workPackage","date","decision","parent","ownerR200Receipt",
   "originalLiveStoragePerPolicyAnon","frozenGitBlobs","interpretation",
   "guardrails","nextGate"
 }:
  raise AuditBlocked("SCHEMA_DRIFT")
 if (type(record["schema"]) is not int or record["schema"]!=1
   or record["workPackage"]!=WORK or record["date"]!="2026-11-22"
   or record["decision"]!="NO_GO"):
  raise AuditBlocked("SOURCE_PROVENANCE")
 strict_dict(record["parent"],PARENT,"PARENT_CHANGED")
 strict_dict(record["ownerR200Receipt"],HISTORY,"PRIVATE_R200_RECEIPT_DRIFT")
 strict_dict(record["frozenGitBlobs"],BLOBS,"GIT_SHA_INDEX_CHANGED")
 strict_dict(record["interpretation"],
   {**{k:True for k in TRUE_CLAIMS},**{k:False for k in FALSE_CLAIMS}},
   "UNSUPPORTED_PRODUCTION_APPROVAL")
 strict_dict(record["guardrails"],{k:True for k in RESTRICTIONS},
   "UNSAFE_SCOPE")
 if record["nextGate"]!=NEXT:raise AuditBlocked("NEXT_GATE_CHANGED")
 slots=record["originalLiveStoragePerPolicyAnon"]
 if not isinstance(slots,list) or len(slots)!=3:
  raise AuditBlocked("LIVE_STORAGE_SLOT_COUNT")
 for actual,values in zip(slots,SLOTS):
  strict_dict(actual,dict(zip(SLOT_FIELDS,values)),"LIVE_BUCKET_COMPARATOR_CHANGED")
 for rel,sha in BLOBS.items():
  p=root/rel
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise AuditBlocked("FROZEN_SOURCE_MISSING")
  if git_blob(p.read_bytes())!=sha:
   raise AuditBlocked("FROZEN_SOURCE_DRIFT")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "original_storage_root_and_bucket_eq_constant_verified":True,
  "three_storage_select_bucket_constants_distinct_verified":True,
  "nested_or_separate_from_first_bucket_comparator_verified":True,
  "source_exact_synthetic_pg17_runner_verified":True,
  "policy_complete_effective_helper_authorization_approved":False,
  "real_signed_revoked_member_fresh_url_denied":False,
  "previously_issued_signed_url_revocation_proven":False,
  "all_83_private_history_semantics_approved":False,
  "all_67_privileged_call_chains_approved":False,
  "hosted_qa_or_production_sql_authorized":False,
  "no_policy_sql_bucket_names_object_paths_or_tokens_exported":True,
 }

def main()->int:
 parser=argparse.ArgumentParser(description="R203 source-only Storage root bucket guard NO_GO")
 parser.add_argument("--root",type=Path,default=Path.cwd())
 args=parser.parse_args()
 try:
  p=args.root/MANIFEST
  if not p.is_file() or p.is_symlink() or p.stat().st_size>16384:
   raise AuditBlocked("MANIFEST_MISSING")
  payload=json.loads(p.read_text("utf8"),object_pairs_hook=unique_json,
    parse_constant=lambda _:( _ for _ in ()).throw(AuditBlocked("NONFINITE")))
  print(json.dumps(validate(payload,args.root),indent=2,sort_keys=True))
  return 0
 except (AuditBlocked,OSError,KeyError,IndexError,ValueError,TypeError,UnicodeError):
  print("R18-203 STORAGE_BUCKET_ROOT_NO_GO: source evidence drift or unsafe claim.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
