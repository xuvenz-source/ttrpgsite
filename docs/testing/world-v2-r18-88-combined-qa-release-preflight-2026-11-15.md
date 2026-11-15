# B10-R18-88 — Source-sealed combined R57/R77 candidate, QA preflight and rollback

**15 November 2026, Australia/Melbourne · draft PR #190 · SOURCE-ONLY · NO SUPABASE SQL APPLY · NO VERCEL DEPLOY · PRODUCTION/QA NO-GO.**

Direct parent: verified R18-87 draft PR #189 exact SHA `26e6887f223653f2426f87145c3a86828ec41c1d`. R18-87 qualified the combined R57 fog fastpath and R77 inline-ray optimization in a balanced, original signed PostgreSQL 17 experiment (24 measured canonical Commits/24 returns, original 6+4 triggers, eight private viewers, 192 exact frames). The two complete local runs reported original vs combined median ratios of approximately 5.47× and 5.12×. **Neither is a real browser p95, proof of independent real-player RLS, or an authorization to modify the linked production database.**

## Live read-only prerequisite finding

The linked Supabase project `lwhwgqaunxbmvyndswze` still has **83** registered migrations; the newest is `20261109171247`. The sealed original R57/R77 installs require **exactly 91** migrations including R05 `20261111023204` and the seven frozen R18-48 narrow pending versioned files. The unapproved R18-26/R18-27 mixed-performance sources remain excluded. Existing original fog and ray source hashes match `ee3356af321fec1a3e167a75c6245e86` and `a9fc198168c29fd5d80041b05337017e` respectively; the former has explicit postgres-only function EXECUTE and the latter has NULL `proacl` while `anon`/`authenticated` lack private-schema USAGE. No active motion sessions or waiting database locks were observed at the point of inspection. This does **not** establish Free-tier memory headroom under multiplayer load.

An additional **read-only** catalog SQL is staged at `supabase/release-preflight/world_v2_b10_r18_88_combined_live_readonly.sql`. It exposes only aggregate counts, MD5s and ACL metadata, never private frames or campaign geometry. The manifest `staging/world-v2-b10-r18-88-combined-qa/manifest.json` records observed prerequisites as NO-GO and is validated by `node scripts/release/validate-world-v2-r18-88-combined-qa.mjs`. This offline validator **always** returns NO-GO; an edited local receipt cannot authorize deployment.

## Exact installation and recovery chain — NOT executed on linked Supabase

Four unchanged candidate files are SHA-1 Git-blob pinned in the manifest. The only acceptable forward chain is:

1. `world_v2_r18_57_sync_fog_fastpath_optin.sql`, with independent `forge.r18_57_release_authorization` token.
2. `world_v2_r18_77_inline_cross2_ray_optin.sql`, with independent `forge.r18_77_release_authorization` token.

The inverse order is **R77 rollback first, R57 rollback second**, using independently authorized rollback-only tokens. Both existing source-sealed files recheck exact function bodies, dependencies, migration versions and private permissions. They are **not** copied or inserted into `supabase/migrations` and are **not** executed in R18-88.

For future separately authorized operation, treat both forward modifications as **ONE explicit transaction**: preflight exact source and ACLs, apply source-sealed R57 then R77, verify private frames/authority, and commit only under independently reviewed release approval. If an install or verification step fails, rollback the entire transaction — never allow R57 alone to remain installed. After a committed installation, only the independently sealed and separately approved reverse R77/R57 functions may restore originals; do not overwrite unknown drift. Keep the feature flags OFF and no QA alias change until independently signed acceptance. Avoid execution by an interactive SQL editor that cannot guarantee atomic rollback across statements.

**Permanent QA frontend is not a separate database.** Replacing the Vercel preview alone changes client code; SQL applied to this shared Supabase project affects its existing site too. Therefore the optimized database must not be installed merely to make the QA frontend faster. This needs a separately authorized shared-backend release window or a genuinely isolated test backend; do not assume the free-tier plan provides a new free project or a safe independent database.

## Sixth local PostgreSQL 17 rehearsal

R18-88 adds a **sixth**, separate, fully disposable R54 `BEGIN/ROLLBACK` pass, leaving the earlier R83–R87 result history unchanged. It first repeats R86's exact-source full **six token / four issued-tool triggers**, eight synthetic viewer roles and signed original four-mode hostile fog/collision checks. Then the optional `r88_atomic` test file executes:

- A deliberately partial **R57-only** operator-gated install under `SAVEPOINT r88_partial`, verifies that only the fog function changed, then performs `ROLLBACK TO SAVEPOINT` and checks both original private source hashes and ACLs.
- A **full R57+R77** operator-gated install under `SAVEPOINT r88_combined`, verifies the exact combined fog source, private ACLs and eight source-frozen complete private JSONB frames in the original wall-heavy scene, then rolls back the single savepoint and checks both original private source bodies, ACL, scene, token and session state.
- The original R54 outer transaction finally rolls back all fixture migrations, temporary structures and trigger/source modifications, proving that nothing persists. No broad role grant, migration history mutation, unauthorized movement or paid infrastructure is introduced.

This proves *precommit transactional recovery in the disposable PG17 fixture*, not a tested live post-commit recovery procedure or a hosted zero-downtime rollback.

## Hard release gates (not met)

The following must be independently satisfied in order, each with explicit approval: (1) exact reviewed 83 historical SQL-body hashes and eight versioned pending sources; (2) official **authenticated, linked and pinned Supabase CLI v2.81.3** `--help`, fetch, list, and `db push --dry-run` against the intended project without actually pushing; (3) separately authorized eight-migration apply and verified restored source/ACL preflight; (4) independent signed DM/P1/passive P2 authorized fog, collision, revocation, canonical observer convergence, instant regrab under rapid wall input and browser p50/p95; (5) physical Supabase Free memory, swap, CPU and lock pressure under realistic multiplayer; (6) reviewed QA build, inverse readiness, operator-controlled SQL window and explicit go/no-go decision.

**CLI compatibility warning:** Supabase CLI v3 (released November 2026) changed the default database target to local and introduced `--remote` semantics. The current project's release evidence requires **exact version 2.81.3**. Never silently use a floating latest CLI or swap `--linked`/`--remote` without fresh `--help` and an explicit target review.

No paid-tier upgrades, new free-project assumptions, SQL migrations, Vercel flags, production/QA aliases, user-visible runtime code or DB permissions were changed for R18-88.

## R18-89 recommendation

Following CI proof, prioritize **migration prerequisite attestation and independent authenticated test environment design**, not another local microbenchmark. The bottleneck candidate is now credible; real-world movement remains unacceptable until a protected build, correct backend history, multiuser verification and Free memory budget demonstrate otherwise. Fail closed if any CLI, sight, collision or rollback gate is unverified.
