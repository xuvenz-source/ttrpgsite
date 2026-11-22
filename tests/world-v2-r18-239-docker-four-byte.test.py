"""R239 tests operate on fabricated four-byte file headers only.

Never invokes Docker, Supabase, SQL, the original private migration archive,
network, a user Docker client, or any external binary.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
SPEC=importlib.util.spec_from_file_location(
 "r239",ROOT/"scripts/release/r239_owner_docker_four_byte_type.py")
r239=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r239)

def fictional_r238():
 d={k:False for k in r239.FALSE_KEYS}
 d.update({
  "work_package":"B10-R18-238","decision":"NO_GO",
  "mode":"OWNER_WSL_DOCKER_EXECUTABLE_FILESYSTEM_METADATA_ONLY",
  "r237_sanitized_receipt_hash_verified":True,
  "sanitized_metadata_only":True,
  "docker_path_entry_found":True,
  "docker_executable_kind":"REGULAR_EXECUTABLE",
  "docker_path_entry_category":"MOUNTED_OTHER_OR_WINDOWS",
  "docker_resolved_target_category":"MOUNTED_OTHER_OR_WINDOWS",
  "docker_user_config_file_present_not_read":True,
  "docker_user_context_directory_present_not_read":True
 })
 assert set(d)==r239.EXPECTED_TOP
 return d

def fake_receipt():
 return json.dumps(fictional_r238()).encode()

class FourBytesOnlyTests(unittest.TestCase):
 def test_invented_receipt_only_with_explicit_fake_hash(self):
  raw=fake_receipt()
  with self.assertRaises(r239.Blocked):
   r239.validate_r238(raw)
  self.assertTrue(r239.validate_r238(raw,expected_sha=hashlib.sha256(raw).hexdigest()))

 def test_changed_yes_no_or_unexpected_fields_rejected(self):
  for key in r239.FALSE_KEYS:
   d=fictional_r238();d[key]=True
   raw=json.dumps(d).encode()
   with self.subTest(field=key),self.assertRaises(r239.Blocked):
    r239.validate_r238(raw,expected_sha=hashlib.sha256(raw).hexdigest())
  for changed in [
   ("decision","GO"),
   ("docker_executable_kind","SYMLINK_TO_EXECUTABLE"),
   ("docker_path_entry_category","LINUX_SYSTEM_BIN"),
   ("r237_sanitized_receipt_hash_verified",False)
  ]:
   d=fictional_r238();d[changed[0]]=changed[1]
   raw=json.dumps(d).encode()
   with self.subTest(field=changed[0]),self.assertRaises(r239.Blocked):
    r239.validate_r238(raw,expected_sha=hashlib.sha256(raw).hexdigest())
  d=fictional_r238();d["private_filename"]="fictional"
  raw=json.dumps(d).encode()
  with self.assertRaises(r239.Blocked):
   r239.validate_r238(raw,expected_sha=hashlib.sha256(raw).hexdigest())

 def test_duplicate_json_rejected(self):
  with self.assertRaises(r239.Blocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',object_pairs_hook=r239.unique_pairs)

 def test_four_header_classes_and_wrong_sizes(self):
  for header,expected in [
   (b"\\x7fELF".decode("unicode_escape").encode("latin1"),"ELF_LINUX_OR_UNIX_BINARY"),
   (b"MZAB","MZ_POSSIBLE_WINDOWS_PE"),
   (b"#!/b","SHEBANG_SCRIPT"),
   (b"ABCD","OTHER_UNKNOWN_HEADER")
  ]:
   with self.subTest(category=expected):
    self.assertEqual(r239.classify_header(header),expected)
  for value in (b"",b"AB",b"ABCDE","MZAB"):
   with self.assertRaises(r239.Blocked):
    r239.classify_header(value)

 def test_real_temp_fake_executable_only_four_bytes_read(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/"docker"
   p.write_bytes(b"\\x7fELF".decode("unicode_escape").encode("latin1")+b"A"*2048)
   p.chmod(0o700)
   reads=[]
   def record(fd,n):
    reads.append(n)
    return os.read(fd,n)
   result=r239.inspect_selected_docker(
    which=lambda cmd:str(p),reader=record)
   self.assertEqual(result["docker_header_category"],"ELF_LINUX_OR_UNIX_BINARY")
   self.assertEqual(reads,[4])
   self.assertTrue(result["exactly_four_bytes_read"])
   self.assertNotIn(t,json.dumps(result))

 def test_no_follow_symlink_and_missing_binary(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/"docker.exe"
   path.write_bytes(b"MZXY"+b"fake")
   link=Path(t)/"docker"
   link.symlink_to(path)
   result=r239.inspect_selected_docker(which=lambda cmd:str(link))
   if hasattr(os,"O_NOFOLLOW"):
    self.assertEqual(result["docker_header_category"],"UNREADABLE")
    self.assertFalse(result["exactly_four_bytes_read"])
   else:
    self.assertIn(result["docker_header_category"],
                  ("MZ_POSSIBLE_WINDOWS_PE","UNREADABLE"))
   missing=r239.inspect_selected_docker(which=lambda cmd:None)
   self.assertEqual(missing["docker_header_category"],"UNAVAILABLE")
   self.assertEqual(missing["docker_entry_suffix_category"],"NOT_FOUND")
   self.assertNotIn(t,json.dumps(missing))

 def test_mocked_report_no_go_no_path_or_sql(self):
  raw=fake_receipt()
  actual=r239.validate_r238
  inspection={"docker_header_category":"MZ_POSSIBLE_WINDOWS_PE",
     "docker_entry_suffix_category":"NO_EXE_SUFFIX","exactly_four_bytes_read":True}
  with patch.object(r239,"validate_r238",
    side_effect=lambda value:actual(value,expected_sha=hashlib.sha256(raw).hexdigest())):
   result=r239.report(raw,inspection=lambda:inspection)
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["r238_sanitized_receipt_sha_verified"])
  self.assertFalse(result["docker_binary_executed"])
  self.assertFalse(result["docker_daemon_or_remote_endpoint_contacted"])
  self.assertFalse(result["private_sql_migrations_or_docket_accessed"])
  self.assertFalse(result["sandbox_sql_execution_authorized"])
  self.assertNotIn("MZXY",json.dumps(result))
  self.assertNotIn("postgres://",json.dumps(result))

 def test_invalid_mocked_probe_data_cannot_pass_as_safe(self):
  raw=fake_receipt()
  actual=r239.validate_r238
  cases=[
   {"docker_header_category":"MZ_POSSIBLE_WINDOWS_PE",
    "docker_entry_suffix_category":"NO_EXE_SUFFIX","exactly_four_bytes_read":False},
   {"docker_header_category":"SYNTHETIC_SAFE",
    "docker_entry_suffix_category":"NO_EXE_SUFFIX","exactly_four_bytes_read":True},
   {"docker_header_category":"UNAVAILABLE",
    "docker_entry_suffix_category":"SECRET_PATH","exactly_four_bytes_read":False},
   {"docker_header_category":"OTHER_UNKNOWN_HEADER",
    "docker_entry_suffix_category":"NO_EXE_SUFFIX","exactly_four_bytes_read":True,
    "sql":"invented"}
  ]
  with patch.object(r239,"validate_r238",
    side_effect=lambda value:actual(value,expected_sha=hashlib.sha256(raw).hexdigest())):
   for i,case in enumerate(cases):
    with self.subTest(i=i),self.assertRaises(r239.Blocked):
     r239.report(raw,inspection=lambda c=case:c)

if __name__=="__main__":
 unittest.main()
