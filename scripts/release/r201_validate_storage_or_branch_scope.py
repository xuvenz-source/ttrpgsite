#!/usr/bin/env python3
"""R201 original Storage SELECT anonymous branch SHA and synthetic OR NO_GO.

No database connections, policy SQL, bucket names/paths, user data or tokens.
Only read-only original catalog boolean classifications are recorded in Git.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-201"
MANIFEST=Path("staging/world-v2-b10-r18-201-storage-policy-or-branches/manifest.json")
BLOBS={
 "scripts/release/r201_readonly_storage_policy_branch_matrix.sql":"62240473e7588a7204d48917238e2410d98dc0b3",
 "tests/world-v2-r18-201-postgres/run.sh":"2fa7c3be2e52f409f6229523c6021af9f0e31b1d",
}
SLOTS=[
 [1,1,1,0,0,1,0,0,1,0,1,1,1,0,0,0,0],
 [2,1,1,0,0,1,1,0,0,1,1,1,1,1,0,0,0],
 [3,1,1,0,0,1,1,0,0,0,1,0,1,0,0,0,0],
]
SLOT_FIELDS=[
 "anonymous_slot","polpermissive","role_applies_authenticated",
 "role_applies_anon","missing_using","has_bucket","direct_uid",
 "direct_membership","map_helper","owner_marker","path_marker",
 "exists_marker","and_word","or_word","true_word",
 "user_metadata_marker","jwt_marker",
]
PARENT={"pr":310,"head":"83feb12629e2ce92e7114a49ab17b28a6c04e9b0",
        "focusedCiSuccess":44905133304,"generalCiSuccess":44905133290}
RECEIPT={"bytes":3183,"sha256":"4d9f09d70ff13208700e4428b33910039029a4ac2d823c429bcce0ff500c2b53",
         "migrationShaVerified":83,"historicalStoragePolicyCreates":10,
         "historicalStoragePolicyAlters":0,"historicalStoragePolicyDrops":2,
         "historicalMapHelperDefinitions":1,"latestMapHelperBodyMatchesCurrent":True}
MAP={"bodyUtf8Bytes":448,"sha256":"835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c",
     "directMembershipMarker":True,"authenticatedExecutable":True}
BLOCKED=(
 "originalEffectiveStoragePolicyBooleanSemanticsReviewed",
 "actualPolicyOrPrecedenceExposureProven",
 "signedRevokedActorCanMintStorageUrlDemonstrated",
 "realSignedMultiaccountStorageQaPassed",
 "existingOneHourBearerRevocationVerified",
 "original83HistoricalSqlSemanticsApproved",
 "all67LivePrivilegedCallGraphsApproved",
 "qaOriginalSqlInstallApproved",
 "productionReleaseApproved",
)
SAFETY=(
 "onlyReadOnlyOriginalCatalogAggregates","nodeAndPg17FixturesOnlySynthetic",
 "noPolicySqlNamesBucketObjectPathsOrSignedTokensExported",
 "noOriginalOrQaWrites","noAppSourceOrVersionedMigrations",
 "noMerge","noDeploy","noPaidResources",
)
NEXT=("Review semantic bucket scope and AND/OR grouping separately for each current "
 "Storage SELECT branch without exporting policy SQL; confirm no cross-bucket route "
 "lets removed member sign protected campaign assets. Require signed QA and "
 "independent deployment approval.")

class AuditBlocked(Exception):pass

def json_unique(pairs):
 data={}
 for k,v in pairs:
  if k in data:raise AuditBlocked("DUPLICATE_JSON")
  data[k]=v
 return data

def blob_sha(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def strict_dict(actual,reference):
 if not isinstance(actual,dict) or set(actual)!=set(reference):
  raise AuditBlocked("MISSING_OR_ADDED_KEYS")
 for k,v in reference.items():
  if actual[k]!=v or type(actual[k]) is not type(v):
   raise AuditBlocked("EXPECTED_FIELD_MISMATCH")

def validate(data,root:Path):
 if not isinstance(data,dict) or set(data)!={
   "schema","workPackage","date","decision","parent","ownerR200Receipt",
   "currentOriginalStorageSelectPoliciesAnonymous",
   "currentOriginalMapHelper","sources","interpretation","restrictions","nextGate"
 }:
  raise AuditBlocked("SCHEMA_INVALID")
 if (type(data["schema"]) is not int or data["schema"]!=1
     or data["workPackage"]!=WORK or data["date"]!="2026-11-21"
     or data["decision"]!="NO_GO"):
  raise AuditBlocked("PROVENANCE")
 strict_dict(data["parent"],PARENT)
 strict_dict(data["ownerR200Receipt"],RECEIPT)
 strict_dict(data["currentOriginalMapHelper"],MAP)
 strict_dict(data["sources"],BLOBS)
 strict_dict(data["interpretation"],{k:False for k in BLOCKED})
 strict_dict(data["restrictions"],{k:True for k in SAFETY})
 if data["nextGate"]!=NEXT:
  raise AuditBlocked("NEXT_GATE")
 slots=data["currentOriginalStorageSelectPoliciesAnonymous"]
 if not isinstance(slots,list) or len(slots)!=3:
  raise AuditBlocked("STORAGE_POLICY_COUNT")
 for row,expected in zip(slots,SLOTS):
  if not isinstance(row,dict) or set(row)!=set(SLOT_FIELDS):
   raise AuditBlocked("ANONYMOUS_SLOT_SCHEMA")
  for name,val in zip(SLOT_FIELDS,expected):
   reference=int(val) if name=="anonymous_slot" else bool(val)
   if row[name]!=reference or type(row[name]) is not type(reference):
    raise AuditBlocked("ANONYMOUS_SLOT_DRIFT")
 for rel,sha in BLOBS.items():
  p=root/rel
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise AuditBlocked("SOURCE_MISSING_OR_OVERSIZE")
  if blob_sha(p.read_bytes())!=sha:
   raise AuditBlocked("SOURCE_SHA_DRIFT")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "owner_r200_83_history_report_reconciled":True,
  "original_three_permissive_policy_branch_boolean_slots_verified":True,
  "one_original_branch_contains_both_and_or_words":True,
  "current_storage_policy_semantics_safely_proven":False,
  "original_revoked_user_can_sign_protected_campaign_asset_proven":False,
  "signed_revoked_user_qa_passed":False,
  "all_83_historical_sql_semantics_approved":False,
  "all_67_privileged_call_chains_approved":False,
  "hosted_sql_or_release_authorized":False,
  "original_policy_sql_names_bucket_paths_urls_or_secrets_exported":False,
 }

def main():
 parser=argparse.ArgumentParser(description="R201 original Storage policy structural NO_GO")
 parser.add_argument("--root",type=Path,default=Path.cwd())
 args=parser.parse_args()
 try:
  f=args.root/MANIFEST
  if not f.is_file() or f.is_symlink() or f.stat().st_size>16384:
   raise AuditBlocked("MANIFEST_MISSING")
  content=f.read_text(encoding="utf-8")
  data=json.loads(content,object_pairs_hook=json_unique,
                  parse_constant=lambda _:(_ for _ in ()).throw(AuditBlocked("NONFINITE")))
  print(json.dumps(validate(data,args.root),sort_keys=True,indent=2))
  return 0
 except (AuditBlocked,OSError,ValueError,TypeError,UnicodeError,KeyError):
  print("R18-201 STORAGE_OR_BRANCH_NO_GO: source/ACL evidence drift.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
