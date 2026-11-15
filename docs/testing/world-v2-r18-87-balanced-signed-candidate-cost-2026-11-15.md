# B10-R18-87 — Balanced signed Commit candidate cost and private fog parity

**15 November 2026 · Melbourne time · DISPOSABLE PostgreSQL 17 ONLY · draft PR #189 · NO MERGE / NO DEPLOY.**

**Exact inherited parent:** PR #188 R18-86 head `45bd82800362d4eeb434cc58f1dae29b3631a9f7`. R18-87 keeps R83's two-trigger, R84's six-token/four-tool, R85's original-phase and R86's four-mode single-Commit/192-private-frame comparison as four distinct rolled-back historical runs. It adds a **fifth separately rolled-back R54 run**, not a production migration or runtime change.

## Why this is required

R18-86 screened original vs sealed R57 fog fastpath vs sealed R77 inline ray vs combined in a fixed order with **n=1 timed original signed Commit per variant** and showed promising results. This was not a causal estimate or reliable p95. R18-87 changes experimental order, not functionality: each sample installs the **actual unchanged, source-sealed, operator-gated R57/R77 opt-in candidate files and their inverses**, returning both private functions to exact original source hashes before the next sample. It does not install anything on linked Supabase.

## Test design (fifth disposable pass only)

The R86 setup creates eight synthetic authenticated-member identities, eight visible player-owned tokens and all **6 original token + 4 issued-tool canonical movement UPDATE triggers**. It creates independent, private, frozen source-exact **original fog-frame AND original ray** helpers so an R77-modified ray cannot taint the reference frame. It also rehearses R86's full signed four-mode matrix, private grants, over-limit/hostile geometry, canonical source restoration and total rollback.

R18-87 runs after R86's complete parity checks, inside the same *fifth-pass* disposable transaction. Its 24 measured signed forward Commits are balanced as follows:

| Group | First | Second | Third | Fourth |
|---|---|---|---|---|
| Latin 1 | Original | R57 | R77 | Combined |
| Latin 2 | R57 | Combined | Original | R77 |
| Latin 3 | R77 | Original | Combined | R57 |
| Latin 4 | Combined | R77 | R57 | Original |
| ABBA | Original | Combined | Combined | Original |
| BAAB | Combined | Original | Original | Combined |

The four Latin rows put **each variant exactly once in each ordinal position**. ABBA and BAAB add four source-original and four combined samples as a separately order-reversed comparison. Totals are **original n=8, R57 n=4, R77 n=4, combined n=8**. For each forward signed Commit, the real source `public.begin_world_motion_v2` then `advance_world_motion_v2` must authorize an off-route-wall movement, the unchanged public `commit_world_motion_v2` must actually move the canonical token, all eight authorized viewer ticks must update synchronously, and eight **full private JSONB frames** are compared to the independently frozen source-original fog+ray. A separate real signed Begin/Advance/Commit returns the token home. No direct `map_tokens` coordinate writes, no disabled triggers, no weakened ACL or delayed sight acknowledgments are allowed.

Across the R18-87 extension this is **24 measured forward Commit samples, 24 untimed signed reverses, 48 additional original signed sessions, 192 full JSONB frame comparisons**. The existing original **120 signed gestures per 60 seconds** limit remains unchanged and is checked at entry, after every sample, and in the final assertion. R86's earlier 8 signed Commits plus R54's prior motions remain within that cap. Candidate mode source-hash and ACL checks run before each measured sample. Both true operator-gated inverse files must restore exact source identity per phase, not just at the final output. R54 post-ROLLBACK must also reject residual R87 temp tables and procedures.

CI prints bounded per-variant local PostgreSQL **median, mean, minimum, maximum and named ray-call counts**; it also prints group-specific summaries. No authored scene, JWT, user IDs, private frames or map geometry are emitted. Do not label local n=4/8 medians as browser p95 or claim a production speedup without separate signed three-party live measurements. The test intentionally does not assert a performance winner: an incidental noisy runner must not create a false security acceptance.

