# Tabletop Forge — B10-R18-56 guarded synchronous fog fast-path

**13 November 2026, Melbourne · source-real disposable PostgreSQL 17 experiment · staging only · NO-GO production.**

## Source and change boundaries

Exact parent: R18-55 PR #159, head `eb1f1d58b1af79c16b68804f1906d6a3452a6d47`. R18-56 adds `tests/world-v2-b10-postgres/r56-synchronous-fog-fastpath-candidate.sql`, `r56-synchronous-fog-fastpath-benchmark.sql`, a seven-test static suite, and this handoff. The existing R05 disposable runner and R54 PG17 workflow path filter are updated only to invoke that additional test. **No active SQL migrations, browser movement/fog source, production ACL, Vercel deployment, existing 83 historical migrations or R18-43 flags changed.**

Candidate is derived only from exact live source `forge_visibility.authorized_viewer_fog_frame(uuid,uuid)` MD5 `ee3356af321fec1a3e167a75c6245e86`, originally captured in R18-54. The fixture loads the original 13 live function definitions, verifies their exact post-load source MD5s and installs the source-exact authorized fog and collision token triggers. Inside disposable BEGIN/ROLLBACK, it renames the unchanged original fog-frame function to `r56_original_fog_frame` for differential testing, then installs a replacement function under the original name in private `forge_visibility` with pinned search_path and no browser EXECUTE privileges. Every other function and caller stays the same.

## Small, guarded optimization only

Inside the original `authorized_viewer_fog_frame` exception-protected ray/lighting stage, precompute once per authorized frame whether a published scene has no blockers and no light sources, and the ambient value. Three original conditions are preserved:

1. **Zero potential wall/door/window objects** shortcut for per-cell `ray_blocked` ONLY when the scene has <=120 objects and every object is a proper JSON object with a string `type` other than wall, door or window. Any malformed/unknown/non-object entry or over-limit array still executes the original fail-closed ray function. A geometry scene with actual walls/doors/windows uses original blocked-ray semantics.
2. **No authored light or enabled torch** shortcut for per-cell `is_lit`: when there are no scene light objects and no enabled tool torch on the map, the only permitted illumination comes from the original ambient-distance formula (distance<=6 when ambient>0, otherwise distance<=1.5). Any scene `light` object or an active tool torch forces original `is_lit`; a conservative detection also counts disabled light objects.
3. When ambient>=50, the original `is_lit` already returns true before checking lighting sources, so avoid calling it for every cell. Bad ambient casts and other exceptions remain enclosed in the original fail-closed `seen=[]` protection.

The exact original campaign/map membership, source-token roster, owner/group shared fog logic, published scene permission generation, exploration writes, cell ordering, frame structure, collision trigger and per-viewer tick/snapshot update sequence remain unchanged. There is **no deferral, no queue, no dirty-frame exposure, no new client handshake**. The replacement is intentionally not included in pending release SQL; its test-only source snapshot guards direct execution outside the isolated DB.

## Semantic and security validation

The R56 disposable script verifies complete equality of original and candidate JSONB authorized frames, including visible/explored cell arrays, for **two synthetic viewer identities** across original fixtures: open ambient25, fully dark ambient0, fully lit ambient75, party-shared fog, wall, closed door, window, authored light, mixed wall+light, bright environment+wall, disabled light, unknown decoration, malformed null object, malformed wall and missing type. A separate 121-object over-limit case must remain completely invisible under both functions, while an enabled portable torch preserves exact original output. Real signed Begin/Advance/Commit still updates canonical token coordinates and increments both private fog viewer revisions synchronously; a solid wall rejects crossing and does not expose geometry. A revoked synthetic player is refused by both source-original and candidate fog functions. The entire transaction rolls back cleanly and the original R05 forward-recovery rehearsal passes.

This does NOT prove independent DM/P1/passive-P2 signed browser access, RLS on every production table, complex multi-token ownership changes, full scene/light combinations, client streaming cursor ordering, network RTT or free-tier memory/lock pressure. The existing B04 fixture has a test-only private observer sink; no live Realtime packets or JWT-based independent users were included.

## Timing evidence (real PostgreSQL 17, SQL only)

Each job uses eight real authenticated canonical one-cell Commit operations for original and candidate (source-real original before candidate), with reversed signed motion between samples. It additionally times 16 direct per-viewer frame calls per variant, alternating the order to reduce order/cache bias. Local results are **not production latency** and n=8 is too small to support a stable p95 claim.

| PG17 job | Commit mean original | Commit mean optimized | Commit median original | Commit median optimized | Frame mean original | Frame mean optimized |
|---|---:|---:|---:|---:|---:|---:|
| 131842134862 | 18.058 ms | 6.281 ms | 16.773 ms | 6.238 ms | 6.154 ms | 1.461 ms |
| 131843087738 (expanded security scenes) | 8.607 ms | 4.088 ms | 7.659 ms | 3.839 ms | 2.873 ms | 0.844 ms |

In this fixture, source-real mean Commit fell around **52–65%**, and per-viewer frame computation around **71–76%**. Actual times vary widely with runner load/cache; Commit groups are ordered original first and candidate second, so direct causality/magnitude in production remains unproven. The optimized scene in measured runs is wall-free with ambient25, which is a favorable case. Heavy multi-wall and active-light scenes mostly use the original guarded helpers; do not extrapolate these gains to all maps or the 443ms Advance / 1308ms Commit p95 observed in historical browser QA. Importantly, unlike R18-55 dirty fog, this candidate does not shift computation to a second RPC or make temporary fog blackout a design requirement.

## Failures and corrected fixture

Initial dedicated PG17 job `131841692402` matched exact source and candidate fog frames for ten differential scenes (including malformed geometry), then failed before benchmark completion due to a **test-only `INSERT` column name typo** (`test_map` instead of the table's `map_id`) when adding an enabled torch. Corrected the physical column name without altering any function logic. Job `131842134862` then passed all R54/R55/R56 source-real and R05 rollback checks, measuring original vs candidate. Expanded mixed wall+light and revoked-viewer cases passed in `131843087738`. No production data or migrations were altered.

## Release decision and next increment

**R18-56: ENGINEERING PROTOTYPE PASS pending final exact-head code/security CI; PRODUCTION NO-GO.** A future R18-57 could prepare a **separate, opt-in, source-hash-gated narrow SQL candidate** that amends only the authorized fog-frame function and has an exact reversible plan, then compare source-real realistic wall-heavy/torch/multiple-viewer cases to decide whether to promote to the 83+8 staging lineage. Do not silently add this to the reviewed eight pending migrations. Real official authenticated Supabase CLI 2.81.3 isolated 83+8 fetch/list/db push --dry-run is still unperformed, and independent genuinely signed DM/P1/passive-P2 fog/LOS/collision/revocation/canonical convergence QA, live browser RTT and free-tier RAM/lock checks remain mandatory. Existing R18-35 Vercel deployment and both atomic flags must remain untouched.