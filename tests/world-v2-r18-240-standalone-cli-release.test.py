"""R240 tests use fictional Github release metadata and fabricated ELF files ONLY.

No actual internet calls, downloaded executables, npm lifecycle scripts,
Docker or Supabase commands, original migrations or database operations.
"""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release"))
spec=importlib.util.spec_from_file_location("r240",ROOT/"scripts/release/r240_install_verified_standalone_cli.py")
r240=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r240)

def pretend_release(arch="amd64",digest=None,name=None):
 name=name or f"supabase_{r240.VERSION}_linux_{arch}.tar.gz"
 return {
  "tag_name":r240.TAG,"draft":False,
  "assets":[{"name":name,
   "browser_download_url":r240.RELEASE_PREFIX+name,
   "digest":digest or "sha256:"+"1"*64,
   "size":1234567}]
 }

def fake_tar(*,name="supabase",body=None,mode=0o755,kind=tarfile.REGTYPE):
 body=body if body is not None else bytes([127])+b"ELF"+b"Z"*2048
 stream=io.BytesIO()
 with tarfile.open(fileobj=stream,mode="w:gz") as archive:
  info=tarfile.TarInfo(name)
  info.mode=mode
  info.type=kind
  info.size=len(body) if kind==tarfile.REGTYPE else 0
  if kind==tarfile.REGTYPE:
   archive.addfile(info,io.BytesIO(body))
  else:
   info.linkname="../../private"
   archive.addfile(info)
 return stream.getvalue()

class VerifiedStandaloneOnlyTests(unittest.TestCase):
 def test_exact_v2813_release_asset_sha(self):
  r=pretend_release()
  a=r240.select_asset(r,"amd64")
  self.assertEqual(a["digest"],"1"*64)
  self.assertEqual(a["name"],"supabase_2.81.3_linux_amd64.tar.gz")
  self.assertEqual(a["size"],1234567)
 def test_allow_exact_old_unversioned_archive_form_only(self):
  r=pretend_release(name="supabase_linux_amd64.tar.gz")
  self.assertEqual(r240.select_asset(r,"amd64")["name"],"supabase_linux_amd64.tar.gz")
  with self.assertRaises(r240.Blocked):
   r240.select_asset(r,"arm64")
 def test_forged_release_or_asset_metadata_fails_closed(self):
  for change,value in [
    ("draft",True),("tag_name","v3.2.0"),("assets","not-an-array")
  ]:
   r=pretend_release();r[change]=value
   with self.subTest(change=change),self.assertRaises(r240.Blocked):
    r240.select_asset(r,"amd64") if change=="assets" else r240.select_asset(r240.decode_release(json.dumps(r).encode()),"amd64")
  for case in ("missing-sha","url","size","duplicate"):
   r=pretend_release()
   a=r["assets"][0]
   if case=="missing-sha":a["digest"]=None
   if case=="url":a["browser_download_url"]="https://evil.invalid/cli"
   if case=="size":a["size"]=True
   if case=="duplicate":r["assets"].append(a.copy())
   with self.subTest(case=case),self.assertRaises(r240.Blocked):
    r240.select_asset(r,"amd64")
 def test_binary_extract_only_elf_and_exact_supabase(self):
  with tempfile.TemporaryDirectory() as temp:
   tarball=Path(temp)/"fake.tar.gz"
   binary=Path(temp)/"bin"
   tarball.write_bytes(fake_tar())
   r240.extract_binary_only(tarball,binary)
   self.assertEqual(binary.read_bytes()[:4],bytes([127])+b"ELF")
   self.assertEqual(binary.stat().st_mode&0o777,0o700)
 def test_tar_symlink_or_traversal_not_extracted(self):
  with tempfile.TemporaryDirectory() as temp:
   tarball=Path(temp)/"fake.tar.gz"
   for name,kind in (
     ("../../private",tarfile.REGTYPE),
     ("supabase",tarfile.SYMTYPE),
     ("dir/supabase",tarfile.REGTYPE)
   ):
    tarball.write_bytes(fake_tar(name=name,kind=kind))
    with self.subTest(name=name,kind=kind),self.assertRaises(r240.Blocked):
     r240.extract_binary_only(tarball,Path(temp)/"install")
    self.assertFalse((Path(temp)/"install").exists())
 def test_never_accept_nonelf_binary(self):
  with tempfile.TemporaryDirectory() as temp:
   src=Path(temp)/"fake.tar.gz";dest=Path(temp)/"bin"
   src.write_bytes(fake_tar(body=b"MZ"+b"X"*2048))
   with self.assertRaises(r240.Blocked):
    r240.extract_binary_only(src,dest)
 def test_download_matching_digest_and_file_size(self):
  fake=b"archive-bytes"+b"Y"*1000
  class Response(io.BytesIO):
   def __enter__(self):return self
   def __exit__(self,*args):self.close()
  with tempfile.TemporaryDirectory() as temp,patch.object(r240,"open_https",return_value=Response(fake)):
   archive=Path(temp)/"blob"
   r240.download_and_verify(
    {"url":"https://example.invalid/fake",
     "size":len(fake),"digest":hashlib.sha256(fake).hexdigest()},archive)
   self.assertEqual(archive.read_bytes(),fake)
  with tempfile.TemporaryDirectory() as temp,patch.object(r240,"open_https",return_value=Response(fake)):
   with self.assertRaises(r240.Blocked):
    r240.download_and_verify(
     {"url":"https://example.invalid/fake",
      "size":len(fake),"digest":"f"*64},Path(temp)/"blob")
 def test_release_metadata_must_match_exact_tag(self):
  self.assertEqual(r240.decode_release(json.dumps(pretend_release()).encode())["tag_name"],r240.TAG)
  with self.assertRaises(r240.Blocked):
   r240.decode_release(b"{malformed")
 def test_existing_destination_never_overwritten(self):
  with tempfile.TemporaryDirectory() as temp,patch.object(r240,"DESTINATION",Path(temp)):
   with self.assertRaises(r240.Blocked):
    r240.install(release=pretend_release())

if __name__=="__main__":
 unittest.main()
