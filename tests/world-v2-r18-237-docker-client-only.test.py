"""R237 uses mock Docker CLI replies and fictional R236 JSON only; no engine or SQL."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
SPEC=importlib.util.spec_from_file_location(
 "r237",ROOT/"scripts/release/r237_owner_docker_client_only_diagnostic.py"
)
r237=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r237)

def invented_r236():
 d={k:False for k in r237.EXPECTED_FALSE}
 d.update({
  "work_package":"B10-R18-236","decision":"NO_GO",
  "mode":"OWNER_WSL_LOCAL_FILESYSTEM_AND_PATH_METADATA_ONLY",
  "available_home_filesystem_mib_observation":40960,
  "available_memory_mib_observation":4096,
  "docker_socket_file_present_not_connectivity_proof":False,
  "expected_prior_private_helper_count_present":4,
  "private_workspace_folder_present":True,
  "wsl_kernel_marker_present":True,
  "tool_binaries_on_path":dict(r237.EXPECTED_TOOLS)
 })
 assert set(d)==r237.EXPECTED_KEYS
 return d

class FakeCompleted:
 def __init__(self,stdout,returncode=0):
  self.stdout=stdout
  self.stderr=""
  self.returncode=returncode

class DockerClientOnlyTests(unittest.TestCase):
 def verified_fake_receipt(self):
  fake=json.dumps(invented_r236()).encode()
  return fake

 def fake_sha(self):
  return patch.object(r237.hashlib,"sha256",
   return_value=SimpleNamespace(hexdigest=lambda:r237.R236_SHA256))

 def test_report_exact_three_docker_client_only_calls(self):
  seen=[]
  responses={
    ("docker","--version"):"Docker version 28.5.1, build fake",
    ("docker","compose","version"):"Docker Compose version v2.40.3",
    ("docker","context","show"):"desktop-linux"
  }
  def fake_run(argv,**kw):
   seen.append((tuple(argv),kw))
   self.assertFalse(kw["shell"])
   self.assertEqual(kw["timeout"],8)
   self.assertEqual(set(kw["env"]),{"PATH","HOME","LANG"})
   self.assertNotIn("DOCKER_HOST",kw["env"])
   return FakeCompleted(responses[tuple(argv)])
  with self.fake_sha():
   result=r237.report(self.verified_fake_receipt(),runner=fake_run,
      environ={"DOCKER_HOST":"tcp://secret.invalid:2376","DOCKER_CONTEXT":"SECRET_NAME"},
      binary_present=True)
  self.assertEqual([x[0] for x in seen],list(r237.ALLOWED_COMMANDS))
  self.assertEqual(result["docker_client_version"]["version_major_minor_patch"],[28,5,1])
  self.assertEqual(result["docker_compose_version"]["version_major_minor_patch"],[2,40,3])
  self.assertEqual(result["docker_selected_context_category_only"],"DESKTOP_LINUX")
  self.assertEqual(result["docker_connection_override_variable_names_present"],
      ["DOCKER_CONTEXT","DOCKER_HOST"])
  self.assertNotIn("secret.invalid",json.dumps(result))
  self.assertNotIn("SECRET_NAME",json.dumps(result))
  self.assertEqual(result["decision"],"NO_GO")
  self.assertFalse(result["docker_engine_availability_proven"])
  self.assertFalse(result["docker_remote_target_absence_proven"])

 def test_no_docker_no_exec(self):
  def never(*args,**kw):
   raise AssertionError("docker should not run")
  with self.fake_sha():
   result=r237.report(self.verified_fake_receipt(),runner=never,
      environ={},binary_present=False)
  self.assertEqual(result["docker_client_version"]["status"],"UNAVAILABLE")
  self.assertEqual(result["docker_selected_context_category_only"],"UNAVAILABLE")

 def test_other_context_name_never_exported(self):
  def fake_run(argv,**kw):
   if argv==["docker","context","show"]:
    return FakeCompleted("a-secret-custom-remote-context")
   if argv==["docker","--version"]:
    return FakeCompleted("Docker version 27.4.0, build fictional")
   return FakeCompleted("A private internal error: super_secret_token",1)
  with self.fake_sha():
   result=r237.report(self.verified_fake_receipt(),runner=fake_run,
      environ={},binary_present=True)
  self.assertEqual(result["docker_compose_version"]["status"],"UNAVAILABLE")
  self.assertEqual(result["docker_selected_context_category_only"],"OTHER_OR_UNRECOGNIZED")
  self.assertNotIn("secret",json.dumps(result))
  self.assertNotIn("fictional",json.dumps(result))
  self.assertFalse(result["docker_container_started_pulled_or_built"])

 def test_strict_r236_schema_rejects_forged_approvals(self):
  for key in r237.EXPECTED_FALSE:
   x=invented_r236(); x[key]=True
   with self.subTest(key=key),self.fake_sha(),self.assertRaises(r237.Blocked):
    r237.validate_r236(json.dumps(x).encode())
  for key in r237.EXPECTED_TOOLS:
   x=invented_r236();x["tool_binaries_on_path"][key]=not x["tool_binaries_on_path"][key]
   with self.subTest(binary=key),self.fake_sha(),self.assertRaises(r237.Blocked):
    r237.validate_r236(json.dumps(x).encode())

 def test_duplicate_json_and_modified_sha_rejected(self):
  with self.assertRaises(r237.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=r237.unique_pairs)
  with self.assertRaises(r237.Blocked):
   r237.validate_r236(self.verified_fake_receipt())
  with self.fake_sha():
   self.assertTrue(r237.validate_r236(self.verified_fake_receipt()))
  x=invented_r236();x["unexpected_database_password"]="password fake"
  with self.fake_sha(),self.assertRaises(r237.Blocked):
   r237.validate_r236(json.dumps(x).encode())

 def test_all_mutation_and_network_cli_command_attempts_blocked(self):
  for cmd in (
   ("docker","info"),("docker","start","x"),("docker","run","hello-world"),
   ("docker","pull","postgres"),("docker","context","use","remote"),
   ("supabase","start"),("psql","-c","SELECT 1")
  ):
   with self.subTest(cmd=cmd),self.assertRaises(r237.Blocked):
    r237.safe_command(cmd,runner=lambda *args,**kw: None)

 def test_bad_version_text_rejected_not_echoed(self):
  r={"status":"EXIT_0","output":"tcp://private:1234; Docker version 28.3.0"}
  self.assertEqual(r237.parse_version(r,r237.DOCKER_VERSION_RE)["status"],"UNRECOGNIZED")
  self.assertEqual(r237.context_category(r),"OTHER_OR_UNRECOGNIZED")
  self.assertEqual(r237.parse_version({"status":"EXIT_0","output":"Docker version 28.5.1, build fake"},r237.DOCKER_VERSION_RE)["status"],"PARSED")

if __name__=="__main__":
 unittest.main()
