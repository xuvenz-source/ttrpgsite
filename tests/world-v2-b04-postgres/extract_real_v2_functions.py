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
