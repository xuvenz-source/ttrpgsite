#!/usr/bin/env python3
"""R18-199: fail-closed R198 private sheet/Storage revocation source evidence.

Reads only versioned, bounded manifest and Git text sources. No database,
network, object/bucket names, original policy SQL, signed bearer URLs or
private original historical migration files are read/exported by this tool.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-199"
MANIFEST=Path("staging/world-v2-b10-r18-199-signed-asset-revocation/manifest.json")
BLOBS={
 "src/SignedAssetUrls.js":"cda974731221ba49262346aaf9baa7b6c2fc7b4b",
 "staging/world-v2-b10-r18-123-access-revocation-guard/CampaignAccessSentinel.js":"984f6d1b1b2653186d8da6d8856a38dadfeac548",
 "staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js":"e98702ec68ea88a65c3a0e362d0dc6e43ac8bc78",
 "tests/world-v2-r18-123-access-revocation-guard.test.mjs":"72b6b2e4613cb58c4784245c2e10921940d2ee59",
 "tests/world-v2-r18-199-signed-url-teardown.test.mjs":"465ba01b11be73f49b32597136b2af3763db29dc",
 "scripts/release/r199_readonly_storage_policy_aggregates.sql":"146d584c56767ee4274f14ea9746f02a2b354b16",
}
RECEIPT={
 "sizeBytes":1734,
 "sha256":"9688c8aedb036f2d393cacb31a9f1852371a732bbe6f8569e8a820fbb6ce78cc",
 "historySha256Verified":83,"chronologyUnique":True,"priorR193Verified":True,
 "directHistoricalSheetHelperDefinitions":1,"matchingCurrentBodyCount":1,
 "prioritySortedR111DocketIndexNotChronology":49,
 "executableSqlStatementOrdinal":7,
 "latestCurrentBodySha256AndByteSizeMatch":True,
 "latestDirectIdentityMarker":True,"latestDirectMembershipMarker":False,
 "sqlOrSecretsExported":False,"networkOrDatabaseAccessed":False,
}
STORAGE={
 "storage_buckets_total":3,"storage_buckets_public":0,"storage_buckets_private":3,
 "storage_objects_tables":1,"objects_rls_enabled":True,"objects_force_rls":False,
 "authenticated_select_grant":True,"anon_select_grant":True,
 "total_policies":8,"select_applicable_policies":3,"permissive_select_applicable":3,
 "restrictive_select_applicable":0,"authenticated_or_public_select_policies":3,
 "direct_membership_marker_select_policies":0,"direct_auth_uid_marker_select_policies":2,
 "map_view_helper_marker_select_policies":1,"bucket_marker_select_policies":3,
}
CLIENT={
 "signedUrlSeconds":3600,"localCacheTtlMs":54*60*1000,
 "clearResignsActiveSubscribers":True,"unmountedR123Sentinel":True,
 "unmountedR123Teardown":True,"alreadyIssuedBearerRevokedByClientCacheClear":False,
 "alreadyIssuedBearerRevokedByAuthJwtKeyRotation":False,
 "supabaseSignedUrlRevocationRequiresSupport":True,
}
BLOCKED=(
 "effectiveStoragePolicyCompositionAndNestedHelperAuthorizationProven",
 "revokedUserCannotMintFreshSignedUrlInRealSupabaseProven",
 "alreadyIssuedBearerRemoteRevocationDemonstrated",
 "realSignedDmP1P2RemovedOutsiderQaPassed",
 "all83HistoricalMigrationSemanticsApproved",
 "all67LivePrivilegedCallChainsApproved",
 "qaSqlOrRuntimeInstallApproved","productionReleaseAuthorized",
)
LIMITS=(
 "noHistoricalPrivateSqlPolicySqlObjectPathsOrTokensExported",
 "noOriginalOrQaDbWritesOrSignedUrlMinting",
 "noChangesToLiveSrcOrActiveMigrations",
 "noMerge","noDeployment","noPaidResources",
)
NEXT=("Audit server-side per-bucket Storage policy AND-helper semantics without publishing original "
      "policy SQL; choose short URL expiry with measured free-tier cache/movement costs, review "
      "support-based issued token revocation, then signed QA only after separately approved isolated QA install.")

class AuditBlocked(Exception):
 pass

def no_duplicate_json(pairs):
 data={}
 for k,v in pairs:
  if k in data:raise AuditBlocked("DUPLICATE_KEY")
  data[k]=v
 return data

def strict_equal(actual,expected,where):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise AuditBlocked(where)
 for key,value in expected.items():
  if actual[key]!=value or type(actual[key]) is not type(value):
   raise AuditBlocked(where)

def git_blob(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def validate(data:dict,root:Path)->dict:
 if not isinstance(data,dict) or set(data)!={
    "schema","workPackage","date","decision","parent",
    "ownerPrivateR198Receipt","originalReadOnlyStorageSnapshot",
    "existingClientSource","frozenGitBlobs","knownIssue","relatedIssues",
    "releaseApprovals","restrictions","nextGate",
 }:
  raise AuditBlocked("MANIFEST_SCHEMA")
 if (type(data["schema"]) is not int or data["schema"]!=1
     or data["workPackage"]!=WORK or data["decision"]!="NO_GO"
     or data["date"]!="2026-11-21"
     or type(data["knownIssue"]) is not int or data["knownIssue"]!=231
     or data["relatedIssues"]!=[212,220,223,229,306]):
  raise AuditBlocked("PROVENANCE_MISMATCH")
 strict_equal(data["parent"],{
   "pr":308,"sha":"a2d6285fdf1e4422c3a88c1b437f15d33d41d95a",
   "sourceOnly":True
 }, "PARENT_NOT_EXACT_HEAD")
 strict_equal(data["ownerPrivateR198Receipt"],RECEIPT,"PRIVATE_R198_RECEIPT_DRIFT")
 strict_equal(data["originalReadOnlyStorageSnapshot"],STORAGE,"LIVE_READ_ONLY_STORAGE_DRIFT")
 strict_equal(data["existingClientSource"],CLIENT,"SIGNED_BEARER_LIFETIME_DRIFT")
 strict_equal(data["frozenGitBlobs"],BLOBS,"SOURCE_BLOB_INDEX_CHANGED")
 strict_equal(data["releaseApprovals"],{k:False for k in BLOCKED},
              "SECURITY_RELEASE_ESCALATION")
 strict_equal(data["restrictions"],{k:True for k in LIMITS},
              "HOSTED_DB_OR_RUNTIME_CHANGE_REQUESTED")
 if data["nextGate"]!=NEXT:raise AuditBlocked("NEXT_MANUAL_GATE_DRIFT")
 for path,sha in BLOBS.items():
  file=root/path
  if not file.is_file() or file.is_symlink() or file.stat().st_size>256*1024:
   raise AuditBlocked("MISSING_PINNED_SOURCE")
  if git_blob(file.read_bytes())!=sha:
   raise AuditBlocked("SOURCE_MUTATED")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "r198_private_original_to_live_helper_parity_reconciled":True,
  "read_only_storage_bucket_and_rls_counts_verified":True,
  "current_signed_asset_source_bytes_verified":True,
  "r123_unmounted_teardown_source_bytes_verified":True,
  "signed_url_issuance_rejected_for_revoked_hosted_user_proven":False,
  "existing_3600s_bearer_urls_remotely_revoked":False,
  "real_signed_storage_qa_passed":False,
  "all_83_history_semantics_approved":False,
  "all_67_privileged_chains_approved":False,
  "hosted_sql_or_production_release_authorized":False,
  "no_private_policy_sql_object_paths_tokens_or_user_data_exported":True,
 }

def main()->int:
 parser=argparse.ArgumentParser(description="R199 source-only storage token revocation evidence gate")
 parser.add_argument("--root",type=Path,default=Path.cwd())
 args=parser.parse_args()
 try:
  file=args.root/MANIFEST
  if not file.is_file() or file.is_symlink() or file.stat().st_size>16384:
   raise AuditBlocked("MANIFEST_MISSING")
  obj=json.loads(file.read_text(encoding="utf8"),object_pairs_hook=no_duplicate_json,
    parse_constant=lambda _:( _ for _ in ()).throw(AuditBlocked("NONFINITE")))
  print(json.dumps(validate(obj,args.root),sort_keys=True,indent=2))
  return 0
 except (AuditBlocked,OSError,ValueError,TypeError,KeyError,IndexError,UnicodeError):
  print("R18-199 STORAGE_SIGNED_BEARER_NO_GO: source or authorization proof drift.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
