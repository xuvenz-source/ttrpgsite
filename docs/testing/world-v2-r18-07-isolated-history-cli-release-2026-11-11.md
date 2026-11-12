# B10-R18-07 — Single-version R05 migration, isolated CLI workspace, and compatible-client canary

**11 November 2026 · staging / NO-GO for production actions.**
**Source:** R18-06 release-readiness draft PR #108 (and its consolidated R18-05 source PR #107). R16 production is still `90df8c960e79e8d66c322095611427da7bb09de4`; the new code, B07/B08/R03 SQL and observer recovery build flags are NOT live.

## Findings — a concrete reason NOT to run repo-root `db push`

As independently observed via read-only GitHub and Supabase data on 11 November:

| Comparison | Count |
| --- | ---: |
| GitHub repository `supabase/migrations/` SQL files | **56** |
| Distinct migration timestamps in repository | **55** |
| Registered remote Supabase migration versions | **83** |
| Local files matching a registered remote version | **20** |
| Remote registered versions absent from local files | **63** |
| Local versions absent remotely (distinct) | **35** |
| Applied remote entries missing their SQL statements | **0** |
| R05 target `20261111023204` already registered | **No** |

Two local files reuse timestamp `20261109000500`. Historical remote migrations were installed under auto-generated aliases (for example `20261109162313` vs historical local `20261109095000`). This is **not** a blank-database migration problem and cannot be resolved safely by rewriting all 83 records or running all 56 local files. The same installed function MD5 fingerprint/privilege/partial-object live preflight as R18-06 remains green **at inspection time**, not necessarily at release time.

### Official tool/API capability audit

