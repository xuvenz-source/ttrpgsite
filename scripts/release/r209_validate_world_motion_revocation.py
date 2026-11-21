#!/usr/bin/env python3
"""R209 current original phase source SHA/lexical gate, irrevocable NO_GO.

No hosted/database/network access. Original source SQL never exported.
An observed map helper BEFORE an UPDATE word does NOT prove the helper is
unconditionally enforced or that revoked live actor requests are denied.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-209"
MANIFEST=Path("staging/world-v2-b10-r18-209-revocation-between-phases/manifest.json")
MANIFEST_SHA="ef2d884afdd9fc00686c6da80d1798fcd2107025"
PARENT={"pr":318,"head":"98947a532e199b9ecf40f09f2a2f310a22f3b037",
        "focusedCiRun":44922737668,"standardCiRun":44922737602,"draft":True}
RECEIPT="f9d57b16c6b9babdad47ffea69f0e414fc5299277dabc146fbe4178eb2097471"
BLOBS={
 "scripts/release/r209_readonly_world_motion_phase_gates.sql":
  "1655eaa636adb7959fb4e9cf2e9fc102da7b4f2a",
 "tests/world-v2-r18-209-postgres/run.sh":
  "77ff4b9dba7a715eadb4f3bb33d35fd25a2f99c3",
}
PHASES=(
 ("begin_world_motion_v2",7,5561,
  "37e262934e6d6a7c48e46fe59165d54f60f97221656724ca47852a3dcc350f14",
  False,True,True,False,811,886,0,0,0,True,True,True,False),
 ("advance_world_motion_v2",6,1150,
  "e7db4514671ba202c5e7bede0a53389cb03a862cf4c943bf0400b3c540a245dd",
  False,False,False,True,0,0,302,0,1,False,True,False,False),
 ("commit_world_motion_v2",5,5796,
  "612c25d0d2b2c5edc011c077bdf3e7065f1b5fd9c0b750986b3d09d09c14607d",
  False,True,False,True,811,0,581,4994,3,True,True,True,True),
 ("cancel_world_motion_v2",1,205,
  "f5921218afb0a8d467fac397aec8a1d93ee9642bc57e6aefe6db6f0baf2b1931",
  False,False,False,True,0,0,0,0,0,False,False,True,False),
 ("can_view_campaign_map",2,448,
  "835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c",
  True,False,False,False,0,0,0,0,0,False,False,False,False)
)
NAMES=("known_public_rpc","input_arg_count","body_bytes","body_sha256",
 "direct_membership","map_helper","dm_helper","actor_equals_uid_marker",
 "map_guard_pos","dm_guard_pos","first_row_lock_pos",
 "first_qualified_update_pos","row_lock_count","insert_word",
 "update_word","delete_word","map_helper_before_first_qualified_update")
LIMITS=(
 "beginHasLiveDirectMapHelperAndDmGuardWords",
 "advanceHasLiveDirectActorEqualityButNoDetectedMapGuard",
 "commitHasLiveMapGuardBeforeFirstSchemaQualifiedUpdateWord",
 "cancelHasLiveDirectActorEqualityNoDetectedCurrentMembership",
 "liveMapHelperReferencesCurrentCampaignMembers",
 "lexicalOrderingIsNotFormalControlFlowProof",
 "fictionalWorldMotionRegressionIsNotSourceExactLiveSql",
 "sourceIdentityIsNotSignedUserAuthorization")
UNAPPROVED=(
 "realRevokedMemberCannotAdvanceSessionOnHosted",
 "realRevokedMemberCannotCommitFinalTokenOnHosted",
 "actualWorldMotionAllControlFlowBranchesSemanticallyApproved",
 "realRevokedUserMaySafelyCancelOnlyOwnSessionVerified",
 "runtimeActorIdBindingAndRlsVerified",
 "mapHelperCurrentMembershipEnforcedInAllCommitPaths",
 "all67PrivilegedCallGraphsReviewed","all83PrivateMigrationSemanticsReviewed",
 "signedDmP1P2RemovedOutsiderQaPassed",
 "originalOrQaSqlInstallationAuthorized",
 "productionReleaseAuthorized")
GUARDS=(
 "originalOnlyPgCatalogSelect","noOriginalFunctionOrPrivateSqlExport",
 "onlyFictionalLoopbackPg17WorldMotionFixture","noOriginalOrQaWrites",
 "noAppRuntimeActiveMigrationOrEdgeChanges","noMerge","noDeploy",
 "noPaidResources")
NEXT=("Continue source-exact boolean control-flow review for begin/advance/commit/cancel "
 "and map visibility; check signed DM/P1/P2/removed/outsider mid-session revocation "
 "only after separate isolated QA authorization. Never treat an actor-owned staged "
 "session as permission to commit final token state.")

class Blocked(Exception):pass

def unique(pairs):
 out={}
 for key,val in pairs:
  if key in out:raise Blocked("DUPLICATE_JSON")
  out[key]=val
 return out

def gitblob(raw:bytes):
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def require(actual,expected,which):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise Blocked(which)
 for key,expected_value in expected.items():
  v=actual[key]
  if type(v) is not type(expected_value) or v!=expected_value:
   raise Blocked(which)

def expected_rows():
 rows=[]
 for value in PHASES:
  row=dict(zip(NAMES,value))
  row.update(prosecdef=True,postgres_owned=True,empty_search_path=True,
             auth_callable=True,anon_callable=False,direct_uid=True)
  rows.append(row)
 return rows

def validate(m:dict,root:Path,raw:bytes|None=None):
 if raw is None:raw=(root/MANIFEST).read_bytes()
 if gitblob(raw)!=MANIFEST_SHA:raise Blocked("MANIFEST_BYTES_CHANGED")
 if not isinstance(m,dict) or set(m)!={
  "schema","workPackage","date","decision","parent",
  "ownerR206SanitizedReportSha256",
  "originalCurrentWorldV2FourPhasesAndMapVisibility",
  "frozenGitSourceBlobs","evidenceBoundaries","unapprovedClaims",
  "restrictions","nextGate"
 }:raise Blocked("MANIFEST_SCHEMA")
 if type(m["schema"]) is not int or m["schema"]!=1 or m["workPackage"]!=WORK or m["date"]!="2026-11-22" or m["decision"]!="NO_GO":
  raise Blocked("PROVENANCE")
 require(m["parent"],PARENT,"PARENT")
 if m["ownerR206SanitizedReportSha256"]!=RECEIPT:
  raise Blocked("PRIVATE_OWNER_RECEIPT")
 require(m["frozenGitSourceBlobs"],BLOBS,"FROZEN_SOURCES")
 require(m["evidenceBoundaries"],{k:True for k in LIMITS},"EVIDENCE_OVERCLAIM")
 require(m["unapprovedClaims"],{k:False for k in UNAPPROVED},"PREMATURE_QA_GO")
 require(m["restrictions"],{k:True for k in GUARDS},"HOSTED_SCOPE")
 if m["nextGate"]!=NEXT:raise Blocked("NEXT_GATE")
 rows=m["originalCurrentWorldV2FourPhasesAndMapVisibility"]
 if type(rows) is not list or len(rows)!=5:raise Blocked("LIVE_PHASE_COUNT")
 for row,expected in zip(rows,expected_rows()):
  require(row,expected,"ORIGINAL_PHASE_SHA_OR_GATE_POSITION_CHANGED")
 for relative,expected_sha in BLOBS.items():
  path=root/relative
  if not path.is_file() or path.is_symlink() or path.stat().st_size>128*1024:
   raise Blocked("SOURCE_UNAVAILABLE")
  if gitblob(path.read_bytes())!=expected_sha:
   raise Blocked("SOURCE_TAMPER")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "five_original_current_function_source_hashes_pinned":True,
  "begin_refs_member_gated_map_helper_and_dm_guard":True,
  "advance_actor_ownership_word_without_map_guard_word":True,
  "commit_map_guard_word_before_first_qualified_update_word":True,
  "cancel_actor_ownership_marker_without_membership_marker":True,
  "live_signed_mid_session_revoke_commit_denial_verified":False,
  "all_67_definer_call_chains_approved":False,
  "all_83_private_history_semantics_approved":False,
  "hosted_qa_or_production_release_authorized":False,
  "no_private_function_sql_or_signed_identity_exported":True
 }

def main():
 p=argparse.ArgumentParser(description="R209 immutable original world movement phase NO_GO")
 p.add_argument("--root",type=Path,default=Path.cwd())
 args=p.parse_args()
 try:
  manifest=args.root/MANIFEST
  if not manifest.is_file() or manifest.is_symlink() or manifest.stat().st_size>16384:
   raise Blocked("MANIFEST_UNAVAILABLE")
  raw=manifest.read_bytes()
  obj=json.loads(raw,object_pairs_hook=unique,
    parse_constant=lambda _:( _ for _ in ()).throw(Blocked("NONFINITE")))
  print(json.dumps(validate(obj,args.root,raw),indent=2,sort_keys=True))
  return 0
 except (Blocked,OSError,TypeError,KeyError,UnicodeError,ValueError):
  print("R209 WORLD_MOTION_REVOKE_NO_GO: original source, gate or hosted scope drift.",file=sys.stderr)
  return 2
if __name__=="__main__":raise SystemExit(main())
