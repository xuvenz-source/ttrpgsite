#!/usr/bin/env python3
"""Extract exact originally released visibility SAT collision function.

R18-46 fourth PG17 fixture needs the pre-R17 function so it can snapshot
it. Earlier R18-22 fixture installed only the R17 replacement and therefore
never needed the original. Source must be the committed published migration,
never a guessed/dummy implementation or a live Supabase network query.
"""
from pathlib import Path
import hashlib
import sys

source_path=Path("supabase/migrations/20261107110539_authoritative_fog_collision_release.sql")
data=source_path.read_bytes()
gitblob=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
assert gitblob=="fcac1768285a2774fe62894ec2ec0649f0174769", (
    "R18-46 original visibility SAT migration Git blob drift: "+gitblob)
text=data.decode("utf-8")
start_marker="create or replace function forge_visibility.swept_hits_segment("
assert text.count(start_marker)==1, "missing/duplicate released visibility swept function"
start=text.index(start_marker)
end_marker="end $$;"
end=text.index(end_marker,start)+len(end_marker)
body=text[start:end]
assert "returns boolean language plpgsql immutable set search_path='' as $$" in body
assert "security definer" not in body.lower()
assert "revoke " not in body.lower()
assert "grant " not in body.lower()
assert body.count("end $$;")==1
sys.stdout.write(body+"\n")
