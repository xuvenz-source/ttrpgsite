#!/usr/bin/env python3
"""R238: local metadata-only Docker executable provenance, never SQL/daemon.

The owner-provided R237 sanitized receipt is validated by exact SHA256 and
strict schema before inspecting the Docker PATH entry. This script NEVER
calls external executables or a daemon, reads no Docker configuration contents,
does not start/install/stop services, and never exports private paths.
All results are fixed enums/booleans, always NO_GO.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import sys

WORK="B10-R18-238"
R237_SHA256="f2808df021b33435056e27e3720eb8a5e3c0793cc44f053bd757561d2cd69639"
MAX_RECEIPT_BYTES=4096
MAX_OUTPUT_BYTES=2300
R237_KEYS={
 "decision","docker_client_version","docker_compose_version",
 "docker_connection_override_variable_names_present",
 "docker_container_started_pulled_or_built",
 "docker_daemon_queried_or_started","docker_engine_availability_proven",
 "docker_remote_target_absence_proven",
 "docker_selected_context_category_only",
 "historical_83_source_migrations_approved","local_disposable_replay_approved",
 "mode","private_sql_or_docket_accessed","r236_receipt_sha256_verified",
 "remote_original_qa_or_production_database_accessed","sanitized_output_only",
 "sql_or_db_query_executed","supabase_cli_installed_or_run",
 "supabase_managed_services_verified","work_package"
}
R237_FALSE_KEYS={
 "docker_container_started_pulled_or_built","docker_daemon_queried_or_started",
 "docker_engine_availability_proven","docker_remote_target_absence_proven",
 "historical_83_source_migrations_approved","local_disposable_replay_approved",
 "private_sql_or_docket_accessed",
 "remote_original_qa_or_production_database_accessed",
 "sql_or_db_query_executed","supabase_cli_installed_or_run",
 "supabase_managed_services_verified"
}
class Blocked(Exception):pass

def reject_duplicate(pairs):
 d={}
 for k,v in pairs:
  if k in d:raise Blocked("DUPLICATE_RECEIPT_FIELD")
  d[k]=v
 return d

def validate_receipt(raw,*,expected_sha=R237_SHA256):
 if type(raw) is not bytes or not 100<len(raw)<=MAX_RECEIPT_BYTES:
  raise Blocked("R237_RECEIPT_LENGTH")
 if hashlib.sha256(raw).hexdigest()!=expected_sha:
  raise Blocked("R237_SANITIZED_RECEIPT_HASH_CHANGED")
 try:
  d=json.loads(raw,object_pairs_hook=reject_duplicate)
 except (ValueError,UnicodeError):
  raise Blocked("R237_RECEIPT_INVALID_JSON") from None
 if type(d) is not dict or set(d)!=R237_KEYS:
  raise Blocked("R237_SCHEMA_DRIFT")
 if (d["decision"]!="NO_GO" or d["work_package"]!="B10-R18-237" or
     d["mode"]!="OWNER_WSL_DOCKER_CLIENT_METADATA_COMMANDS_ONLY" or
     d["r236_receipt_sha256_verified"] is not True or
     d["sanitized_output_only"] is not True):
  raise Blocked("R237_FALSE_SCOPE")
 if any(d[k] is not False for k in R237_FALSE_KEYS):
  raise Blocked("R237_UNEXPECTED_APPROVAL")
 for k in ("docker_client_version","docker_compose_version"):
  value=d[k]
  if type(value) is not dict or set(value)!={"status","version_major_minor_patch"} or (
      value["status"]!="UNAVAILABLE" or value["version_major_minor_patch"] is not None):
   raise Blocked("R237_UNEXPECTED_DOCKER_VERSION")
 if d["docker_selected_context_category_only"]!="UNAVAILABLE":
  raise Blocked("R237_UNEXPECTED_DOCKER_CONTEXT")
 if d["docker_connection_override_variable_names_present"]!=[]:
  raise Blocked("R237_DOCKER_OVERRIDE_CHANGED")
 return True

def category(path,home):
 """Report only broad category, never a raw path or endpoint."""
 if path is None:return "UNAVAILABLE"
 try:
  p=Path(path).absolute()
  h=Path(home).absolute()
  if p==h or h in p.parents:return "OWNER_HOME"
  if str(p).startswith("/mnt/wsl/docker-desktop/"):
   return "DOCKER_DESKTOP_WSL_MOUNT"
  if any(str(p)==prefix or str(p).startswith(prefix+"/")
         for prefix in ("/usr/bin","/usr/local/bin","/bin","/sbin","/usr/sbin")):
   return "LINUX_SYSTEM_BIN"
  if str(p).startswith("/mnt/"):
   return "MOUNTED_OTHER_OR_WINDOWS"
  return "OTHER"
 except (OSError,ValueError,RuntimeError):
  return "UNAVAILABLE"

def probe(*,where=None,home=None,stat_fn=os.stat,lstat_fn=os.lstat,
          access_fn=os.access,resolve_fn=None,exists_fn=None):
 """All injected dependency options exist only for fictional CI tests."""
 if home is None: home=Path.home()
 if where is None: where=shutil.which("docker")
 if resolve_fn is None:resolve_fn=lambda p:Path(p).resolve(strict=False)
 if exists_fn is None:exists_fn=lambda p:Path(p).exists()
 if not where:
  return {
   "docker_path_entry_found":False,
   "docker_path_entry_category":"UNAVAILABLE",
   "docker_resolved_target_category":"UNAVAILABLE",
   "docker_executable_kind":"NOT_FOUND"
  }
 kind="OTHER_OR_UNREADABLE"
 target_category="UNAVAILABLE"
 try:
  mode=lstat_fn(where).st_mode
  is_link=stat.S_ISLNK(mode)
  if is_link:
   try:
    actual=resolve_fn(where)
    target_category=category(actual,home)
    target=stat_fn(where).st_mode
    if stat.S_ISREG(target) and access_fn(where,os.X_OK):
     kind="SYMLINK_TO_EXECUTABLE"
    elif stat.S_ISREG(target):
     kind="SYMLINK_TO_NONEXECUTABLE"
    else:
     kind="SYMLINK_TO_OTHER"
   except (OSError,RuntimeError):
    kind="SYMLINK_BROKEN_OR_UNRESOLVABLE"
  elif stat.S_ISREG(mode):
   kind="REGULAR_EXECUTABLE" if access_fn(where,os.X_OK) else "REGULAR_NOT_EXECUTABLE"
   target_category=category(where,home)
  else:
   kind="OTHER_FILE_TYPE"
 except (OSError,RuntimeError):
  kind="UNREADABLE_OR_CHANGED"
 return {
  "docker_path_entry_found":True,
  "docker_path_entry_category":category(where,home),
  "docker_resolved_target_category":target_category,
  "docker_executable_kind":kind
 }

def report(raw,*,probe_fn=probe,exists_fn=None,home=None):
 validate_receipt(raw)
 if home is None:home=Path.home()
 if exists_fn is None:exists_fn=lambda p:Path(p).exists()
 result=probe_fn()
 return {
  "work_package":WORK,
  "decision":"NO_GO",
  "mode":"OWNER_WSL_DOCKER_EXECUTABLE_FILESYSTEM_METADATA_ONLY",
  "r237_sanitized_receipt_hash_verified":True,
  **result,
  "docker_desktop_wsl_mount_present":bool(exists_fn("/mnt/wsl/docker-desktop")),
  "docker_standard_socket_file_present_not_connectivity_proof":bool(
     exists_fn("/var/run/docker.sock")),
  "docker_user_config_file_present_not_read":bool(
     exists_fn(Path(home)/".docker"/"config.json")),
  "docker_user_context_directory_present_not_read":bool(
     exists_fn(Path(home)/".docker"/"contexts")),
  "docker_binary_contents_or_config_read":False,
  "docker_cli_or_any_external_binary_executed":False,
  "docker_engine_contacted_or_started":False,
  "containers_images_or_resources_modified":False,
  "private_migration_sql_or_docket_opened":False,
  "remote_or_local_database_accessed":False,
  "remote_docker_context_absence_proven":False,
  "hosted_or_local_sql_execution_authorized":False,
  "original_qa_or_production_deployment_authorized":False,
  "sanitized_metadata_only":True
 }

def main():
 p=argparse.ArgumentParser(description="R238 WSL Docker PATH metadata probe; NO_GO")
 p.add_argument("--r237",type=Path,
     default=Path.home()/"ttrpg-history-private"/"r237-sanitized-docker-client.json")
 args=p.parse_args()
 try:
  if args.r237.is_symlink() or not args.r237.is_file():
   raise Blocked("R237_RECEIPT_NOT_REGULAR_FILE")
  raw=args.r237.read_bytes()
  value=report(raw)
  data=json.dumps(value,sort_keys=True,indent=2)
  if len(data.encode("utf-8"))>MAX_OUTPUT_BYTES:
   raise Blocked("R238_OUTPUT_OVER_BOUNDS")
  print(data)
  return 0
 except Exception:
  print("R238_WSL_LOCAL_PATH_METADATA_NO_GO",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
