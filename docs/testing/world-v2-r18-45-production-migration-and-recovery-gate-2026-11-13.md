# B10-R18-45 — Production-safe migration preflight and post-commit recovery gate

**Date:** 13 November 2026, Australia/Melbourne. **STAGING ONLY. NO LIVE SQL WRITES, SQL MIGRATION REGISTRATION, CLIENT FEATURE FLAG, VERCEL PREVIEW OR PRODUCTION DEPLOYMENT.**

## 1. State of the release

Parent: R18-44 exact head `9bfdcedb87ecd53ab25b3f4e2349216e0fb4bc58` (draft PR #148), on the clean R18-43 optional client bridge. Rejected R18-40 movement patch is not inherited. Live Vercel remains R18-35, source SHA `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`. Supabase free project has **83 applied migration versions**, latest `20261109171247`. Existing official-CLI-generated R05 versioned file `20261111023204_world_v2_b10_integrated_motion.sql` remains **UNAPPLIED**. Finalizer `public.finalize_world_motion_v2` remains **ABSENT**. Both atomic client activation flags remain **OFF/unset**.

Unlike R18-44, this package addresses operational risk of *real database rollout*: the unversioned SQL dependency list, exact-source live catalog preflight, client/API shutdown and forward recovery after a committed failure. The preflight is actually executed as a read-only DO statement against the live project; it performs **zero** writes. This is NOT the same as authorizing any DDL to be run there.

## 2. Exact live read-only preflight

`supabase/release-preflight/world_v2_b10_r18_45_exact_authority_readonly.sql` fails closed unless all conditions hold:

- **Exactly 83** migration records, latest `20261109171247`, no registered R05;
- **Ten exact MD5 digests** of `pg_get_functiondef` match the original public/private Begin-adjacent V2 authority/visibility definitions (seven previously pinned) plus `forge_world_v2.step_allowed` and the two deployed legacy token/tool collision triggers (three independently matched by a read-only query on 13 Nov);
- `forge_world_v2` is inaccessible to browser `anon` and `authenticated`; those roles have only expected public Advance/Commit privileges;
- R05 queues, backup schema, R18-20 guard, finalizer API and R18-28/B08 receipt columns are **not** partially installed;
- There are **zero active, unexpired V2 motion sessions** at the instant of preflight.

The first live invocation detected an incorrect five-argument `Advance` privilege signature in the *new preflight itself* and was rejected by PostgreSQL. It was fixed to the **source-real six-argument signature** in both preflight and containment scripts. The subsequent live read-only preflight succeeded without modifying a row. Preserve this failed first attempt in the handoff record.

The successful preflight is point-in-time only. It does not hold a transaction lock across later migration execution. **A separate authoritative migration-time recheck with bounded locks and no active sessions remains mandatory.** Live tenant/actor data was not retrieved.

## 3. Frozen candidate chain — not yet versioned for release

Existing official Supabase CLI v2.81.3 previously generated the frozen **R05** file in CI. Subsequent candidates remain **UNVERSIONED**, deliberately located in `supabase/candidates`:

| Order | Source | Role | Status |
|---|---|---|---|
| 0 | R05 `20261111023204` | integrated private B03/B07/B08/R01/R03 authority, backups | Staged CLI-versioned, unapplied |
| 1 | R18-17 wall-edge clearance | bounded shallow-overlap margin, preserves solid blocking | Exact historical blob, unversioned |
| 2 | R18-19 corrected token/tool cross-map guards | preserves V2 checkpoint + campaign map identity | Exact historical blob, unversioned |
| 3 | R18-20 campaign affinity | rejects cross-campaign reparenting | Exact historical blob, unversioned |
| 4 | R18-26 exact swept-step AABB optimization | collision prefilter, not a player grant | Exact historical blob, unversioned |
| 5 | R18-27 empty-work Commit optimization | skip provably empty observer/token updates | Exact historical blob, unversioned |
| 6 | R18-28 atomic finalizer | adds two private nullable receipt columns and authenticated-only public API | Exact historical blob, unversioned |
| 7 | R18-30 blocked terminal semantics | replaces ONLY R18-28 public function; preserves prior movement/noMotion | Exact historical blob, unversioned |

The R18-44 branch already contains all prior source-reviewed files and source-real tests for R18-17/19/20/28/30. R18-45 brings in exact immutable historical blobs for **R18-26** (`57522d2d801ca69c92a136c5c915c58101644e51`) and **R18-27** (`bbc2dcf4c770ce857845691c80bd2c11418c3d77`) plus original 4,860-case geometry parity and Commit/observer tests. These are not silently merged from the failed R18-40 branch.

**Performance blocker:** prior R18-33 timing showed the 26/27/28/30 candidate stack was **not consistently faster** than its baseline. R18-26/27's inclusion must receive a separate security and workload decision. They are loaded in the disposable *worst-case full-dependency rehearsal*, not recommended for live based on their existence.

**No new `supabase/migrations` filename was manufactured.** The official Supabase CLI is not installed in this runtime; following the plugin skill and [current CLI docs](https://supabase.com/docs/reference/cli/introduction), new versioned migration files must be created with `supabase migration new <descriptive-name>` in a properly configured isolated development environment and then reviewed by exact Git/source digests. Do not run a default `db push` against the 83-version live project while historical aliases still differ. Do not use `migration repair` to silence drift.

## 4. Post-commit failure is different from transaction abort

A database transaction's `ROLLBACK` is useful only **before COMMIT**. After a committed release, neither rolling back the frontend nor manually changing migration history restores changed function definitions, wall geometry, triggers or public privileges.

`supabase/release-recovery/world_v2_b10_r18_45_atomic_containment.sql` is a **manual, bounded, source-guarded containment** SQL script, never a migration or automatic deployment:

- Rechecks that the reviewed finalizer body, two receipt columns and R05 protected backups exist, plus actor/private schema ACLs and the still-authorized original Begin/Advance/Commit API.
- In a single 5-second lock-timeout / 30-second statement-timeout transaction, **REVOKEs `EXECUTE` on only `public.finalize_world_motion_v2` from `PUBLIC`, `anon`, and `authenticated`**, then rechecks browser ACL denial and the unchanged normal V2 API. Leaves prior session records, canonical pieces, observer logs, private fog and migration history intact.
- Does not forcibly kill already running SQL statements or deny privileged service/owner access; that limitation is explicit. Both Vercel atomic client flags must remain OFF. Re-enablement requires a later reviewed release.
- This script can contain the optional finalizer without needing the original movement function bodies to be restored immediately.
- Separately, the **previously tested R05 emergency forward-recovery** `supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql` can restore exactly four protected original V2 function definitions after all motion sessions are drained. It keeps R05 schema/metadata for audit.

**Important incompleteness:** R18-17 wall functions, R18-19 legacy collision trigger function changes, R18-20 new triggers and R18-26 step_allowed may remain installed after restoring R05's four functions. This is **forward containment, NOT a full rollback to the 83-version original schema**. A production-ready release needs reviewed pre-change source backups and a separate recovery strategy for those additional objects, including legacy triggers, grants, existing dependencies and incident procedures. Unless that exists, there is no approval to deploy the full stack. Do not drop data-bearing tables or rewrite migration history.

## 5. New source-real isolated PostgreSQL 17 verification

The existing R18-44 **third** disposable PostgreSQL 17 DB is reused, explicitly local with no Supabase project credentials. At its end, after the original 16 R18-28, 13 R18-30, five real-JS receipt and 11 R18-44 hostile/rollback checks:

1. `step-bbox-r18-26.sql`: compare the prefilter against the exact original in **4,860** wall/door/span/edge/corner scenarios under BEGIN/ROLLBACK;
2. `commit-empty-r18-27.sql`: compare empty work and nonempty private observer drain with exact original Commit, actor/ACL, mounted tool and idempotent reply under BEGIN/ROLLBACK;
3. `postcommit-containment-r18-45.sql`: transactionally **COMMIT** R18-26 + R18-27 + R18-28 + R18-30 in the disposable DB only; prove the new terminal RPC exists and has the proper limited ACL;
4. Begin a normal signed V2 movement session; execute the **actual containment SQL** as an independently committed transaction; verify the terminal browser grant is revoked and the active normal gesture/canonical position is untouched;
5. Complete the still-active ordinary movement through original Begin/Advance/Commit, proving no blocked wall bypass or false guest authority;
6. Execute the protected **R05 forward-recovery SQL**, also committed in the disposable DB, after all active sessions are closed. Check all four original function hashes restored, terminal still revoked, valid token endpoint retained and R18-17/19/20/26 changes still present — explicitly **not a full database rollback**.

These fixtures are source-real in their isolated functional scope, but do NOT measure production network RTT, memory, real P1/P2 recipient-specific LOS or actual cloud lock contention. No synthetic fixture can replace independent fog/revocation verification.

## 6. Release handoff / outstanding hard blockers

**R18-45 expected status: staged / NO-GO production.** Required exact head gates: Node regressions, Chromium real board drag, build/lint/npm audit/Edge checks, CodeQL, isolated V2 PG17 authority, combined PG17 with *new post-commit containment recovery*. Do not claim success until logs show it.

Before any future live release:

- Generate official versioned migration files with the Supabase CLI and verify the **exact 83-version live alias ledger**; execute staged SQL from reviewed hashes only, never a best-guess `db push`. Select explicitly whether R18-26/27 qualify after observed cost/behavior review.
- Add protected original-source snapshots and rehearse **complete postcommit recovery** for R18-17/19/20/26/27 (or change the release scope to exclude unsupported changes), plus version-ordered rollout transaction safety and a confirmed way to reconcile migration history without falsifying it.
- Run independent authenticated **DM, P1 and passive P2** fog/collision/LOS/revocation/outbox privacy tests and canonical convergence, including revoked grants mid-gesture. User currently has only the solo DM available; do not certify private multiplayer behavior from DM preview.
- Only after server is installed and independently verified consider enabling the **two R18-43 atomic flags** in an explicitly gated live test. Do not use a preview with empty backend flags to claim the speed feature works.
- Maintain free-tier infrastructure: existing GitHub CI disposable PG17 only; no paid Supabase branches, no new always-on workers or extra project.

**Lead developer's release decision:** retain R18-35 production and R18-43 flags OFF. R18-45 improves controlled deploy/containment evidence, not player movement yet.
