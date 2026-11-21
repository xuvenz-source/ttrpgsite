#!/usr/bin/env python3
"""B10-R18-200 private original Storage policy and map-helper source history.

Owner-local WSL ONLY: reads 83 immutable historical SQL files plus private R111
docket under $HOME/ttrpg-history-private. Never accesses a database/network
or prints SQL, policy names, migration filenames, paths, function signatures,
bucket/object paths, user records, JWTs or signed asset URLs.
Lexical history is NOT current effective Storage policy authorization.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import (
    AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
)
from r191_private_fog_status_lineage import strict_migration_version
import r186_private_privileged_statement_inventory as r186
import r198_private_sheet_auth_lineage as r198

WORK_PACKAGE="B10-R18-200"
MAP_HELPER={
    "name":"can_view_campaign_map",
    "body_sha256":"835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c",
    "body_bytes":448,
}
MAX_POLICIES=500
MAX_MAP_HELPER_DEFINITIONS=100
DOLLAR_BODY=re.compile(r'\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)',re.I)
SECURITY_DEFINER=re.compile(r'\bSECURITY\s+DEFINER\b',re.I)
LANGUAGE_SQL=re.compile(r'\bLANGUAGE\s+sql\b',re.I)
AUTH_UID=re.compile(r'\bauth\s*\.\s*uid\s*\(',re.I)
MEMBERSHIP=re.compile(r'\bcampaign_members\b',re.I)
PLAYER_MAPS=re.compile(r'\bcampaign_player_maps\b',re.I)
MAP_HELPER_CALL=re.compile(r'\bcan_view_campaign_map\b',re.I)
BUCKET_ID=re.compile(r'\bbucket_id\b',re.I)
USER_EDITABLE=re.compile(r'\b(?:raw_user_meta_data|user_metadata)\b',re.I)
FOR_SELECT=re.compile(r'\bFOR\s+SELECT\b',re.I)
AS_RESTRICTIVE=re.compile(r'\bAS\s+RESTRICTIVE\b',re.I)
TO_AUTH=re.compile(r'\bTO\s+(?:"authenticated"|authenticated)(?![A-Za-z_0-9])',re.I)
POLICY_NAME=r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)'
STORAGE_OBJECTS=r'(?:(?:"storage"|storage)\s*\.\s*)(?:"objects"|objects)(?![A-Za-z_0-9])'
CREATE_POLICY=re.compile(r'^\s*CREATE\s+POLICY\s+'+POLICY_NAME+r'\s+ON\s+'+STORAGE_OBJECTS,re.I)
ALTER_POLICY=re.compile(r'^\s*ALTER\s+POLICY\s+'+POLICY_NAME+r'\s+ON\s+'+STORAGE_OBJECTS,re.I)
DROP_POLICY=re.compile(r'^\s*DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?'+POLICY_NAME+r'\s+ON\s+'+STORAGE_OBJECTS,re.I)

def matches_helper(sql:str)->bool:
    prefix=(r'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+'
            r'(?:(?:"public"|public)\s*\.\s*)?'
            r'(?:"can_view_campaign_map"|can_view_campaign_map)\s*\(')
    return re.match(prefix,sql,re.I) is not None

def helper_context(sql:str,helper:dict)->dict|None:
    if not matches_helper(sql):return None
    outside=r186.exclude_dollar_bodies(sql)
    definer=bool(SECURITY_DEFINER.search(outside))
    supported=bool(LANGUAGE_SQL.search(outside))
    raw=None
    if supported:
        opening=DOLLAR_BODY.search(sql)
        if opening:
            tag=opening.group(1)
            end=sql.find(tag,opening.end())
            if end<0:raise AuditBlocked("R200_UNTERMINATED_MAP_HELPER")
            raw=sql[opening.end():end].encode("utf-8")
            if not raw or len(raw)>MAX_SQL_BYTES:
                raise AuditBlocked("R200_MAP_HELPER_SIZE_INVALID")
        else:supported=False
    return {
        "explicit_security_definer":definer,
        "sql_dollar_body_supported":bool(supported and raw is not None),
        "body_sha256_matches_live":bool(raw is not None and hashlib.sha256(raw).hexdigest()==helper["body_sha256"]),
        "body_size_matches_live":bool(raw is not None and len(raw)==helper["body_bytes"]),
        "direct_auth_uid_marker":bool(AUTH_UID.search(sql)),
        "direct_membership_marker":bool(MEMBERSHIP.search(sql)),
        "direct_player_map_marker":bool(PLAYER_MAPS.search(sql)),
        "user_editable_metadata_marker":bool(USER_EDITABLE.search(sql)),
    }

def storage_event(sql:str)->dict|None:
    if CREATE_POLICY.match(sql):kind="create"
    elif ALTER_POLICY.match(sql):kind="alter"
    elif DROP_POLICY.match(sql):kind="drop"
    else:return None
    # SQL-style token markers are not parsed authorization expressions.
    return {
        "kind":kind,
        "for_select_word_marker":bool(FOR_SELECT.search(sql)),
        "as_restrictive_word_marker":bool(AS_RESTRICTIVE.search(sql)),
        "to_authenticated_word_marker":bool(TO_AUTH.search(sql)),
        "direct_auth_uid_word_marker":bool(AUTH_UID.search(sql)),
        "direct_membership_word_marker":bool(MEMBERSHIP.search(sql)),
        "map_view_helper_word_marker":bool(MAP_HELPER_CALL.search(sql)),
        "bucket_id_word_marker":bool(BUCKET_ID.search(sql)),
        "user_editable_metadata_word_marker":bool(USER_EDITABLE.search(sql)),
    }

def report(root:Path)->dict:
    # Attests R198 original helper as well as prior 83/83 source and R193
    # join/create lineage. Reject any source mismatch instead of claiming GO.
    prior=r198.report(root)
    if (prior.get("decision")!="NO_GO"
        or prior.get("original_migration_files_sha256_verified")!=83
        or prior.get("all_83_original_migration_timestamps_valid_unique") is not True
        or prior.get("r193_join_create_lineage_reverified") is not True
        or prior.get("historical_direct_target_definitions")!=1
        or prior.get("latest_body_sha256_matches_live") is not True
        or prior.get("latest_body_length_matches_live") is not True
        or prior.get("qa_or_production_sql_authorized") is not False):
        raise AuditBlocked("R200_PRIOR_ORIGINAL_SOURCE_PARITY_FAILED")
    root=checked_dir(root,private=True)
    docket=json.loads(checked_file(root/"r111-private-review-docket.json",1024*1024))
    items=docket.get("reviewItems")
    if not isinstance(items,list) or len(items)!=83:
        raise AuditBlocked("R200_DOCKET_83_REQUIRED")
    folder=checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    versions=set()
    chronology=True
    helper=[]
    policies=[]
    dynamic_marker_count=0
    for index,item in enumerate(items,1):
        filename=item["filename"]
        version=strict_migration_version(filename)
        if version is None or version in versions:
            chronology=False
        else:versions.add(version)
        raw=checked_file(folder/filename,MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest()!=item["sourceBodySha256"]:
            raise AuditBlocked("R200_ARCHIVE_MUTATED")
        for ordinal,sql in enumerate(statements(raw.decode("utf-8")),1):
            a=helper_context(sql,MAP_HELPER)
            if a is not None:
                helper.append({
                    "version":version,
                    "r111_priority_index_not_chronology":index,
                    "executable_statement_ordinal":ordinal,
                    "context":a
                })
                if len(helper)>MAX_MAP_HELPER_DEFINITIONS:
                    raise AuditBlocked("R200_TOO_MANY_MAP_HELPER_DEFINITIONS")
            p=storage_event(sql)
            if p is not None:
                policies.append({
                    "version":version,
                    "r111_priority_index_not_chronology":index,
                    "executable_statement_ordinal":ordinal,
                    "context":p
                })
                if len(policies)>MAX_POLICIES:
                    raise AuditBlocked("R200_TOO_MANY_POLICY_EVENTS")
            if (re.match(r'^\s*DO\b',sql,re.I)
                and re.search(r'\b(?:CREATE|ALTER|DROP)\s+POLICY\b',sql,re.I)):
                dynamic_marker_count+=1
    chronology=chronology and len(versions)==83
    if not chronology:raise AuditBlocked("R200_SOURCE_CHRONOLOGY_INVALID")
    sorted_helper=sorted(helper,key=lambda v:(v["version"],v["executable_statement_ordinal"]))
    latest_helper=sorted_helper[-1] if sorted_helper else None
    sorted_events=sorted(policies,key=lambda v:(v["version"],v["executable_statement_ordinal"]))
    latest_event=sorted_events[-1] if sorted_events else None
    marks=lambda name:sum(v["context"][name] for v in policies)
    return {
        "work_package":WORK_PACKAGE,
        "decision":"NO_GO",
        "mode":"OFFLINE_SHA_VERIFIED_PRIVATE_MAP_HELPER_AND_STORAGE_POLICY_EVENT_LINEAGE",
        "original_historical_migrations_sha256_verified":83,
        "r198_sheet_helper_and_r193_join_create_reverified":True,
        "original_chronology_valid_unique":True,
        "historical_direct_map_helper_definitions":len(helper),
        "historical_explicit_definer_map_helpers":sum(v["context"]["explicit_security_definer"] for v in helper),
        "historical_supported_sql_map_helper_bodies":sum(v["context"]["sql_dollar_body_supported"] for v in helper),
        "historical_map_helper_body_sha256_matches_current_count":sum(v["context"]["body_sha256_matches_live"] for v in helper),
        "latest_map_helper_direct_definition_found":latest_helper is not None,
        "latest_map_helper_r111_priority_index_not_chronology":
            latest_helper["r111_priority_index_not_chronology"] if latest_helper else None,
        "latest_map_helper_executable_statement_ordinal":
            latest_helper["executable_statement_ordinal"] if latest_helper else None,
        "latest_map_helper_sha256_matches_current":
            latest_helper["context"]["body_sha256_matches_live"] if latest_helper else False,
        "latest_map_helper_body_bytes_match_current":
            latest_helper["context"]["body_size_matches_live"] if latest_helper else False,
        "latest_map_helper_direct_auth_uid_marker":
            latest_helper["context"]["direct_auth_uid_marker"] if latest_helper else False,
        "latest_map_helper_direct_membership_marker":
            latest_helper["context"]["direct_membership_marker"] if latest_helper else False,
        "latest_map_helper_direct_player_map_marker":
            latest_helper["context"]["direct_player_map_marker"] if latest_helper else False,
        "latest_map_helper_user_editable_metadata_marker":
            latest_helper["context"]["user_editable_metadata_marker"] if latest_helper else False,
        "historical_direct_storage_objects_policy_events":len(policies),
        "historical_direct_create_policy_events":sum(v["context"]["kind"]=="create" for v in policies),
        "historical_direct_alter_policy_events":sum(v["context"]["kind"]=="alter" for v in policies),
        "historical_direct_drop_policy_events":sum(v["context"]["kind"]=="drop" for v in policies),
        "historical_direct_events_with_for_select_marker":marks("for_select_word_marker"),
        "historical_direct_events_with_as_restrictive_marker":marks("as_restrictive_word_marker"),
        "historical_direct_events_with_to_authenticated_marker":marks("to_authenticated_word_marker"),
        "historical_direct_events_with_auth_uid_marker":marks("direct_auth_uid_word_marker"),
        "historical_direct_events_with_campaign_members_marker":marks("direct_membership_word_marker"),
        "historical_direct_events_with_map_helper_marker":marks("map_view_helper_word_marker"),
        "historical_direct_events_with_bucket_id_marker":marks("bucket_id_word_marker"),
        "historical_direct_events_with_user_editable_metadata_marker":marks("user_editable_metadata_word_marker"),
        "historical_do_block_policy_word_markers":dynamic_marker_count,
        "last_direct_policy_event_r111_priority_index_not_chronology":
            latest_event["r111_priority_index_not_chronology"] if latest_event else None,
        "last_direct_policy_event_statement_ordinal":
            latest_event["executable_statement_ordinal"] if latest_event else None,
        "historical_policy_names_or_sql_exported":False,
        "current_live_policy_expression_identity_proven":False,
        "storage_policy_permissive_or_and_helper_authorization_proven":False,
        "new_signed_url_issuance_denied_to_revoked_hosted_actor_proven":False,
        "previously_issued_3600s_storage_bearers_revoked":False,
        "all_83_historical_semantics_approved":False,
        "all_67_live_privileged_chains_approved":False,
        "real_signed_dm_p1_p2_revoked_outsider_qa_passed":False,
        "qa_or_production_sql_authorized":False,
        "network_or_database_accessed":False,
        "original_sql_migration_names_paths_policy_names_signatures_urls_or_secrets_exported":False,
        "limitations":[
          "Only direct top-level CREATE/ALTER/DROP POLICY statements on storage.objects are counted; dynamic DO SQL, later installs, defaults, and effective current composition are NOT proven.",
          "Marker counts do not establish SQL boolean semantics, PERMISSIVE OR union, helper delegation, current Storage RLS or revoked actor URL issuance denial.",
          "A byte match of the map helper is source identity only, not proof of safe campaign ownership/membership access.",
          "Already-issued signed Storage bearer URLs are not invalidated by browser cache clear or Auth JWT key rotation; real signed QA and expiry/support handling remain mandatory."
        ]
    }

def main()->int:
    p=argparse.ArgumentParser(description="R200 private Storage policy and map helper source history")
    p.add_argument("--root",type=Path,default=Path.home()/"ttrpg-history-private")
    args=p.parse_args()
    try:
        print(json.dumps(report(args.root),sort_keys=True,indent=2))
        return 0
    except (AuditBlocked,OSError,UnicodeError,ValueError,TypeError,KeyError,IndexError):
        print("R18-200 PRIVATE_STORAGE_POLICY_NO_GO: history/parser failure; never export SQL.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