## Verified balanced local measurement and attribution

The complete fifth-pass source-real PostgreSQL 17 CI sample, timestamped 15 November 2026 at 08:31 UTC, passed `R87-10`, with 24 timed original signed canonical Commits, 24 untimed signed return Commits, **192 full eight-viewer source-frozen private frame equalities**, six original token and four tool movement triggers, all source-sealed inverses restored and the outer R54 ROLLBACK.

| Source implementation | Signed timed samples | Local median Commit | Local mean | Min–max | Mean original-named ray calls |
|---|---:|---:|---:|---:|---:|
| Original | 8 | **660.041 ms** | 662.219 ms | 654.375–679.922 ms | 1,854 |
| Sealed R57 | 4 | **279.786 ms** | 279.873 ms | 279.341–280.580 ms | 789 |
| Sealed R77 | 4 | **279.918 ms** | 281.348 ms | 277.063–288.492 ms | 1,854 |
| Sealed R57 + R77 | 8 | **120.616 ms** | 120.328 ms | 118.830–121.231 ms | 789 |

The local combined-vs-original sample median ratio is approximately **5.47×**, with about **81.7% lower local instrumented Commit duration**. The group-order check was directionally consistent: ABBA original/combined group means **655.842/119.112 ms** (two samples each); BAAB **659.903/120.616 ms** (two samples each). Neither of these tiny groups is a population confidence interval; this is one CI runner, one wall-heavy scenario and synthetic membership data. Do **not** publish these figures as real-user movement speed or p95. Source originals and both candidate inverses were used, not mocked. This is an eligible *candidate selection*, not authorization to apply SQL.

**Verified privilege nuance from linked Supabase SELECT-only catalog on the same date:** `forge_visibility.ray_blocked` has **NULL `proacl`**, so function-level EXECUTE follows PostgreSQL's default PUBLIC privilege, but both `anon` and `authenticated` lack **USAGE on the private `forge_visibility` schema**. Conversely, `authorized_viewer_fog_frame` has explicit `{postgres=X/postgres}` grants. R18-87 checks these exact real-source privilege shapes and the inaccessible private schema before every timed Commit; neither candidate changes privileges. A blanket assertion that the ray helper already had revoked function EXECUTE would be incorrect.

## Release and operator gates

Neither R18-57 nor R18-77 may be installed on the project before all mandatory gates. R18-87 is not an opt-in feature deployment and does not alter production clients, public RPCs, roles, Supabase migrations, official migration history, switches, Vercel aliases, or the permanent QA preview.

**Still NO-GO:** official authenticated pinned Supabase CLI v2.81.3 linked **83 + 8** migration fetch/list/`db push --dry-run`; separate signed DM/P1/passive P2 true sight/collision/revocation/canonical convergence including rapid corner regrab; real browser p50/p95 under multiplayer load; free-tier physical memory/swap/CPU/lock budget measurements; an independently reviewed sealed QA candidate, rollback plan and explicit operator approval. Existing real signed-in solo DM QA performance is still unacceptable near walls and fast movement.

## Handoff protocol

Record exact PR #189 final head and direct R18-86 parent, ahead/behind/changed files, exact-head 4/4 GitHub Actions including Node tests, build/lint/audit, isolated PostgreSQL authority, source-real R54/R83/R84/R85/R86/R87+rollback and CodeQL, bounded actual local mode/count results, and read-only Supabase migration state if used. Retarget draft PR directly onto R18-86 after all checks. If any parity, source, rate-limit or performance fixture fails, **engineering BLOCKED, production NO-GO** until fixed; no partial release.

**Likely R18-88:** review balanced effect sizes plus cache variability, design a guarded source-exact candidate QA rollout whose authenticity, rollback and linked history can be verified before any staging-only controlled site test. Keep all private sight and collision authority synchronous unless equivalent security is demonstrated.
