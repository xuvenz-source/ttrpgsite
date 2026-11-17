#!/usr/bin/env python3
"""Extract FOUR exact source-verified functions and real combat RLS policy.

Local fixture generator only. Never connects to Supabase or reads private SQL.
Source bodies must match R18-104's independently checked live SHA-256 digests.
"""
from __future__ import annotations
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
INDEX = ROOT / "staging/world-v2-b10-r18-103-live-source-parity/metadata-index.json"
SOURCES = (
    ("can_view_campaign_map",
     "supabase/migrations/20261106180100_private_player_maps.sql",
     "835829ca8012fe26ae5d224df749a1a8cde958136c322d10f3d3fa91a5f3f83c", 448),
    ("is_map_fog_published",
     "supabase/migrations/20261107110539_authoritative_fog_collision_release.sql",
     "767cbcd8bd4813c0a535fa71bf1ecc3a9cf8a6dd02c239499c0be1737a28c96f", 102),
    ("end_map_motion_previews",
     "supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql",
     "0af8c21219a4886736dd5cfa275aaab1ed25160e60c8ef932642080d6a2ce863", 535),
    ("end_map_motion_sessions",
     "supabase/migrations/20261108111759_unified_movement_fog_realtime_memory_20261108.sql",
     "b8f4a5a49a748e3ee7caccb77ae3c2f99ecc04adfe93e444768db1eb95efeadb", 682),
)
def reject(msg: str) -> None:
    raise SystemExit("R105 SOURCE MISMATCH: " + msg)

def extract(sql: str, name: str) -> tuple[str, str]:
    anchor = re.compile(r"\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\." +
                        re.escape(name) + r"\s*\(", re.I)
    hits = list(anchor.finditer(sql))
    if len(hits) != 1:
        reject("expected exactly one Git SQL definition for " + name)
    remaining = sql[hits[0].end():]
    body_match = re.search(r"\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;", remaining, re.I)
    if body_match is None:
        reject("unterminated dollar quote for " + name)
    ddl = sql[hits[0].start():hits[0].end() + body_match.end()]
    return ddl, body_match.group(2)

def main() -> None:
    if len(sys.argv) != 2:
        reject("provide exactly one temporary output directory")
    dst = pathlib.Path(sys.argv[1]).resolve()
    if not str(dst).startswith("/tmp/") and "/_temp/" not in str(dst):
        reject("only temporary CI fixture output is permitted")
    dst.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX.read_text())
    if index["workPackage"] != "B10-R18-103" or index["decision"] != "NO_GO":
        reject("inherited live SHA baseline is no longer frozen")
    functions = []
    for name, path, sha, size in SOURCES:
        source = (ROOT / path).read_text()
        ddl, body = extract(source, name)
        encoded = body.encode("utf8")
        actual = hashlib.sha256(encoded).hexdigest()
        ref = [x for x in index["functions"] if x["schema"] == "public" and x["name"] == name]
        if (len(ref) != 1 or actual != sha or len(encoded) != size or
                ref[0]["bodySha256"] != sha or ref[0]["bodyBytes"] != size):
            reject("actual Git function body not equal to live source for " + name)
        functions.append((name, ddl))
    grants = [
        f"REVOKE ALL ON FUNCTION public.{name}(" +
        ("uuid,uuid" if name == "can_view_campaign_map" else
         "uuid,uuid[],uuid[]" if name in ("end_map_motion_previews", "end_map_motion_sessions")
         else "uuid") +
        ") FROM PUBLIC,anon,authenticated;\n" +
        f"GRANT EXECUTE ON FUNCTION public.{name}(" +
        ("uuid,uuid" if name == "can_view_campaign_map" else
         "uuid,uuid[],uuid[]" if name in ("end_map_motion_previews", "end_map_motion_sessions")
         else "uuid") +
        ") TO authenticated;"
        for name, _ in functions
    ]
    (dst / "original-functions.sql").write_text(
        "-- EXACT FOUR Git functions matching live SHA-256 (not original DB data)\n"
        + "\n\n".join(x[1] for x in functions) + "\n\n"
        + "\n".join(grants) + "\n")
    (dst / "restore-fog.sql").write_text(
        "-- LOCAL-ONLY ORIGINAL FOG DEFINITION; restores known disclosure, use for rehearsal only\n"
        + functions[1][1] + "\n"
        + "REVOKE ALL ON FUNCTION public.is_map_fog_published(uuid) "
          "FROM PUBLIC,anon,authenticated;\n"
        + "GRANT EXECUTE ON FUNCTION public.is_map_fog_published(uuid) TO authenticated;\n"
    )
    fog_path = ROOT / SOURCES[1][1]
    original = fog_path.read_text()
    policy_anchor = re.compile(
        r'CREATE\s+POLICY\s+"dm or nonfog viewers read combat roster"\s+'
        r'ON\s+public\.map_combats\s+FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(',
        re.I,
    )
    policy_matches = list(policy_anchor.finditer(original))
    if len(policy_matches) != 1:
        reject("real map_combats fog RLS policy missing or duplicated")
    # This policy uses function calls/parentheses but contains no nested semicolon.
    tail = original[policy_matches[0].start():]
    semicolon = tail.find(";")
    if semicolon < 0:
        reject("RLS policy is not terminated")
    policy = tail[:semicolon + 1]
    if ("public.can_view_campaign_map(campaign_id,map_id)" not in policy or
        "not public.is_map_fog_published(map_id)" not in policy or
        "public.is_campaign_dm(campaign_id)" not in policy):
        reject("RLS combat policy not the Git-reviewed one")
    (dst / "combat-policy.sql").write_text(
        "-- Source-extracted real PostgreSQL combat RLS policy from frozen Git\n"
        + policy + "\n"
    )
    print("R105: 4/4 Git function bodies exactly match prior live SHA-256; "
          "real combat RLS policy extracted. Source-safe local-only files ready.")

if __name__ == "__main__":
    main()
