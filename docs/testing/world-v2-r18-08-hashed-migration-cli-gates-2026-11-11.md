
# B10-R18-08 — Hashed migration payload and CLI configuration audit

11 November 2026. STAGING ONLY / PRODUCTION NO-GO.
Source: R18-07 draft PR #109. This change contains no database mutation, Vercel deployment, env switch, new grants or paid services.

## Reviewed CLI implementation, pinned to Supabase CLI v2.81.3

The official pinned Go source establishes these facts:
- Migration fetch: https://github.com/supabase/cli/blob/v2.81.3/internal/migration/fetch/fetch.go reads each registered remote SQL statement array and writes local version_name.sql by joining statements with a semicolon and newline, then one final semicolon and newline.
- Migration list: https://github.com/supabase/cli/blob/v2.81.3/internal/migration/list/list.go compares only timestamps, NOT SQL bodies.
- Dry-run db push: https://github.com/supabase/cli/blob/v2.81.3/internal/db/push/push.go computes and prints pending migration names, but does not call ApplyMigrations. However, if config.Db.Migrations.Enabled is false, it SKIPS all migrations and can misleadingly report up-to-date.
- Project selection: https://github.com/supabase/cli/blob/v2.81.3/internal/utils/flags/project_ref.go reads the local linked project reference, subject to explicit CLI/environment override precedence.
- Application: https://github.com/supabase/cli/blob/v2.81.3/pkg/migration/file.go records the reviewed migration file timestamp plus its parsed SQL statements in the migration history together with its SQL batch; do not invoke this until a separately approved controlled release.

This is source review, NOT an actual linked dry run.

## New live read-only evidence

A read-only query of the existing Supabase Free project confirmed all 83 registered migrations have at least one historical SQL statement and a valid MD5 fingerprint of the exact bytes which the v2.81.3 fetch function would write. All versions are unique. No historical SQL bodies, account details, passwords, JWTs, or campaign records were exported or committed. The R05 version 20261111023204 remains unregistered.

We recorded 83 historical SQL-body checksums and statement counts in:
- staging/world-v2-b10-r18-08-remote-history-content-hashes.json
- supabase/release-preflight/world_v2_b10_r18_08_readonly_migration_body_hashes.sql

The query matches the pinned CLI output by calculating:
md5(array_to_string(statements, E';\n') || E';\n')

## Read-only validator

scripts/release/validate-world-v2-r18-08-history-payload.mjs:
- Requires a FRESH 83-row read-only SQL-hash export, not merely the old migration names or an older committed manifest.
- Compares version, name, SQL statement count, and fingerprint to both stored baseline and the ACTUAL historical files fetched into an isolated release directory outside Git checkout.
- Re-runs all R18-07 validations: 83 exact remote names and versions, no missing/extra/placeholder files, and exact frozen reviewed R05 Git blob as the only pending migration.
- Requires a real local supabase/config.toml with exactly one db.migrations section enabled=true and one db.seed section enabled=false.
- Requires the known linked project-reference file inside the isolated workspace, rejects symlinked control files and conflicting known project overrides.
- Does not run a CLI, SQL, network request or write any file. A successful result remains DRY_RUN_ONLY, safeToApply:false, actualCliDryRunPerformed:false.

tests/world-v2-r18-08-history-payload.test.mjs adds adversarial tests using synthetic local-only SQL: same-version SQL tampering, changed live digest or statement count, missing/duplicated hash metadata, wrong linked project, symlinked files, disabled migrations, enabled seed, duplicated config sections, and env overrides. No synthetic SQL is installed.

## Future isolated linked CLI rehearsal — NOT YET PERFORMED

Only in a secure and deliberately approved linked read-only CLI session:

1. Confirm Supabase CLI version 2.81.3 and inspect its command help; confirm intended existing live project and exact target migration SHA.
2. Create a fresh directory OUTSIDE Git checkout and initialize Supabase CLI local config there. Edit LOCAL supabase/config.toml to state db.migrations enabled=true, db.seed enabled=false. Do not bring the repository's historical SQL migrations into this directory.
3. Securely link this isolated directory to the known existing Supabase Free project. Never paste credentials, access tokens, or connection strings into GitHub or chat. Confirm local supabase/.temp/project-ref and any env overrides.
4. Run pinned supabase migration fetch --linked into an initially empty migrations directory. Expect 83 actual historical SQL files.
5. Copy exactly one reviewed file to that directory: 20261111023204_world_v2_b10_integrated_motion.sql. No others pending.
6. Run the fresh read-only SQL query above and save its 83-row JSON locally, without historical SQL text. The reviewed JSON input to the validator can be the rows array or an object with a rows field.
7. Execute from secure local shell:
   node /path/to/repo/scripts/release/validate-world-v2-r18-08-history-payload.mjs --workspace=/path/to/isolation --fresh-sql-hashes=/path/to/fresh-83-hashes.json
   Require DRY_RUN_ONLY, 83 verified SQL bodies, migrations enabled, seeds disabled, correct project, and exactly one reviewed R05 pending.
8. Run supabase migration list --linked and supabase db push --dry-run --linked from the isolated workspace, with NO include-all, include-roles, include-seed or automated confirmations. Dry run must show exactly one pending migration, version 20261111023204. Do not infer readiness if migration support is disabled or the command says up to date.
9. If history, hashes, project ID, config or number of pending migrations diverges: STOP. No history repair, bulk repo-root db push, MCP apply_migration or SQL-editor DDL as a workaround.

The linked CLI dry run CANNOT be executed through the currently connected tools and has NOT occurred. No claim of actual SQL compatibility follows from this local test.

## Production release remains separate

The R18-06 release order still applies: an explicitly approved Vercel frontend client build compiled with VITE_WORLD_V2_OBSERVER_RECOVERY=1 must first be serving and Auth-tested against existing R16 SQL, with VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY unset/OFF. Real DM/P1/passive-P2 sight and fog validation, two 12-second recovery cycles and Free-tier resource measurements must pass. Then obtain a SEPARATE explicit SQL approval, repeat the exact read-only 83 version / 7 function / 0 session preflight, prove ONE pending version by CLI dry run and only then consider applying the frozen SQL once. Run all 24 protected live scenarios and verify 84 registered versions after a successful authorized install. The guarded 700ms recovery remains deferred until its own revocation/LOS security gate.

Decision: NO-GO for deployment, migration or enabling either flag. Keep current production R16.
