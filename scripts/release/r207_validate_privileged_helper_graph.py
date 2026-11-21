#!/usr/bin/env python3
"""R207: strict original 12-function live lexical helper graph (NO_GO).

This source-only validator has NO network, original DB, owner private archive,
user data, SQL body, campaign ID or signed URL access. Graph edges are text
matches, not executed authorization or effective Postgres permissions.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys
import r206_private_privileged_function_lineage as historical

WORK="B10-R18-207"
MANIFEST=Path("staging/world-v2-b10-r18-207-privileged-helper-graph/manifest.json")
MANIFEST_BLOB="cf778b88f1a46ab41ee575c907478800cc2ba3e4"
PARENT={"pr":316,"head":"fe36e37480744e661ae003ea9597cb80cda6cfda",
        "focusedCiRun":44918104589,"standardCiRun":44918104592,"draft":True}
RECEIPT={"bytes":11290,
 "sha256":"f9d57b16c6b9babdad47ffea69f0e414fc5299277dabc146fbe4178eb2097471",
 "verifiedOriginalMigrations":83,"latest11BodiesMatchedCurrent":True,
 "exact11EachOneHistoricalDefinition":True,
 "priorR200R198R193LineageReverified":True,
 "noNetworkOrDatabaseAccess":True,"securityApproved":False}
BLOBS={
 "scripts/release/r207_readonly_privileged_helper_graph.sql":"129a00c61fac2a3c55ea724f22aadf17a4436766",
 "tests/world-v2-r18-207-postgres/run.sh":"f21706ede1c6175f0b9884c7c71d639aa44d4016",
}
EDGES=([11],[9],[10],[10],[],[12],[],[10],[12],[],[],[10])
UID={1,10,11,12}
MEMBER={1,10,11}
WRITE={2,6,8}
ISSUES={
 "fogStatusIssue":212,"revokedSheetOwnerIssue":220,"storageBearerIssue":231,
 "inviteRejoinIssue":223,"membershipTruncateIssue":229,"authenticatedTruncateIssue":306}
CAUTIONS=(
 "graphEdgesAreLexicalTextNotExecutedCalls",
 "metadataBeforeWhereIsNotFormalAuthorizationProof",
 "previewMotionNoKnownHelperDoesNotProveVulnerability",
 "doNotConfuseR111PriorityWithChronology",
 "doNotClaimSignedQaFromLocalPgFixture")
UNAPPROVED=(
 "metadataOnlyDisplaySemanticsEstablished","all12HelperBooleanConditionsProven",
 "removedOwnerInventoryReadDeniedOnOriginal","fogStatusOracleRepairedOnOriginal",
 "all67PrivilegedFunctionCallGraphsApproved","all83HistoricalPrivateSqlSemanticsApproved",
 "realSignedDmP1P2RevokedOutsiderQaPassed","hostedQaSqlInstallAuthorized",
 "productionDeploymentAuthorized")
GUARDS=(
 "originalOnlyPgCatalogSelect","onlySyntheticPg17RolesMetadata",
 "noPrivateOriginalSqlFunctionBodiesOrDocketExported","noOriginalOrQaSqlWrites",
 "noApplicationEdgeOrActiveMigrationEdits","noMerge","noDeploy","noPaidResources")
NEXT=("Prioritize exact source semantics of original current fog status and removed "
 "sheet owner controls, and expand remaining 55+ callable privileged RPC graph "
 "reviews. No signed QA, SQL installation or production release until separately authorized.")
EXTRA=("can_edit_campaign_sheet",790,
 "07dd89b2aa9c2e2c4851604de83362da37b3e5bf1716d146fd769b7bb816cb53")

class Blocked(Exception):pass

def unique(pairs):
 d={}
 for k,v in pairs:
  if k in d:raise Blocked("DUPLICATE_JSON_KEY")
  d[k]=v
 return d

def gitblob(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def require(actual,expected,label):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise Blocked(label)
 for k,expected_value in expected.items():
  v=actual[k]
  if type(v) is not type(expected_value) or v!=expected_value:
   raise Blocked(label)

def expected_rows():
 targets=list(historical.TARGETS)+[EXTRA]
 if len(targets)!=12:raise Blocked("TARGET_COUNT")
 return [{
  "slot":i+1,"known_function_name":name,"source_bytes":n,
  "source_sha256":sha,"is_definer":True,
  "auth_exec":i+1 not in (9,12),"anon_exec":False,
  "lexical_callee_slots":list(EDGES[i]),
  "direct_member_marker":i+1 in MEMBER,
  "direct_uid_marker":i+1 in UID,
  "editable_metadata_marker":i==0,
  "metadata_marker_before_first_where":i==0,
  "write_verb_marker":i+1 in WRITE
 } for i,(name,n,sha) in enumerate(targets)]

def validate(data,root:Path,raw:bytes|None=None):
 if raw is None:raw=(root/MANIFEST).read_bytes()
 if gitblob(raw)!=MANIFEST_BLOB:raise Blocked("MANIFEST_GIT_BLOB_DRIFT")
 if not isinstance(data,dict) or set(data)!={
  "schema","workPackage","date","decision","parent",
  "ownerR206SanitizedReceipt","currentOriginalLiveTwelveFunctionLexicalCallGraph",
  "frozenSourceBlobs","provenanceLimitations","unresolvedSecurity",
  "unapprovedClaims","restrictions","nextGate"
 }:raise Blocked("MANIFEST_SCHEMA")
 if type(data["schema"]) is not int or data["schema"]!=1 or data["workPackage"]!=WORK or data["date"]!="2026-11-22" or data["decision"]!="NO_GO":
  raise Blocked("PROVENANCE")
 require(data["parent"],PARENT,"PARENT_CHANGED")
 require(data["ownerR206SanitizedReceipt"],RECEIPT,"OWNER_SANITIZED_REPORT_MISMATCH")
 require(data["frozenSourceBlobs"],BLOBS,"SOURCE_SHA_INDEX_CHANGED")
 require(data["unresolvedSecurity"],ISSUES,"BLOCKER_CHANGED")
 require(data["provenanceLimitations"],{k:True for k in CAUTIONS},
         "STRUCTURAL_EVIDENCE_OVERCLAIMED")
 require(data["unapprovedClaims"],{k:False for k in UNAPPROVED},
         "UNAUTHORIZED_RELEASE_APPROVAL")
 require(data["restrictions"],{k:True for k in GUARDS},"HOSTED_SCOPE")
 if data["nextGate"]!=NEXT:raise Blocked("NEXT_GATE_CHANGED")
 rows=data["currentOriginalLiveTwelveFunctionLexicalCallGraph"]
 expected=expected_rows()
 if type(rows) is not list or len(rows)!=12:raise Blocked("LIVE_TARGET_COUNT")
 for row,expected_row in zip(rows,expected):
  require(row,expected_row,"SOURCE_HASH_OR_GRAPH_EDGE_DRIFT")
 for rel,digest in BLOBS.items():
  p=root/rel
  if not p.is_file() or p.is_symlink() or p.stat().st_size>128*1024:
   raise Blocked("FROZEN_SOURCE_MISSING")
  if gitblob(p.read_bytes())!=digest:raise Blocked("FROZEN_SOURCE_BYTES_CHANGED")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "owner_r206_83_sha_and_11_live_function_matches_reconciled":True,
  "current_original_12_function_source_hashes_matched":True,
  "live_12_function_lexical_callee_graph_frozen":True,
  "inventory_get_chain_reaches_existing_sheet_guard":True,
  "fog_status_has_no_detected_current_membership_helper":True,
  "mutable_account_name_marker_before_where_not_auth_approval":True,
  "original_fog_status_vulnerability_remediated":False,
  "original_sheet_revoked_owner_gap_remediated":False,
  "all_67_privileged_call_graphs_approved":False,
  "all_83_private_history_semantics_approved":False,
  "real_signed_qa_or_hosted_sql_authorized":False,
  "no_private_original_sql_or_signed_tokens_exported":True,
 }

def main():
 parser=argparse.ArgumentParser(description="R207 immutable source-only privileged call graph NO_GO")
 parser.add_argument("--root",type=Path,default=Path.cwd())
 args=parser.parse_args()
 try:
  p=args.root/MANIFEST
  if not p.is_file() or p.is_symlink() or p.stat().st_size>16384:
   raise Blocked("MANIFEST_MISSING")
  raw=p.read_bytes()
  data=json.loads(raw,object_pairs_hook=unique,
   parse_constant=lambda _:( _ for _ in ()).throw(Blocked("NONFINITE")))
  print(json.dumps(validate(data,args.root,raw),sort_keys=True,indent=2))
  return 0
 except (Blocked,OSError,ValueError,TypeError,KeyError,UnicodeError):
  print("R207 PRIVATE_FUNCTION_GRAPH_NO_GO: original fingerprint/source evidence drift.",file=sys.stderr)
  return 2
if __name__=="__main__":raise SystemExit(main())
