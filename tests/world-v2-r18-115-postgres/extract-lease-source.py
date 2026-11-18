#!/usr/bin/env python3
"""R18-115: source-exact live catalog MD5/byte checks for lease operations.

The only input source is a Git-tracked historical SQL migration. Generated SQL
stays in disposable /tmp scratch on the isolated GitHub Actions runner.
No source DB, private recovery history, HTTP, CLI or Git mutation.
"""
import hashlib
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
MIGRATION=ROOT/"supabase/migrations/20261107095350_campaign_sheet_inventory_collaboration.sql"
EXPECTED=(
 ("claim_campaign_sheet_item","d7932b1e0c2141833537301d75d262e4",1379,
  "uuid,text,uuid,text,uuid,boolean"),
 ("release_campaign_sheet_item","f7bc314718884312ce3e1ca48331429f",271,
  "uuid,text,uuid,text,uuid"),
 ("mutate_campaign_sheet_item","d2e4affcf04808423830f443ce93e530",2752,
  "uuid,text,uuid,text,uuid,jsonb,boolean")
)

def fail():
 raise SystemExit("R115 PRIVATE-LEASE SOURCE NO-GO: mismatch; do not execute SQL")

def get(sql,name):
 anchor=re.compile(r"\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\."+
                   re.escape(name)+r"\s*\(",re.I)
 found=list(anchor.finditer(sql))
 if len(found)!=1: fail()
 tail=sql[found[0].start():]
 m=re.search(r"\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;",tail,re.I)
 if not m: fail()
 return tail[:m.end()],m.group(2)

def main():
 if len(sys.argv)!=2: fail()
 target=pathlib.Path(sys.argv[1]).resolve()
 if not (target.parent.is_dir() and
         target.parent.name.startswith("world-v2-r18-115-") and
         target.parent.parent == pathlib.Path("/tmp") and
         target.name=="source-exact-lease-functions.sql"):
  fail()
 sql=MIGRATION.read_text(encoding="utf8")
 fragments=[]
 for name,md5,size,args in EXPECTED:
  ddl,body=get(sql,name)
  raw=body.encode("utf8")
  if len(raw)!=size or hashlib.md5(raw).hexdigest()!=md5:fail()
  if not re.search(r"\bSECURITY\s+DEFINER\b",ddl,re.I) or "search_path=''" not in ddl:
   fail()
  fragments.append(ddl)
  fragments.append("REVOKE ALL ON FUNCTION public."+name+"("+args+") FROM PUBLIC,anon,authenticated;")
  fragments.append("GRANT EXECUTE ON FUNCTION public."+name+"("+args+") TO authenticated;")
 target.write_text("\n\n".join(fragments)+"\n",encoding="utf8")
 print("R115: three source-exact original lease-function MD5/byte identities confirmed; synthetic CI only")

if __name__=="__main__":
 main()
