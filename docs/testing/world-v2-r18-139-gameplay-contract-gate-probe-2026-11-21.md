# B10-R18-139 — Actor-scoped gameplay contract blockers and R132 gate concurrency probe

**21 November 2026 (Melbourne).** Stacked **draft**, child of R18-138 PR #246 at
\`300fb92786bf66f8c61dcb36488f51be0709aa7c\`. **NO_GO** for production,
hosted QA writes, migration application, Data API exposure, merge, deployment,
new browser grants or paid infrastructure.

## Exact production-source contracts (reviewed, NOT authorized)

The executable \`GameplayContractAudit.mjs\` re-censuses the 26 R138 dynamic
browser call sites and locks six important producer/consumer groups to their
exact checked-in method names: gesture-session, player sight/DM preview,
viewer light masks, five combat actions, fog delta/fallback, and dynamic
inventory source mapping. Drift fails CI rather than silently promoting an
unknown RPC, relation or name-parameter to an exposed gateway.

1. Gesture: the original database has signed begin, advance, commit and
   cancel V2 routines. The client also contains an **optional finalizer**,
   but \`finalize_world_motion_v2\` is **absent** from the original 83-migration
   server catalog. The V3 client must not enable atomic finalization until a
   separately verified original server implementation exists. Zero additional
   browser calls are proposed.
2. Player sight and DM player-preview: the original database has
   \`get_world_visibility_v2\`, \`preview_world_visibility_v2\` and
   \`preview_world_visibility_at_v2\`. The latter two accept viewer/token
   parameters; they must verify DM membership and visibility authority
   **inside the server**, not trust the UI's \`dmPreview\` boolean.
3. Lighting and fog: both light-mask variants are present; V3 must use a
   current signed viewer mask without a legacy fallback. Fog delta/current
   viewer and legacy global RPCs coexist in the current browser source.
   R128's public schema freeze intentionally makes older routes unavailable.
   No V3 fog or lighting route has been released.
4. Combat and inventory: five distinct action RPCs are explicitly named by
   the browser's indirect combat dispatcher; a generic caller-selected
   privileged function is forbidden. A UI \`isDM\` flag is insufficient.
   Dynamic sheet relations map to \`characters\`, \`npc_templates\` and
   \`map_tokens\`; mapping alone proves neither owner nor DM scope, and
   original authenticated \`map_tokens\` SELECT is not granted.

R138's seven V3 gameplay facades remain EXECUTE-revoked; private SECURITY
DEFINER helpers remain ungranted. No further V3 routes, grants or runtime
source edits are included in R139. The original 67 public privileged functions,
31 relations, 17 published Realtime tables, 19 Postgres Changes listeners,
Storage signed bearer URLs (#231), alternate sender and **old socket**
revocation remain release blockers. No browser-only version flag is security.

## R132 gate: read-read compatibility, fence-update ordering

R132's \`scene_v3_publish_allowed()\` issues \`SELECT ... FOR SHARE\` on
the single maintenance gate row. PostgreSQL allows concurrent \`FOR SHARE\`
readers, while a transaction modifying that same row waits for existing
shared row locks. R138 calls that predicate on beginning, advancing and
committing a movement. Consequently the maintenance gate does **not**
inherently serialize concurrent players' advance RPCs, but additional
read/row-lock time, real movement-row contention, and fence transition wait
must be measured.

The standalone \`world-v2-r18-139-gate-concurrency.mjs\` probe runs only
with the guarded R138 **fictional PostgreSQL 17** fixture. It requires an
isolated GitHub Actions job, loopback PG, a fixed disposable database and
credentials, and rejects hosted environment variables. It checks that
two independent gate-reading transactions coexist and that a maintenance
UPDATE waits while those transactions hold shared locks. It emits a small
EXPLAIN ANALYZE gate-call sample alongside a no-gate baseline. These numbers
are **not** free-tier latency results: they omit original LOS, collision,
scene fanout, multi-client network, payloads, Realtime and fog redraw.

The correct future benchmark compares unmodified V2 vs R138 V3 on actual
free-tier-like collision-heavy drag and rapid arrow workloads with DM, P1,
P2 and outsider signed actors, p50/p95/p99 response timing, lock wait events,
DB memory/CPU, and visual rubber-banding. No real signed DM/P1/P2/outsider,
revoked/reinstated, old-socket or multi-tab QA was run here.

## Mandatory release gate and next work

R128 public API freeze, R132 maintenance gate and R138 private helpers
are still source-only. QA remains zero migrations and application tables;
original remains at 83 migrations. Existing PR #246 and this R139 draft
must not be merged or deployed. Production **NO_GO**.

Next: R18-140 should stage narrow, **default-denied** DM preview and
private fog/light/navigation prototypes with actual original role semantics
and tests, followed by the complete original privilege audit and explicit
old Realtime socket teardown. Real signed QA and measured free-tier
movement performance are prerequisites before any browser EXECUTE grant.
No manual user action is required in this step.
