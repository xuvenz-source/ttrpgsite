#!/usr/bin/env python3
"""R240: install exact Supabase CLI v2.81.3 standalone Linux release by SHA-256.

Downloads ONLY public GitHub release metadata and the matching versioned
Supabase CLI tarball. Requires the release asset's GitHub API SHA-256 digest,
verifies the complete archive, and extracts ONLY the single root-level supabase
ELF binary into a brand-new owner-home tooling directory. No npm postinstall,
sudo, Docker action, Supabase project init/link, database access, SQL, user or
campaign data, token, or private migration files. The tool does not execute
the downloaded binary; operator must separately request --version.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import sys
import tarfile
import tempfile
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

VERSION="2.81.3"
TAG=f"v{VERSION}"
API=f"https://api.github.com/repos/supabase/cli/releases/tags/{TAG}"
RELEASE_PREFIX=f"https://github.com/supabase/cli/releases/download/{TAG}/"
DESTINATION=Path.home()/"ttrpg-cli-standalone-v2-81-3"
MAX_ARCHIVE=150*1024*1024
MAX_BINARY=160*1024*1024
ALLOWED_REDIRECT_HOSTS={"github.com","release-assets.githubusercontent.com",
                        "objects.githubusercontent.com"}

class Blocked(Exception):
 pass

def selected_arch():
 if sys.platform!="linux":
  raise Blocked("LINUX_WSL_ONLY")
 machine=platform.machine().lower()
 choices={"x86_64":"amd64","amd64":"amd64",
          "aarch64":"arm64","arm64":"arm64"}
 if machine not in choices:
  raise Blocked("UNSUPPORTED_LINUX_ARCHITECTURE")
 return choices[machine]

def decode_release(payload):
 if not isinstance(payload,bytes) or len(payload)>2*1024*1024:
  raise Blocked("INVALID_RELEASE_METADATA_SIZE")
 try:
  data=json.loads(payload)
 except (UnicodeError,ValueError):
  raise Blocked("UNREADABLE_RELEASE_METADATA") from None
 if not isinstance(data,dict) or data.get("tag_name")!=TAG or data.get("draft") is True:
  raise Blocked("RELEASE_TAG_NOT_EXACT")
 return data

def select_asset(release,arch):
 names=(f"supabase_{VERSION}_linux_{arch}.tar.gz",f"supabase_linux_{arch}.tar.gz")
 assets=release.get("assets")
 if not isinstance(assets,list):
  raise Blocked("NO_ASSET_METADATA")
 for expected in names:
  matching=[a for a in assets if isinstance(a,dict) and a.get("name")==expected]
  if len(matching)>1:
   raise Blocked("DUPLICATE_ASSET_NAME")
  if not matching:
   continue
  asset=matching[0]
  url=asset.get("browser_download_url")
  digest=asset.get("digest")
  size=asset.get("size")
  if url!=RELEASE_PREFIX+expected:
   raise Blocked("NONOFFICIAL_ASSET_URL")
  if not isinstance(digest,str) or not re.fullmatch(r"sha256:[0-9a-f]{64}",digest):
   raise Blocked("NO_GITHUB_PUBLISHED_SHA256_DIGEST")
  if type(size) is not int or not 1000000<=size<=MAX_ARCHIVE:
   raise Blocked("ASSET_SIZE_OUT_OF_BOUNDS")
  return {"name":expected,"url":url,"digest":digest[7:],"size":size}
 raise Blocked("PINNED_LINUX_ARCHIVE_NOT_IN_OFFICIAL_RELEASE")

def open_https(url):
 if urlsplit(url).scheme!="https":
  raise Blocked("NONHTTPS_URL")
 request=Request(url,headers={"User-Agent":"Tabletop-Forge-R240-public-release-check",
                              "Accept":"application/vnd.github+json"})
 response=urlopen(request,timeout=45)
 actual=urlsplit(response.geturl())
 if actual.scheme!="https" or actual.hostname not in ALLOWED_REDIRECT_HOSTS|{"api.github.com"}:
  response.close()
  raise Blocked("UNTRUSTED_DOWNLOAD_REDIRECT")
 return response

def read_public_metadata():
 with open_https(API) as response:
  return decode_release(response.read(2*1024*1024+1))

def download_and_verify(asset,outpath):
 digest=hashlib.sha256()
 total=0
 with open_https(asset["url"]) as response, open(outpath,"xb") as output:
  while True:
   piece=response.read(1024*1024)
   if not piece:break
   total+=len(piece)
   if total>MAX_ARCHIVE or total>asset["size"]:
    raise Blocked("DOWNLOADED_ARCHIVE_TOO_LARGE")
   digest.update(piece)
   output.write(piece)
 if total!=asset["size"] or digest.hexdigest()!=asset["digest"]:
  raise Blocked("RELEASE_SHA256_OR_SIZE_MISMATCH")
 return total

def extract_binary_only(archive,dest):
 try:
  with tarfile.open(archive,"r:gz") as bundle:
   candidates=[m for m in bundle.getmembers()
               if m.name in ("supabase","./supabase")]
   if len(candidates)!=1:
    raise Blocked("NO_UNIQUE_ROOT_SUPABASE_BINARY")
   item=candidates[0]
   if not item.isfile() or not 1024<=item.size<=MAX_BINARY:
    raise Blocked("UNEXPECTED_BINARY_TYPE_OR_SIZE")
   stream=bundle.extractfile(item)
   if stream is None:
    raise Blocked("BINARY_NOT_EXTRACTABLE")
   written=0
   with open(dest,"xb") as result:
    while True:
     chunk=stream.read(1024*1024)
     if not chunk:break
     written+=len(chunk)
     if written>item.size or written>MAX_BINARY:
      raise Blocked("BINARY_EXCEEDS_BOUNDS")
     result.write(chunk)
   if written!=item.size:
    raise Blocked("TRUNCATED_BINARY")
   with open(dest,"rb") as handle:
    if handle.read(4)!=b"\\x7fELF".decode("unicode_escape").encode("latin1"):
     raise Blocked("EXPECTED_LINUX_ELF_BINARY")
 except (tarfile.TarError,OSError,EOFError) as exc:
  raise Blocked("INVALID_RELEASE_TAR_ARCHIVE") from None
 os.chmod(dest,0o700)

def install(release=None):
 arch=selected_arch()
 target=DESTINATION
 if target.exists() or target.is_symlink():
  raise Blocked("DESTINATION_ALREADY_EXISTS_DO_NOT_OVERWRITE")
 release=read_public_metadata() if release is None else release
 asset=select_asset(release,arch)
 with tempfile.TemporaryDirectory(prefix=".r240-verified-cli-",dir=Path.home()) as root:
  directory=Path(root)
  tarball=directory/"official-release.tar.gz"
  binary=directory/"supabase"
  download_and_verify(asset,tarball)
  extract_binary_only(tarball,binary)
  if target.exists() or target.is_symlink():
   raise Blocked("DESTINATION_ALREADY_EXISTS_DO_NOT_OVERWRITE")
  target.mkdir(mode=0o700)
  shutil.move(str(binary),str(target/"supabase"))
 return target/"supabase"

def main():
 os.umask(0o077)
 try:
  destination=install()
  print("R240_VERIFIED_STANDALONE_READY")
  print("Release:",TAG)
  print("Installed binary:",str(destination))
  print("No npm scripts, containers or database actions were run.")
  return 0
 except (Blocked,OSError,ValueError) as e:
  print("R240_NO_GO:",str(e),file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
