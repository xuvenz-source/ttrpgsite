#!/usr/bin/env python3
"""R205 fail-closed immutable current authenticated-callable SECURITY DEFINER census.

Only source files, known public routine identifiers and PostgreSQL-generated
counts/body hashes. No hosted connection, function body, signature, user,
credential, private SQL or signed bearer token is read or exported.
These are lexical markers, not an authorization audit approval.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-205"
MANIFEST=Path("staging/world-v2-b10-r18-205-definer-auth-triage/manifest.json")
MANIFEST_BLOB="5dea93bc0857368649b7a7ddf6593dd39a4508a9"
SOURCES={
 "scripts/release/r205_readonly_definer_authorization_census.sql":
   "af4209ada83cde29f71d88ebde2cd9447010c601",
 "scripts/release/r205_readonly_definer_focus_queue.sql":
   "a88b0362469dabfd2b71c4e7ded7fc172c5986f7",
 "tests/world-v2-r18-105-postgres/run.sh":
   "e6a92d934fef4905216f86e18e77e5dba4f17503",
 "tests/world-v2-r18-115-postgres/run.sh":
   "1e5b6d413116251c3077b89ae292fae6fc60cefd",
 "tests/world-v2-r18-114-postgres/run.sh":
   "403cfca912c434780ebd68b2d54af55f59dfd402",
}
QUEUE=[
 "get_campaign_account_names","get_campaign_sheet_inventory",
 "get_dm_map_npc_values","get_npc_token_values","is_map_fog_published",
 "patch_campaign_sheet_noninventory","preview_map_motion",
 "publish_map_environment",
]
HASHES=[
 "bd98b2ec061445b828724d0830f1da245b845a3e9c83fcf7c1a17bd34343c9a6",
 "4b168977eaa254f665fa1f26ed81d7296053bb988b991e60574c1610de0a879e",
 "5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5",
 "2b82239cc0b630d500240b19bc267aeac013f6b78936472fc590d8207e46a9f8",
 "767cbcd8bd4813c0a535fa71bf1ecc3a9cf8a6dd02c239499c0be1737a28c96f",
 "2059d837aea133d1cbe726e9eebb0736d04739ed37b06ed8cfa08dca017efc2b",
 "31720e150e501f186bb0424b2d814d6a480c3e781c202a3209d872b8e0e491dd",
 "425a2336150ea0a1a28cd4d39f6d2b7560b2fb43a0bd25d69d6897ad74b1b32c",
]
BLOCKED=[
 "noDirectUidImpliesVulnerability",
 "userMetadataNameDisplayImpliesAuthorizationBug",
 "existingFogOracleRemediatedOnOriginal",
 "existingRevokedSheetOwnerRemediatedOnOriginal",
 "sourceExactFogSyntheticRegressionProvesRealSignedQa",
 "sourceExactSheetSyntheticRegressionProvesRealSignedQa",
 "all67PrivilegedCallGraphsSemanticallyReviewed",
 "all83HistoricalMigrationSemanticsReviewed",
 "realSignedDmP1P2RevokedOutsiderQaPassed",
 "originalOrQaSqlInstallApproved",
 "productionReleaseApproved",
]
LIMITS=[
 "onlyReadOnlyOriginalPgCatalog","noOriginalFunctionOrPrivateMigrationSqlExported",
 "noArgsSignaturesSecretsJwtUserDataExported",
 "onlyGitHubDisposablePostgres17Fixtures","noAppEdgeOrActiveMigrationChanges",
 "noHostedOriginalOrQaDatabaseWrite","noMerge","noDeploy","noPaidResources"
]

class Blocked(Exception):pass

def unique(pairs):
 obj={}
 for k,v in pairs:
  if k in obj:raise Blocked("DUPLICATE_JSON")
  obj[k]=v
 return obj

def blob(raw:bytes)->str:
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def validate(m:dict,root:Path,raw:bytes|None=None)->dict:
 if raw is None:
  raw=(root/MANIFEST).read_bytes()
 if blob(raw)!=MANIFEST_BLOB:raise Blocked("MANIFEST_BYTES_DRIFT")
 if not isinstance(m,dict) or set(m)!={
   "schema","workPackage","date","decision","parent",
   "originalReadOnlyPublicDefinerCensus","originalKnownFunctionQueue",
   "existingOriginalSourceRegressionBlobs","newOriginalQuerySourceBlobs",
   "knownSecurityBlockers","interpretation","limits","nextGate"
 }:raise Blocked("UNEXPECTED_MANIFEST_KEYS")
 if type(m["schema"]) is not int or m["schema"]!=1 or m["workPackage"]!=WORK or m["date"]!="2026-11-22" or m["decision"]!="NO_GO":
  raise Blocked("PROVENANCE_DRIFT")
 if m["parent"]!={"pr":314,"head":"a3e2b6ceed9be32fdcc767c39ffb2187e81394e2",
   "focusedCiRun":44908475029,"standardCiRun":44908475000,
   "standardPassedOnUnskippedFailedJobRerun":True,"draft":True}:raise Blocked("PARENT")
 agg=m["originalReadOnlyPublicDefinerCensus"]
 if not isinstance(agg,dict) or (agg.get("public_functions_total")!=112
   or agg.get("authenticated_callable_security_definer")!=67
   or agg.get("also_anon_callable")!=0
   or agg.get("postgres_owned")!=67
   or agg.get("empty_search_path")!=67
   or agg.get("missing_direct_uid_marker")!=7
   or agg.get("editable_metadata_marker")!=1
   or agg.get("direct_uid_marker")!=60
   or agg.get("direct_membership_marker")!=10
   or agg.get("min_function_body_bytes")!=102
   or agg.get("max_function_body_bytes")!=12861):raise Blocked("LIVE_CENSUS")
 if (agg["direct_uid_marker"]+agg["missing_direct_uid_marker"]!=67
   or agg["empty_search_path"]+agg["other_search_path"]+agg["no_explicit_search_path"]!=67):
  raise Blocked("LIVE_COUNT_INCONSISTENCY")
 queue=m["originalKnownFunctionQueue"]
 if not isinstance(queue,list) or len(queue)!=8:
  raise Blocked("QUEUE_SIZE")
 for i,(name,sha) in enumerate(zip(QUEUE,HASHES)):
  item=queue[i]
  if item.get("known_public_function_name")!=name or item.get("body_sha256")!=sha:
   raise Blocked("KNOWN_FUNCTION_SHA_DRIFT")
 if (sum(not item["direct_uid"] for item in queue)!=7
     or sum(item["metadata_word"] for item in queue)!=1
     or queue[5]["calls_edit_helper"] is not True
     or queue[4]["exists_word"] is not True
     or sum(item["calls_dm_helper"] for item in queue)!=3):
  raise Blocked("DELEGATION_MARKER_DRIFT")
 if (m["knownSecurityBlockers"]!={"fogStatus":212,"removedSheetOwner":220}
   or set(m["interpretation"])!=set(BLOCKED)
   or any(m["interpretation"][k] is not False for k in BLOCKED)
   or set(m["limits"])!=set(LIMITS)
   or any(m["limits"][k] is not True for k in LIMITS)):
  raise Blocked("UNAUTHORIZED_GO")
 if not m["nextGate"].startswith("Privately review each of the eight"):
  raise Blocked("INVALID_NEXT_GATE")
 expected={**m["existingOriginalSourceRegressionBlobs"],**m["newOriginalQuerySourceBlobs"]}
 if expected!=SOURCES:raise Blocked("SOURCE_INDEX")
 for path,digest in SOURCES.items():
  source=root/path
  if not source.is_file() or source.is_symlink() or source.stat().st_size>128*1024:
   raise Blocked("SOURCE_MISSING")
  if blob(source.read_bytes())!=digest:raise Blocked("SOURCE_TAMPER")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "current_live_privileged_authenticated_definers":67,
  "anonymous_callable_count":0,
  "all_67_current_search_paths_empty":True,
  "seven_no_direct_uid_source_identifiers_sha_reconciled":True,
  "one_user_editable_metadata_word_only_not_proven_auth":True,
  "fog_and_revoked_sheet_existing_guard_source_bytes_pinned":True,
  "signed_qa_or_approval_proven":False,
  "all_67_source_chain_semantics_approved":False,
  "all_83_original_history_semantics_approved":False,
  "hosted_sql_or_production_release_authorized":False,
  "no_raw_source_or_private_user_data_exported":True,
 }

def main():
 parser=argparse.ArgumentParser(description="R205 public definer auth triage source-only NO_GO")
 parser.add_argument("--root",type=Path,default=Path.cwd())
 args=parser.parse_args()
 try:
  f=args.root/MANIFEST
  if not f.is_file() or f.is_symlink() or f.stat().st_size>16_384:
   raise Blocked("MANIFEST_UNAVAILABLE")
  raw=f.read_bytes()
  obj=json.loads(raw,object_pairs_hook=unique,
    parse_constant=lambda _:(_ for _ in ()).throw(Blocked("NONFINITE")))
  print(json.dumps(validate(obj,args.root,raw),sort_keys=True,indent=2))
  return 0
 except (Blocked,OSError,UnicodeError,ValueError,TypeError,KeyError,IndexError):
  print("R205 DEF_AUTH_TRIAGE_NO_GO: original fingerprint, source or release gate drift.",
        file=sys.stderr)
  return 2

if __name__=="__main__":raise SystemExit(main())
