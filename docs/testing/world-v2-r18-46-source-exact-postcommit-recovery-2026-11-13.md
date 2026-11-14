# Tabletop Forge B10-R18-46 — Source-exact recovery for wall, collision-trigger and step authority

**13 November 2026 (Australia/Melbourne). Status: DRAFT STAGING / NO PRODUCTION SQL, WEB DEPLOYMENT OR FEATURE FLAG CHANGES.**

## Source of truth and intended isolation

R18-46 extends verified R18-45 `d76fd9aa3c0138f240d107952605cf44cb1d08b1`, itself from R18-44/R18-43. Rejected R18-40 pointer patch is explicitly excluded. R18-45's main result was emergency containment of the optional atomic RPC and forward restoration of *four* R05 movement functions, not a rollback of updated wall/trigger code. This new increment captures and restores **five more original source definitions** while keeping the campaign identity restrictions.

Live Supabase `lwhwgqaunxbmvyndswze` prior to any changes: **83 migrations**, latest `20261109171247`, R05 `20261111023204` not installed, finalizer absent. The user reports wall and held-key lag on the R18-40 V2 preview: 44 `authority.advance` samples p95 ~443 ms, 7 `authority.commit` samples p95 ~1308 ms; these are real browser RPC times, not database-only numbers. R18-46 is recovery infrastructure and **does not improve input responsiveness in a deployed product**.

## Live source verification (read-only; no campaign data)

The exact original `pg_get_functiondef` MD5 hashes used by R18-46 are:

| Existing function | Expected original digest |
|---|---|
| `forge_world_v2.swept_hits_segment` | `86cbe9a2145e05f8a5f88b05e6b87186` |
| `forge_visibility.swept_hits_segment` | `95ee819774fc9b4303dffff76c786dee` |
| `forge_visibility.enforce_collision` | `7e652f0f2334980ccc724e1748d334ba` |
| `forge_visibility.enforce_tool_collision` | `771ea1716498a43210661532f9c24977` |
| `forge_world_v2.step_allowed` | `6dcd75ce4719cd0bf6173f77f75fdf32` |

The collision functions and step validator had already passed R18-45's read-only ten-function catalog gate. The two original swept helper hashes were read directly from current Supabase `pg_proc`, without reading or modifying user data. The live implementation is Postgres-owned; browser roles lack private `forge_world_v2` schema usage. The legacy trigger function itself has a general EXECUTE grant (historical default) despite being in a private schema; we preserve, rather than silently alter, its effective privilege during recovery.

## Source capture, seal and recovery boundaries

This increment introduces **unversioned** SQL candidates and operator-only recovery SQL:

1. `supabase/candidates/world_v2_r18_46_capture_original_sources.sql` executes **after** frozen R05 but **before** R18-17 wall clearance, R18-19 legacy trigger replacement and R18-26 collision prefilter. It refuses to run with active motion sessions or a partially modified schema, verifies each of the **five live original code hashes** independently, then stores the exact original `pg_get_functiondef`, MD5 and per-role EXECUTE/security mode in `forge_world_v2.motion_r46_source_backup` with RLS enabled and all browser table grants revoked. No campaign data or passwords are included in snapshots.
2. `supabase/candidates/world_v2_r18_46_seal_release_sources.sql` runs only **after** the complete installed R05→17→19→20→26→27→28→30 candidate stack. It stores five replacement function MD5 fingerprints and the exact source/trigger definitions of the two R18-20 campaign-affinity triggers in another private RLS-protected table. It refuses uninstalled or changed sources, unknown additional guard triggers, disabled triggers or client-exposed guard code.
3. `supabase/release-recovery/world_v2_b10_r18_46_restore_original_geometry.sql` is a **MANUAL, guarded, transactional** post-commit recovery script. It requires:
   - prior R18-45 terminal EXECUTE containment already committed (no browser call can start a new atomic finalize);
   - prior protected R05 four-function restoration complete;
   - zero live motion sessions;
   - all five private original snapshots and all five replacement digests matching exactly, plus both R18-20 trigger definitions/source and private ACLs matching the sealed state.
   It uses the captured **original** source definitions with `CREATE OR REPLACE FUNCTION` and verifies all five recovered MD5s, auth/anon EXECUTE grants and `SECURITY DEFINER` mode **inside one transaction**. A mismatch aborts everything. It never drops a map, token, character, fog record, migration entry, trigger checkpoint or outbox.
