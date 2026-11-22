"""R238 fabricated-only tests: no Docker, no Supabase, no private SQL."""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
SPEC=importlib.util.spec_from_file_location(
 "r238",ROOT/"scripts/release/r238_owner_docker_path_metadata.py"
)
r238=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r238)

def invented_r237():
 x={k:False for k in r238.R237_FALSE_KEYS}
 x.update({
  "work_package":"B10-R18-237",
  "decision":"NO_GO",
  "mode":"OWNER_WSL_DOCKER_CLIENT_METADATA_COMMANDS_ONLY",
  "r236_receipt_sha256_verified":True,
  "sanitized_output_only":True,
  "docker_client_version":{"status":"UNAVAILABLE","version_major_minor_patch":None},
  "docker_compose_version":{"status":"UNAVAILABLE","version_major_minor_patch":None},
  "docker_selected_context_category_only":"UNAVAILABLE",
  "docker_connection_override_variable_names_present":[]
 })
 assert set(x)==r238.R237_KEYS
 return x

def fake_bytes():
 return json.dumps(invented_r237()).encode()

def fake_digest():
 return hashlib.sha256(fake_bytes()).hexdigest()

class OwnerPathMetadataOnlyTests(unittest.TestCase):
 def test_pinned_r237_validator_accepts_valid_fake_with_test_digest(self):
  self.assertTrue(r238.validate_receipt(fake_bytes(),expected_sha=fake_digest()))
  with self.assertRaises(r238.Blocked):
   r238.validate_receipt(fake_bytes())
 def test_source_scope_and_no_go_approval_gates(self):
  for k in r238.R237_FALSE_KEYS:
   d=invented_r237();d[k]=True
   b=json.dumps(d).encode()
   with self.subTest(k=k),self.assertRaises(r238.Blocked):
    r238.validate_receipt(b,expected_sha=hashlib.sha256(b).hexdigest())
  d=invented_r237();d["decision"]="GO"
  b=json.dumps(d).encode()
  with self.assertRaises(r238.Blocked):
   r238.validate_receipt(b,expected_sha=hashlib.sha256(b).hexdigest())
 def test_forged_json_and_field_schema_rejected(self):
  with self.assertRaises(r238.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=r238.reject_duplicate)
  d=invented_r237();d["private_sql"]="invented secret"
  b=json.dumps(d).encode()
  with self.assertRaises(r238.Blocked):
   r238.validate_receipt(b,expected_sha=hashlib.sha256(b).hexdigest())
  d=invented_r237()
  d["docker_compose_version"]["version_major_minor_patch"]=[2,45,1]
  b=json.dumps(d).encode()
  with self.assertRaises(r238.Blocked):
   r238.validate_receipt(b,expected_sha=hashlib.sha256(b).hexdigest())
 def test_linux_regular_executable_is_category_only(self):
  out=r238.probe(
   where="/usr/bin/docker",
   home="/home/veryprivateuser",
   lstat_fn=lambda x:SimpleNamespace(st_mode=stat.S_IFREG|0o755),
   access_fn=lambda x,y:True
  )
  self.assertEqual(out["docker_executable_kind"],"REGULAR_EXECUTABLE")
  self.assertEqual(out["docker_path_entry_category"],"LINUX_SYSTEM_BIN")
  self.assertEqual(out["docker_resolved_target_category"],"LINUX_SYSTEM_BIN")
  self.assertNotIn("privateuser",json.dumps(out))
 def test_wsl_docker_desktop_symlink_category_only(self):
  out=r238.probe(
   where="/usr/bin/docker",
   home="/home/secret-user",
   lstat_fn=lambda x:SimpleNamespace(st_mode=stat.S_IFLNK|0o777),
   stat_fn=lambda x:SimpleNamespace(st_mode=stat.S_IFREG|0o755),
   access_fn=lambda x,y:True,
   resolve_fn=lambda x:"/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker"
  )
  self.assertEqual(out["docker_executable_kind"],"SYMLINK_TO_EXECUTABLE")
  self.assertEqual(out["docker_resolved_target_category"],"DOCKER_DESKTOP_WSL_MOUNT")
  self.assertNotIn("secret-user",json.dumps(out))
 def test_missing_or_unresolved_and_nonexecutable(self):
  absent=r238.probe(where="",home="/home/fake")
  self.assertEqual(absent["docker_executable_kind"],"NOT_FOUND")
  broken=r238.probe(
   where="/usr/bin/docker",home="/home/fake",
   lstat_fn=lambda x:SimpleNamespace(st_mode=stat.S_IFLNK|0o777),
   resolve_fn=lambda x:"/missing-target",
   stat_fn=lambda x: (_ for _ in ()).throw(OSError("private file path"))
  )
  self.assertEqual(broken["docker_executable_kind"],"SYMLINK_BROKEN_OR_UNRESOLVABLE")
  nonexec=r238.probe(
   where="/usr/bin/docker",home="/home/fake",
   lstat_fn=lambda x:SimpleNamespace(st_mode=stat.S_IFREG|0o600),
   access_fn=lambda x,y:False
  )
  self.assertEqual(nonexec["docker_executable_kind"],"REGULAR_NOT_EXECUTABLE")
  self.assertNotIn("private",json.dumps(broken))
 def test_fabricated_report_is_fixed_no_go_and_never_reads_file_contents(self):
  fabricated=r238.probe(
    where="/usr/bin/docker",home="/home/fake",
    lstat_fn=lambda x:SimpleNamespace(st_mode=stat.S_IFREG|0o755),
    access_fn=lambda x,y:True
  )
  actual_validate=r238.validate_receipt
  with patch.object(r238,"validate_receipt",
      side_effect=lambda raw:actual_validate(raw,expected_sha=fake_digest())):
   report=r238.report(fake_bytes(),
    probe_fn=lambda:fabricated,
    exists_fn=lambda p:str(p)=="/mnt/wsl/docker-desktop",
    home=Path("/home/fake"))
  self.assertEqual(report["decision"],"NO_GO")
  self.assertTrue(report["docker_desktop_wsl_mount_present"])
  self.assertFalse(report["docker_engine_contacted_or_started"])
  self.assertFalse(report["docker_cli_or_any_external_binary_executed"])
  self.assertFalse(report["hosted_or_local_sql_execution_authorized"])
  self.assertFalse(report["private_migration_sql_or_docket_opened"])
  self.assertFalse(report["remote_docker_context_absence_proven"])
  self.assertNotIn("/home/fake",json.dumps(report))
 def test_raw_identifiers_and_contexts_are_not_emitted(self):
  self.assertEqual(r238.category("/mnt/c/Windows/secret-folder/docker.exe","/home/x"),
                   "MOUNTED_OTHER_OR_WINDOWS")
  self.assertEqual(r238.category("/home/owner/.local/bin/docker","/home/owner"),
                   "OWNER_HOME")
  self.assertEqual(r238.category("/opt/hidden/secret/docker","/home/x"),
                   "OTHER")
  self.assertEqual(r238.WORK,"B10-R18-238")

if __name__=="__main__":
 unittest.main()
