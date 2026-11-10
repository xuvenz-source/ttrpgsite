# B10-R04 — PR #71 source reconciliation and atomic SQL release rehearsal

**Date:** 11 November 2026 (Australia/Melbourne).  
**Parent:** B10-R03 draft PR #88 at `c66148971a75f65503bcd3140e3acaecc7be05c6`.  
**Status:** **STAGED — NO-GO production release.** This is one incremental engineering step only. The designer confirmed **no real campaigns are active; live campaigns are disposable test environments**. That materially lowers campaign-data restoration risk and will allow a deliberate live-test rollout once the coupled security and SQL/client gates pass. It does **not** waive confidential fog, player ownership, hidden NPC/door, cross-user access or login validation.

## 1. Read PR #71 as a source candidate, not a merge prerequisite

PR #71 is draft, still based on old production SHA `b246b3a72537b53b2afc2a9a38cbe1db3609a8af`, and remains separate from the staged B03–R03 stack. It contains three distinct proposals:

| PR #71 element | B10-R04 review and decision |
|---|---|
| `src/TabletopApp.jsx` trailing V2 commit reconciliation (280ms) | **Port with adaptation.** One deferred authorized token+issued-tool read after a burst instead of two queries per successful Commit; non-V2 fallback remains unchanged. Use the **already imported** `createTrailingRefresh`, store an instance ref, and cancel it on viewer/map/campaign changes. Never let an old map timer trigger stale row reads. |
| `ObserverSightContinuity.js` and conditional `WorldV2TabletopRuntime.onRevoke` retaining certified sight during `unknown-piece` recovery | **Reject for this release.** The private recipient stream is **locked** while reauthorizing but PR71 leaves an old rendered sight in place. Its proposed guard does not include an enforceable maximum hold duration or proven negative map/permission revocation while delayed. Existing V2 `authorized()` only checked the scene+vision+renderer, not the private stream's lock state: old sight could still allow a new input pick. Until a bounded, fail-closed viewer-epoch policy is proven, prefer the existing safe renderer seal over stale authorization. Do **not** merge or cherry-pick the retention helper. |
| One opt-in `observer.sight-hold` diagnostic and PR71 targeted tests | Do not introduce new diagnostic payloads; the event name is already allowed in `WorldTrace.js` from earlier source and never grants anything. PR71's hold-specific test depends on unsafe behavior, so **do not port** it. Instead regression-test locked-stream movement denial and revised source-contract gating. |

The new runtime guard explicitly refuses normal V2 gesture picks unless its private stream is connected, unlocked and `privateReady`, *in addition to* scene/vision/renderer authorization. DM player preview remains a local, separate authority and does not need a foreign player's private channel. This is defense in depth even while the renderer remains conservatively sealed.

**Disposition:** PR #71 is **superseded**, not merged. Once the R04 draft and exact-head CI are recorded, close PR71 with rationale and a link to the replacement PR. Keep its original diff for audit. Renderer retention without flashing belongs to the later Track C02–C03 bounded revocation/terrain-owner redesign, not a half-enabled B10 shortcut.

## 2. Exact candidate migration order — single disposable PostgreSQL transaction

B10-R04 adds `tests/world-v2-b10-postgres/migration-rehearsal-r04.sql`, run **before** the ordinary B10 candidate-install and hostile fixture suites by `tests/world-v2-b10-postgres/run.sh`. The runner already refuses every remote database or non-`world_v2_b10` database; the workflow starts a temporary PostgreSQL 17 service with a local test-only password.

The rehearsal records baseline Core, Advance and Commit function definition hashes; checks the private candidate objects are absent; starts one transaction; sources the five candidates in exact dependency order:

1. `world_v2_b03_path_validation.sql` — private swept-path validator.
2. `world_v2_b07_private_observer_budget.sql` — private per-recipient queue, current LOS/filter and physical publish budget.
3. `world_v2_b08_commit_reconciliation.sql` — actor-scoped exact RPC replay, canonical Commit and bounded terminal drain.
4. `world_v2_b10_r01_core_path_integration.sql` — route *fresh* authoritative advances through B03 once.
5. `world_v2_b10_r03_terminal_queue_retirement.sql` — retire all old postcommit path coordinates while retaining certified hide-only recovery.

