# B10-R18-68 — Source-real Commit cost attribution (isolated PG17)

**14 November 2026 · Draft staging only · No production SQL, migration or deployment.**

## Why this is not another speculative movement patch

R18-67 read-only, real Supabase `extensions.pg_stat_statements` shows historical `authenticated` Commit averages **292.46 ms** across **514** calls (historical maximum **3,673.7 ms**), compared with Advance 64.14 ms, Visibility 43.53 ms and Begin 25.40 ms. These are database-only cumulative values since 5 November; neither browser p95 nor definitive causal decomposition. This is strong evidence of costly Commit, but insufficient justification to remove security checks.

The installed original `public.commit_world_motion_v2` revalidates all server-accepted cells through the exact `forge_world_v2.step_allowed`, takes row locks, updates canonical positions and executes collision/visibility token triggers. R18-54 already measures one-cell Commit with source-real fog off/on. R18-57 compares a separate **opt-in** synchronous fog implementation on open/24-wall maps with eight viewers, but is not approved for live use. We need a **route-length × fog × wall** interaction experiment to distinguish route replay scaling from synchronous observer cost.

## Engineering scope

- Add `tests/world-v2-b10-postgres/r68-commit-cost-attribution.sql`; it runs **ONLY** inside the existing R18-54 source-real **`BEGIN ... ROLLBACK`** disposable PostgreSQL 17 fixture after original source MD5 checks and exact real token collision/fog triggers are installed.
- Add exactly one `\i` inclusion immediately before R18-54's original benchmark. The new test returns the canonical token and fixture scene to their original positions and settings; then **all existing** R18-54 wall-block, private fog, player-revocation and rollback assertions run unchanged.
- Add focused static guards checking the 48-sample experiment, pinned production function hashes, signed Begin/Advance/Commit, fog-only viewer tick effects, no fake collision-disable, and that R18-54's original hostile cases remain.
- **No** changes in `supabase/migrations`, `supabase/candidates`, live RPCs, permissions, V2 client code, renderer, Vercel or Supabase. The tests run exclusively in a throwaway local GitHub Actions PostgreSQL 17 instance with the existing explicit host, port and database checks.

## Exact controlled test

4 repetitions × 2 scenarios × 2 fog modes × 3 movement depths = **48 timed original Commit calls**. A matching untimed reverse Commit follows each timed call, so every sample starts from the same server-authorized origin.

| Dimension | Values |
|---|---|
| Authorized route depth | **1, 6, 12 cells** |
| Scene | Open (zero barriers) / 24 off-route walls |
| Fog | On / off |
| Authentication | Existing fixture player, signed original Begin/Advance/Commit |
| Canonical state | Must end at expected cell; reversed by signed RPCs |
| Timing | Server-side PostgreSQL `clock_timestamp` around original Commit |
| Fog observer consequence | Original scoped viewer revision changes only for fog-on |
| Source integrity | Original production Commit and fog MD5 must match exactly |
| Output | Scenario, fog mode, depth, count, mean/median/p95/max SQL milliseconds (four synthetic-fixture samples only) |

The wall-heavy map uses **24** barriers at x≈14.2–14.3 and y=3..15, outside the y=1 route ending at x=13. Obstacles are therefore tested for **cost**, not bypassed; existing R18-54 tests still require real walls to stop movement without leaking geometry. The 1/6/12-cell Advances must approve **every cell** and the successful Commit must write the exact approved final position. Fog-on must refresh at least two protected fixture observers. No fake player access or recipient authorization is created.

The order of scenes, fog modes and route lengths reverses on alternating repetitions to reduce (not eliminate) warm-cache order bias. This **is not an external latency SLA**: four samples per condition are too few for stable p95, and the disposable fixture does not model all production token triggers, real 3-browser streaming, hosted Supabase Free RAM or network RTT. Compare directional costs only; never claim a browser p95 or guarantee. The CI artifact/log has timings and counts, not token IDs, map geometry, JWTs or private fog frames.

## Decision gate after CI

- **If longer routes cost substantially more even with fog off:** inspect the 12-step vs 1-step original Commit loop and its collision validation on exact source-real geometry. Preserve every authorization/permission check; optimize only after a separately tested, proven equivalent candidate.
- **If fog-on dominates for one-cell routes:** use R18-57's separately gated original-vs-candidate test as additional evidence. It is **not** automatically safe to install; independent fog revocation/privacy checks and 83+8 authenticated CLI/multiplayer release gates remain.
- **If wall-heavy geometry dominates independently of fog:** inspect per-step swept collision checks and potential coarse safe prefilters, with exact geometry and hostile authorization tests before implementation. Previously rejected R18-26 bbox candidate is **not** reintroduced.
- **If results overlap or are noisy:** report insufficient attribution and gather more controlled data; do not patch based on wishful inference.

**Release verdict throughout: ENGINEERING INVESTIGATION ONLY / PRODUCTION NO-GO.** The signed DM/P1/passive P2 integrated QA, official authenticated Supabase CLI v2.81.3 remote history 83+8 `migration fetch`, `migration list`, `db push --dry-run` and peak Supabase Free RAM/lock/browser RTT measurements remain separate mandatory gates. Google OAuth preview smoke is already PASS; no need to repeat that user task.
