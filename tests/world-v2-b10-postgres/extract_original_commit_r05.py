#!/usr/bin/env python3
"""Source-extract original V2 Commit for R05's disposable live-shape rehearsal.

No network and no changes to the production database. The earlier B04/B08
fixture intentionally had no original public Commit before B08, whereas the
live database has it. This script closes that fixture gap for R05 testing.
"""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
src = (root / "supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql").read_text()
needle = "CREATE OR REPLACE FUNCTION public.commit_world_motion_v2("
assert src.count(needle) == 1, "Unexpected original Commit function count"
start = src.index(needle)
end = src.index("END $$;", start) + len("END $$;")
body = src[start:end]
assert "SECURITY DEFINER SET search_path=''" in body
assert "commit_checkpoints" in body
assert "CREATE OR REPLACE FUNCTION public.cancel_world_motion_v2(" not in body
print("-- Source extracted, original released V2 public Commit; test-only.\n")
print(body)
print("""
REVOKE ALL ON FUNCTION public.commit_world_motion_v2(
 uuid,bigint,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_world_motion_v2(
 uuid,bigint,jsonb,bigint,bigint) TO authenticated;
""")
