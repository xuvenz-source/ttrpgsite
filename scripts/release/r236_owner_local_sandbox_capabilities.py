#!/usr/bin/env python3
"""R236: owner-local NO-GO WSL capability inventory; reads metadata only.

Never invokes Supabase/Docker/psql or any other executable; never connects to
a socket, network or DB; never opens original migration SQL or private docket.
No private paths, executable paths, hostnames, environment values or secrets
are returned. Results are hints, not proof of an isolated test environment.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys

WORK="B10-R18-236"
TOOLS=("supabase","docker","podman","psql","pg_config")
EXPECTED_HELPERS=(
 "r154_private_history_audit.py",
 "r191_private_fog_status_lineage.py",
 "r211_private_qa_migration_effects.py",
 "r230_private_opaque_do_effects.py",
)
MAX_REPORT_BYTES=3000

def wsl_kernel_detected():
 try:
  with open("/proc/version","r",encoding="utf-8") as handle:
   return "microsoft" in handle.read(512).lower()
 except (OSError,UnicodeError):
  return False

def available_memory_mib():
 try:
  with open("/proc/meminfo","r",encoding="utf-8") as handle:
   for _ in range(12):
    line=handle.readline()
    if line.startswith("MemAvailable:"):
     match=re.fullmatch(r"MemAvailable:\s+(\d+)\s+kB\s*",line)
     if match:
      return min(int(match.group(1))//1024,1_000_000)
 except (OSError,UnicodeError,ValueError):
  pass
 return None

def local_disk_mib(path):
 try:
  fs=os.statvfs(path)
  return min((fs.f_bavail*fs.f_frsize)//(1024*1024),100_000_000)
 except (OSError,ValueError):
  return None

def docker_socket_present():
 try:
  st=os.lstat("/var/run/docker.sock")
  return stat.S_ISSOCK(st.st_mode)
 except OSError:
  return False

def report(*,detect_binary=None,private_root=None,kernel=None,memory=None,disk=None,socket_present=None):
 """Dependency-injected fake sensor values are for local fictional unit tests."""
 if detect_binary is None:
  detect_binary=lambda name:shutil.which(name) is not None
 if private_root is None:
  private_root=Path.home()/"ttrpg-history-private"
 if kernel is None:
  kernel=wsl_kernel_detected()
 if memory is None:
  memory=available_memory_mib()
 if disk is None:
  disk=local_disk_mib(Path.home())
 if socket_present is None:
  socket_present=docker_socket_present()
 exists=private_root.is_dir() and not private_root.is_symlink()
 helpers=sum((private_root/name).is_file() and not (private_root/name).is_symlink()
             for name in EXPECTED_HELPERS) if exists else 0
 tool_presence={name:bool(detect_binary(name)) for name in TOOLS}
 if memory is not None and (type(memory) is not int or memory<0):
  raise ValueError("INVALID_LOCAL_RESOURCE")
 if disk is not None and (type(disk) is not int or disk<0):
  raise ValueError("INVALID_LOCAL_RESOURCE")
 return {
  "work_package":WORK,
  "decision":"NO_GO",
  "mode":"OWNER_WSL_LOCAL_FILESYSTEM_AND_PATH_METADATA_ONLY",
  "wsl_kernel_marker_present":bool(kernel),
  "private_workspace_folder_present":bool(exists),
  "expected_prior_private_helper_count_present":int(helpers),
  "tool_binaries_on_path":tool_presence,
  "docker_socket_file_present_not_connectivity_proof":bool(socket_present),
  "available_memory_mib_observation":memory,
  "available_home_filesystem_mib_observation":disk,
  "executable_versions_inspected":False,
  "docker_daemon_or_supabase_stack_started_or_queried":False,
  "local_postgres_engine_version_proven":False,
  "local_supabase_managed_service_compatibility_proven":False,
  "local_environment_isolation_or_remote_link_absence_proven":False,
  "execution_of_original_migration_sql_authorized":False,
  "credentials_or_environment_values_inspected":False,
  "network_or_database_accessed":False,
  "subprocess_or_any_external_binary_executed":False,
  "source_sql_executed":False,
  "private_paths_sql_names_migration_contents_or_secrets_exported":False
 }

def main():
 try:
  data=report()
  output=json.dumps(data,indent=2,sort_keys=True)
  if len(output.encode("utf-8"))>MAX_REPORT_BYTES:
   raise ValueError("R236_OUTPUT_SIZE")
  print(output)
  return 0
 except Exception:
  print("R236_LOCAL_INVENTORY_NO_GO: local metadata probe unavailable.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
