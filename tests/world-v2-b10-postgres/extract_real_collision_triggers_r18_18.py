#!/usr/bin/env python3
"""B10-R18-18: extract exact shipped legacy collision triggers for disposable PG17.

NO NETWORK, no dynamic SQL or production connection. Fail closed if original
source blobs change or function bodies/trigger DDL cannot be identified.
This source extraction is used ONLY by tests/world-v2-b10-postgres/run.sh.
"""
from __future__ import annotations
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
V1 = ROOT / "supabase/migrations/20261107110539_authoritative_fog_collision_release.sql"
V2 = ROOT / "supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql"
SOURCES = [
    (V1, "fcac1768285a2774fe62894ec2ec0649f0174769"),
    (V2, "c774aa7d13e89aa2d783d8d5fdc6f46326e28206"),
]


def source(path: pathlib.Path, blob_sha: str) -> str:
    data = path.read_bytes()
    got = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if got != blob_sha:
        raise SystemExit(f"FROZEN TRIGGER SOURCE DRIFT: {path.name}")
    return data.decode("utf-8")


v1, v2 = [source(*entry) for entry in SOURCES]


def function(text: str, name: str) -> str:
    needle = f"create or replace function forge_visibility.{name}("
    if text.lower().count(needle) != 1:
        raise SystemExit(f"Unsafe trigger fixture: wrong function count: {name}")
    start = text.lower().index(needle)
    end = text.find("$$;", start)
    if end < 0:
        raise SystemExit(f"Unsafe trigger fixture: unterminated function: {name}")
    definition = text[start:end + 3]
    if "security definer set search_path=''" not in definition.lower() and name.startswith("enforce_"):
        raise SystemExit(f"Unsafe trigger fixture: missing pinned security mode: {name}")
    if name == "wall_passes" and "set search_path=''" not in definition.lower():
        raise SystemExit("Unsafe trigger fixture: missing pinned wall_passes search path")
    return definition


def triggers(text: str, label: str, table: str, func: str) -> str:
    pattern = re.compile(
        rf"(?is)drop trigger if exists {re.escape(label)} on public\.{re.escape(table)};"
        rf"\s*create trigger {re.escape(label)}\b.*?"
        rf"execute function forge_visibility\.{re.escape(func)}\(\);"
    )
    result = list(pattern.finditer(text))
    if len(result) != 1:
        raise SystemExit(f"Unsafe trigger fixture: unexpected trigger DDL: {label}")
    return result[0].group(0)


parts = [
    "-- SOURCE-REAL LEGACY COLLISION TRIGGERS, TEST-ONLY DISPOSABLE PG17",
    "-- The existing public test tables and auth.uid() shim already exist.",
    function(v1, "wall_passes"),
    function(v2, "enforce_collision"),
    function(v2, "enforce_tool_collision"),
    triggers(v2, "forge_player_collision", "map_tokens", "enforce_collision"),
    triggers(v2, "forge_tool_collision", "campaign_tool_issues", "enforce_tool_collision"),
]
sys.stdout.write("\n\n".join(parts) + "\n")
print("R18-18: historical source-real wall_passes and TWO triggers extracted", file=sys.stderr)
