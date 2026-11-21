#!/usr/bin/env python3
"""R211 source-only owner-private offline QA preflight delivery check.

GitHub CI never receives original SQL/filenames, R111 docket, Auth/Storage
records, JWTs, credentials or user URLs. Exact reviewed manifest + source
Git blobs enforce no QA/production SQL and immutable prep-only scope.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-211"
MANIFEST=Path("staging/world-v2-b10-r18-211-private-qa-schema-preflight/manifest.json")
MANIFEST_BLOB="161523514b0ebe51df9268d104ce94a7d73c2515"

class Blocked(Exception):
    pass

def no_duplicates(pairs):
    out={}
    for key,value in pairs:
        if key in out:
            raise Blocked("R211_DUPLICATE_JSON_KEY")
        out[key]=value
    return out

def gitblob(raw:bytes)->str:
    return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def canonical(data)->str:
    return json.dumps(data,sort_keys=True,separators=(",",":"),allow_nan=False)

def validate(m:dict,root:Path,raw:bytes|None=None)->dict:
    if raw is None:raw=(root/MANIFEST).read_bytes()
    if gitblob(raw)!=MANIFEST_BLOB:
        raise Blocked("R211_MANIFEST_BYTES_DRIFT")
    trusted=json.loads(raw,object_pairs_hook=no_duplicates)
    if not isinstance(m,dict) or canonical(m)!=canonical(trusted):
        raise Blocked("R211_MANIFEST_CONTENT_DRIFT")
    if (m["schema"]!=1 or type(m["schema"]) is not int or
        m["workPackage"]!=WORK or m["decision"]!="NO_GO" or
        m["parent"]["head"]!="4b39a4173e7643b9a35acdd8b398cc0d322b87b3"):
        raise Blocked("R211_WRONG_PARENT_OR_SECURITY_RELEASE")
    if m["scope"]!={
        "qaOnlySchemaPreparationUserAuthorized":True,
        "qaSqlInstallationUserAuthorized":False,
        "originalSqlWritesAuthorized":False,
        "productionDeploymentAuthorized":False,
        "freeResourcesOnly":True
    }:
        raise Blocked("R211_FORGED_INSTALL_APPROVAL")
    if m["privateOriginalSourceState"]["migrationsShaVerified"]!=83:
        raise Blocked("R211_PRIVATE_ARCHIVE_BASIS_INVALID")
    if m["readOnlyBaseline"]["qaPublicTables"]!=0 or m["readOnlyBaseline"]["qaPublicFunctions"]!=0:
        raise Blocked("R211_QA_SCHEMA_NOT_BLANK")
    if m["ownerLocalPreflight"]["ownerPrivateReportReceived"] is not False:
        raise Blocked("R211_NO_OWNER_RESULT_YET")
    if any(x is not False for x in m["releaseApprovals"].values()):
        raise Blocked("R211_RELEASE_APPROVAL_FORGED")
    if any(x is not True for x in m["restrictions"].values()):
        raise Blocked("R211_HOSTED_SCOPE_FORGED")
    for rel,expected_sha in m["sourceBlobs"].items():
        source=root/rel
        if not source.is_file() or source.is_symlink() or source.stat().st_size>128*1024:
            raise Blocked("R211_SOURCE_FILE_UNAVAILABLE")
        if gitblob(source.read_bytes())!=expected_sha:
            raise Blocked("R211_SOURCE_GIT_SHA_DRIFT")
    return {
      "work_package":WORK,"decision":"NO_GO",
      "qa_only_preparation_user_authorized":True,
      "qa_sql_installation_user_authorized":False,
      "original_or_production_change_authorized":False,
      "owner_private_83_file_preflight_not_yet_run":True,
      "owner_local_script_and_fictional_tests_sha_pinned":True,
      "no_original_private_sql_uploaded_to_ci":True,
      "no_database_or_network_access_during_source_checks":True,
      "all_83_migration_semantics_approved":False,
      "isolate_qa_install_safe_to_run_proven":False
    }

def main()->int:
    ap=argparse.ArgumentParser(description="R211 source-only preparatory approval/no-SQL gate")
    ap.add_argument("--root",type=Path,default=Path.cwd())
    a=ap.parse_args()
    try:
        target=a.root/MANIFEST
        if not target.is_file() or target.is_symlink() or target.stat().st_size>16384:
            raise Blocked("R211_MANIFEST_UNAVAILABLE")
        raw=target.read_bytes()
        obj=json.loads(raw,object_pairs_hook=no_duplicates,
          parse_constant=lambda _:( _ for _ in ()).throw(Blocked("R211_NONFINITE")))
        print(json.dumps(validate(obj,a.root,raw),indent=2,sort_keys=True))
        return 0
    except Exception:
        print("R211 QA_PRIVATE_SCHEMA_PREFLIGHT_NO_GO: source or approval scope changed.",
              file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
