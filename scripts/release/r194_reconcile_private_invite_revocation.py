#!/usr/bin/env python3
"""R18-194: source-only fail-closed original invite lineage / R120-R122 guard.

Never reads the private original SQL archive or connects to hosted databases.
No signature, ACL, rejoin authorization or production release is approved.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK_PACKAGE="B10-R18-194"
RECEIPT="4a4eeb14225eccb43153138375989c97930f17f4299c026ee5263b3faeef6f75"
MANIFEST=Path("staging/world-v2-b10-r18-194-invite-revocation-lineage-regression/manifest.json")
MAX_MANIFEST=12288
SOURCE_BLOBS={
    "staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql":"f7bda6b79f7b9ac4a3323142c27d54a44436d5a8",
    "staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql":"cc6c778783fc387203dee88cdb25517ba0050bcb",
    "tests/world-v2-r18-120-postgres/run.sh":"3bc1b07c5c1d906117dd47ff0e8daa392c5674ac",
    "tests/world-v2-r18-120-postgres/setup.sql":"7caa4fcc0dd90622683f6bac48edb0047ddf8206",
    "tests/world-v2-r18-120-postgres/verify-contract.sql":"0ff3fd257ec4534974cc16e54352d330fb8a22e8",
    "tests/world-v2-r18-121-postgres/run.sh":"d3584daa47c803b7d7025c04ad785434ef9e60ea",
    "tests/world-v2-r18-121-postgres/campaign-cascade.sql":"91dff03c1e472a60a4ec1bf26366a5e4e871fd13",
    "tests/world-v2-r18-122-postgres/run.sh":"76cbba376f21531426308791fe207054147863f5",
    "tests/world-v2-r18-122-postgres/verify-dm-removed-roster.sql":"068f4dd191c44eeb75655fde37099f221f3bdca7",
    "tests/world-v2-r18-120-revocation-contract.test.mjs":"57b7f575eecd711600f99383193f290db909460e",
    "tests/world-v2-r18-121-membership-source-boundary.test.mjs":"b1d00c9d25850365c311e8a91b0a0333f9fafde6",
    "tests/world-v2-r18-122-member-admin-contract.test.mjs":"f6d994ef5bf565e51a690f6a2a57be23b7cc5df4",
}
NO_GO_FLAGS=(
    "all83HistoricalMigrationSemanticsApproved",
    "all67PrivilegedFunctionCallChainsApproved",
    "finalRoleGrantRLSSemanticsApproved",
    "existingServiceRoleTruncateBypassFixed",
    "realSignedDmP1P2RevokedOutsiderQaPassed",
    "qaHistoricalMigrationInstallAuthorized",
    "originalOrProductionDeploymentAuthorized",
)
RESTRICTIONS=(
    "noOriginalPrivateSqlOrFunctionBodiesPublished",
    "noHostedOriginalOrQaSqlAccessOrWrites",
    "noApplicationRuntimeChanges",
    "noVersionedMigrations",
    "noMerge",
    "noDeployment",
    "noPaidResources",
)
EXPECTED_NEXT=("No private WSL re-run needed; existing synthetic prototype is not a hosted fix. "
    "Before QA SQL installation separately review all 83 historical migration semantics, "
    "live DM removal paths, service-role TRUNCATE and signed multiuser security tests.")

class AuditBlocked(Exception):
    pass

def unique(pairs):
    obj={}
    for k,v in pairs:
        if k in obj:
            raise AuditBlocked("DUPLICATE_JSON_KEY")
        obj[k]=v
    return obj

def blob_sha(raw:bytes)->str:
    return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def check_source_blobs(root:Path)->None:
    for rel,sha in SOURCE_BLOBS.items():
        file=root/rel
        if not file.is_file() or file.is_symlink() or file.stat().st_size > 256*1024:
            raise AuditBlocked("MISSING_OR_OVERSIZE_FROZEN_SOURCE")
        if blob_sha(file.read_bytes())!=sha:
            raise AuditBlocked("FROZEN_PROTOTYPE_CHANGED")

def validate(data:dict,root:Path)->dict:
    if not isinstance(data,dict) or set(data)!={
        "schema","workPackage","date","decision","parent","ownerR193Receipt",
        "liveFunctionSourceSnapshot","inheritedRepairEvidence","frozenSourceBlobs",
        "releaseGates",*RESTRICTIONS,"nextGate"}:
        raise AuditBlocked("MANIFEST_SHAPE_CHANGED")
    if (type(data["schema"]) is not int or data["schema"]!=1
        or data["workPackage"]!=WORK_PACKAGE or data["date"]!="2026-11-21"
        or data["decision"]!="NO_GO"
        or data["parent"]!={"pr":302,"headSha":"10e9178895144b20fb9b584b005eb6664c8198f7"}):
        raise AuditBlocked("PARENT_PROVENANCE_MISMATCH")
    if data["ownerR193Receipt"]!={
        "sizeBytes":2616,"sha256":RECEIPT,
        "verifiedPrivateHistoryFiles":83,"uniqueMigrationChronology":True,
        "create":{"historicalDefinitions":1,"matchingCurrentLiveBodyCount":1,
                  "latestR111PriorityDocketIndexNotChronological":2,"latestStatementOrdinal":12,
                  "latestBodyMatchesLive":True},
        "join":{"historicalDefinitions":2,"matchingCurrentLiveBodyCount":1,
                "latestR111PriorityDocketIndexNotChronological":28,"latestStatementOrdinal":4,
                "latestBodyMatchesLive":True},
    }:
        raise AuditBlocked("PRIVATE_SOURCE_RECEIPT_MISMATCH")
    if data["liveFunctionSourceSnapshot"]!={
        "joinCampaign":{"bodyBytes":742,"sha256":"5f3a7dbcadc4361f59fa814a820b84cfb2cc0d89f685ae6194efe3912d015655"},
        "createCampaign":{"bodyBytes":475,"sha256":"0ea1e01ba784dfa78e92c8e82a3ca2b2d28a19920f5286cc7423d1e891be645f"},
    }:
        raise AuditBlocked("LIVE_FUNCTION_DIGEST_MISMATCH")
    e=data["inheritedRepairEvidence"]
    if not isinstance(e,dict) or set(e)!={
        "sourceExactOriginalInviteReuseSyntheticObserved","originalSourceExactPrivatePg17Issue",
        "existingDraftPrototypePrs","productPolicy","standaloneSyntheticPG17NotHostedSignedAuth",
        "postDeleteCampaignCascadeRegressionPassedPreviously","privilegedTruncateGapRemainsUnresolved",
        "clientAdminControllerIsStagedUnmounted"
    }:
        raise AuditBlocked("PROTOTYPE_EVIDENCE_SCHEMA")
    if (e["sourceExactOriginalInviteReuseSyntheticObserved"] is not True
        or type(e["originalSourceExactPrivatePg17Issue"]) is not int
        or e["originalSourceExactPrivatePg17Issue"]!=223
        or e["existingDraftPrototypePrs"]!=[226,227,228]
        or e["productPolicy"]!=
            "A DM-removed member cannot rejoin using an unchanged generic invite without explicit DM reinstatement. Voluntary leave remains a separate flow."
        or any(e[name] is not True for name in (
            "standaloneSyntheticPG17NotHostedSignedAuth",
            "postDeleteCampaignCascadeRegressionPassedPreviously",
            "privilegedTruncateGapRemainsUnresolved",
            "clientAdminControllerIsStagedUnmounted"
        ))):
        raise AuditBlocked("PROTOTYPE_EVIDENCE_CHANGED")
    if data["frozenSourceBlobs"]!=SOURCE_BLOBS:
        raise AuditBlocked("FROZEN_SOURCE_SHA_INDEX_CHANGED")
    r=data["releaseGates"]
    if not isinstance(r,dict) or set(r)!=set(NO_GO_FLAGS) or any(r[k] is not False for k in NO_GO_FLAGS):
        raise AuditBlocked("RELEASE_GATES_NOT_CLOSED")
    if any(data[k] is not True for k in RESTRICTIONS) or data["nextGate"]!=EXPECTED_NEXT:
        raise AuditBlocked("LIVE_RELEASE_OR_HOSTED_ACTION_NOT_BLOCKED")
    check_source_blobs(root)
    return {
        "work_package":WORK_PACKAGE,
        "decision":"NO_GO",
        "r193_private_source_matches_live_reconciled":True,
        "current_join_and_create_function_body_sha_pinned":True,
        "frozen_unapplied_revocation_prototypes_verified":True,
        "synthetic_pg17_concurrency_and_dm_contracts_require_replay":True,
        "privileged_truncate_authorization_issue_resolved":False,
        "signed_multiuser_qa_passed":False,
        "all_83_original_history_semantics_approved":False,
        "all_67_privileged_call_chains_approved":False,
        "hosted_sql_or_production_release_authorized":False,
        "no_source_sql_or_user_data_exported":True,
    }

def main()->int:
    p=argparse.ArgumentParser(description="R194 private join/create vs prior revocation prototype gate")
    p.add_argument("--root",type=Path,default=Path.cwd())
    args=p.parse_args()
    try:
        source=args.root/MANIFEST
        if not source.is_file() or source.is_symlink() or source.stat().st_size>MAX_MANIFEST:
            raise AuditBlocked("MANIFEST_FILE_INVALID")
        data=json.loads(source.read_text(),object_pairs_hook=unique,
                        parse_constant=lambda _:( _ for _ in ()).throw(AuditBlocked("NONFINITE")))
        print(json.dumps(validate(data,args.root),sort_keys=True,indent=2))
        return 0
    except (AuditBlocked,OSError,ValueError,TypeError,KeyError,IndexError):
        print("R18-194 INVITE_REVOCATION_LINEAGE_NO_GO: source/receipt drift; no hosted SQL permitted.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
