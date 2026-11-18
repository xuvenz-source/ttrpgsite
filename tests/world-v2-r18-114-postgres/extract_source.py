#!/usr/bin/env python3
"""R18-114: extract only Git SQL functions whose bodies match prior LIVE SHA-256.

No private migration files, original DB connections, tokens, or hosted SQL.
Output permitted only in a scratch /tmp/world-v2-r18-114-* directory.
"""
import hashlib
import json
import pathlib
import re
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
INDEX=ROOT/"staging/world-v2-b10-r18-103-live-source-parity/metadata-index.json"
SHEET=ROOT/"supabase/migrations/20261107095350_campaign_sheet_inventory_collaboration.sql"
MOVE=ROOT/"supabase/migrations/20261108091818_observer_and_per_viewer_visibility_release_20261108.sql"
MAP=ROOT/"supabase/migrations/20261106180100_private_player_maps.sql"
EXPECTED=[
 ("public","can_edit_campaign_sheet",SHEET,"07dd89b2aa9c2e2c4851604de83362da37b3e5bf1716d146fd769b7bb816cb53",790),
 ("public","can_edit_campaign_sheet_inventory",SHEET,"169d6e5ec9fb79a760bc25ab28a3937f4c76cc1a5233c997b673b366cd8176e4",427),
 ("public","get_campaign_sheet_inventory",SHEET,"4b168977eaa254f665fa1f26ed81d7296053bb988b991e60574c1610de0a879e",1950),
 ("public","patch_campaign_sheet_noninventory",SHEET,"2059d837aea133d1cbe726e9eebb0736d04739ed37b06ed8cfa08dca017efc2b",2364),
 ("public","can_view_campaign_map",MAP,"835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c",448),
 ("forge_visibility","dispatch_movement_preview",MOVE,"b897f48495a9a8add788741b64bf4a52c9cd5b9c1969d6e6dd50dadd8965063c",6397)
]

def fail():
 raise SystemExit("R114 SOURCE-PARITY NO-GO: stop; investigate locally")

def extract(sql,schema,name):
 anchor=re.compile(r"\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+"+
  re.escape(schema)+r"\."+re.escape(name)+r"\s*\(",re.I)
 found=list(anchor.finditer(sql))
 if len(found)!=1: fail()
 tail=sql[found[0].start():]
 m=re.search(r"\bAS\s+(\$[A-Za-z_0-9]*\$)([\s\S]*?)\1\s*;",tail,re.I)
 if m is None: fail()
 return tail[:m.end()],m.group(2)

def main():
 if len(sys.argv)!=2: fail()
 directory=pathlib.Path(sys.argv[1]).resolve()
 if not (str(directory).startswith("/tmp/world-v2-r18-114-") and directory.is_dir()):
  fail()
 index=json.loads(INDEX.read_text(encoding="utf8"))
 if index.get("workPackage")!="B10-R18-103" or index.get("decision")!="NO_GO":
  fail()
 sheet,movement=[],[]
 for schema,name,path,expected_sha,expected_len in EXPECTED:
  ddl,body=extract(path.read_text(encoding="utf8"),schema,name)
  encoded=body.encode("utf8")
  if len(encoded)!=expected_len or hashlib.sha256(encoded).hexdigest()!=expected_sha:
   fail()
  v=[f for f in index.get("functions",[]) if f.get("name")==name and f.get("schema")==schema]
  if len(v)!=1 or v[0].get("bodySha256")!=expected_sha or v[0].get("bodyBytes")!=expected_len:
   fail()
  if not re.search(r"\bSECURITY\s+DEFINER\b",ddl,re.I) or "search_path" not in ddl:
   fail()
  if schema=="forge_visibility" or name=="can_view_campaign_map":
   movement.append(ddl)
  else:
   sheet.append(ddl)
 sheet.extend([
  "REVOKE ALL ON FUNCTION public.can_edit_campaign_sheet(uuid,text,uuid) FROM PUBLIC,anon,authenticated;",
  "REVOKE ALL ON FUNCTION public.can_edit_campaign_sheet_inventory(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;",
  "REVOKE ALL ON FUNCTION public.get_campaign_sheet_inventory(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;",
  "REVOKE ALL ON FUNCTION public.patch_campaign_sheet_noninventory(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;",
  "GRANT EXECUTE ON FUNCTION public.get_campaign_sheet_inventory(uuid,text,uuid,text) TO authenticated;",
  "GRANT EXECUTE ON FUNCTION public.patch_campaign_sheet_noninventory(uuid,text,uuid,jsonb,jsonb) TO authenticated;"
 ])
 movement.extend([
  "REVOKE ALL ON FUNCTION public.can_view_campaign_map(uuid,uuid) FROM PUBLIC,anon,authenticated;",
  "GRANT EXECUTE ON FUNCTION public.can_view_campaign_map(uuid,uuid) TO authenticated;",
  "REVOKE ALL ON FUNCTION forge_visibility.dispatch_movement_preview(uuid,text,uuid,integer,integer,bigint,boolean) FROM PUBLIC,anon,authenticated;"
 ])
 (directory/"verified-sheet.sql").write_text("\n\n".join(sheet)+"\n",encoding="utf8")
 (directory/"verified-movement.sql").write_text("\n\n".join(movement)+"\n",encoding="utf8")
 print("R114: six Git function bodies match frozen original pg_proc SHA-256/byte metadata (not signed authorization)")

if __name__=="__main__":
 main()
