# B10-R18-69 — Extended eight-viewer privacy parity for the guarded R18-57 fog fastpath

**14 November 2026 · Stage only · No production migration, candidate rewrite, permissions change or Vercel deployment.**

## Why this test is needed

The real live database's `authenticated` Commit RPC has a cumulative execution average of approximately **292 ms** over 514 historical calls (R18-67). The corrected R18-68 disposable PostgreSQL 17 benchmark isolated the direction: with the original source-real collision and fog triggers, a one-cell Commit took about **1.28 ms** with fog off on a 24-wall scene, versus **135.10 ms** with fog on; extending the path to 12 accepted cells barely changed the result. This points toward synchronous private fog work for the *fixture*, not toward weakening authoritative collision.

Our already staged **R18-57 unversioned candidate** optimizes synchronous fog while preserving private per-viewer frames, exact source digests, privileges and a separately guarded rollback. Prior R18-56 source parity exercised many hostile scenes with only two viewers, while R18-57 exercised eight viewers primarily on open/wall-heavy/torch configurations. That gap matters for party-shared sight, portal states and fail-closed malformed scenes under multiple viewers.

## Exact engineering scope

Only three changes, all exclusively test and documentation:

1. New `tests/world-v2-b10-postgres/r69-eight-viewer-fog-parity.sql`, which runs in the **existing** R18-57 disposable, transactionally rolled-back PostgreSQL 17 fixture *after* installing the guarded candidate and *before* its original eight-viewer, wall-authority, revocation and operator-drift tests.
2. One `\i` line in `tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql` at that precisely guarded point. There is no source function replacement or new RPC.
3. Seven static adversarial tests in `tests/world-v2-r18-69-eight-viewer-fog-parity.test.mjs` plus this runbook.

The new test refuses any non-`world_v2_b10_r05` database, wrong role, unexpected 91-migration fixture history, altered sealed R18-57 candidate MD5, expanded private `EXECUTE` or schema `USAGE`, or a viewer roster different from the original eight fixture members. It creates only temporary local scenario/count tables and updates the disposable map environment within the existing outer **ROLLBACK**; no public grant or migration history is changed.

## Nine deliberately different authorization/vision states

| Scenario | Risk exercised |
|---|---|
| Open, ambient darkness | Near-token falloff without authored lights |
| Shared-party open, darkness | Multiple owned sight sources shared with permitted teammates |
| Shared-party open, ambient light | Mixed viewer-source radius under partyShared |
| Closed door | Portal occlusion remains enforced |
| Open door | Portal state changes authorized line of sight |
| Closed window | Window vision behavior must remain exact |
| Malformed wall geometry | Malformed scene must not grant different visibility |
| Null scene object | Unknown/malformed object fails closed as original |
| 121 objects (>120 limit) | Explicit source and candidate zero-visible fail-closed behavior |

For **each** scenario, the test computes the *entire original protected JSONB frame* and *entire optimized protected JSONB frame* for all **eight** original fixture players, and requires `IS NOT DISTINCT FROM` equality. This includes `visible`, `explored`, map metadata, party-sharing and permission generations—not just cell counts. It requires 9 × 8 = **72 exact complete frame comparisons**, plus zero visible cells for every viewer in the over-limit scene. Only scenario names and counts appear in test output; never token IDs, user IDs, private cell arrays or signed fog frames.

After the comparisons, it restores the disposable original scene, keeps the eight fixture members intact, then continues all previous original-vs-optimized fog tests, genuine signed Begin/Advance/Commit, collision blocking, revoked-viewer denial, exact rollback source restoration, source/history/operator-authorization negative gates and final outer ROLLBACK.

## Interpretation and release policy

- A CI failure is a **R18-57 opt-in fastpath blocker**. Do not fix it by downgrading source privacy, skipping a malformed scene, disabling fog or altering permissions.
- A CI pass supports source-real local equivalence only. The eight fixture players are synthetic; this **does not substitute for three independently authenticated browsers** or live private Realtime delivery/revocation, browser p95 or Supabase Free RAM/lock profiling.
- This test does not alter R18-57 candidate source and cannot install it: the candidate remains outside `supabase/migrations` and requires a post-83+8, explicitly authorized, digest/privilege-pinned opt-in window. The original R18-57 rollback remains intact.
- The official authenticated Supabase CLI v2.81.3 `migration fetch --linked`, `migration list --linked`, `db push --dry-run --linked` on the exact 83+8 history has **not** occurred. It remains an independent release NO-GO gate. Google preview OAuth smoke is already PASS; no repeat needed.

**Engineering PASS must include all exact-head Node/Chromium, build/lint/npm audit/Edge, independent PG17 authority, this full source-real R18-57/54/05 suite and CodeQL. No Vercel deployment, production SQL, feature-flag change or additional live test required from the user for this staged step.**
