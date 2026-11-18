#!/usr/bin/env python3
"""B10-R18-116: extract two source-bound functions from tracked Git SQL.

No private historical recovery, hosted DB, secrets, imports or network.
Only writes two SQL files within a disposable /tmp/world-v2-r18-116-* dir.
"""
import hashlib
import json
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
TOOL_SRC=ROOT/"supabase/migrations/20261108013000_inventory_lease_expiry_qualification.sql"
NPC_SRC=ROOT/"supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql"
R103=ROOT/"staging/world-v2-b10-r18-103-live-source-parity/metadata-index.json"
ORIGINAL_ID="lwhwgqaunxbmvyndswze"
TOOL_MD5="570c89cc5b88bc739c56825eeb227449"
TOOL_BYTES=1693
NPC_SHA256="5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5"
NPC_BYTES=263

def fail():
 raise SystemExit("R116 SOURCE-BOUND NO-GO: original Git/live SQL identity mismatch")

def extract(sql,name):
 anchor=re.compile(r"\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\."+re.escape(name)+r"\s*\(",re.I)
 matches=list(anchor.finditer(sql))
 if len(matches)!=1:fail()
 tail=sql[matches[0].start():]
 m=re.search(r"\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;",tail,re.I)
 if not m:fail()
 return tail[:m.end()],m.group(2)

def main():
 if len(sys.argv)!=2:fail()
 scratch=pathlib.Path(sys.argv[1]).resolve()
 if not(scratch.parent==pathlib.Path("/tmp") and
        scratch.name.startswith("world-v2-r18-116-") and
        scratch.is_dir() and not scratch.is_symlink()):fail()
 ddl_tool,body_tool=extract(TOOL_SRC.read_text(encoding="utf8"),"claim_campaign_tool_item")
 ddl_npc,body_npc=extract(NPC_SRC.read_text(encoding="utf8"),"get_dm_map_npc_values")
 if (len(body_tool.encode("utf8"))!=TOOL_BYTES or
     hashlib.md5(body_tool.encode("utf8")).hexdigest()!=TOOL_MD5 or
     len(body_npc.encode("utf8"))!=NPC_BYTES or
     hashlib.sha256(body_npc.encode("utf8")).hexdigest()!=NPC_SHA256):fail()
 if "security definer" not in ddl_tool.lower() or "security definer" not in ddl_npc.lower():fail()
 if "search_path" not in ddl_tool or "search_path" not in ddl_npc:fail()
 if "public.is_campaign_member(target.campaign_id)" not in body_tool:fail()
 if "public.is_campaign_dm(m.campaign_id)" not in body_npc:fail()
 r103=json.loads(R103.read_text(encoding="utf8"))
 npc_rows=[r for r in r103.get("verifiedSourceMatches",[]) if
           r.get("schema")=="public" and r.get("name")=="get_dm_map_npc_values"]
 if (len(npc_rows)!=1 or
     npc_rows[0].get("checkedByDirectLiveBodyEquality") is not True or
     npc_rows[0].get("expectedSourceSha256")!=NPC_SHA256 or
     npc_rows[0].get("expectedSourceBytes")!=NPC_BYTES):fail()
 # Public RPC ACLs in disposable PG17 replicate verified live metadata:
 # authenticated EXECUTE yes; anon no. Internal helper bodies are synthetic.
 tool_sql=(ddl_tool+
   "\nREVOKE ALL ON FUNCTION public.claim_campaign_tool_item(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;\n"+
   "GRANT EXECUTE ON FUNCTION public.claim_campaign_tool_item(uuid,uuid,boolean) TO authenticated;\n")
 npc_sql=(ddl_npc+
   "\nREVOKE ALL ON FUNCTION public.get_dm_map_npc_values(uuid) FROM PUBLIC,anon,authenticated;\n"+
   "GRANT EXECUTE ON FUNCTION public.get_dm_map_npc_values(uuid) TO authenticated;\n")
 for name,body in [("source-exact-tool-claim.sql",tool_sql),
                   ("source-exact-npc-reader.sql",npc_sql)]:
  dest=scratch/name
  with dest.open("x",encoding="utf8") as target:target.write(body)
 print("R116: tool-claim MD5/bytes and exact NPC SHA-256 parity verified against prior original metadata")

if __name__=="__main__":
 main()
