#!/usr/bin/env python3
"""R239 owner WSL Docker executable first-four-byte magic ONLY.

Does not run Docker or any subprocess, access Docker socket/config, execute
SQL, connect to a database/network, modify WSL integration, or install software.
Reads exactly 4 bytes from the PATH-selected 'docker' regular file only after
validating the exact owner R238 sanitized receipt. Reports fixed enums, never
bytes, raw paths, executable contents, environment values or credentials.
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

WORK="B10-R18-239"
R238_SHA256="6ff99a2f396d7eb57ffe20847971bd21be9d7d04b086972c0895baae1db88f6f"
MAX_RECEIPT_BYTES=4096
MAX_EXE_BYTES=1024*1024*1024
EXPECTED_TOP={
 "containers_images_or_resources_modified","decision",
 "docker_binary_contents_or_config_read","docker_cli_or_any_external_binary_executed",
 "docker_desktop_wsl_mount_present","docker_engine_contacted_or_started",
 "docker_executable_kind","docker_path_entry_category","docker_path_entry_found",
 "docker_resolved_target_category",
 "docker_standard_socket_file_present_not_connectivity_proof",
 "docker_user_config_file_present_not_read",
 "docker_user_context_directory_present_not_read",
 "hosted_or_local_sql_execution_authorized","mode",
 "original_qa_or_production_deployment_authorized",
 "private_migration_sql_or_docket_opened",
 "r237_sanitized_receipt_hash_verified",
 "remote_docker_context_absence_proven","remote_or_local_database_accessed",
 "sanitized_metadata_only","work_package",
}
FALSE_KEYS=(
 "containers_images_or_resources_modified",
 "docker_binary_contents_or_config_read",
 "docker_cli_or_any_external_binary_executed",
 "docker_desktop_wsl_mount_present","docker_engine_contacted_or_started",
 "docker_standard_socket_file_present_not_connectivity_proof",
 "hosted_or_local_sql_execution_authorized",
 "original_qa_or_production_deployment_authorized",
 "private_migration_sql_or_docket_opened",
 "remote_docker_context_absence_proven",
 "remote_or_local_database_accessed",
)
class Blocked(Exception):pass

def unique_pairs(pairs):
 d={}
 for k,v in pairs:
  if k in d:raise Blocked("DUPLICATE_RECEIPT_FIELD")
  d[k]=v
 return d

def validate_r238(raw,expected_sha=R238_SHA256):
 if type(raw) is not bytes or not 100<len(raw)<=MAX_RECEIPT_BYTES:
  raise Blocked("RECEIPT_INVALID_SIZE")
 if hashlib.sha256(raw).hexdigest()!=expected_sha:
  raise Blocked("R238_RECEIPT_SHA_CHANGED")
 try:
  d=json.loads(raw,object_pairs_hook=unique_pairs)
 except (ValueError,UnicodeError):
  raise Blocked("R238_INVALID_JSON") from None
 if type(d) is not dict or set(d)!=EXPECTED_TOP:
  raise Blocked("R238_SCHEMA_DRIFT")
 if (d["work_package"]!="B10-R18-238" or d["decision"]!="NO_GO" or
     d["mode"]!="OWNER_WSL_DOCKER_EXECUTABLE_FILESYSTEM_METADATA_ONLY" or
     d["r237_sanitized_receipt_hash_verified"] is not True or
     d["sanitized_metadata_only"] is not True):
  raise Blocked("R238_FALSE_SCOPE")
 if any(d[k] is not False for k in FALSE_KEYS):
  raise Blocked("R238_UNEXPECTED_AUTHORITY")
 if (d["docker_path_entry_found"] is not True or
     d["docker_executable_kind"]!="REGULAR_EXECUTABLE" or
     d["docker_path_entry_category"]!="MOUNTED_OTHER_OR_WINDOWS" or
     d["docker_resolved_target_category"]!="MOUNTED_OTHER_OR_WINDOWS" or
     d["docker_user_config_file_present_not_read"] is not True or
     d["docker_user_context_directory_present_not_read"] is not True):
  raise Blocked("R238_DIAGNOSTIC_CHANGED")
 return True

def classify_header(header):
 if type(header) is not bytes or len(header)!=4:
  raise Blocked("UNEXPECTED_BINARY_HEADER")
 if header.startswith(b"\x7fELF"):
  return "ELF_LINUX_OR_UNIX_BINARY"
 if header.startswith(b"MZ"):
  return "MZ_POSSIBLE_WINDOWS_PE"
 if header.startswith(b"#!"):
  return "SHEBANG_SCRIPT"
 return "OTHER_UNKNOWN_HEADER"

def inspect_selected_docker(*,which=shutil.which,opener=os.open,reader=os.read,
                             closer=os.close,fstatter=os.fstat):
 selected=which("docker")
 if not selected:
  return {"docker_header_category":"UNAVAILABLE",
          "docker_entry_suffix_category":"NOT_FOUND",
          "exactly_four_bytes_read":False}
 suffix="EXE_SUFFIX" if Path(selected).name.lower().endswith(".exe") else "NO_EXE_SUFFIX"
 flags=os.O_RDONLY|os.O_CLOEXEC|os.O_NONBLOCK
 if hasattr(os,"O_NOFOLLOW"):
  flags|=os.O_NOFOLLOW
 fd=None
 try:
  fd=opener(selected,flags)
  metadata=fstatter(fd)
  if not stat.S_ISREG(metadata.st_mode):
   category="NOT_REGULAR"
  elif not 4<=metadata.st_size<=MAX_EXE_BYTES:
   category="INVALID_OR_OVERSIZE"
  else:
   header=reader(fd,4)
   category=classify_header(header)
 except (OSError,ValueError,Blocked):
  category="UNREADABLE"
 finally:
  if fd is not None:
   try:closer(fd)
   except OSError:pass
 return {
  "docker_header_category":category,
  "docker_entry_suffix_category":suffix,
  "exactly_four_bytes_read":category in (
   "ELF_LINUX_OR_UNIX_BINARY","MZ_POSSIBLE_WINDOWS_PE",
   "SHEBANG_SCRIPT","OTHER_UNKNOWN_HEADER")
 }

def report(receipt_bytes,*,inspection=inspect_selected_docker):
 validate_r238(receipt_bytes)
 evidence=inspection()
 if type(evidence) is not dict or set(evidence)!={
     "docker_header_category","docker_entry_suffix_category","exactly_four_bytes_read"}:
  raise Blocked("R239_INVALID_INSPECTION")
 if evidence["docker_header_category"] not in (
      "UNAVAILABLE","NOT_REGULAR","INVALID_OR_OVERSIZE","UNREADABLE",
      "ELF_LINUX_OR_UNIX_BINARY","MZ_POSSIBLE_WINDOWS_PE",
      "SHEBANG_SCRIPT","OTHER_UNKNOWN_HEADER"):
  raise Blocked("R239_UNEXPECTED_FORMAT")
 if evidence["docker_entry_suffix_category"] not in (
      "NOT_FOUND","EXE_SUFFIX","NO_EXE_SUFFIX"):
  raise Blocked("R239_INVALID_SUFFIX")
 if type(evidence["exactly_four_bytes_read"]) is not bool:
  raise Blocked("R239_INVALID_BYTE_COUNT_FLAG")
 if evidence["exactly_four_bytes_read"] is not (evidence["docker_header_category"] in
    ("ELF_LINUX_OR_UNIX_BINARY","MZ_POSSIBLE_WINDOWS_PE","SHEBANG_SCRIPT","OTHER_UNKNOWN_HEADER")):
  raise Blocked("R239_INCONSISTENT_INSPECTION")
 return {
  "work_package":WORK,
  "decision":"NO_GO",
  "mode":"OWNER_WSL_DOCKER_FOUR_BYTE_HEADER_ONLY",
  "r238_sanitized_receipt_sha_verified":True,
  **evidence,
  "docker_binary_executed":False,
  "docker_daemon_or_remote_endpoint_contacted":False,
  "docker_config_or_context_contents_read":False,
  "binary_payload_or_raw_path_exported":False,
  "private_sql_migrations_or_docket_accessed":False,
  "sql_executed":False,
  "any_remote_or_local_db_accessed":False,
  "docker_installs_starts_pulls_or_changes":False,
  "qa_or_production_execution_authorized":False,
  "sandbox_sql_execution_authorized":False,
  "isolation_or_engine_readiness_proven":False,
  "sanitized_enums_only":True,
 }

def main():
 parser=argparse.ArgumentParser(description="R239 Docker 4-byte file type only, NO_GO")
 parser.add_argument("--r238",type=Path,
   default=Path.home()/"ttrpg-history-private"/"r238-sanitized-docker-path.json")
 args=parser.parse_args()
 try:
  if args.r238.is_symlink() or not args.r238.is_file():
   raise Blocked("R238_RECEIPT_INVALID_FILE")
  raw=args.r238.read_bytes()
  data=json.dumps(report(raw),sort_keys=True,indent=2)
  if len(data.encode("utf-8"))>2048:
   raise Blocked("R239_OUTPUT_TOO_LARGE")
  print(data)
  return 0
 except Exception:
  print("R239_DOCKER_BINARY_HEADER_NO_GO: stopped before any external process or database action.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
