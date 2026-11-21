#!/usr/bin/env python3
"""R18-198 strict staged live-source fingerprint and frozen R115 test ledger.

Source-only: does not read private originals, connect to Supabase or run SQL.
Tests only synthetic Git-tracked fixture sources. It never certifies hosted QA.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-198"
MANIFEST=Path("staging/world-v2-b10-r18-198-private-sheet-auth-lineage/manifest.json")
BLOBS={
 "staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql":"380f7fd4fcd75fc17c76af8b851d86c068616420",
 "tests/world-v2-r18-115-postgres/run.sh":"1e5b6d413116251c3077b89ae292fae6fc60cefd",
 "tests/world-v2-r18-115-postgres/extract-lease-source.py":"62dc53c44d67bcf5cf1ed379ed6c177a9baae53f",
 "tests/world-v2-r18-114-postgres/run.sh":"403cfca912c434780ebd68b2d54af55f59dfd402",
 "tests/world-v2-r18-115-postgres/verify-revocation-candidate.sql":"dabdcc808f23358b3ce3fd135e0ed2ecce164ac9",
 "tests/world-v2-r18-115-postgres/verify-lease-and-revocation-baseline.sql":"6d5820c4eb4d29a9df0a25ceee7f2c95f2c840a7",
}
FUNCTIONS={
 "can_edit_campaign_sheet":{"liveBodies":1,"bytes":790,
  "sha256":"07dd89b2aa9c2e2c4851604de83362da37b3e5bf1716d146fd769b7bb816cb53",
  "md5":"5a8fed2bdc8427c884f89440c0eebe03","authenticatedExecute":False,
  "directAuthIdentityMarker":True,"directCampaignMembersMarker":False},
 "claim_campaign_sheet_item":{"liveBodies":1,"bytes":1379,
  "sha256":"7c7916294b992927098b797e83406eaf6113920231bd22cbb7c8f53e0c4cbf44",
  "md5":"d7932b1e0c2141833537301d75d262e4","authenticatedExecute":True},
 "mutate_campaign_sheet_item":{"liveBodies":1,"bytes":2752,
  "sha256":"8d749e88cd95ab6dd14f781d80bfa114f28396a5ebcd2c1f84b64b38b1f7d5fa",
  "md5":"d2e4affcf04808423830f443ce93e530","authenticatedExecute":True},
 "release_campaign_sheet_item":{"liveBodies":1,"bytes":271,
  "sha256":"e31447390c4a34dac06f1c6a6beaedb33ec9c730f02933e6129c43a54fe2fe22",
  "md5":"f7bc314718884312ce3e1ca48331429f","authenticatedExecute":True},
}
NO_APPROVAL=(
 "all83HistoricalSemanticsApproved",
 "all67PrivilegedCallChainsApproved",
 "historicalFunctionSignatureIdentityProven",
 "revokedOwnerAuthorizationProvenSafe",
 "realSignedDmP1P2RevokedOutsiderQaPassed",
 "qaSqlInstallAuthorized",
 "productionReleaseAuthorized",
)
RESTRICT=(
 "sourceOnly","noOriginalOrQaSqlWrites","noLiveRuntimeChanges",
 "noActiveVersionedMigrations","noMerge","noDeploy","noPaidResources",
)
EXPECTED_MANUAL=("After exact-head CI, owner runs SHA-pinned R198 offline Python in existing "
 "private WSL archive and uploads ONLY r198-sanitized-report.json; no original SQL, "
 "migration filenames, function source/signatures, paths, credentials or invite values.")

class AuditBlocked(Exception):
 pass

def no_duplicates(pairs):
 data={}
 for key,val in pairs:
  if key in data:raise AuditBlocked("DUPLICATE_JSON")
  data[key]=val
 return data

def blob_sha(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def validate(data:dict,root:Path)->dict:
 if not isinstance(data,dict) or set(data)!={
   "schema","workPackage","date","decision","parent","existingGuardPr","issue",
   "knownPublicFunctions","frozenSourceBlobs","privateOfflineScript",
   "privateExistingDependencies","privateExpectedHistorySourceFiles",
   "releaseGuards",*RESTRICT,"nextManualGate",
 }:
  raise AuditBlocked("MANIFEST_SCHEMA")
 if (type(data["schema"]) is not int or data["schema"]!=1
     or data["workPackage"]!=WORK or data["date"]!="2026-11-21"
     or data["decision"]!="NO_GO"
     or data["parent"]!={"pr":307,"sha":"0663a3f37e54078cb0b1e9b3ab97612255e872dc","sourceOnly":True}
     or type(data["existingGuardPr"]) is not int or data["existingGuardPr"]!=219
     or type(data["issue"]) is not int or data["issue"]!=220):
  raise AuditBlocked("PARENT_OR_ISSUE_PROVENANCE")
 if data["knownPublicFunctions"]!=FUNCTIONS:
  raise AuditBlocked("LIVE_FUNCTION_SHA_DRIFT")
 if data["frozenSourceBlobs"]!=BLOBS:
  raise AuditBlocked("R115_FROZEN_SOURCE_INDEX_DRIFT")
 if (data["privateOfflineScript"]!="scripts/release/r198_private_sheet_auth_lineage.py"
     or data["privateExistingDependencies"]!=[
     "r154_private_history_audit.py","r186_private_privileged_statement_inventory.py",
     "r191_private_fog_status_lineage.py","r193_private_invite_source_lineage.py"]
     or type(data["privateExpectedHistorySourceFiles"]) is not int
     or data["privateExpectedHistorySourceFiles"]!=83):
  raise AuditBlocked("PRIVATE_SOURCE_CONTRACT_DRIFT")
 gates=data["releaseGuards"]
 if not isinstance(gates,dict) or set(gates)!=set(NO_APPROVAL) or any(
   gates[k] is not False for k in NO_APPROVAL):
  raise AuditBlocked("RELEASE_APPROVAL_ESCALATED")
 if any(data[k] is not True for k in RESTRICT) or data["nextManualGate"]!=EXPECTED_MANUAL:
  raise AuditBlocked("HOSTED_ACTION_NOT_BLOCKED")
 for path,sha in BLOBS.items():
  p=root/path
  if not p.is_file() or p.is_symlink() or p.stat().st_size>256*1024:
   raise AuditBlocked("MISSING_OR_OVERSIZE_SOURCE")
  if blob_sha(p.read_bytes())!=sha:
   raise AuditBlocked("FROZEN_R115_SOURCE_TAMPER")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "read_only_live_sheet_helper_and_lease_sources_sha_reconciled":True,
  "r115_unapplied_revoked_owner_guard_git_blob_verified":True,
  "r114_r115_disposable_pg17_source_guard_verified":True,
  "owner_private_r198_report_received":False,
  "all_83_historical_semantics_approved":False,
  "all_67_live_privileged_chains_approved":False,
  "signed_qa_passed":False,
  "hosted_sql_or_production_release_authorized":False,
  "no_private_sql_or_user_data_exported":True,
 }

def main()->int:
 p=argparse.ArgumentParser(description="R198 source-only revoked sheet owner evidence gate")
 p.add_argument("--root",type=Path,default=Path.cwd())
 args=p.parse_args()
 try:
  file=args.root/MANIFEST
  if not file.is_file() or file.is_symlink() or file.stat().st_size>8192:
   raise AuditBlocked("MANIFEST_INVALID")
  data=json.loads(file.read_text(encoding="utf8"),object_pairs_hook=no_duplicates,
    parse_constant=lambda _:(_ for _ in ()).throw(AuditBlocked("NONFINITE")))
  print(json.dumps(validate(data,args.root),indent=2,sort_keys=True))
  return 0
 except (AuditBlocked,OSError,TypeError,ValueError,KeyError,IndexError,UnicodeError):
  print("R18-198 SHEET_SOURCE_GUARD_NO_GO: source or approval drift.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
