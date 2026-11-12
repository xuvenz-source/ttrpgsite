# B10-R18-16 — Wall edge clearance research and repeated-movement latency audit

**12 November 2026 (Australia/Melbourne) · Incremental staging QA / NO-GO for SQL or frontend rollout.** Parent exact R18-15 HEAD `7628a319b8c62bf18a4046fffc7bb4b8f28d67be`, draft PR #117. R18-15 frontend-only canary already deployed to `ttrpgsite.vercel.app` as `dpl_E1P6cNfuswAMH7qAFnSLPrTWN6kQ`; Git `main` remains R16. R05 migration `20261111023204` remains unapplied; 12-second signed recovery ON, guarded 700 ms OFF.

## Actual DM trace and observations

The user reports corner dragging is much improved. New problems: a cell appears blocked if a wall barely clips its footprint, and repeated movement starts to feel laggy.

The attached enabled bounded WorldTrace snapshot covers approximately 27 seconds (including startup). Its aggregate **8 grabbed, 8 released, 7 committed, 1 blur-cancelled**, **4 blocked** and **23 approved** events show valid movement without a full-map redraw during the sustained movement interval. **Four renderer seals** and **three full fog draws** were in the initial 0.2–1.5 seconds, associated with initial scene/sight/observer resynchronization; they do not independently demonstrate later fog repaint storms.

| Metric | Samples | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| `authority.begin` | 8 | 192.2 ms | 848 ms | 848 ms |
| `authority.advance` | 27 | 251.2 ms | 567.3 ms | 1314 ms |
| `authority.commit` | 8 | 1057.7 ms | 1336.7 ms | 1336.7 ms |
| `visibility.rpc` | 12 | 217.4 ms | 488.9 ms | 488.9 ms |
| `movement.release-to-terminal` | 8 | 1166.1 ms | 2377.4 ms | 2377.4 ms |
| `render.frame` JS-only | 256 | 0 ms | 0.1 ms | 0.3 ms |

Observed release-to-terminal intervals from the event list, in order: **1159, 1337, 1166, 325, 1324, 1424, 2377, 688 ms**, last cancelled on browser blur. One late keyboard gesture remained finishing for 2377 ms (released t=22006, committed t=24383), and pointer `busy` occurred at t=22327 and t=24038. The final 688 ms cancellation should not be interpreted as an authorized commit. The data show intermittent long waits, but do **not** establish monotonically worsening slowdown (mixed gesture type, wall contacts and sample count). Avoid attributing slow browser time entirely to client painting.

## Read-only production SQL and metrics

Read-only inspection of `forge_world_v2.step_allowed` and `forge_world_v2.swept_hits_segment` confirmed: all blocking walls/closed portals are **line segments**, not filled tile polygons. Every movement checks the swept **full rectangular token/tool footprint** against each relevant wall; a strictly interior intersection blocks even if only a tiny outer slice of the destination footprint intersects. This is the direct source of '1% edge clip counts as a wall' perception; this behavior is **not** a 1% occupancy threshold, as line geometry has zero area.

Read-only SQL calls using synthetic, non-campaign coordinates and live `forge_world_v2.swept_hits_segment(0,0,1,1,1,0,...) ` demonstrate:
- Wall vertical at destination x=**1.95** (5% from right edge of [1,2]): **blocked**.
- Wall vertical at x=**1.80** (20%): **blocked**.
- Wall vertical at x=**1.05** (5% from left edge, directly crossed): **blocked**.
- Wall at x=**2.00**, touching only exterior boundary: **not blocked**.

**Design distinction:** interpret requested '10% tolerance' as clearance to the *outer footprint band* of **0.10 grid-cell units per edge**, not 'percent tile covered by a zero-area line'. The derived candidate shrinks a proposed physical collision footprint inward by at most 0.10 units, using the **full swept route**, so very shallow non-crossing edge contact can be allowed while a true wall crossing remains blocked. A 5% incursion near the destination far edge is admissible in the research model, 20% is not; a 5% incursion at the near edge that the token actually crosses still blocks. This is a **proposal**, not a released movement rule.

