#!/usr/bin/env python3
"""R18-113: write only the exact prior live-verified Git NPC function to scratch.

This script has no hosted connections, tokens, or private SQL input.
"""
import hashlib
import json
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=ROOT / "supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql"
PARITY=ROOT / "staging/world-v2-b10-r18-103-live-source-parity/metadata-index.json"
EXPECTED_SHA="5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5"
EXPECTED_BYTES=263

def fail():
    raise SystemExit("R113 ISOLATED SOURCE NO-GO: original Git-to-live identity mismatch")

def extract(sql):
    anchor=re.compile(
        r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_dm_map_npc_values\s*\(",
        re.I)
    matches=list(anchor.finditer(sql))
    if len(matches)!=1: fail()
    tail=sql[matches[0].start():]
    quote=re.search(r"\bAS\s+(\$[A-Za-z_0-9]*\$)([\s\S]*?)\1\s*;",tail,re.I)
    if quote is None: fail()
    ddl=tail[:quote.end()]
    return ddl,quote.group(2)

def main():
    if len(sys.argv)!=2: fail()
    target=pathlib.Path(sys.argv[1]).resolve()
    if not (str(target).startswith("/tmp/world-v2-r18-113-") and
            target.name=="verified-npc-source.sql" and target.parent.is_dir()):
        fail()
    data=json.loads(PARITY.read_text(encoding="utf8"))
    rows=[f for f in data.get("verifiedSourceMatches",[])
          if f.get("schema")=="public" and f.get("name")=="get_dm_map_npc_values"]
    if len(rows)!=1 or rows[0].get("checkedByDirectLiveBodyEquality") is not True or rows[0].get("individualAuthorizationApproved") is not False or rows[0].get("expectedSourceSha256")!=EXPECTED_SHA or rows[0].get("expectedSourceBytes")!=EXPECTED_BYTES:
        fail()
    ddl,body=extract(SOURCE.read_text(encoding="utf8"))
    raw=body.encode("utf8")
    if len(raw)!=EXPECTED_BYTES or hashlib.sha256(raw).hexdigest()!=EXPECTED_SHA:
        fail()
    if "SECURITY DEFINER" not in ddl.upper() or "search_path" not in ddl or "public.is_campaign_dm(m.campaign_id)" not in body:
        fail()
    target.write_text("-- SOURCE-EXACT PRIVATE-NPC RPC, DISPOSABLE POSTGRES 17 ONLY.\n"+
      ddl+"\nREVOKE ALL ON FUNCTION public.get_dm_map_npc_values(uuid) FROM PUBLIC, anon, authenticated;\n"+
      "GRANT EXECUTE ON FUNCTION public.get_dm_map_npc_values(uuid) TO authenticated;\n",
      encoding="utf8")
    print("R113: NPC function body SHA-256/bytes match prior exact original source parity")

if __name__=="__main__":
    main()
