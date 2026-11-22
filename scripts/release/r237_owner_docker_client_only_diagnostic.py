#!/usr/bin/env python3
"""R237: owner-local Docker CLIENT-ONLY capability check, permanently NO_GO.

Reads only the owner's R236 sanitized JSON; no private SQL, database or docket.
Runs exactly three Docker CLI *client metadata* commands (no engine query):
  docker --version; docker compose version; docker context show
No shell, Docker daemon info, Docker start, pull/build, SQL, network requests
from Python, Supabase CLI, migration/install or Docker container execution.
Never returns unredacted command output, context name, filesystem path,
credentials, connection endpoint or environment variable values.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

WORK="B10-R18-237"
R236_SHA256="b4b686ad5e94fb4dec92d02628b07328e6fa9d179504d73af59a8c4c96e97699"
MAX_RECEIPT_BYTES=4096
MAX_OUTPUT_BYTES=3000
EXPECTED_TOOLS={"docker":True,"supabase":False,"psql":False,"pg_config":False,"podman":False}
EXPECTED_FALSE=(
 "credentials_or_environment_values_inspected",
 "docker_daemon_or_supabase_stack_started_or_queried",
 "executable_versions_inspected",
 "execution_of_original_migration_sql_authorized",
 "local_environment_isolation_or_remote_link_absence_proven",
 "local_postgres_engine_version_proven",
 "local_supabase_managed_service_compatibility_proven",
 "network_or_database_accessed",
 "private_paths_sql_names_migration_contents_or_secrets_exported",
 "source_sql_executed",
 "subprocess_or_any_external_binary_executed",
)
EXPECTED_KEYS={
 "available_home_filesystem_mib_observation","available_memory_mib_observation",
 "credentials_or_environment_values_inspected","decision",
 "docker_daemon_or_supabase_stack_started_or_queried",
 "docker_socket_file_present_not_connectivity_proof",
 "executable_versions_inspected","execution_of_original_migration_sql_authorized",
 "expected_prior_private_helper_count_present",
 "local_environment_isolation_or_remote_link_absence_proven",
 "local_postgres_engine_version_proven",
 "local_supabase_managed_service_compatibility_proven",
 "mode","network_or_database_accessed",
 "private_paths_sql_names_migration_contents_or_secrets_exported",
 "private_workspace_folder_present","source_sql_executed",
 "subprocess_or_any_external_binary_executed",
 "tool_binaries_on_path","work_package","wsl_kernel_marker_present",
}
DOCKER_VERSION_RE=re.compile(r"^Docker version (\d+)\.(\d+)\.(\d+)(?:[+.-][^\s,]*)?(?:,|\s|$)")
COMPOSE_VERSION_RE=re.compile(r"^Docker Compose version v?(\d+)\.(\d+)\.(\d+)(?:[+.-][^\s,]*)?(?:\s|$)")
ALLOWED_COMMANDS=(
 ("docker","--version"),
 ("docker","compose","version"),
 ("docker","context","show"),
)
REMOTE_FLAG_NAMES=("DOCKER_HOST","DOCKER_CONTEXT","DOCKER_TLS_VERIFY","DOCKER_CERT_PATH")

class Blocked(Exception): pass

def unique_pairs(pairs):
 obj={}
 for key,value in pairs:
  if key in obj:
   raise Blocked("DUPLICATE_SANITIZED_RECEIPT_PROPERTY")
  obj[key]=value
 return obj

def validate_r236(raw:bytes):
 if len(raw)>MAX_RECEIPT_BYTES or len(raw)<100 or hashlib.sha256(raw).hexdigest()!=R236_SHA256:
  raise Blocked("R236_RECEIPT_DIGEST_OR_LENGTH_MISMATCH")
 try:
  d=json.loads(raw,object_pairs_hook=unique_pairs)
 except (ValueError,UnicodeError):
  raise Blocked("R236_INVALID_JSON") from None
 if type(d) is not dict or set(d)!=EXPECTED_KEYS:
  raise Blocked("R236_RECEIPT_SCHEMA_CHANGED")
 if (d["work_package"]!="B10-R18-236" or d["decision"]!="NO_GO" or
     d["mode"]!="OWNER_WSL_LOCAL_FILESYSTEM_AND_PATH_METADATA_ONLY"):
  raise Blocked("R236_WRONG_SCOPE")
 if any(d[k] is not False for k in EXPECTED_FALSE):
  raise Blocked("R236_FALSE_AUTHORITY")
 if (d["private_workspace_folder_present"] is not True or
     d["expected_prior_private_helper_count_present"]!=4 or
     d["wsl_kernel_marker_present"] is not True or
     d["docker_socket_file_present_not_connectivity_proof"] is not False):
  raise Blocked("R236_UNEXPECTED_LOCAL_HOST")
 tools=d["tool_binaries_on_path"]
 if type(tools) is not dict or set(tools)!=set(EXPECTED_TOOLS) or any(
     tools[k] is not v for k,v in EXPECTED_TOOLS.items()):
  raise Blocked("R236_TOOL_BOUNDARY_CHANGED")
 for key in ("available_home_filesystem_mib_observation","available_memory_mib_observation"):
  if type(d[key]) is not int or d[key]<256:
   raise Blocked("R236_RESOURCE_OBSERVATION_INVALID")
 return True

def safe_command(argv,runner=subprocess.run):
 argv=tuple(argv)
 if argv not in ALLOWED_COMMANDS:
  raise Blocked("R237_UNAUTHORIZED_CLI_COMMAND")
 # Never forward stored Docker host/context settings into the command.
 # No Docker command below requests the daemon, a container or remote API.
 safe_env={"PATH":os.environ.get("PATH",""),
           "HOME":str(Path.home()),
           "LANG":"C"}
 try:
  result=runner(list(argv),input="",capture_output=True,text=True,
     shell=False,timeout=8,check=False,env=safe_env)
 except (OSError,subprocess.SubprocessError):
  return {"status":"UNAVAILABLE","output":""}
 value=result.stdout if result.returncode==0 else ""
 if result.returncode!=0:
  return {"status":"UNAVAILABLE","output":""}
 return {"status":"EXIT_0","output":value[:256].strip()}

def parse_version(result,pattern):
 if result["status"]!="EXIT_0":
  return {"status":"UNAVAILABLE","version_major_minor_patch":None}
 match=pattern.match(result["output"])
 if not match:
  return {"status":"UNRECOGNIZED","version_major_minor_patch":None}
 version=[int(v) for v in match.groups()]
 if any(v<0 or v>9999 for v in version):
  return {"status":"UNRECOGNIZED","version_major_minor_patch":None}
 return {"status":"PARSED","version_major_minor_patch":version}

def context_category(result):
 if result["status"]!="EXIT_0":
  return "UNAVAILABLE"
 name=result["output"]
 if name=="default":
  return "DEFAULT"
 if name=="desktop-linux":
  return "DESKTOP_LINUX"
 # Never export a custom context name; it may disclose a remote provider.
 return "OTHER_OR_UNRECOGNIZED"

def report(receipt_bytes,runner=subprocess.run,environ=None,binary_present=None):
 validate_r236(receipt_bytes)
 if environ is None:environ=os.environ
 if binary_present is None:binary_present=shutil.which("docker") is not None
 if not binary_present:
  version={"status":"UNAVAILABLE","version_major_minor_patch":None}
  compose={"status":"UNAVAILABLE","version_major_minor_patch":None}
  context="UNAVAILABLE"
 else:
  version=parse_version(safe_command(ALLOWED_COMMANDS[0],runner),DOCKER_VERSION_RE)
  compose=parse_version(safe_command(ALLOWED_COMMANDS[1],runner),COMPOSE_VERSION_RE)
  context=context_category(safe_command(ALLOWED_COMMANDS[2],runner))
 return {
  "work_package":WORK,
  "decision":"NO_GO",
  "mode":"OWNER_WSL_DOCKER_CLIENT_METADATA_COMMANDS_ONLY",
  "r236_receipt_sha256_verified":True,
  "docker_client_version":version,
  "docker_compose_version":compose,
  "docker_selected_context_category_only":context,
  "docker_connection_override_variable_names_present":sorted(
    key for key in REMOTE_FLAG_NAMES if key in environ
  ),
  "docker_daemon_queried_or_started":False,
  "docker_container_started_pulled_or_built":False,
  "docker_engine_availability_proven":False,
  "docker_remote_target_absence_proven":False,
  "supabase_cli_installed_or_run":False,
  "supabase_managed_services_verified":False,
  "private_sql_or_docket_accessed":False,
  "sql_or_db_query_executed":False,
  "remote_original_qa_or_production_database_accessed":False,
  "local_disposable_replay_approved":False,
  "historical_83_source_migrations_approved":False,
  "sanitized_output_only":True
 }

def main():
 parser=argparse.ArgumentParser(description="R237 limited Docker client metadata; NO_GO")
 parser.add_argument("--r236",type=Path,default=Path.home()/"ttrpg-history-private"/"r236-sanitized-capabilities.json")
 args=parser.parse_args()
 try:
  if args.r236.is_symlink() or not args.r236.is_file():
   raise Blocked("R236_RECEIPT_NOT_REGULAR_FILE")
  raw=args.r236.read_bytes()
  result=report(raw)
  rendered=json.dumps(result,sort_keys=True,indent=2)
  if len(rendered.encode())>MAX_OUTPUT_BYTES:raise Blocked("R237_OUTPUT_TOO_LONG")
  print(rendered)
  return 0
 except Exception:
  print("R237_CLIENT_ONLY_DIAGNOSTIC_NO_GO: stopped before any SQL or DB action.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