While still inside the transaction, assert that all tables/functions exist, private queue RLS and browser-role denials remain true, existing authenticated public Advance/Commit RPCs still have correct signatures and grants, public Commit uses B08 drain, and the private Core delegates to B03. Then issue **ROLLBACK** and compare the original function hashes. Verify every candidate table/function is absent again and the original state was restored exactly. The synthetic B04/PG17 baseline originally lacked public Commit before B08, while the actual live Supabase baseline has Commit. The rehearsal treats both a preexisting function and a preexisting **absence** as immutable baseline state, rather than inventing a dummy function.

**What this proves:** the five SQL files are transactionally compilable together on the source-real synthetic schema, with expected private ACLs and no leftover candidate after rollback; their existing hostile suites continue to pass when installed normally.

**What this does not prove:** executing the migration against live triggers, real Supabase Auth/JWT, active RLS policies, prepared map/fog entities or concurrent in-flight sessions. A transaction can roll back *before* commit; after a production migration has committed, Postgres rollback requires a separately tested forward-repair/downgrade plan. No actual `supabase/migrations/` file or production installation is made in R04.

## 3. Read-only live catalogue parity

The live Supabase Free project currently reports **83 applied migrations**, latest `20261109171247`. Read-only `pg_catalog` verifies existing public `advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)`, `commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)`, `get_world_visibility_v2(uuid)` and private `advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)` exist with `SECURITY DEFINER` as designed in this source's public/server authorization system. B03, B07 and B08 candidates and R01/R03 overrides are **not installed**. The migration order can therefore be staged without changing RPC signatures or adding a paid service; **it is not authorized for live execution yet.**

The synthetic SQL fixture's source functions and visibility helper are deliberately not equivalent to a full live project clone; next-phase tests should verify live `pg_proc` signature/ownership, original migration-name aliasing, private queue RLS/grants, and a recoverable fault after partial candidate application.

## 4. Coupled rollout requirements before disposable live campaign tests

There are **no active real campaigns**, so game-state backup/rebuild is a test-convenience concern rather than an irreplaceable user-data concern. This changes our deployment posture: a **controlled, revertible production-URL live-test build** becomes reasonable as soon as source, ACL and multi-account preflight gates pass. It does NOT make a hidden NPC leaking to a different account acceptable.

The next explicit staged step should prepare a versioned forward-only migration and a tested recovery path from both halfway and fully applied SQL. Deployment must keep server and client compatible: B03+B07+B08+R01+R03 and Vercel's `VITE_WORLD_V2_OBSERVER_RECOVERY` flag must activate as a reviewed pair. Do not ship R03 alone with recovery OFF, or enable B05/B06/B08 frontend flags before matching backend is installed. Refresh/rollback feature flags and versioned RPC signatures in a documented sequence, not as simultaneous unverified mutations.

**Real authenticated QA:** distinct DM, Player 1 and Player 2 accounts, one disposable protected test map with fog/collision, wall, door, a hidden NPC, 2×2 obstruction, light boundaries, tool placement, group drag, arrow and touch, player preview, multi-tab and disconnected/reconnected access. Run all 24 A06 cases, collect sanitized authorization and latency/flash counters, and test budget-saturated hide + terminal ACK replay. Free-tier CPU/RAM and Realtime billed fanout must be measured. If this requires reset of disposable map/characters, the designer has confirmed that is acceptable.

## 5. Outstanding blockers and next handoff

**B10 / Gate A / Gate B: NO-GO** until versioned migration/roll-forward strategy, real signed-user security/LOS and renderer latency tests, and coupled release preflight are complete. The safe PR71 performance subset reduces avoidable app reads but does not by itself prove lower p95 or fix underlying map flashing. Do not claim `PR #71` merged or a real browser acceptance pass.

**Next bounded step:** B10-R05 — finalize a forward-only deployment migration using approved Supabase CLI release tooling, verify it against the true catalog with an atomic and partial-failure rehearse/repair plan, and create a gated live-test rollout checklist. Then execute the disposable campaign acceptance once source+SQL+Vercel go/no-go gates are green. Production remains unchanged by R04.
