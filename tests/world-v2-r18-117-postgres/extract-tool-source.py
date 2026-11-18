#!/usr/bin/env python3
"""B10-R18-117: offline extract current Git tracked tool edit RPCs to scratch.

Every body must match read-only current original pg_proc MD5/length.
Never accepts private original SQL, sessions, or remote DB configuration.
"""
import hashlib
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=ROOT/"supabase/migrations/20261107095343_campaign_tool_item_collaboration.sql"
EXPECTED=[
 ("release_campaign_tool_item","775ad6515c74f23367ce6e55513f8744",220,"uuid,uuid"),
 ("mutate_campaign_tool_item","0692ac50eb864f3dd0f91064f478309e",2178,"uuid,uuid,jsonb,boolean"),
 ("patch_campaign_tool_details","12841d624886adab4f33e98f2c7716ac",1086,"uuid,boolean,jsonb")
]

def fail():
 raise SystemExit("R117 SOURCE FINGERPRINT NO-GO: fixture not created")

def extract(sql,name):
 a=re.compile(r"\bcreate\s+or\s+replace\s+function\s+public\."+re.escape(name)+r"\s*\(",re.I)
 hits=list(a.finditer(sql))
 if len(hits)!=1:fail()
 tail=sql[hits[0].start():]
 m=re.search(r"\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;",tail,re.I)
 if not m:fail()
 return tail[:m.end()],m.group(2)

def main():
 if len(sys.argv)!=2:fail()
 target=pathlib.Path(sys.argv[1]).resolve()
 if not (target.parent==pathlib.Path("/tmp") and
         target.name.startswith("world-v2-r18-117-") and
         target.is_dir() and not target.is_symlink()):fail()
 src=SOURCE.read_text(encoding="utf8")
 ddls=[]
 for name,md5,size,signature in EXPECTED:
  ddl,body=extract(src,name)
  raw=body.encode("utf8")
  if len(raw)!=size or hashlib.md5(raw).hexdigest()!=md5:fail()
  if not re.search(r"\bsecurity\s+definer\b",ddl,re.I) or
   not re.search(r"\bsearch_path\s*=\s*''",ddl,re.I):fail()
  if name != "release_campaign_tool_item":
   if "public.is_campaign_member(target.campaign_id)" not in body:fail()
  elif "holder_id=actor" not in body:fail()
  ddls.extend([ddl,
   f"REVOKE ALL ON FUNCTION public.{name}({signature}) FROM PUBLIC,anon,authenticated;",
   f"GRANT EXECUTE ON FUNCTION public.{name}({signature}) TO authenticated;"])
 with (target/"source-bound-tool-edits.sql").open("x",encoding="utf8") as out:
  out.write("\n\n".join(ddls)+"\n")
 print("R117: 3 tool edit/release function bodies verified to current original pg_proc MD5 and byte counts")

if __name__=="__main__":
 main()
