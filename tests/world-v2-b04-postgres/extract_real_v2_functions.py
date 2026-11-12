#!/usr/bin/env python3
"""Extract the ACTUAL deployed V2 SQL helper bodies for isolated B04 testing.

Only test-local auth/map-membership functions are stubs. The geometry, bounds,
session_valid and candidate validators must run as shipped, not mocked.
This script never opens a network connection or touches production.
"""
import pathlib
import re
import sys

repo = pathlib.Path(__file__).resolve().parents[2]
source_path = repo / "supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql"
text = source_path.read_text(encoding="utf-8")
names = ("swept_hits_segment", "wall_passes", "step_allowed", "valid_point", "session_valid")
output = []
for name in names:
    needle = f"CREATE OR REPLACE FUNCTION forge_world_v2.{name}("
    if text.count(needle) != 1:
        raise SystemExit(f"Unsafe fixture source: expected exactly one {needle}")
    start = text.index(needle)
    end = text.find("$$;", start)
    if end < 0:
        raise SystemExit(f"Unterminated V2 function: {name}")
    definition = text[start : end + 3]
    if "SET search_path=''" not in definition:
        raise SystemExit(f"Unsafe V2 function without pinned search_path: {name}")
    if not re.search(r"(?ms)^CREATE OR REPLACE FUNCTION forge_world_v2\.", definition):
        raise SystemExit(f"Unexpected V2 function extraction: {name}")
    output.append(f"-- SOURCE-EXTRACTED from {source_path.name}: {name}\n" + definition)
print("\n\n".join(output))
print("-- All five production helper definitions extracted without edits.", file=sys.stderr)

# Import the REAL public Begin, the original V2 Advance core, and the REAL
# current private-observer public Advance wrapper. The publisher is replaced
# only by a TEST-ONLY inert sink to avoid implying fog/LOS delivery is proven.
def function_source(data: str, qualified_name: str) -> str:
    needle = f"CREATE OR REPLACE FUNCTION {qualified_name}("
    if data.count(needle) != 1:
        raise SystemExit(f"Unexpected count for {needle}")
    start = data.index(needle)
    end = data.find("$;", start)
    if end < 0:
        raise SystemExit(f"Unterminated SQL for {qualified_name}")
    return data[start:end + 3]

print("-- Extract exact production Begin and original Advance source.")
print(function_source(text, "public.begin_world_motion_v2"))
print(function_source(text, "public.advance_world_motion_v2"))
print("""
-- Match the 20261109100000 World V2 observer migration's core move.
ALTER FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) SET SCHEMA forge_world_v2;
ALTER FUNCTION forge_world_v2.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) RENAME TO advance_core_v2;
REVOKE ALL ON FUNCTION forge_world_v2.advance_core_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;

-- TEST-ONLY fake audience sink, not the production fog/LOS filtering body.
-- Counts emissions to verify no duplicate sends on server replay.
CREATE OR REPLACE FUNCTION forge_world_v2.publish_approved_observers(
 p_session forge_world_v2.motion_sessions,p_from jsonb,p_accepted jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $b04_stub$
BEGIN
 INSERT INTO forge_world_v2.b04_private_broadcasts(session_id,actor_id,payload)
 VALUES(p_session.id,p_session.actor_id,p_accepted);
 RETURN 1;
END $b04_stub$;
REVOKE ALL ON FUNCTION forge_world_v2.publish_approved_observers(
 forge_world_v2.motion_sessions,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
""")

observer_path = repo / "supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql"
observer_sql = observer_path.read_text(encoding="utf-8")
print("-- Exact PRODUCTION public Advance wrapper (observer publisher stubbed).")
print(function_source(observer_sql, "public.advance_world_motion_v2"))
print("""
REVOKE ALL ON FUNCTION public.begin_world_motion_v2(
 uuid,jsonb,jsonb,text,bigint,bigint,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_world_motion_v2(
 uuid,jsonb,jsonb,text,bigint,bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) TO authenticated;
""")
print("-- Real public RPCs source-extracted; broadcaster only is test-stubbed.", file=sys.stderr)

