#!/usr/bin/env python3
"""B10-R18-195: verify frozen scratch-only TRUNCATE denial candidate, NO_GO.

Never reads hosted data, calls Supabase, runs SQL, or authorizes a migration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK_PACKAGE="B10-R18-195"
MANIFEST=Path("staging/world-v2-b10-r18-195-membership-truncate-denial/manifest.json")
MAX_MANIFEST_BYTES=8192
FROZEN_BLOBS={
  "staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql":
      "300421215fce40f1cfcfacbe3d3762413f218343",
  "tests/world-v2-r18-195-postgres/run.sh":
      "ae07bc8ffde2ae873e3d47072956da0666b2d349",
}
RISKS=(
  "real_service_role_usage_inventory_complete",
  "owner_superuser_trigger_bypass_prevented",
  "real_qa_signed_accounts_tested",
  "all83PrivateHistoricalSemanticsApproved",
  "all67CallablePrivilegedFunctionsApproved",
  "qaSqlInstallationApproved",
  "productionReleaseApproved",
)
RESTRICTIONS=(
  "no_real_sql_or_user_data_exported",
  "no_original_or_qa_database_changes",
  "no_live_runtime_changed",
  "no_active_versioned_migration",
  "no_merge","no_deploy","no_paid_resources",
)
EXPECTED_NEXT=("Verify source-only disposable PG17 denial including simulated baseline bypass; "
  "inventory privileged admin/service role TRUNCATE workflow before recommending any "
  "forward-only migration or signed QA.")
EXPECTED_DESIGN=("Revoke service_role TRUNCATE only, add BEFORE TRUNCATE statement-level error "
  "as defense in depth while retaining per-row DELETE/revocation logic.")
EXPECTED_ISOLATION=("GitHub Actions only, loopback 127.0.0.1, synthetic postgres scratch db, "
  "no original SQL or hosted Supabase credentials")

class AuditBlocked(Exception):
  pass

def no_duplicates(pairs):
  out={}
  for key,value in pairs:
    if key in out:raise AuditBlocked("DUPLICATE_KEY")
    out[key]=value
  return out

def git_blob_sha(data:bytes)->str:
  return hashlib.sha1(f"blob {len(data)}\0".encode()+data).hexdigest()

def validate(data:dict,root:Path)->dict:
  if not isinstance(data,dict) or set(data)!={
    "schema","work_package","date","decision","parent","live_read_only_grants",
    "known_source_issue","candidate_unapplied_only","synthetic_runner",
    "limitations",*RESTRICTIONS,"next_gate"
  }:
    raise AuditBlocked("MANIFEST_SCHEMA")
  if (type(data["schema"]) is not int or data["schema"]!=1
     or data["work_package"]!=WORK_PACKAGE or data["date"]!="2026-11-21"
     or data["decision"]!="NO_GO"
     or data["parent"]!={"pr":303,"head":"01001c8fd2ca0599055fa5aaca02115f7d0132a9",
                            "prior_security_workflow":"44900555044"}
     or type(data["known_source_issue"]) is not int or data["known_source_issue"]!=229):
    raise AuditBlocked("PROVENANCE_DRIFT")
  if data["live_read_only_grants"]!={
    "relation":"public.campaign_members","owner_role":"postgres",
    "rls_enabled":True,"service_role_effective_truncate":True,
    "ordinary_authenticated_effective_truncate":False,
    "anonymous_effective_truncate":False,
    "service_role_effective_delete":True,"service_role_effective_update":True
  }:
    raise AuditBlocked("READ_ONLY_CATALOG_DRIFT")
  if data["candidate_unapplied_only"]!={
    "path":"staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql",
    "git_blob_sha1":FROZEN_BLOBS["staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql"],
    "design":EXPECTED_DESIGN,"originalOrQaInstalled":False
  }:
    raise AuditBlocked("UNAPPLIED_CANDIDATE_DRIFT")
  if data["synthetic_runner"]!={
    "path":"tests/world-v2-r18-195-postgres/run.sh",
    "git_blob_sha1":FROZEN_BLOBS["tests/world-v2-r18-195-postgres/run.sh"],
    "postgres_version":17,"isolation":EXPECTED_ISOLATION
  } or type(data["synthetic_runner"]["postgres_version"]) is not int:
    raise AuditBlocked("RUNNER_PROVENANCE_DRIFT")
  if (not isinstance(data["limitations"],dict)
      or set(data["limitations"])!=set(RISKS)
      or any(data["limitations"][flag] is not False for flag in RISKS)):
    raise AuditBlocked("SAFETY_LIMITATION_OVERRIDDEN")
  if (any(data[field] is not True for field in RESTRICTIONS)
      or data["next_gate"]!=EXPECTED_NEXT):
    raise AuditBlocked("RELEASE_RESTRICTION_OVERRIDDEN")
  for rel,expected_sha in FROZEN_BLOBS.items():
    file=root/rel
    if not file.is_file() or file.is_symlink() or file.stat().st_size>128*1024:
      raise AuditBlocked("MISSING_OR_OVERSIZE_FROZEN_SOURCE")
    if git_blob_sha(file.read_bytes())!=expected_sha:
      raise AuditBlocked("CANDIDATE_OR_TEST_CHANGED")
  return {
    "work_package":WORK_PACKAGE,
    "decision":"NO_GO",
    "live_service_role_truncate_still_present_at_read_only_capture":True,
    "unapplied_truncate_guard_and_scratch_runner_byte_pinned":True,
    "privileged_truncate_bypass_fixed_on_hosted":False,
    "signed_qa_performed":False,
    "all_83_historical_semantics_approved":False,
    "all_67_privileged_call_chains_approved":False,
    "hosted_sql_or_production_release_authorized":False,
    "no_private_sql_or_user_data_exported":True,
  }

def main()->int:
  p=argparse.ArgumentParser(description="R195 scratch-only membership TRUNCATE source guard")
  p.add_argument("--root",type=Path,default=Path.cwd())
  args=p.parse_args()
  try:
    file=args.root/MANIFEST
    if not file.is_file() or file.is_symlink() or file.stat().st_size>MAX_MANIFEST_BYTES:
      raise AuditBlocked("MANIFEST_MISSING")
    data=json.loads(file.read_text(),object_pairs_hook=no_duplicates,
      parse_constant=lambda _:(_ for _ in ()).throw(AuditBlocked("NONFINITE")))
    print(json.dumps(validate(data,args.root),sort_keys=True,indent=2))
    return 0
  except (AuditBlocked,OSError,KeyError,ValueError,IndexError,TypeError):
    print("R18-195 TRUNCATE_GUARD_NO_GO: source/role evidence mismatch; no hosted release.",file=sys.stderr)
    return 2

if __name__=="__main__":
  raise SystemExit(main())