4. The two **R18-20 campaign-affinity triggers are deliberately retained**, with exact source fingerprints checked. Removing a guard against cross-campaign map/token reparenting merely to recreate the old schema would loosen security. This is **forward containment**, not a return to the entire original 83-migration schema.
5. The disabled finalizer, its receipt columns, R05 private queue schemas and the two new protected source/guard backup tables remain present for audit and future reviewed forward fixes. Previous canonical movement commits are not unwound and migration history is never forged or deleted.

## Disposable PostgreSQL test plan

`tests/world-v2-b10-postgres/rehearse-r18-46.sh` creates a **fourth** isolated PostgreSQL 17 database on an ephemeral GitHub Actions runner. It validates an explicit isolate marker, PGHOST loopback, `postgres` role, port 5432, caller database `world_v2_b10` and rejects `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE`, `DATABASE_URL`, `SUPABASE_DB_URL`. No Supabase connection string or secrets are read.

The script verifies the exact historical Git blob SHA of the existing R18-22 ordered SQL fixture. It writes a **temporary local copy** with only one additional `\i` statement at a single anchored point: immediately after R05 is installed and immediately before R18-17's geometry replacement. The historical reviewed source remains unchanged in Git.

The remainder is source-real: R18-22 tests R05 + R17/19/20, then a distinct `recoverable-install-r18-46.sql` **COMMITS** 26/27/28/30 and seals five replacement source hashes/trigger topology. After commit, in **three distinct transactions**, it executes the exact R18-45 atomic EXECUTE containment, the existing original R05 four-function recovery, then the new R18-46 five-function recovery. `verify-recovered-r18-46.sql` demands 9/9 original function hashes and privileges, two retained enabled campaign guards, unmodified canonical token data, no active/queued motion, no browser access to the new atomic RPC, and the RLS-protected archived source definitions.

Unlike `BEGIN/ROLLBACK`-only tests, this catches a failure mode that appears *after* a release has committed. The previous combined PG17/Chromium/CodeQL security gates remain mandatory. An optional bad-source-injection recovery rejection is desirable but must be isolated to its own transaction so it cannot corrupt the positive baseline.

## Important remaining limitations

- **NO live deployment.** The new capture/seal files are not official Supabase CLI migrations, and the live project cannot safely execute them now. Before launch, generate properly named migrations through the official CLI, reconcile the exact 83-version live alias history, and review the full ordered scripts with an unchanged source-digest manifest. Do not guess migration filenames, bulk-run `db push`, or change the live schema/migration ledger to pass a test.
- Database schema is still not identical to pre-release after recovery. The two secure R18-20 triggers, optional finalizer (denied to browsers), R05 queues, backup tables and any previously committed game state remain. These are intentional explicit retained objects.
- Private fog/LOS observer semantics still need independently authenticated **DM + P1 + passive P2** tests. The sole DM can diagnose subjective movement but cannot certify per-viewer privacy, revocation or canonical convergence.
- The original R18-26/27 candidate performance evidence was **mixed**. Their presence in a worst-case SQL recovery rehearsal is not a recommendation to ship them. They should be excluded from a narrower production release unless justified by measured workload-specific evidence.
- One fewer terminal HTTP request is only a narrow R18-43 benefit, and it is still disabled. Held-arrow movement is still limited by serialized Advance requests; R18-46 does **not** implement a broad movement-speed optimization.

## Handoff checklist

R18-46 is limited to five-source capture/seal/restore scripts, a fourth local PG17 regression fixture, source-security tests, and this handoff. Existing R18-45 and R18-44 source/SQL tests must remain green. Frontend runtime remains unchanged. R18-46 is **NO-GO for production** until exact SHA CI, official migration package and independently authenticated multiplayer acceptance are satisfied. No paid infrastructure or always-on services are introduced.
