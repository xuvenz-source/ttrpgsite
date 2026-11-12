# B10-R18-42 — Source-real authority throughput, Commit, and collision fixture

**13 November 2026 · Australia/Melbourne. Staging/test-only. Never a live migration, SQL execution, preview build or production deployment.**

## Scope and source controls

- Parent: R18-41 test-only `fb35b290c1aa7de88de59d66f5f232befc783a68`, branched from R18-39 `99798032abd2a68d6fea32475a4b16a604d2080d`. The **rejected R18-40 preview** `1b33da9bb60252e7964700e9d97b1d05ea452392` and its pointer-rebase change are **not inherited**.
- Accepted production remains R18-35 `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`. Both public Vercel aliases continue serving its deployment. Supabase free project `lwhwgqaunxbmvyndswze` read-only catalog survey reported **83** applied migrations, latest `20261109171247`, and `20261111023204` R05 **unapplied**. All seven critical live V2 SQL-function hashes matched the pinned preflight on 13 November. No live SQL is run here.
- This package is intentionally **only one isolated SQL fixture**, one guarded local runner change, one Node source/invariant test and this handoff note. It **does not** install R05 or any R18-17/19/20/26/27/28/30 candidate, add new functions, change privileges or alter JavaScript runtime.
- Retain current free-tier setup. No extra project, persistent database, worker, network service or paid product.

## Why this exact benchmark

The sole DM still reports wall-collision and rapid keyboard/drag lag on genuine R18-40 V2 preview. The user-supplied R18-40 QA report records 215 native pointer events p95 **0.2ms**, 44 `authority.advance` RPCs p50 **237.1ms** / p95 **443ms**, 7 `authority.commit` p50 **1117.6ms** / p95 **1308.2ms**, 8 release-to-terminal p95 **1703.5ms**, 6 server-blocked replies, and a 23-approval held-key sequence lasting roughly five seconds. These are device/browser RPC and renderer metrics; not database execution timings.

The read-only `pg_stat_statements` snapshot from the live Supabase project: 1,756 historical Advance calls mean **64.14ms** database execution, 514 Commit calls mean **292.46ms**. Those historical aggregates and the browser trace **do not share request IDs or time windows**. Never calculate their difference as an exact network latency. The Commit function rechecks every previously accepted cell, triggers canonical selected-token/tool writes and retains session lock/scene/permission checks; the Advance path validates each cell and private observer publishing. Removing these without source-real security equivalence would be dangerous.

R18-41's deterministic JS controller test proved 23 *paced* key events create 23 separate signed Advance requests, but 23 already-known same-direction cells fit into one existing server request (max 24 attempted cells and 8 targets). This new R18-42 fixture verifies that distinction with **the original released PostgreSQL 17 implementation** and observes its SQL-local cost.

## Exactly what executes

The existing **isolated** B10 R05 rehearsal creates an additional dedicated PostgreSQL 17 database. It compiles the exact released V2 Begin/Advance/geometry/validator helpers from frozen migrations `20261109095000` and original public Commit from source extraction; it uses the pre-existing mock authentication/map fixture and **test-only inert observer broadcast sink**. That sink does not simulate production recipient/fog work or real user accounts.

Before the frozen R05 migration is even opened, `authority-throughput-r18-42.sql` runs an explicit `BEGIN` / `ROLLBACK` with six repetitions of each variant:

1. **Paced-23:** authenticate test actor, Begin token at x1, issue 23 sequential one-cell `public.advance_world_motion_v2` RPC calls, checking each canonical approved prefix, then the original `public.commit_world_motion_v2` to x24. Record separate SQL-local `Begin`, cumulative `Advance` and `Commit` durations and total number of Advance invocations. Each variant is `23` Advance calls + one Begin + one Commit.
2. **Single-batch-23:** same source actor, map/token/scene, Begin at x1, issue a single bounded `Advance` target x24 containing **all 23 individually validated cells**, original `Commit` to x24, exact same resource budget and canonical endpoint. This variant uses `1` Advance + one Begin + one Commit.
3. Both variants return from x24 to x1 using **separate real actor-signed Begin/Advance/Commit**, not a direct token-row UPDATE. The reset time is not included. Test iteration order alternates to reduce warm-cache order bias.
4. Fixture map width is enlarged **only inside the rolled-back transaction** to fit 23 cells (16 to 32 columns); environment/permission generation/collision rules otherwise unchanged.
5. Hostile section sets a solid wall at x2.5 and verifies a foreign actor cannot use the session, a genuine collision returns `blocked=true` without hidden geometry, and canonical token x remains 1.
6. Output exactly 36 timed records (six iterations × two variants × three phases), with mean, median, p95, max **SQL-local** timing and RPC counts. No numeric speedup threshold: CI scheduling, warm-cache effects, fixture incompleteness and small n prohibit performance acceptance on a ratio alone.
7. A second post-`ROLLBACK` assertion checks that the map is back to 16 cells, original open scene and token x1 are restored, session table and temp timing table are empty/removed, and `public.finalize_world_motion_v2` remains absent.
8. Only **after** these conditions pass does the original R05 `versioned-release-r05.sql` fixture rehearse transactional abort and post-commit recovery. R05 remains unapplied outside the disposable CI database.

## Security and transport limitations

The local B04 private publisher is a stub and fixture `map_tokens` lacks every production trigger, so **do not infer** real fog, Realtime, observer queue, trigger cost, lock contention, shared Nano memory or HTTPS latency from these numbers. This benchmark compares **source-real core Begin/Advance/Commit logic** but not end-to-end production performance.

The existing cumulative R18-33 draft #137 separately benchmarks **R05 plus the R18-26/27/28/30 SQL candidates** in a larger isolated PostgreSQL fixture; it is **not a dependency of this branch** and must not be merged accidentally. Its measurements exclude network RTT and cannot clear the required real DM/P1/passive-P2 security gate.

No visual prediction or local speculative collision change is proposed here. The future server architecture must offer a bounded, actor/map/permission/scene-scoped certificate before allowing any visible unconfirmed motion, and an atomic Begin/Advance/Commit or final Advance+Commit only after the full R05 dependency chain has been separately reviewed and installed. A player must not learn a hidden wall merely from a guessed unrestricted movement envelope.

## Release decision

**R18-42 is diagnostic gating, not a latency fix.** Require exact-head frontend Node tests, Vite/lint/audit/Edge checks, CodeQL, isolated PostgreSQL authority tests and combined disposable PostgreSQL 17 test. Record actual SQL measurements from the combined fixture logs and review against previous R18-33 candidate evidence without assuming equal environments.

**NO-GO** for production: R18-40 failed user experience acceptance, R05 is absent, and no independent fog/recipient/convergence tester is available. No DM test needed for this test-only package. Next package can optimize protocol/SQL only with measured source parity, signed fog permission, canonical transaction and bounded resource guards.