- Supabase Management API `POST /v1/projects/{ref}/database/migrations` accepts SQL and an optional name, but **no explicit version**. The Supabase MCP `apply_migration` wrapper also accepts only `name` and `query`, forwards them unchanged to that Management API and returns success rather than a chosen migration version. The API assigns its own migration version. This is confirmed by current published tool source and the documented [MCP issue #241](https://github.com/supabase/mcp/issues/241). **Do not call `apply_migration`** for the existing `20261111023204` file because it would diverge from the reviewed repository version. Re-registering or repairing remote history later is not an acceptable invisible workaround.
- The official Supabase CLI `migration fetch` retrieves remote migration SQL/history into local files; the CLI's `db push` records the **local file timestamp** when applied. A release workspace derived from the actual 83 remote entries plus exactly one reviewed `20261111023204` file therefore provides a **candidate** source-aligned install method without changing previous history.
- Current official docs support `migration fetch --remote`, `migration list --remote`, and `db push --dry-run --remote`. The reviewed candidate itself was built with **Supabase CLI 2.81.3** and source-real PostgreSQL 17 checks; use that pinned version for the first controlled operator rehearsal (v3 has recent CLI behavior/flag changes). **Discover `--help` locally for 2.81.3** before using any flag. With CLI v2, `--linked` is the expected explicitly linked remote flag; v3 defaults to local unless `--remote` is passed. Confirm the selected project explicitly; never rely on ambiguous default.
- Official references: [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Migration fetch & db push](https://supabase.com/docs/reference/cli/supabase-migration-list), [CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3), [Management API migration](https://supabase.com/docs/reference/api/v1-apply-a-migration).

## Prepared read-only artifacts

- `staging/world-v2-b10-r18-07-live-migration-baseline.json`: read-only snapshot of **83 exact applied version/name pairs** (no live campaign content, users, passwords or SQL function bodies). Its version list is a freshness guard, not an authority to mutate or repair history.
- `scripts/release/validate-world-v2-r18-07-workspace.mjs`: **no network access, SQL execution, spawned CLI, writable operations or remote credentials**. It validates an operator-created isolated directory (outside repository checkout): exactly 83 fetched remote version/name files, **no duplicates, no extra pending files**, nonempty actual historical SQL, plus **only the exact source-frozen R05 Git blob** `f4e296725c09055685321726cbe4bc6e09dbce5a`. It compares all 83 entries to a FRESH read-only remote history export (a stale committed snapshot alone is rejected). It emits `DRY_RUN_ONLY` and `safeToApply:false` on success, and fails closed on drift.
- `tests/world-v2-r18-07-isolated-migration-workspace.test.mjs`: synthetic **local filesystem only**, covering valid isolated plan, omitted/extra remote files, wrong name/version, altered R05 SQL, placeholders, symlinks, repo-root workspace, duplicate target and absence of fresh history. The synthetic historical contents are **NOT** real remote SQL and are never installed anywhere.

## Exact candidate operator sequence (NOT executed here)

**A. After designer approval to rehearse the read-only linked CLI workflow:** Confirm `main`/PR source and selected Supabase project. Use a secure local/ephemeral CLI workspace **outside the repository**; do not commit fetched SQL history or put credentials into GitHub Actions artifacts. Pin Supabase CLI **2.81.3**, run `supabase --version`, `supabase migration fetch --help`, `supabase migration list --help`, `supabase db push --help`; inspect current project ref and linked target. Link only the intended existing Supabase project using secure CLI authentication (no secrets in chat).

**B. Read-only source preparation:** Run `supabase migration fetch --linked` from the isolated empty `supabase/migrations/` directory. Inspect that it fetched exactly all 83 *actual* SQL migration scripts; if it cannot fetch a script or generated names differ from the live history, **STOP**. Copy only the exact reviewed `20261111023204_world_v2_b10_integrated_motion.sql` into that isolated directory. **Do not copy the repo's other 55 migration timestamps**; they would replay historical updates.

**C. Independent readonly comparison:** Get a **new** `Supabase.list_migrations` response and export its `migrations` array as a local, noncommitted JSON file. Invoke:

```bash
node /path/to/ttrpgsite/scripts/release/validate-world-v2-r18-07-workspace.mjs \
  --workspace=/path/to/isolated/release-workspace \
  --fresh-history=/path/to/current-readonly-migration-history.json
```

Expected output is `decision: "DRY_RUN_ONLY"`, `safeToApply:false`, 83 exact applied versions, and **only** `20261111023204_world_v2_b10_integrated_motion.sql` pending. This script does **not** run the database CLI or grant approval.

**D. Official CLI read-only dry run:** Inside the isolated workspace, run `supabase migration list --linked` and **`supabase db push --dry-run --linked`** (provided pinned CLI `--help` confirms those flags). The dry-run must show **only one** pending migration, exact version `20261111023204`, no repairs/role or seed changes, and the precise intended project. Keep the dry-run output (redact URLs/account identifiers as necessary). **No `--include-all`, migration `repair`, SQL-editor DDL, MCP `apply_migration`, `db reset`, or repo-root `db push`.** If dry-run lists even one other migration, STOP. This linked CLI dry-run has **NOT** yet been performed: no protected linked CLI credential or authorized release session was used here.

**E. Only after a separate explicit SQL release authorization and successful prior CLIENT canary:** The R18-06 original release ordering still applies. R18-02 signed client **`VITE_WORLD_V2_OBSERVER_RECOVERY=1` must already be built, live, and verified against R16** for the existing DM/P1/passive-P2 test campaign; R18-04 guarded flag remains OFF. Quiesce gestures and recheck **83 latest version, 7 function digests, private grants, 0 live sessions and absence of partial SQL install**. Rebuild/compare the isolated release directory from the new live history and repeat the dry run. Only then may a deliberately authorized, single `supabase db push --linked` from the isolated workspace be considered. The CLI must record precisely `20261111023204` and the resulting 84-version remote list, and no other changes. If the exact one-file dry-run or transactional SQL installation cannot be shown, **NO-GO**.

**F. Post-install verification and recovery:** Verify private table RLS, browser grants, B08 queue, wrapper definitions and original 4-function backup; run the 24 protected cases in R18-06, including hidden NPCs, explicit permission revocation and DM/P2 eventual canonical agreement, plus Supabase Free resource metrics. Any bad authorization or position convergence => halt movement tests and use the separately reviewed `world_v2_b10_r05_restore_original_authority.sql` recovery with explicit incident authority. That recovery does not eliminate all added schema/history or undo already committed coordinates. Only after safe recovery choose a compatible Vercel deployment and reconcile ledger; no blind frontend rollback after SQL.

## Compatibility canary before SQL: independently reviewed future release gate

The currently deployed R16 frontend has **neither Vite recovery env flag**. R18-07 adds no flags. A future explicit authorized frontend release must embed `VITE_WORLD_V2_OBSERVER_RECOVERY=1` at build time, leaving `VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY` OFF, deploy one approved consolidated build, and verify real foreground signed sight, ordinary DM/owned-token drag/arrow, fog and hidden NPC roster, local DM preview, two signed watch cycles per observer, visibility RPC p50/p95 and Free RAM/CPU before SQL. Failure here => restore compatible frontend without installing SQL. This compatibility canary is not proof the original four map resets disappeared; R18-04 anti-flash still stays OFF.

## Remaining NO-GO

**R18-07 is readiness staging, not deployment authorization.** Remote migration fetch and `db push --dry-run` against the linked project remain unperformed; schema history cannot yet be declared release-ready. Exact 83-version source can be harvested after authorization without billing for new infrastructure, but do not offer or silently perform the real one-file install on an implicit `proceed` instruction. Require specific approval for frontend deployment and separate backend application. The project live campaign is only a disposable testing ground; never treat that as permission to reveal DM fog or skip real account checks.
