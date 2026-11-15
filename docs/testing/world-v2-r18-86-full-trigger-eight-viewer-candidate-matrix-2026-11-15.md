# B10-R18-86 — Full-trigger eight-viewer original/R57/R77 candidate matrix

**15 November 2026 · Australia/Melbourne · DISPOSABLE LOCAL PG17 ONLY · DRAFT, UNMERGED, PRODUCTION/QA NO-GO.**

Direct parent: draft PR #187, exact SHA `57b3916b34313070698e3ca1e13827e3154e4142`. Draft PR #188 is staging-only, **not a production release proposal**.

## Why this test

R18-85 isolated synchronous authorized private-fog frame and wall-ray calculations as dominant local CPU cost during one original signed, 24 off-route wall, fog-enabled Commit. Its instrumented local database had 2 viewers and all six token/four issued-tool position UPDATE triggers, but it did not exercise the two existing separately sealed candidates against each other under the full-trigger and eight-viewer signed movement route.

Existing R18-57 operator-gated `world_v2_r18_57_sync_fog_fastpath_optin.sql` changes only `forge_visibility.authorized_viewer_fog_frame`. Existing R18-77 `world_v2_r18_77_inline_cross2_ray_optin.sql` changes only four cross-product expressions inside the private `forge_visibility.ray_blocked`. Their exact opt-in/inverse files are byte-identical to the R18-85 inherited sources. Neither was applied on production.

## Architecture and exact assertions

A fourth local R54 `BEGIN/ROLLBACK` invocation uses `-v r84_full=1 -v r86_matrix=1`, after the unchanged R18-83 baseline, R18-84 full-trigger profile and R18-85 phase probe have each completed in their own rolled-back transactions. The R86 branch bypasses the *R68/R84/R85 workload replay only in its fourth run* to avoid artificially exceeding the original 120 signed gesture-per-minute limit. It retains R54's full 16-Commit fog-on/off benchmark and original opaque wall rejection, private-viewer revocation, and adds **8 original signed forward/return Commits** across four variants:

| Variant | Private fog implementation | Private wall-ray implementation |
|---|---|---|
| Original | Exact R54 source original | Exact R54 source original |
| R57 | Actual sealed R57 candidate | Source original |
| R77 | Source original | Actual sealed R77 candidate |
| Combined | Actual sealed R57 candidate | Actual sealed R77 candidate |

The original R57/R77 **source-sealed operator install and inverse** files run unchanged under the synthetic fixture's transaction-local authorization values and locally synthesized exact 83+8 migration version gate. The synthetic 91 versions are *not* linked CLI proof; no production approval or history mutation is inferred.

The R57 original fog alias was previously unsafe as a reference for R77 after the ray helper itself changed; calling the original fog alias then would dynamically call the candidate ray and could compare the candidate against itself. R18-86 instead clones two independent test-only `SECURITY DEFINER` private helpers from the exact original `pg_get_functiondef`: **a frozen original ray helper**, plus a **frozen original full fog-frame helper referencing that frozen ray**. Their named source substitutions are unique-anchored, preflight the live-original source hashes, revoke public/anon/authenticated function access, and are removed by the outer rollback.

Six scene configurations are compared per variant: open, shared dark, closed door, malformed wall, over-limit scene (>120 objects), and 24 off-route solid walls. Eight synthetic signed member-owned tokens are present in the fixture, with all original six token and four issued-tool movement triggers. Every variant performs real actor-signed Begin/Advance/Commit and an untimed actor-signed reverse back to canonical home, asserting **eight private viewer revisions**, all eight authorized frames, no leaked geometry, **48 exact full JSONB frame comparisons** against the frozen original private fog/ray helpers, and over-limit fail-closed visible cells. Thus the matrix covers **192 complete frame comparisons and eight signed canonical Commits**. The combined variant also checks live private ACL invariants and spectator revocation. No test-only direct canonical `map_tokens UPDATE` bypass occurs.

Original candidate functions and their inverse are restored by the actual independently gated inverse files. The outer rollback verifies all test-only helpers, synthetic migration history and measurement tables disappear, and the canonical token/sessions stay unchanged. No source-identifying map/user/frame JSON is printed: only bounded aggregate variant counts, original ray call counts and single-Commit time samples.

## Measured local screening data

**Initial disposable PG17 output, one measured signed Commit per variant, fixed sequential order (not robust causal speedup, browser latency, or p95):**

| Variant | Local Commit (ms) | Original named ray calls |
|---|---:|---:|
| Original | 458.169 | 1,854 |
| R57 | 197.882 | 789 |
| R77 | 202.351 | 1,854 |
| Combined | 90.159 | 789 |

These are extremely order/cache and instrumentation sensitive. They demonstrate local functional eligibility and identify a promising combined candidate; they do **not** demonstrate a reliable median or p95 improvement. The private frame comparison is exact, but the fixture uses synthetic user IDs, simplified table/RLS state, and a test-only observer sink; it is not genuine three-browser DM/P1/passive P2 authentication, multi-session network overhead or Free-tier RAM/locks measurement.

The eight-viewer source parity, including hostile geometry and revocation, must be upheld through all subsequent stages; never accept hiding private fog until after user acknowledgment, permitting client-predicted collision to become authority, bypassing the signed routing, relaxing grants, or loosening JWT authorization to reduce timing.

## R18-86 final verification gate

Record final draft PR #188 SHA against direct parent PR #187, diff, GitHub Actions **four exact-head workflows** (general Node/build/lint/npm audit, isolated PostgreSQL authority, the R54/R83/R84/R85/R86 full source-real fog/Commit rollback, CodeQL), and linked Supabase SELECT-only migration/function-stat audit if needed. Retarget PR #188 directly onto the R18-85 staging branch after final-head CI. Do not claim engineering PASS if any workflow is red or incomplete.

**Hard release NO-GO:** confirmed official pinned linked Supabase CLI 2.81.3 83+8 fetch/list/`db push --dry-run`, separately authenticated DM/P1/passive P2 fog/collision/revocation and fast regrab, honest browser p95 under multiplayer load, physical Free-tier memory/lock monitoring, isolated sealed migration/rollback approval, and explicit operator production release authorization. The permanent QA site remains the earlier R18-62 build. No migration, production SQL, deployment, Vercel flags, aliases or paid infrastructure changes in this step.

**R18-87 recommendation:** once exact CI is clean, design balanced warm-cache ABBA/BAAB *full-trigger signed* measurements for original/R57/R77/combined, preserving complete private sight and collision invariants, then qualify the smallest safe candidate for a separately authorized protected QA build. Do not install both just because one unbalanced local measurement was smaller.
