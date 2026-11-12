#!/usr/bin/env python3
"""Import unchanged real World V2 private per-viewer authority SQL.

Use with B04 test-only schema and standard source extraction. No network.
The ONLY stub is the isolated forge_visibility LOS test fixture, never the
private server-built map/roster/membership filter.
"""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
source = (root / "supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql").read_text()
for name in ("viewer_on_map", "observer_path_status"):
    marker = f"CREATE OR REPLACE FUNCTION forge_world_v2.{name}("
    if source.count(marker) != 1:
        raise SystemExit(f"Expected one original V2 function: {name}")
    start = source.index(marker)
    end = source.index("END $$;", start) + len("END $$;")
    sql = source[start:end]
    if "SECURITY DEFINER SET search_path=''" not in sql:
        raise SystemExit(f"Unsafe unexpected source of {name}")
    print("-- SOURCE-EXTRACTED original " + name)
    print(sql)
    print()
print("-- Original viewer scope and path-status helpers imported",file=sys.stderr)
