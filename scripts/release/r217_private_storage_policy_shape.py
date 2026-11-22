#!/usr/bin/env python3
"""R217 owner-private Storage policy *shape* inventory. Never semantic approval.

Offline only. Reuses R216/R215/... historical SHA, chronology, private file
permission and NO_GO gates; exports fixed codes/counts and bounded R111 numbers.
No SQL text, policy/bucket/target names, private paths or data leave owner's WSL.
"""
from __future__ import annotations
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

from r154_private_history_audit import AuditBlocked, MAX_SQL_BYTES, checked_dir, checked_file, statements
from r191_private_fog_status_lineage import strict_migration_version
from r215_private_managed_effect_scope import statement_codes
from r216_private_storage_effect_words import report as r216_report

WORK = "B10-R18-217"
MAX_REFS = 24
CODES = (
    "storage_policy_create", "storage_policy_alter", "storage_policy_drop",
    "storage_policy_unknown_statement_form",
    "storage_policy_role_authenticated_word", "storage_policy_role_anon_word",
    "storage_policy_role_public_word", "storage_policy_role_unspecified_word",
    "storage_policy_as_restrictive_word", "storage_policy_as_permissive_or_default_word",
    "storage_policy_bucket_id_word", "storage_policy_owner_id_word",
    "storage_policy_direct_uid_or_jwt_word",
    "storage_policy_campaign_guard_helper_word",
    "storage_policy_storage_operation_helper_word",
    "storage_policy_using_literal_true_word",
    "storage_policy_check_literal_true_word", "storage_policy_or_word",
    "storage_policy_user_editable_metadata_word",
)
CREATE = re.compile(r'^\s*CREATE\s+POLICY\b', re.I)
ALTER = re.compile(r'^\s*ALTER\s+POLICY\b', re.I)
DROP = re.compile(r'^\s*DROP\s+POLICY\b', re.I)
HEADER_END = re.compile(r'\b(?:USING|WITH\s+CHECK)\s*\(', re.I)
ROLE_CLAUSE = re.compile(r'\bTO\s+(.+)$',re.I|re.S)
ROLE_WORDS = {
    "storage_policy_role_authenticated_word":re.compile(r'\bauthenticated\b',re.I),
    "storage_policy_role_anon_word":re.compile(r'\banon\b',re.I),
    "storage_policy_role_public_word":re.compile(r'\bPUBLIC\b',re.I),
}
RESTRICTIVE = re.compile(r'\bAS\s+RESTRICTIVE\b',re.I)
BUCKET = re.compile(r'\bbucket_id\b',re.I)
OWNER = re.compile(r'\bowner_id\b',re.I)
AUTH = re.compile(r'\bauth\s*\.\s*(?:uid|jwt)\s*\(',re.I)
CAMPAIGN = re.compile(r'\b(?:is_campaign_member|is_campaign_dm|can_view_campaign_map|can_edit_campaign_sheet)\s*\(',re.I)
STORAGE_HELPER = re.compile(r'\bstorage\s*\.\s*(?:allow_only_operation|allow_any_operation)\s*\(',re.I)
TRUE_USING = re.compile(r'\bUSING\s*\(\s*TRUE\s*\)',re.I)
TRUE_CHECK = re.compile(r'\bWITH\s+CHECK\s*\(\s*TRUE\s*\)',re.I)
OR_WORD = re.compile(r'\bOR\b',re.I)
USER_META = re.compile(r'\b(?:raw_user_meta_data|user_metadata)\b',re.I)

def shape(statement: str) -> tuple[str,...]:
    if "managed_storage_policy_target" not in statement_codes(statement):
        return ()
    codes=set()
    if CREATE.match(statement): codes.add("storage_policy_create")
    elif ALTER.match(statement): codes.add("storage_policy_alter")
    elif DROP.match(statement): codes.add("storage_policy_drop")
    else: codes.add("storage_policy_unknown_statement_form")

    # Header inspection is lexical, truncated before first guard expression.
    # The body/guard is never serialized, only fixed marker categories.
    header = HEADER_END.split(statement, maxsplit=1)[0]
    roles = ROLE_CLAUSE.search(header)
    if roles:
        targets = roles.group(1)
        for name, regex in ROLE_WORDS.items():
            if regex.search(targets): codes.add(name)
    else:
        codes.add("storage_policy_role_unspecified_word")
    if RESTRICTIVE.search(header): codes.add("storage_policy_as_restrictive_word")
    else: codes.add("storage_policy_as_permissive_or_default_word")
    if BUCKET.search(statement): codes.add("storage_policy_bucket_id_word")
    if OWNER.search(statement): codes.add("storage_policy_owner_id_word")
    if AUTH.search(statement): codes.add("storage_policy_direct_uid_or_jwt_word")
    if CAMPAIGN.search(statement): codes.add("storage_policy_campaign_guard_helper_word")
    if STORAGE_HELPER.search(statement): codes.add("storage_policy_storage_operation_helper_word")
    if TRUE_USING.search(statement): codes.add("storage_policy_using_literal_true_word")
    if TRUE_CHECK.search(statement): codes.add("storage_policy_check_literal_true_word")
    if OR_WORD.search(statement): codes.add("storage_policy_or_word")
    if USER_META.search(statement): codes.add("storage_policy_user_editable_metadata_word")
    if not codes.issubset(CODES): raise AuditBlocked("R217_UNKNOWN_FIXED_CODE")
    return tuple(sorted(codes))

