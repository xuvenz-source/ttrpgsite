#!/usr/bin/env python3
"""R208: immutable original 8 privileged write/cleanup source markers, NO_GO.

No database, private historical SQL, original function body or user data is
read here. All current source metadata was computed by SELECT-only catalog
queries in original and frozen. Lexical words are NOT authorization semantics.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-208"
MANIFEST=Path("staging/world-v2-b10-r18-208-privileged-cleanup-census/manifest.json")
MANIFEST_BLOB="15c2e11a8939f3826239ac3d3f4c0ba1fe28deee"
PARENT={"pr":317,"head":"646d46331f72ab4b30c3eb994c0c1c9c47e80769",
        "focusedCiRun":44922049841,"standardCiRun":44922049744,"draft":True}
RECEIPT="f9d57b16c6b9babdad47ffea69f0e414fc5299277dabc146fbe4178eb2097471"
AGGREGATES={"total":67,"noDirectUid":7,"noDetectedPublicCallee":14,
 "noUidAndNoDetectedPublicCallee":2,"writeVerbCount":43,
 "writeVerbWithoutPublicCallee":8,
 "writeVerbWithoutUidAndWithoutCallee":0,
 "writeWithoutSpecifiedKnownGuardMarker":8,
 "editableMetadataWordCount":1,"truncateWordCount":0}
BLOBS={
 "scripts/release/r208_readonly_cleanup_privilege_census.sql":
   "4c3626fdc761f357804ab73db9b7c8bccc97596e",
 "tests/world-v2-r18-115-postgres/run.sh":
   "1e5b6d413116251c3077b89ae292fae6fc60cefd"}
TARGETS=(
 ("advance_world_motion_v2",1150,2,"e7db4514671ba202c5e7bede0a53389cb03a862cf4c943bf0400b3c540a245dd"),
 ("cancel_world_motion_v2",205,2,"f5921218afb0a8d467fac397aec8a1d93ee9642bc57e6aefe6db6f0baf2b1931"),
 ("end_authorized_navigation_gesture",170,2,"905162758cb51c221361ea07f4ad33b2a40c4b1349d6ec274f33dadc817aabba"),
 ("end_map_motion_previews",535,2,"0af8c21219a4886736dd5cfa275aaab1ed25160e60c8ef932642080d6a2ce863"),
 ("end_map_motion_sessions",682,1,"b8f4a5a49a748e3ee7caccb77ae3c2f99ecc04adfe93e444768db1eb95efeadb"),
 ("get_authorized_map_fog_delta",3088,1,"82502082dac21b3bc2a4ed665b8cee7fcd8fcf591789b046d94a4e113ed81a0a"),
 ("release_campaign_sheet_item",271,2,"e31447390c4a34dac06f1c6a6beaedb33ec9c730f02933e6129c43a54fe2fe22"),
 ("release_campaign_tool_item",220,1,"1dbf377382055c05e60e7ef982f16eb53af589f16ef88094b793bb40e29cac01")
)
FOCUS_FIELDS=("user_id_word","holder_id_word","actor_id_word",
 "campaign_id_word","map_id_word","token_id_word","session_id_word",
 "delete_word","update_word","insert_word","for_update_word",
 "fog_guard_helper_word","preview_cleanup_helper_word")
FOCUS=(
 (0,0,1,0,0,0,0,0,1,0,1,0,0),
 (0,0,1,0,0,0,0,1,0,0,0,0,0),
 (0,0,1,0,0,0,0,1,0,0,0,0,0),
 (0,0,1,0,1,0,0,1,0,0,0,0,0),
 (0,0,1,0,1,0,0,1,0,0,0,0,1),
 (1,0,0,0,1,0,0,0,1,1,1,1,0),
 (0,1,0,1,0,0,0,1,0,0,0,0,0),
 (0,1,0,0,0,0,0,1,0,0,0,0,0)
)
FALSE_CLAIMS=(
 "lexicalDmlWordsAreExecutedWritesProven",
 "absenceOfMembershipHelperIsVulnerabilityProven",
 "advanceMotionRevokedActorDeniedOnHosted",
 "allEightOwnershipAndCampaignGuardsReviewed",
 "sourceExactToolItemOwnStaleLeaseReleaseTested",
 "currentOriginalFogDeltaHelperFullAuthorizationProven",
 "all67AuthCallableDefinerCallGraphsReviewed",
 "all83PrivateMigrationsSemanticallyReviewed",
 "realSignedMultiaccountQaPassed",
 "originalOrQaSqlAuthorized","productionDeployAuthorized"
)
TRUE_CLAIMS=("sourceExactSheetOwnStaleLeaseReleaseRecheckedInScratch",)
GUARDS=("originalPgCatalogSelectOnly","noHostedRawFunctionSqlOrPrivateHistoryExported",
 "onlyExistingGitHubDisposablePg17SheetLeaseFixture","noOriginalOrQaDatabaseWrites",
 "noAppEdgeOrActiveMigrationChanges","noMerge","noDeploy","noPaidResources")
NEXT=("Privately inspect actor_id/holder_id/campaign bindings on current motion, fog "
 "delta and lease cleanup paths; keep own stale-lease release working while denying "
 "cross-actor actions; require signed DM/P1/P2/revoked/outsider QA before release.")

class Blocked(Exception):pass
def unique(pairs):
 d={}
 for k,v in pairs:
  if k in d:raise Blocked("DUPLICATE_KEY")
  d[k]=v
 return d
def gitblob(raw):
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()
def strict(actual,expected,why):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise Blocked(why)
 for k,v in expected.items():
  if type(actual[k]) is not type(v) or actual[k]!=v:raise Blocked(why)
def expected_rows():
 rows=[]
 for i,(name,size,nuid,sha) in enumerate(TARGETS):
  r={"known_rpc_name":name,"source_bytes":size,"source_sha256":sha,
     "language":"plpgsql","postgres_owned":True,"empty_search_path":True,
     "auth_exec":True,"anon_exec":False,"uid_calls":nuid,"has_where_word":True,
     "editable_metadata_word":False}
  r.update({k:bool(v) for k,v in zip(FOCUS_FIELDS,FOCUS[i])})
  returnrows_dummy=None
  rows.append(r)
 return rows
def validate(m,root,raw=None):
 if raw is None:raw=(root/MANIFEST).read_bytes()
 if gitblob(raw)!=MANIFEST_BLOB:raise Blocked("MANIFEST_FINGERPRINT_CHANGED")
 if not isinstance(m,dict) or set(m)!={
  "schema","workPackage","date","decision","parent",
  "privateOwnerR206ReceiptSha256","current67DefinerSourceTriage",
  "originalCurrentEightLiveSourceMarkers","frozenGitSourceBlobs",
  "interpretation","guards","nextGate"
 }:raise Blocked("MANIFEST_SCHEMA")
 if type(m["schema"]) is not int or m["schema"]!=1 or m["workPackage"]!=WORK or m["date"]!="2026-11-22" or m["decision"]!="NO_GO":
  raise Blocked("PROVENANCE")
 strict(m["parent"],PARENT,"PARENT")
 if m["privateOwnerR206ReceiptSha256"]!=RECEIPT:raise Blocked("OWNER_REPORT_SHA_CHANGED")
 strict(m["current67DefinerSourceTriage"],AGGREGATES,"LIVE_67_CENSUS")
 strict(m["frozenGitSourceBlobs"],BLOBS,"SOURCE_INDEX")
 strict(m["interpretation"],{**{k:False for k in FALSE_CLAIMS},
                              **{k:True for k in TRUE_CLAIMS}},"UNSAFE_APPROVAL")
 strict(m["guards"],{k:True for k in GUARDS},"HOSTED_SCOPE")
 if m["nextGate"]!=NEXT:raise Blocked("NEXT_GATE")
 rows=m["originalCurrentEightLiveSourceMarkers"]
 if type(rows) is not list or len(rows)!=8:raise Blocked("EXPECTED_EIGHT")
 for observed,expected in zip(rows,expected_rows()):
  strict(observed,expected,"LIVE_FUNCTION_SHA_OR_MARKER_DRIFT")
 for rel,sha in BLOBS.items():
  p=root/rel
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise Blocked("SOURCE_MISSING")
  if gitblob(p.read_bytes())!=sha:raise Blocked("SOURCE_CHANGED")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "live_67_definer_source_census_reconciled":True,
  "eight_current_cleanup_write_rpc_source_hashes_pinned":True,
  "all_eight_current_sources_have_auth_uid_text":True,
  "no_direct_campaign_membership_is_a_proven_vulnerability":False,
  "verified_stale_own_sheet_lease_release_only_in_disposable_fixture":True,
  "hosted_revoked_actor_movement_denied_proven":False,
  "original_tool_lease_owner_semantics_proven":False,
  "all_67_callable_privileged_chains_approved":False,
  "hosted_sql_or_production_release_authorized":False,
  "no_original_private_sql_or_user_data_exported":True
 }
def main():
 ap=argparse.ArgumentParser(description="R208 privileged cleanup source-only NO_GO")
 ap.add_argument("--root",type=Path,default=Path.cwd())
 args=ap.parse_args()
 try:
  p=args.root/MANIFEST
  if not p.is_file() or p.is_symlink() or p.stat().st_size>16384:
   raise Blocked("MANIFEST")
  raw=p.read_bytes()
  m=json.loads(raw,object_pairs_hook=unique,
    parse_constant=lambda _:( _ for _ in ()).throw(Blocked("NONFINITE")))
  print(json.dumps(validate(m,args.root,raw),sort_keys=True,indent=2))
  return 0
 except (Blocked,OSError,KeyError,ValueError,TypeError,UnicodeError):
  print("R208 CLEANUP_AUTH_NO_GO: original evidence or scope drift.",file=sys.stderr)
  return 2
if __name__=="__main__":raise SystemExit(main())
