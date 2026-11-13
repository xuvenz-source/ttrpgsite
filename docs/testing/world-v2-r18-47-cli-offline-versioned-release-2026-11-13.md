# B10 R18-47 — Official CLI-generated, isolated database release workspace

**13 November 2026, Australia/Melbourne | Draft staging only | NO LIVE DEPLOYMENT, NO DATABASE WRITES, NO ATOMIC FEATURE ACTIVATION**

## Source and release lineage

R18-47 proceeds from the fully verified R18-46 branch at exact SHA `ebe4467de276ec32b1c3c581ca6b8a904fda4e8e`, draft PR #150. The rejected R18-40 movement patch is not inherited. R18-46 had verified R05 four-function plus R46 five-function source restoration and deliberate refusal of changed code in an entirely disposable PostgreSQL 17 database, while retaining stronger campaign-affinity triggers.

Live Supabase project `lwhwgqaunxbmvyndswze`, read-only checked 13 Nov: **83** applied versions, latest `20261109171247`; **83/83** exact v2.81.3 migration-fetch SQL-body MD5 hashes match the previously recorded R18-08 baseline, no missing or changed versions. Live remains without pending R05 `20261111023204`, R18-20 campaign-affinity guard, R46 private backup and public atomic finalizer.

The actual checked-in repository root has **62** `supabase/migrations/*.sql` files, of which only **20** distinct timestamp versions overlap remote. There are **63 remote-only** versions and **35 local-only** unique timestamp versions, including existing historical alias collisions. Therefore **repo-root `supabase db push` is prohibited**: it would risk replaying old SQL. No migration history entry may be inserted/deleted/renamed as a workaround. A future operator must fetch the **real 83 history SQL scripts**, not synthesize missing/empty stubs.

## Official CLI execution — VERIFIED but deliberately UNLINKED

GitHub Actions **run #43350078071** executed the pinned **Supabase CLI v2.81.3** `migration new` command nine times, within `$RUNNER_TEMP/b10-r18-47-offline-cli`, using no Supabase project link, login, database password, token, server hostname or SQL execution. Unique generated filenames came from the CLI's actual UTC clock, not handwritten timestamps. They are listed and source-pinned in `staging/world-v2-b10-r18-47-isolated-pending/manifest.json`.

Nine CLI-generated filenames (strict ordering after the already CLI-versioned but **unapplied** R05):

| Sequence | Officially generated file | Reviewed SQL source | Go/no-go |
|---|---|---|---|
| 1 | `20261113021005_r47_capture_original_sources.sql` | R18-46 private source snapshot, BEFORE any replacement | Review required |
| 2 | `20261113021007_r47_wall_edge_clearance.sql` | R18-17 exact geometry functions | Review required |
| 3 | `20261113021010_r47_cross_map_collision_guards.sql` | R18-19 exact token/tool checkpoint-safe guards | Review required |
| 4 | `20261113021012_r47_campaign_affinity.sql` | R18-20 campaign-reparent guard | Review required |
| 5 | `20261113021015_r47_step_bbox_prefilter.sql` | R18-26 collision SQL prefilter | **Performance NO-GO** |
| 6 | `20261113021017_r47_commit_empty_work.sql` | R18-27 observer/Commit empty-work optimization | **Performance NO-GO** |
| 7 | `20261113021020_r47_atomic_finalize_rpc.sql` | R18-28 original actor-bound finalizer | Review required |
| 8 | `20261113021022_r47_blocked_terminal_semantics.sql` | R18-30 authenticated blocked/no-motion finalizer | Review required |
| 9 | `20261113021024_r47_seal_release_sources.sql` | R18-46 private post-change hash/guard seal | Review required |

The SQL bodies were attached to the CLI-generated filenames by reusing the EXACT original reviewed Git blob IDs, not reimplementing the SECURITY DEFINER code. All nine versioned files are under **`staging/world-v2-b10-r18-47-isolated-pending/supabase/migrations/`**, NEVER the repository's ordinary `supabase/migrations/` path. The manifest documents the CLI generator run, exact byte identities, live baseline and release blockers.

