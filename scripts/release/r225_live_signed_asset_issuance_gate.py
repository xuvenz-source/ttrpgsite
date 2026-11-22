#!/usr/bin/env python3
"""R225 live-source signed-asset issuance surface gate (NO_GO always).

Reads only Git checkout src/ and supabase/functions/ JS/TS text. Refuses
unreviewed new direct signing paths, public URL creation, or cache-clearing
callers. This is a lexical review lock, NOT a complete JavaScript parser,
a proof of effective Storage RLS, or bearer URL revocation.
No GitHub/network/DB access and no filesystem writes.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

WORK="B10-R18-225"
MAX_SOURCE_FILE=2*1024*1024
EXTENSIONS={".js",".jsx",".ts",".tsx",".mjs"}
SIGN=re.compile(r"\bcreateSignedUrls?\s*\(",re.I)
PUBLIC=re.compile(r"\bgetPublicUrl\s*\(",re.I)
CLEAR=re.compile(r"\bsignedAssetStore\s*\.\s*clear\s*\(")
SUBSCRIBE=re.compile(r"\bsignedAssetStore\s*\.\s*subscribe\s*\(")
PEEK=re.compile(r"\bsignedAssetStore\s*\.\s*peek\s*\(")
IMPORT=re.compile(r"\bfrom\s*['\"][^'\"]*SignedAssetUrls\.js['\"]")
SIGNED_URL_TTL=re.compile(r"\bcreateSignedUrl\s*\(\s*path\s*,\s*3600\s*\)")
EXPECTED={
 "signed_calls":{"src/SignedAssetUrls.js":1},
 "public_calls":{},
 "cache_clear_calls":{"src/TabletopApp.jsx":2},
 "cache_subscribe_calls":{"src/Artwork.jsx":1,"src/TabletopApp.jsx":1},
 "cache_peek_calls":{"src/Artwork.jsx":2},
 "signed_asset_store_imports":{"src/Artwork.jsx":1,"src/TabletopApp.jsx":1},
}
class Blocked(Exception): pass


def safe_source_files(root:Path):
    if root.is_symlink() or not root.is_dir():
        raise Blocked("repository root unavailable")
    for name in ("src","supabase/functions"):
        base=root/name
        if base.is_symlink() or not base.is_dir():
            raise Blocked("required live source root missing")
        for path in sorted(base.rglob("*")):
            if path.is_symlink():
                raise Blocked("source tree symlink")
            if not path.is_file() or path.suffix not in EXTENSIONS:
                continue
            if path.stat().st_size>MAX_SOURCE_FILE:
                raise Blocked("source unexpectedly large")
            relative=path.relative_to(root).as_posix()
            if not relative.startswith(("src/","supabase/functions/")):
                raise Blocked("unexpected source path")
            yield relative,path.read_text(encoding="utf-8")


def count_methods(root:Path):
    found={kind:{} for kind in EXPECTED}
    checked=0
    signer_source=None
    for path,source in safe_source_files(root):
        checked+=1
        if path=="src/SignedAssetUrls.js":
            signer_source=source
        for kind,pattern in (
            ("signed_calls",SIGN),("public_calls",PUBLIC),
            ("cache_clear_calls",CLEAR),
            ("cache_subscribe_calls",SUBSCRIBE),
            ("cache_peek_calls",PEEK),
            ("signed_asset_store_imports",IMPORT),
        ):
            n=len(pattern.findall(source))
            if n:found[kind][path]=n
    if checked==0 or signer_source is None:
        raise Blocked("missing required signer")
    if not SIGNED_URL_TTL.search(signer_source):
        raise Blocked("historical signed URL TTL changed")
    return checked,found


def report(root:Path):
    checked,found=count_methods(root)
    if found!=EXPECTED:
        raise Blocked("unreviewed direct signer or clear caller drift")
    return {
        "work_package":WORK,
        "decision":"NO_GO",
        "mode":"GIT_CHECKOUT_READ_ONLY_SIGNED_ASSET_SOURCE_SURFACE",
        "source_js_ts_files_scanned":checked,
        "direct_create_signed_url_call_count":sum(found["signed_calls"].values()),
        "get_public_url_call_count":sum(found["public_calls"].values()),
        "legacy_auth_transition_cache_clear_calls":sum(found["cache_clear_calls"].values()),
        "shared_store_subscription_call_count":sum(found["cache_subscribe_calls"].values()),
        "shared_store_peek_call_count":sum(found["cache_peek_calls"].values()),
        "existing_signed_url_ttl_seconds":3600,
        "reviewed_exact_callsite_baseline_unchanged":True,
        "new_live_revocation_code_installed":False,
        "semantic_access_and_server_signed_url_revocation_verified":False,
        "all_83_private_migrations_approved":False,
        "qa_sql_install_authorized":False,
        "production_deploy_authorized":False,
        "no_database_or_network_access":True,
        "no_sql_executed":True,
        "limitations":[
            "Lexical scanning can miss aliases, computed property access, dynamic imports, helper indirection and runtime-injected signers.",
            "The existing cache-clear callers remain capable of reissuing URL requests for active subscribers until a separately reviewed live revocation integration exists.",
            "A syntactically unchanged client signer does not establish Storage RLS authorization after campaign membership removal.",
            "An issued 3600-second bearer URL is not revoked by cache purge, tab hint, or this source-only preflight.",
        ],
    }


def main():
    parser=argparse.ArgumentParser(description="R225 strict live-source signing callsite NO_GO gate")
    parser.add_argument("--repo",type=Path,default=Path(__file__).resolve().parents[2])
    args=parser.parse_args()
    try:
        print(json.dumps(report(args.repo),indent=2,sort_keys=True))
        return 0
    except Exception:
        print("R225_SIGNED_ASSET_LIVE_SOURCE_NO_GO: frozen signing surface drift or unreadable sources.",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