For a multi-cell token, `0.10` means grid-cell units, not 10% of its full 2x2 body. Wall crossings through the center of the swept footprint must be blocked regardless of tolerance. All wall types/doors, conditional attributes, tools, groups, bounds, diagonal corner cuts, dynamic revisions, DM overrides, direct database writes and player-specific unpublished walls must be tested. Vision/LOS/light must **not** be silently relaxed alongside physical movement.

The live `pg_stat_statements` extension is available. Accumulated function-group statistics at inspection time (not isolated to user session): **advance 1314 calls, ~58.6 ms mean server execution**, **commit 441 calls, ~186.5 ms mean server execution**, **begin 516 calls, ~25.3 ms mean**, **signed visibility 1192 calls, ~44.6 ms mean**. Historical statistics mix sessions and workload; they cannot pinpoint this trace's network latency or prove a memory leak. No migration was applied. Read-only `forge_world_v2.motion_sessions` grouped view showed only **five historical committed rows**, mean 2.2 batches, max 7. No current active run or runaway persistent table volume was identified. Sequential RPC round-trips and backend terminal commit remain prime suspects for interaction lock time.

## Staged work, no active collision change

1. `scripts/qa/world-v2-wall-edge-clearance-research.mjs`: isolated pure comparison of strict vs hypothetical 0.10-cell inward footprint; **not imported by the board, authoritative movement engine, server or SQL**. Returns `researchOnly:true`. Null on invalid inputs; cannot authorize movement.
2. `tests/world-v2-r18-16-wall-clearance-cadence.test.mjs`: 5% vs 20% penetration, near-edge true crossing, boundary-only contact, full wall crossing, larger footprints, malformed fail-closed, verify research helper is not wired into live source.
3. `src/engine/v2/WorldTrace.js`: opt-in only, bounded categories `authority.begin.sample`, `authority.advance.sample`, `authority.commit.sample`, `movement.release-to-terminal.sample` with fixed delay buckets `under-250ms`, `250-750ms`, `over-750ms`, `over-2s`, `over-5s`. No exact per-event RPC duration, token identity, SQL, map IDs, coordinates or client network logging; no additional event per `render.frame`.
4. `scripts/qa/world-v2-solo-dm-analyze.mjs`: compare retained first-vs-last halves only when >=12 valid sample events for a given operation; show slow (>750 ms) sample shares without inferring cause. The trace stores only **256 recent events**, so a long session can hide initial samples; longer live captures should be reset between short fixed-duration phases.
5. Existing R05 frozen SQL and live collision function are **intentionally untouched**.

## Next engineering release gates

**Wall semantics (design/SQL work):** After acceptance of the '0.10-cell outer-footprint clearance' definition, stage separately reviewed PostgreSQL authority + direct-write enforcement + matching local preflight + tests in one security-gated migration, without overwriting the R05 frozen migration version. Require full parity and no hidden-geometry disclosure. No frontend-only wall-tolerance flag can permit movement the server rejects.

**Latency (solo DM):** Before a new R18-16 frontend-only canary (requires new approval), keep the exact map/token and browse `?worldV2Trace=1`; clear the trace after startup and compare 12–20 normal, repeated, rapid, and wall/fog-involved gestures in *separate* intervals. Record cursor lock, `movement.release-to-terminal`, `authority.commit`, and new fixed-category timing event sequence. Check whether late buckets increase in a comparable workload. If no client-side growth is shown, prioritize R05 signed/backend transaction network and observer path rework rather than altering frame rendering.

**Production:** Current R18-15 remains live. No live change, no backend migration, no guarded recovery activation, no paid resources or browser Auth DM/P1/passive P2 acceptance from this research step. R05 still requires a **separate explicit SQL approval** and real authenticated CLI migration-history parity rehearsal before installation.

**Release disposition: STAGED RESEARCH / NO-GO.**
