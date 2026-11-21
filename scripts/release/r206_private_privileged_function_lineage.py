#!/usr/bin/env python3
"""R206 — one owner-local original 83-migration, multi-function source lineage audit.

May execute ONLY in owner's private Ubuntu WSL original-history directory.
No network/database, no original SQL, function names/signatures, migration
filenames/paths, campaign data, signed URLs, credentials or tokens in output.
Matching body SHA is SOURCE IDENTITY, never authorization/release signoff.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked,MAX_SQL_BYTES,checked_dir,checked_file,statements
)
from r191_private_fog_status_lineage import strict_migration_version
import r193_private_invite_source_lineage as r193
import r186_private_privileged_statement_inventory as r186
import r200_private_storage_policy_lineage as r200

WORK_PACKAGE="B10-R18-206"
# Fixed, existing public function name/hash/size metadata: NOT original SQL.
# Never include actual source/signatures/filenames in the sanitized report.
TARGETS=(
 ("get_campaign_account_names",378,
  "bd98b2ec061445b828724d0830f1da245b845a3e9c83fcf7c1a17bd34343c9a6"),
 ("get_campaign_sheet_inventory",1950,
  "4b168977eaa254f665fa1f26ed81d7296053bb988b991e60574c1610de0a879e"),
 ("get_dm_map_npc_values",263,
  "5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5"),
 ("get_npc_token_values",141,
  "2b82239cc0b630d500240b19bc267aeac013f6b78936472fc590d8207e46a9f8"),
 ("is_map_fog_published",102,
  "767cbcd8bd4813c0a535fa71bf1ecc3a9cf8a6dd02c239499c0be1737a28c96f"),
 ("patch_campaign_sheet_noninventory",2364,
  "2059d837aea133d1cbe726e9eebb0736d04739ed37b06ed8cfa08dca017efc2b"),
 ("preview_map_motion",110,
  "31720e150e501f186bb0424b2d814d6a480c3e781c202a3209d872b8e0e491dd"),
 ("publish_map_environment",3836,
  "425a2336150ea0a1a28cd4d39f6d2b7560b2fb43a0bd25d69d6897ad74b1b32c"),
 ("can_edit_campaign_sheet_inventory",427,
  "169d6e5ec9fb79a760bc25ab28a3937f4c76cc1a5233c997b673b366cd8176e4"),
 ("is_campaign_dm",148,
  "7c9cbc8f5146ee794ad6fe97bdb83017fccefe76761bf5c0f31d6020303d398a"),
 ("is_campaign_member",132,
  "18a326e27b3839b1b6011d593b1d1c1dd566e8ac8d17eda1feda7cb886713024"),
)
MAX_DEFINITIONS_PER_TARGET=100
PLPGSQL=re.compile(r'\bLANGUAGE\s+plpgsql\b',re.I)
UID=re.compile(r'\bauth\s*\.\s*uid\s*\(',re.I)
MEMBER=re.compile(r'\bcampaign_members\b',re.I)
EDIT_SHEET=re.compile(r'\bcan_edit_campaign_sheet\s*\(',re.I)
EDIT_INVENTORY=re.compile(r'\bcan_edit_campaign_sheet_inventory\s*\(',re.I)
IS_DM=re.compile(r'\bis_campaign_dm\s*\(',re.I)
IS_MEMBER=re.compile(r'\bis_campaign_member\s*\(',re.I)
EDITABLE=re.compile(r'\b(?:raw_user_meta_data|user_metadata)\b',re.I)
DYNAMIC_EXECUTE=re.compile(r'\bEXECUTE\s+(?:format\s*\(|\$|[A-Za-z_])',re.I)
NO_APPROVAL_FIELDS=(
 "all_11_live_privileged_functions_semantically_approved",
 "all_67_live_privileged_call_chains_approved",
 "all_83_private_migration_semantics_approved",
 "current_original_fog_status_oracle_repaired",
 "current_original_revoked_sheet_owner_repaired",
 "signed_dm_p1_p2_revoked_outsider_qa_passed",
 "qa_or_production_sql_authorized",
)

def markers(statement:str,target:tuple)->dict|None:
    name,bytes_expected,sha_expected=target
    if not r193.matches_direct(statement,name):
        return None
    # Header/body must be separated; a body text containing DEF or LANGUAGE
    # must not masquerade as the function header.
    header=r186.exclude_dollar_bodies(statement)
    definer=bool(r200.SECURITY_DEFINER.search(header))
    supported_language=bool(r200.LANGUAGE_SQL.search(header)
                            or PLPGSQL.search(header))
    tag=r200.DOLLAR_BODY.search(statement)
    body=None
    if supported_language and tag:
        delim=tag.group(1)
        end=statement.find(delim,tag.end())
        if end<0:raise AuditBlocked("R206_UNTERMINATED_TARGET_FUNCTION")
        body=statement[tag.end():end].encode("utf-8")
        if not body or len(body)>MAX_SQL_BYTES:
            raise AuditBlocked("R206_INVALID_TARGET_BODY_SIZE")
    # Inspect only extracted function BODY, not its CREATE declaration.
    # Function names in headers must not masquerade as recursive calls.
    body_text=body.decode("utf-8") if body is not None else ""
    return {
      "explicit_security_definer":definer,
      "supported_sql_or_plpgsql_dollar_body":body is not None,
      "source_sha256_matches_current":bool(body is not None and
           hashlib.sha256(body).hexdigest()==sha_expected),
      "source_bytes_match_current":bool(body is not None and
           len(body)==bytes_expected),
      "direct_auth_uid_marker":bool(UID.search(body_text)),
      "direct_campaign_members_marker":bool(MEMBER.search(body_text)),
      "calls_sheet_guard_marker":bool(EDIT_SHEET.search(body_text)),
      "calls_inventory_guard_marker":bool(EDIT_INVENTORY.search(body_text)),
      "calls_dm_guard_marker":bool(IS_DM.search(body_text)),
      "calls_membership_guard_marker":bool(IS_MEMBER.search(body_text)),
      "user_editable_metadata_marker":bool(EDITABLE.search(body_text)),
      "dynamic_execute_word_marker":bool(DYNAMIC_EXECUTE.search(body_text)),
    }

def report(root:Path)->dict:
    # Re-run R200 -> R198 -> R193 -> R154 original private source
    # fingerprints and known JOIN/CREATE/sheet/map baseline, not prior JSON.
    prior=r200.report(root)
    if (prior.get("decision")!="NO_GO"
        or prior.get("original_historical_migrations_sha256_verified")!=83
        or prior.get("original_chronology_valid_unique") is not True
        or prior.get("r198_sheet_helper_and_r193_join_create_reverified") is not True
        or prior.get("latest_map_helper_sha256_matches_current") is not True
        or prior.get("latest_map_helper_body_bytes_match_current") is not True
        or prior.get("historical_direct_storage_objects_policy_events")!=12
        or prior.get("historical_direct_create_policy_events")!=10
        or prior.get("historical_direct_drop_policy_events")!=2
        or prior.get("qa_or_production_sql_authorized") is not False):
        raise AuditBlocked("R206_PRIOR_PRIVATE_SOURCE_LINEAGE_DRIFT")
    root=checked_dir(root,private=True)
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024))
    entries=docket.get("reviewItems")
    if not isinstance(entries,list) or len(entries)!=83:
        raise AuditBlocked("R206_EXPECTED_83_PRIVATE_DOCKET")
    folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    matches=[[] for _ in TARGETS]
    versions=set()
    for index,item in enumerate(entries,1):
        name=item["filename"]
        version=strict_migration_version(name)
        if version is None or version in versions:
            raise AuditBlocked("R206_BAD_OR_DUPLICATE_MIGRATION_CHRONOLOGY")
        versions.add(version)
        data=checked_file(folder/name,MAX_SQL_BYTES)
        if hashlib.sha256(data).hexdigest()!=item["sourceBodySha256"]:
            raise AuditBlocked("R206_PRIVATE_ARCHIVE_SHA_MISMATCH")
        for ordinal,sql in enumerate(statements(data.decode("utf-8")),1):
            # Only direct top-level CREATE FUNCTION statements, no DO
            # execution, function invocation or dynamic SQL inference.
            if not re.match(r'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b',sql,re.I):
                continue
            for t,target in enumerate(TARGETS):
                flags=markers(sql,target)
                if flags is None:continue
                matches[t].append((version,ordinal,index,flags))
                if len(matches[t])>MAX_DEFINITIONS_PER_TARGET:
                    raise AuditBlocked("R206_TOO_MANY_TARGET_DEFINITIONS")
    if len(versions)!=83:
        raise AuditBlocked("R206_MISSING_MIGRATION_VERSION")
    slots=[]
    for i,history in enumerate(matches,1):
        latest=max(history,key=lambda entry:(entry[0],entry[1])) if history else None
        flags=latest[3] if latest else {}
        slots.append({
          "slot":i,
          "direct_historical_definition_count":len(history),
          "historical_current_source_sha_matches_count":
            sum(x[3]["source_sha256_matches_current"] for x in history),
          "latest_direct_definition_found":latest is not None,
          "latest_r111_priority_index_not_migration_chronology":
            latest[2] if latest else None,
          "latest_executable_statement_ordinal":latest[1] if latest else None,
          "latest_explicit_security_definer":
            flags.get("explicit_security_definer",False),
          "latest_supported_sql_or_plpgsql_body":
            flags.get("supported_sql_or_plpgsql_dollar_body",False),
          "latest_sha256_matches_current":
            flags.get("source_sha256_matches_current",False),
          "latest_byte_length_matches_current":
            flags.get("source_bytes_match_current",False),
          "latest_direct_auth_uid_marker":
            flags.get("direct_auth_uid_marker",False),
          "latest_direct_campaign_members_marker":
            flags.get("direct_campaign_members_marker",False),
          "latest_calls_sheet_guard_marker":
            flags.get("calls_sheet_guard_marker",False),
          "latest_calls_inventory_guard_marker":
            flags.get("calls_inventory_guard_marker",False),
          "latest_calls_dm_guard_marker":
            flags.get("calls_dm_guard_marker",False),
          "latest_calls_membership_guard_marker":
            flags.get("calls_membership_guard_marker",False),
          "latest_user_editable_metadata_marker":
            flags.get("user_editable_metadata_marker",False),
          "latest_dynamic_execute_word_marker":
            flags.get("dynamic_execute_word_marker",False),
        })
    return {
      "work_package":WORK_PACKAGE,
      "decision":"NO_GO",
      "mode":"OFFLINE_SHA_VERIFIED_PRIVILEGED_AUTH_FUNCTION_LINEAGE",
      "original_private_migrations_sha256_verified":83,
      "prior_r200_r198_r193_source_lineage_reverified":True,
      "original_migration_versions_unique_and_valid":True,
      "target_slots":slots,
      "all_11_latest_target_bodies_match_current":
        all(x["latest_sha256_matches_current"] and
            x["latest_byte_length_matches_current"] for x in slots),
      **{key:False for key in NO_APPROVAL_FIELDS},
      "no_original_sql_function_names_signatures_migration_names_paths_or_secrets_exported":True,
      "network_or_database_accessed":False,
      "limitations":[
        "Only direct top-level SQL/PLpgSQL dollar-body CREATE FUNCTION statements are covered; DO/dynamic SQL, quoted single-string bodies, and post-migration installs are not.",
        "R111 priority docket indices are NOT chronological migration positions. Latest is selected by unique timestamp version and SQL statement ordinal.",
        "Matching original/live bytes and body-only lexical call markers are source identity, NOT semantic proof of caller identity, authorization, effective RLS or nested helper chains.",
        "Actual signed DM/P1/P2/removed/outsider QA and separate owner approvals remain mandatory."
      ]
    }

def main()->int:
    parser=argparse.ArgumentParser(description="R206 owner-only private function source lineage")
    parser.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=parser.parse_args()
    try:
        print(json.dumps(report(args.root),sort_keys=True,indent=2))
        return 0
    except (AuditBlocked,OSError,UnicodeError,ValueError,TypeError,KeyError,IndexError):
        print("R18-206 PRIVATE_FUNCTION_LINEAGE_NO_GO: private source integrity/parser error; never export SQL.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
