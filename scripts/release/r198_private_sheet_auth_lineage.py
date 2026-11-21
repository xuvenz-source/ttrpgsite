#!/usr/bin/env python3
"""R18-198 owner-local historical privilege-helper lineage.

This read-only script accesses the 83 private original SQL files *only* in
owner's WSL, alongside R154/R186/R191/R193. It NEVER emits source SQL, function
names/signatures, original filenames/paths, credentials or invite codes.
Source identity is not proof of correct authorization or signed QA acceptance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

from r154_private_history_audit import (
    AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
)
import r193_private_invite_source_lineage as r193
from r191_private_fog_status_lineage import strict_migration_version

WORK_PACKAGE="B10-R18-198"
TARGET={
    "name":"can_edit_campaign_sheet",
    "body_sha256":"07dd89b2aa9c2e2c4851604de83362da37b3e5bf1716d146fd769b7bb816cb53",
    "body_bytes":790,
}
MAX_MATCHES=100

def report(root:Path)->dict:
    # Full R193 original history SHA, private docket and already validated
    # join/create chronology must still match. Do not trust a prior JSON alone.
    prior=r193.report(root)
    if (prior.get("decision")!="NO_GO"
        or prior.get("original_private_history_sha256_verified")!=83
        or prior.get("all_83_migration_versions_valid_unique_chronology") is not True
        or prior.get("targets",{}).get("CREATE",{}).get("historical_direct_definitions")!=1
        or prior.get("targets",{}).get("CREATE",{}).get("latest_sha256_matches_live") is not True
        or prior.get("targets",{}).get("JOIN",{}).get("historical_direct_definitions")!=2
        or prior.get("targets",{}).get("JOIN",{}).get("latest_sha256_matches_live") is not True
        or prior.get("qa_or_production_sql_authorized") is not False):
        raise AuditBlocked("R198_R193_SOURCE_LINEAGE_DRIFT")

    root=checked_dir(root,private=True)
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024))
    items=docket.get("reviewItems")
    if not isinstance(items,list) or len(items)!=83:
        raise AuditBlocked("R198_PRIVATE_DOCKET_NOT_83")
    folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")

    matches=[]
    versions=set()
    chronology_ok=True
    for index,item in enumerate(items,1):
        filename=item["filename"]
        version=strict_migration_version(filename)
        if version is None or version in versions:
            chronology_ok=False
        else:
            versions.add(version)
        source=checked_file(folder/filename,MAX_SQL_BYTES)
        if hashlib.sha256(source).hexdigest()!=item["sourceBodySha256"]:
            raise AuditBlocked("R198_PRIVATE_SOURCE_MISMATCH")
        for ordinal,sql in enumerate(statements(source.decode("utf8")),1):
            markers=r193.evaluate(sql,TARGET)
            if markers is None:
                continue
            matches.append({
                "version":version,
                "r111_priority_docket_index_not_chronology":index,
                "statement_ordinal":ordinal,
                "markers":markers,
            })
            if len(matches)>MAX_MATCHES:
                raise AuditBlocked("R198_TOO_MANY_FUNCTION_DEFINITIONS")
    chronology_ok=chronology_ok and len(versions)==83
    latest=(max(matches,key=lambda x:(x["version"],x["statement_ordinal"]))
            if chronology_ok and matches else None)
    marker=latest["markers"] if latest else {}
    return {
        "work_package":WORK_PACKAGE,
        "decision":"NO_GO",
        "mode":"OFFLINE_SHA_VERIFIED_PRIVATE_SHEET_AUTH_HELPER_LINEAGE",
        "original_migration_files_sha256_verified":83,
        "r193_join_create_lineage_reverified":True,
        "all_83_original_migration_timestamps_valid_unique":chronology_ok,
        "historical_direct_target_definitions":len(matches),
        "historical_explicit_definer_definitions":
          sum(e["markers"]["explicit_security_definer"] for e in matches),
        "historical_supported_plpgsql_bodies":
          sum(e["markers"]["plpgsql_dollar_body_supported"] for e in matches),
        "historical_body_sha256_matches_current_count":
          sum(e["markers"]["sha256_matches_live"] for e in matches),
        "latest_direct_definition_found":latest is not None,
        "latest_r111_priority_docket_index_not_chronology":
          latest["r111_priority_docket_index_not_chronology"] if latest else None,
        "latest_executable_statement_ordinal":
          latest["statement_ordinal"] if latest else None,
        "latest_explicit_security_definer":
          marker.get("explicit_security_definer",False),
        "latest_body_sha256_matches_live":
          marker.get("sha256_matches_live",False),
        "latest_body_length_matches_live":
          marker.get("byte_length_matches_live",False),
        "latest_direct_auth_identity_marker":
          marker.get("direct_identity_marker",False),
        "latest_direct_campaign_membership_marker":
          marker.get("direct_campaign_members_marker",False),
        "latest_user_editable_metadata_marker":
          marker.get("user_editable_metadata_marker",False),
        "effective_function_signature_owner_rls_acl_proven":False,
        "revoked_character_owner_authorization_proven_safe":False,
        "all_83_original_migration_semantics_approved":False,
        "all_67_live_privileged_call_chains_approved":False,
        "real_signed_qa_passed":False,
        "qa_or_production_sql_authorized":False,
        "no_private_sql_filenames_signatures_paths_or_secrets_exported":True,
        "network_or_database_accessed":False,
        "limitations":[
          "Only direct top-level CREATE FUNCTION is scanned; dynamic DO SQL and post-migration installs are not covered.",
          "A matching source fingerprint does not prove the complete SQL predicate/helper/RLS authorization graph or campaign revocation safety.",
          "Actual signed DM, assigned player, removed owner, outsider and lease cleanup QA is mandatory before any hosted release."
        ]
    }

def main()->int:
    p=argparse.ArgumentParser(description="R198 private original sheet authorization helper source lineage")
    p.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=p.parse_args()
    try:
        print(json.dumps(report(args.root),sort_keys=True,indent=2))
        return 0
    except (AuditBlocked,OSError,UnicodeError,ValueError,TypeError,KeyError,IndexError):
        print("R18-198 PRIVATE_SHEET_AUTH_NO_GO: source integrity/parser failure; never export SQL.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
