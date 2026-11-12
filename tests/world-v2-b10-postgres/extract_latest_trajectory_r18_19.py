#!/usr/bin/env python3
"""Extract final source-real legacy trajectory/trigger/RPC bodies, offline only.

R18-18 tested the pre-trajectory trigger body from 20261108031754. This
extracts the actual later deployed 20261108055943 version instead, with an
exact historical Git blob guard. It must run only against a local PG fixture.
"""
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCES = {
    "old": ("supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql",
            "c774aa7d13e89aa2d783d8d5fdc6f46326e28206"),
    "latest": ("supabase/migrations/20261108055943_world_runtime_single_write_trajectory.sql",
               "2dbb5e3d76ffbfecbb33c739a3a6a7d328baf451"),
}


def load(source):
    name, digest = SOURCES[source]
    path = ROOT / name
    b = path.read_bytes()
    actual = hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest()
    if actual != digest:
        sys.exit("R18-19 FROZEN SOURCE DRIFT: " + name)
    return b.decode("utf-8")


def function(text, name):
    needle = "create or replace function " + name + "("
    if text.lower().count(needle) != 1:
        sys.exit("R18-19 unexpected function declaration count: " + name)
    start = text.lower().index(needle)
    as_pos = text.lower().index(" as $", start)
    tag_end = text.index("$", as_pos + 5) + 1
    tag = text[as_pos + 4:tag_end]
    if not tag.startswith("$") or not tag.endswith("$"):
        sys.exit("R18-19 invalid function delimiter " + name)
    end = text.find(tag + ";", tag_end)
    if end < 0:
        sys.exit("R18-19 unterminated function " + name)
    definition = text[start:end + len(tag) + 1]
    if "set search_path=''" not in definition.lower():
        sys.exit("R18-19 missing pinned search_path " + name)
    return definition


old, latest = load("old"), load("latest")
items = [
    "-- SOURCE-EXTRACTED 20261108055943 FINAL TRAJECTORY/LEGACY GUARDS.",
    "-- CAUTION: 20261108031754 trigger copies are superseded by this file.",
    function(latest, "forge_visibility.validate_piece_trajectory"),
    function(latest, "forge_visibility.enforce_collision"),
    function(latest, "forge_visibility.enforce_tool_collision"),
    function(old, "public.move_map_group"),
    function(latest, "public.commit_map_trajectory"),
    "REVOKE ALL ON FUNCTION forge_visibility.validate_piece_trajectory("
    "jsonb,jsonb,double precision,double precision,double precision,"
    "double precision,double precision,double precision,jsonb)"
    " FROM PUBLIC,anon,authenticated;",
]
print("\n\n".join(items))
print("R18-19 exact latest trigger + trajectory + 2 public RPC bodies extracted",
      file=sys.stderr)
