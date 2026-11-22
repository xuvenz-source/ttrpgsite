"""R236 tests use only fictional local paths and injected metadata; no tools run."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
SPEC=importlib.util.spec_from_file_location(
 "r236",ROOT/"scripts/release/r236_owner_local_sandbox_capabilities.py"
)
r236=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r236)

def fake_report(path,bins=None,memory=2048,disk=6144,socket=False,kernel=True):
 return r236.report(
  detect_binary=lambda name: name in (bins or set()),
  private_root=path,
  kernel=kernel,memory=memory,disk=disk,socket_present=socket
 )

class LocalCapabilityNoSqlTests(unittest.TestCase):
 def test_absent_private_archive_no_tools_still_no_go(self):
  with tempfile.TemporaryDirectory() as t:
   data=fake_report(Path(t)/"missing")
  self.assertEqual(data["decision"],"NO_GO")
  self.assertFalse(data["private_workspace_folder_present"])
  self.assertEqual(data["expected_prior_private_helper_count_present"],0)
  self.assertFalse(any(data["tool_binaries_on_path"].values()))
 def test_fake_helpers_are_counted_without_opening_contents(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t)
   for name in r236.EXPECTED_HELPERS:
    (root/name).write_text("invented, never SQL")
   data=fake_report(root,{"supabase","docker","psql"},socket=True)
   self.assertEqual(data["expected_prior_private_helper_count_present"],4)
   self.assertTrue(data["tool_binaries_on_path"]["supabase"])
   self.assertTrue(data["tool_binaries_on_path"]["docker"])
   self.assertFalse(data["tool_binaries_on_path"]["pg_config"])
   self.assertTrue(data["docker_socket_file_present_not_connectivity_proof"])
   self.assertFalse(data["docker_daemon_or_supabase_stack_started_or_queried"])
 def test_symlink_helpers_not_counted_and_private_paths_not_printed(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t)
   payload=root/"private_log"
   payload.write_text("TOPSECRET fake not a real token")
   (root/r236.EXPECTED_HELPERS[0]).symlink_to(payload)
   data=fake_report(root,{"podman"})
   self.assertEqual(data["expected_prior_private_helper_count_present"],0)
   rendered=json.dumps(data)
   self.assertNotIn(t,rendered)
   self.assertNotIn("TOPSECRET",rendered)
   self.assertNotIn("postgres://",rendered)
 def test_no_binary_version_or_hosted_target_proven(self):
  with tempfile.TemporaryDirectory() as t:
   data=fake_report(Path(t),set(r236.TOOLS))
  for k in (
    "executable_versions_inspected",
    "docker_daemon_or_supabase_stack_started_or_queried",
    "local_postgres_engine_version_proven",
    "local_supabase_managed_service_compatibility_proven",
    "local_environment_isolation_or_remote_link_absence_proven",
    "execution_of_original_migration_sql_authorized",
    "credentials_or_environment_values_inspected",
    "network_or_database_accessed",
    "subprocess_or_any_external_binary_executed",
    "source_sql_executed",
    "private_paths_sql_names_migration_contents_or_secrets_exported"
  ):
   with self.subTest(key=k):
    self.assertIs(data[k],False)
 def test_resource_values_only_numeric_or_unknown(self):
  with tempfile.TemporaryDirectory() as t:
   data=fake_report(Path(t),memory=1000,disk=2000)
   self.assertEqual(data["available_memory_mib_observation"],1000)
   self.assertEqual(data["available_home_filesystem_mib_observation"],2000)
   with self.assertRaises(ValueError):
    fake_report(Path(t),memory="private")
   with self.assertRaises(ValueError):
    fake_report(Path(t),disk=-1)
 def test_output_fixed_schema_no_private_file_identifiers(self):
  with tempfile.TemporaryDirectory() as t:
   data=fake_report(Path(t))
  rendered=json.dumps(data)
  self.assertLess(len(rendered),r236.MAX_REPORT_BYTES)
  self.assertNotIn(r236.EXPECTED_HELPERS[0],rendered)
  self.assertEqual(set(data["tool_binaries_on_path"]),set(r236.TOOLS))
  self.assertEqual(data["mode"],"OWNER_WSL_LOCAL_FILESYSTEM_AND_PATH_METADATA_ONLY")

if __name__=="__main__":
 unittest.main()