**R18-26/27 optimization decision:** previous R18-33 performance measurements were **mixed**, with some candidate paths slower. They are retained as individually versioned experimental components for complete *worst-case recovery rehearsal only*, not approved for installation. The current R46 seal expects the R18-26-changed step validator; omitting R26/27 in a future narrower release requires a separately reviewed narrow seal and equivalent source-real test coverage. Do not simply remove those two files from a linked release workspace while keeping an incompatible seal.

## Release workspace validator (read-only)

`scripts/release/validate-world-v2-r18-47-offline-package.mjs` checks nine byte-for-byte reviewed blobs, the CLI filenames/order, original R05 hash, no migration files on the dangerous repo-root path, and hard NO-GO state. It refuses promotion of R18-26/27 from `performance_no_go` without separate review.

`scripts/release/validate-world-v2-r18-47-linked-workspace.mjs` is a **pure, read-only** future operator gate requiring:
- a REAL isolated directory **outside the Git checkout**;
- the **83 actual migration SQL files** freshly fetched by the pinned CLI and each matched against fresh read-only live SQL-body MD5s (against the frozen approved 83-history baseline);
- the **existing exact R05** plus all **nine exact officially timestamped candidate SQL files**, in immutable reviewed source order (**93 files total**);
- exactly one configured linked project identity; explicit `db.migrations.enabled=true` and `db.seed.enabled=false`;
- no extra, missing, symlinked or modified migration file, no repository-root replay of history.

A successful validator returns **`DRY_RUN_ONLY`, `safeToApply:false`**. It **never executes** `supabase migration up`, `db push`, `migration repair`, SQL, a network request or schema modification.

Tests use **synthetic 83+10 files in a disposable filesystem**, not real player data; they must reject changed remote SQL, altered pending SQL, wrong linked project, unsafe config, missing/extra versions, and performance-gate tampering.

## Conditional future operator rehearsal — NOT PERFORMED

An actual linked, authenticated CLI session is unavailable here and is **not simulated**. After separate authorization, the operator must:
1. Use pinned **Supabase CLI v2.81.3** in a securely isolated directory, separately verify `--help` syntax for `migration fetch`, `migration list` and `db push --dry-run`, and confirm the exact intended existing Supabase project. Do **not** use repository-root migrations.
2. Fetch the **actual 83 registered SQL migration bodies** into that empty isolated workspace using `migration fetch`. They must all have valid SQL and exact fresh read-only MD5 hashes.
3. Copy the separately reviewed R05 and the specific nine CLI-generated staging files into the isolated workspace; preserve source hashes and **no other** migration versions. Run the R47 linked-workspace validator against an immediately fresh read-only 83-SQL-hash export.
4. Execute `migration list` and `db push --dry-run` **only**, specifying the selected linked project and without `--include-all`, data seeds or automatic confirmations. It must report exactly those ten pending files in expected order with zero historical reapplications.
5. **STOP.** Dry run is a diagnostic, not deployment authorization. The current package still includes two unapproved performance candidates, and genuine DM/P1/passive-P2 observer privacy/fog/LOS/revocation and free-tier lock/memory gates are not satisfied.

Never call MCP `apply_migration` to install an already CLI-versioned file: the Management API generates its own version and would diverge from the reviewed repository timestamp. Never use `migration repair`, DDL editors or manual history table updates to reconcile old aliases.

## CI, security and remaining release gates

The source-real combined R18-44/45/46 PostgreSQL 17 tests previously proved the full candidate stack can be installed and that the original nine critical functions (4 R05 + 5 R46) can be recovered after a committed change, with an adversarial altered-source refusal. R18-47 must pass all existing frontend tests/Chromium, PostgreSQL integration, CodeQL, production build, lint, dependency audit and Edge checks at its **exact final SHA**.

The package **has not been deployed**. No SQL was applied or registered in Supabase. Neither atomic feature flag was enabled in Vercel. Live R18-35 must remain the production fallback until a later authorized release. The R18-43 atomic terminal bridge only has potential to eliminate one final RTT; it does **not** solve sustained held-arrow serialized Advance latency, corner snap or solid-wall response by itself. Those remain independent movement performance work.

**Release verdict: NO-GO.** Further work: resolve R18-26/27 inclusion with real workload evidence or separately design a narrow server package, perform a secure linked read-only dry run, then pass independent signed DM/P1/passive-P2 fog/observer/revocation acceptance before any database installation or movement feature activation. All steps should remain on free infrastructure.
