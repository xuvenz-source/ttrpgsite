#!/usr/bin/env python3
"""R204 strict original map helper nesting and fictional signed-actor NO_GO."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-204"
MANIFEST=Path("staging/world-v2-b10-r18-204-map-helper-membership/manifest.json")
PARENT={"pr":313,"head":"f70e1528921353dd5c211d23db833d353d652e55",
 "focusedCiSuccess":44907900317,"generalCiSuccess":44907900208,"draft":True}
HELPER={
 "overloads":1,"body_bytes":448,
 "body_sha256":"835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c",
 "security_definer":True,"postgres_owned":True,
 "authenticated_execute":True,"anon_execute_denied":True,
 "or_word_count":1,"and_word_count":5,"exists_word_count":1,
 "member_table_word_count":1,"player_maps_word_count":1,
 "auth_uid_call_count":2,"or_token_offset":393,"or_depth":2,
 "exists_depth":0,"member_depth":1,"player_maps_depth":1,
 "first_uid_depth":0,"second_uid_depth":1,
 "membership_reference_precedes_or":True,
 "player_maps_reference_precedes_or":True,
 "user_editable_metadata_absent":True,
}
OPERATIONS={
 "select_applicable_policy_count":3,
 "only_operation_helper_count":0,"any_operation_helper_count":0,
 "object_list_operation_marker_count":0,
 "authenticated_download_operation_marker_count":0,
 "signed_url_operation_marker_count":0,
 "foldername_marker_count":1,"filename_marker_count":0,
 "owner_id_marker_count":1,"auth_uid_marker_count":2,
 "map_helper_marker_count":1,"editable_metadata_marker_count":0
}
BLOBS={
 "scripts/release/r204_readonly_map_helper_or_depth.sql":"5d4b3dae721d92f18d1556b310abf60bda2e9d01",
 "tests/world-v2-r18-204-postgres/run.sh":"8b812fdd3bceb6f29cd822d5e5c0b5eea870db1a",
 "tests/world-v2-r18-203-postgres/run.sh":"eea9a3ddce8a0f4554be87bd352425e710426bc4",
 "scripts/release/r204_readonly_storage_operation_markers.sql":"7aa8b9d7c092c87ab04310ab1a8c245a188560cf"
}
TRUE_CLAIMS=("liveMapHelperOrLexicallyNestedDeeperThanMembershipReference",)
FALSE_CLAIMS=(
 "safelyProvedFullHelperBooleanAuthSemantics",
 "sourceExactCurrentMapHelperExecutedInScratch",
 "realRemovedCampaignMemberFreshStorageUrlDenied",
 "existingSignedBearerLinksRevoked",
 "all83PrivateHistoricalSqlSemanticsApproved",
 "all67PrivilegedCallGraphsApproved",
 "signedDmP1P2RemovedOutsiderQaPassed",
 "qaSchemaSqlOrProductionReleaseAuthorized",
)
RESTRICTIONS=(
 "originalPgCatalogSelectOnly","onlyFictionalSqlRolesMapAssignmentsAndFixtures",
 "noOriginalSqlPolicyNamesObjectPathsOrSignedTokensExported",
 "noOriginalOrQaWrites","noAppSourceOrActiveMigrationChanges",
 "noMerge","noDeploy","noPaidResources"
)
NEXT=("Privately inspect exact 448-byte current can_view_campaign_map SQL boolean branches "
 "and run independently authorized real signed DM/P1/P2/removed/outsider Storage and "
 "Realtime QA; prove new URL issuance denial, handle existing one-hour URLs, "
 "review 83 semantics and 67 call graphs before deployment.")

class AuditBlocked(Exception):pass

def no_duplicates(pairs):
 out={}
 for key,value in pairs:
  if key in out:raise AuditBlocked("DUPLICATE_JSON")
  out[key]=value
 return out

def strict(actual,expected,label):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise AuditBlocked(label)
 for k,v in expected.items():
  if type(actual[k]) is not type(v) or actual[k]!=v:
   raise AuditBlocked(label)

def blob_sha(data:bytes):
 return hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()

def validate(m:dict,root:Path)->dict:
 if not isinstance(m,dict) or set(m)!={
  "schema","workPackage","date","decision","parent","knownOriginalMapHelper",
  "liveStorageSelectOperationMarkers","sourceGitBlobs","interpretation",
  "restrictions","nextGate"
 }:
  raise AuditBlocked("SCHEMA")
 if (type(m["schema"]) is not int or m["schema"]!=1
  or m["workPackage"]!=WORK or m["date"]!="2026-11-22"
  or m["decision"]!="NO_GO"):
  raise AuditBlocked("PROVENANCE")
 strict(m["parent"],PARENT,"PARENT")
 strict(m["knownOriginalMapHelper"],HELPER,"MAP_HELPER_LIVE_SOURCE_DRIFT")
 strict(m["liveStorageSelectOperationMarkers"],OPERATIONS,"STORAGE_OPERATION_DRIFT")
 strict(m["sourceGitBlobs"],BLOBS,"SOURCE_INDEX")
 strict(m["interpretation"],
  {**{k:True for k in TRUE_CLAIMS},**{k:False for k in FALSE_CLAIMS}},
  "CLAIMING_UNPROVEN_QA_OR_SEMANTICS")
 strict(m["restrictions"],{k:True for k in RESTRICTIONS},
  "HOSTED_SCOPE_BYPASS")
 if m["nextGate"]!=NEXT:raise AuditBlocked("NEXT_GATE")
 for rel,expected in BLOBS.items():
  path=root/rel
  if not path.is_file() or path.is_symlink() or path.stat().st_size>128*1024:
   raise AuditBlocked("SOURCE_UNAVAILABLE")
  if blob_sha(path.read_bytes())!=expected:raise AuditBlocked("SOURCE_TAMPER")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "current_map_helper_448_byte_fingerprint_and_nesting_pinned":True,
  "all_3_storage_select_policies_lack_operation_discriminator_marker":True,
  "synthetic_pg17_live_shaped_authorization_source_immutable":True,
  "source_exact_current_helper_boolean_semantics_proven":False,
  "real_signed_removed_user_fresh_url_issuance_denial_proven":False,
  "all_83_historical_semantics_approved":False,
  "all_67_privileged_call_chains_approved":False,
  "hosted_qa_or_production_release_authorized":False,
  "no_original_sql_names_paths_keys_or_tokens_exported":True,
 }

def main():
 p=argparse.ArgumentParser(description="R204 source-only original Storage helper NO_GO")
 p.add_argument("--root",type=Path,default=Path.cwd())
 args=p.parse_args()
 try:
  path=args.root/MANIFEST
  if not path.is_file() or path.is_symlink() or path.stat().st_size>16384:
   raise AuditBlocked("MANIFEST_UNAVAILABLE")
  m=json.loads(path.read_text("utf8"),object_pairs_hook=no_duplicates,
   parse_constant=lambda _:( _ for _ in ()).throw(AuditBlocked("NONFINITE")))
  print(json.dumps(validate(m,args.root),indent=2,sort_keys=True))
  return 0
 except (AuditBlocked,KeyError,OSError,ValueError,TypeError,IndexError,UnicodeError):
  print("R18-204 STORAGE_HELPER_NO_GO: original source or release gate drift.",file=sys.stderr)
  return 2

if __name__=="__main__":raise SystemExit(main())
