# B10-R18-09 — Fail-closed CLI transcript review

11 November 2026. **STAGING ONLY. NEVER MERGE, DEPLOY OR APPLY SQL ON THE BASIS OF THIS CHECK.**

## Baseline at start of step

The exact consolidated parent source is R18-08 draft #110, commit ee9984804123b8c32709372b1dc2000aa3250be8, based on unchanged production R16 main 90df8c960e79e8d66c322095611427da7bb09de4.

Read-only re-observation of the connected live Supabase Free project on 11 November confirmed: 83 unique registered versions, all 83 historical reconstructed SQL MD5 fingerprints equal the committed R18-08 reference, latest 20261109171247, frozen target version 20261111023204 absent. This observation is point-in-time and never authorizes installation.

## Why this isolated increment exists

The R18-08 workspace validator rejects wrong historical files, config, project reference and extra pending file names. It does **not** verify what the actual Supabase CLI reports once linked. In Supabase CLI v2.81.3, migration list and db push --dry-run are separate paths. A CLI invocation with migrations disabled could misleadingly print "Remote database is up to date" even when the frozen SQL is still pending. The source checks alone are insufficient to declare a safe one-file candidate.

R18-09 adds a **pure offline log validator** for the captured outputs from exactly:
- Supabase CLI v2.81.3 migration list --linked.
- Supabase CLI v2.81.3 db push --dry-run --linked, with stdout and stderr combined.

The new script refuses any run unless the migration-list table shows 83 identical local/remote registered versions and exactly one local-only pending version 20261111023204; the dry-run text must contain the explicit no-apply marker, one bullet for exactly 20261111023204_world_v2_b10_integrated_motion.sql, and the completion marker. It rejects missing/duplicate/drifted versions, extra pending migrations, extra SQL filenames, migration-disabled/"up to date", seeds, roles, apply/push prompts, and incomplete captures. It may reject legitimate outputs if their format changes; that is the intended fail-closed behavior.

## How the eventual release operator uses this

Only AFTER a separately authorized, secure linked **read-only** CLI rehearsal following R18-07/R18-08 with the isolated external workspace:

1. Confirm the CLI installed on the operator's machine reports exactly v2.81.3. Use CLI --help to confirm the flags. This validator's CLI version input is a claim and cannot authenticate the installation.
2. Capture the full plain-text output of migration list into a local UTF-8 file. Capture the combined stdout+stderr of db push --dry-run into a second local UTF-8 file. Do not commit these files or credentials. Verify them visually as an operator before parsing.
3. Run the offline validator from the trusted repository checkout:

       node scripts/release/validate-world-v2-r18-09-cli-transcripts.mjs --cli-version=2.81.3 --migration-list-output=/absolute/path/list.txt --dry-run-output=/absolute/path/dry-run.txt

4. Require 83 matching remote/local versions, exactly ONE reviewed R05 pending file, safeToApply:false, decision:NO_GO, and no contradictory output. An output marked NO_GO is the correct result **even if the text matches**.
5. Independently review actual CLI run authenticity, workspace hashes, exact linked Supabase project and no project flag/env override. If the CLI output format differs or the parser rejects, STOP, investigate the CLI and do not weaken the checks to force acceptance.

This script never launches CLI, connects to a DB, mutates files, invokes Supabase, or grants permission to apply migrations. Captured text can be fabricated: passing it is only a consistency check, **not proof that an actual linked dry run occurred**. No future release state should be automatically promoted by passing its tests.

## Release remains NO-GO

- Actual Supabase CLI linked migration fetch/list/db push --dry-run against the existing live Free project: **NOT DONE**.
- R18-02 signed-observer-recovery production Vite client ON, R18-04 guarded recovery OFF, approved and real DM/P1/passive-P2 fog/LOS/revocation tested before SQL: **NOT DONE**.
- Separate designer approval for exact one-file SQL install, refreshed seven function fingerprints/ACLs, zero active sessions, 24-case protected multiplayer test and Free-tier RAM/latency gate: **NOT DONE**.
- No preview, environment flag change, SQL write, history repair, paid tier, Vercel deployment or production merge in R18-09.

Use the latest R18-06 controlled-release plan and R18-08 historical-body validator together. R18-09 is supplementary, not a replacement.