def report(root: Path) -> dict:
    earlier = r216_report(root)
    if (earlier["decision"] != "NO_GO" or
        earlier["original_migrations_sha256_reverified"] != 83 or
        earlier["qa_sql_install_authorized"] is not False):
        raise AuditBlocked("R217_R216_BASELINE_REFUSED")
    root = checked_dir(root, private=True)
    docket = json.loads(checked_file(root/"r111-private-review-docket.json", 1024*1024))
    items = docket.get("reviewItems")
    if type(items) is not list or len(items) != 83:
        raise AuditBlocked("R217_DOCKET_INCOMPLETE")
    folder = checked_dir(root/"r106-original-83-recovery"/"supabase"/"migrations")
    versions=set()
    counts=Counter()
    file_counts=Counter()
    flagged=[]
    total=0
    policies=0
    for priority,item in enumerate(items,1):
        name=item["filename"]
        version = strict_migration_version(name)
        if version is None or version in versions:
            raise AuditBlocked("R217_CHRONOLOGY_INVALID")
        versions.add(version)
        raw = checked_file(folder/name, MAX_SQL_BYTES)
        if hashlib.sha256(raw).hexdigest() != item["sourceBodySha256"]:
            raise AuditBlocked("R217_SOURCE_SHA_CHANGED")
        found=set()
        for statement in statements(raw.decode("utf-8")):
            total += 1
            markers = shape(statement)
            if markers:
                policies += 1
                counts.update(markers)
                found.update(markers)
        if found:
            flagged.append({"r111_priority_index":priority, "storage_policy_shape_codes":sorted(found)})
            for code in found: file_counts[code]+=1
    if (len(versions)!=83 or
        total!=earlier["top_level_statements_reconciled"] or
        policies!=earlier["r215_storage_policy_statements_reconciled"] or
        len(flagged)!=sum(1 for row in earlier["first_r111_priority_storage_review_items"]
                         if any(code.startswith("storage_policy_") for code in row["storage_lexical_review_codes"]))
                         and not earlier["priority_review_items_truncated"]):
        raise AuditBlocked("R217_R216_POLICY_RECONCILIATION_REFUSED")
    return {
        "work_package": WORK, "decision": "NO_GO",
        "mode": "OWNER_PRIVATE_OFFLINE_STORAGE_POLICY_SHAPE_TRIAGE",
        "original_migrations_sha256_reverified":83,
        "top_level_statements_reconciled":total,
        "storage_policy_statements_reconciled":policies,
        "storage_policy_lexical_statement_counts":{code:counts[code] for code in CODES},
        "storage_policy_lexical_file_counts":{code:file_counts[code] for code in CODES},
        "storage_policy_review_file_count":len(flagged),
        "first_r111_priority_storage_policy_review_items":flagged[:MAX_REFS],
        "priority_review_items_truncated":len(flagged)>MAX_REFS,
        "role_policy_semantics_and_permissive_composition_verified":False,
        "signed_url_revocation_verified":False,
        "all_83_migrations_semantically_approved":False,
        "qa_sql_install_authorized":False,
        "original_or_production_sql_authorized":False,
        "no_sql_executed":True,
        "no_network_or_database_access":True,
        "private_sql_migration_names_versions_paths_or_docket_exported":False,
        "limitations":[
            "This is a lexical source-word audit, NOT PostgreSQL RLS role, helper, permissive-policy OR composition or historical migration semantic proof.",
            "Missing TO, auth.uid, bucket_id, USING or WITH CHECK text is not automatically insecure; quoted text and indirect helpers can skew marker counts.",
            "Signed Storage URLs may remain accessible after membership changes; this report does NOT test tokens, key rotation, revocation or CDN caching.",
            "All original SQL and R111 docket remain owner-private; QA installation and production require separate exact owner approval and rollback.",
        ],
    }

def main():
    try:
        print(json.dumps(report(Path.home()/"ttrpg-history-private"),indent=2,sort_keys=True))
        return 0
    except Exception:
        print("R217_PRIVATE_STORAGE_POLICY_NO_GO: private source validation or marker reconciliation refused.", file=sys.stderr)
        return 2

if __name__=="__main__": raise SystemExit(main())
