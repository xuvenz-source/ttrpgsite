# Tabletop Forge — R18-60 operator-only authenticated Supabase CLI dry-run

**13 November 2026 · Stage only · Production and integrated SQL release NO-GO.**

## What changed

PR for R18-60 adds `scripts/release/run-world-v2-r18-60-83-plus-8-linked-readonly.mjs` and a synthetic adversarial test suite. It uses existing source-pinned R18-48 package and R18-49/R18-50/R18-51 validators. The script is **operator-invoked**, not a GitHub CI credential job or a deployment hook. No source content under `supabase/migrations`, no production connection, no flags or Vercel code is changed.

Existing independent R18-49 and R18-51 validators proved the *shape* of expected 83+8 files and CLI text, but did **not invoke** any authenticated CLI. This new script makes the exact read-only invocation possible in one guard-controlled operation once an operator has linked official CLI authentication. It still cannot independently verify an operator's login identity or certify the release.

## Mandatory operator setup — not executable from this chat

1. Verify the current GitHub PR's exact source SHA and preserve a clean source checkout for scripts and frozen reviewed SQL. **Never run any migration push from repo root**: the root contains historical SQL files that do not match the live 83-version migration ledger.
2. Install the official **Supabase CLI v2.81.3** on the operator's own authenticated machine. Check `supabase --version`, `supabase migration fetch --help`, `supabase migration list --help` and `supabase db push --help`. The upstream CLI documentation may now describe v3 and `--remote`; this release gate intentionally rejects v3. Never silently replace v2.81.3 or alter flags. The documented v2 flags are `migration fetch --linked`, `migration list --linked` and `db push --dry-run --linked`.
3. Create a brand-new *separate* local workspace outside the source repo, e.g. `/secure/world-v2-cli-r60`. Initialize and link the official CLI to Supabase project **`lwhwgqaunxbmvyndswze`** using operator-controlled CLI authentication; never paste access tokens, passwords or JWTs into ChatGPT, source control or test discussion. The workspace must have `supabase/.temp/project-ref` pointing at that exact project, an **empty** `supabase/migrations/`, one `[db.migrations]` with `enabled = true`, and one `[db.seed]` with `enabled = false`. It must have no seed/roles SQL. The script does not run login or link and cannot guess DB credentials.
4. Use the already reviewed read-only SQL under `supabase/release-preflight/world_v2_b10_r18_08_readonly_migration_body_hashes.sql` and `supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql` to obtain a **fresh** local private 83-history SQL digest JSON file and R18-50 single result receipt. The receipt must be **less than 15 minutes old** at command start. Ensure it reflects 83 historical migrations, ten original authority function hashes, R05 not installed and no active motion sessions/lock waiters. These are SELECT-only receipts, not migration applications.
5. Confirm `DATABASE_URL`, `SUPABASE_DB_URL`, `PGHOST`, `PGHOSTADDR`, `PGPORT`, `PGDATABASE`, `PGSERVICE`, `PGSERVICEFILE`, `SUPABASE_YES` and `SUPABASE_CONFIRM` are **unset** in the invoking shell. `SUPABASE_PROJECT_ID`/`PROJECT_ID` must be absent or match the known project. Do not turn on debug CLI logging. The official CLI can use its own authenticated local state, but the operator-run script never receives a CLI token as an argument or prints it.

## Single explicit read-only command

From the reviewed repository checkout run:

```bash
node scripts/release/run-world-v2-r18-60-83-plus-8-linked-readonly.mjs \
  --operator-run-linked-read-only \
  --workspace=/secure/world-v2-cli-r60 \
  --fresh-sql-digests=/secure/private/live-83-hashes.json \
  --read-only-receipt=/secure/private/r18-50-snapshot.json
```

Only after validating the workspace, private input file bounds, current 83-history and live 10-function R50 snapshot does the script call the actual official CLI. The four hardcoded subprocess argv arrays are:

```text
supabase --version
supabase migration fetch --linked
supabase migration list --linked
supabase db push --dry-run --linked
```

Each command is invoked with `shell:false` and a hard timeout. Credentials remain in the operator's already authenticated environment; subprocess stdout/stderr is held only in memory. The script never invokes `db push` without the **literal `--dry-run`**, `migration repair`, migration up, reset, live DDL or a production deploy. A CLI fetch writes only historical SQL to the **external local workspace**; it does not apply SQL.

After fetching it insists on exactly 83 actual original migration SQL files, with every content MD5 equal to the independent fresh SQL digests. It copies frozen original R05 and **only** the seven reviewed R18-48 narrow files with exclusive no-overwrite semantics, then requires **exactly 91** local files. No R18-26 bbox or R18-27 empty Commit candidate files or other unreviewed migrations are allowed. R18-49 checks all local source bytes, history and project/config, then R18-51 parses *actual captured CLI output* with exact 83 aligned history + eight pending, no replay and explicit dry-run wording. No raw output is written or returned; the result is a small sanitized NO_GO summary.

## Successful evidence is not permission to release

The result must contain `decision:NO_GO`, `safeToApply:false`, `sqlPushApproved:false`, `historicalSqlBodiesValidated:83`, `reviewedPendingVersions:8`, `linkedCliListAndDryRunValidated:true`, and `productionApproval:false`. This proves only that the linked official CLI commands and local source validation ran in that operator process. Because the result can be self-reported, an independent reviewer must still check the operator's command provenance, target identity and out-of-band auth evidence. The standalone **R18-57 optimized fog fast-path remains outside the eight files** and is not granted installation rights by this rehearsal.

Separate release blockers still require genuinely independent signed DM/P1/passive-P2 accounts on an explicitly reviewed integrated candidate, private Realtime fog/LOS/revoke and canonical convergence, no wall pushback/lag, browser RTT and Supabase Free RAM/locks, and release sign-off. The R18-59 one-click browser QA panel remains staged and unavailable on the live R18-35 deployment until a controlled test release is authorized.

## Safe failure and security warnings

Any unexpected target, remote hash mismatch, missing file, extra migration, stale receipt, disallowed environment variable, CLI v3/other version, CLI failure, ambiguous output or output containing possible secrets is a **hard NO-GO**. Failures leave the isolated external folder possibly partly populated; securely discard that disposable folder and create a new empty one for a rerun. Never apply manual migration repair or edit fetched historical files to make a mismatch disappear. Never turn `SUPABASE_YES` on.

CLI documentation was checked on 13 Nov 2026: the official CLI v2 reference documents `db push --dry-run` (nonapplying) and `--linked`. Newer v3 documentation changes target defaults to local and uses `--remote`; the R18-60 pinned runner deliberately rejects a wrong major version to prevent target confusion.

## Engineering tests

`tests/world-v2-r18-60-linked-cli-runner.test.mjs` simulates four CLI command invocations using temporary external fixtures but **never makes a real network connection**. It confirms no unsafe write argv, immutable 83+8 allowlist, no false GO from synthetic success, fail-before-network for unsafe env/incorrect project/missing or stale R50 snapshots, no list/dry-run after a fake history digest, and strict transcript result checks. A synthetic successful runner path does **not** count as actual authenticated linked CLI completion. Run full exact-head CI with Node, CodeQL, source-real PG17, lint, build and Edge checks.

**Operational status at time of staging:** Official linked CLI binary and credentials are not available to this chat environment. No real `migration fetch`, `migration list` or `db push --dry-run` was executed yet. Vercel and live database must remain unchanged.