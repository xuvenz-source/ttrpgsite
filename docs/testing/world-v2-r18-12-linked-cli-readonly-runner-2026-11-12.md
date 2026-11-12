# B10-R18-12 — Isolated linked Supabase CLI read-only rehearsal runner

**12 November 2026, Australia/Melbourne · Staging only / release NO-GO.** Based on audited R18-11 draft PR #113 HEAD `ec8a4e0a6c9117776e93517c61495434a7cb222e`. Production remains R16 `main@90df8c960e79e8d66c322095611427da7bb09de4`. No live deployment, Vercel feature flag, migration or paid service change.

## Fresh independent read-only live preflight (12 Nov)

Against the same connected Supabase Free project `lwhwgqaunxbmvyndswze`, SELECT-only database checks establish: 83 distinct historical migration versions, latest `20261109171247`, **83/83** exact MD5 SQL-body matches against the R18-08 baseline, and the target R05 version `20261111023204` still **absent**. A separate SELECT-only current catalog check confirms **7/7** original reviewed function source hashes, **0** active unexpired motion sessions, B07 pending/budget, B08 drain and R05 backup **absent**, public anon Advance execute **denied**, authenticated Advance execute **allowed**, and private schema usage **denied** to anon and authenticated. This is an observation, not production installation permission or proof of a future state. Do not commit any JWT, user IDs, credentials, migration SQL bodies or raw CLI outputs.

## Concrete engineering gap this closes

R18-07 through R18-09 already checked a candidate external directory against remote SQL digests and operator-captured CLI logs but did **not actually invoke an authenticated CLI**. Manual multi-command execution was error-prone, especially given 56 repository migration files but only 55 distinct local versions versus 83 remote aliases. The new **operator-invoked** `scripts/release/rehearse-world-v2-r18-12-linked-cli.mjs` runs a strict, single-pass rehearsal using real official CLI commands, with no ability to install SQL.

## Fail-closed sequence, local read/write boundary

1. Requires an explicit `--run-readonly-linked-rehearsal` opt-in, a fresh 83-row SQL-digest JSON from an **independent read-only** Supabase query, and a linked external workspace **outside Git checkout**. It refuses existing migration files, symlinks, wrong `supabase/.temp/project-ref`, cross-database URL/PGHOST overrides, disabled migrations and enabled seeding. No CLI call is made before these checks.
2. Requires official CLI version exactly `2.81.3`. Uses only the hardcoded array `supabase --version`, `supabase migration fetch --linked`, `supabase migration list --linked` and `supabase db push --dry-run --linked`. Spawns with `shell:false`, bounded time/output and no caller-supplied CLI flags. The CLI must be installed and already authenticated by the operator; the script does **not** authenticate, link or handle secrets.
3. Fetches the live historical SQL scripts **into the operator's local isolated directory only**, then copies exactly the frozen R05 file using exclusive no-overwrite semantics. The unchanged R18-08 validator checks all 83 fetched SQL bodies against fresh row digests, each registered version/name, local config, target project and exact frozen R05 Git blob. Any failure stops before migration list/dry-run.
4. The unchanged R18-09 validator parses both outputs, insisting on all 83 aligned historical versions and exactly one proposed R05 migration, an explicit dry-run safety banner, and no extra seeds, roles, SQL actions or contradictory 'up-to-date' message. Any mismatch blocks. A successful report still says `decision: NO_GO`, `safeToApply: false`, and `sqlInstallationAuthorized: false`.
5. Raw CLI stdout/stderr (which can contain connection context) is retained **only in memory** and never printed, uploaded or committed by the runner. The tool leaves local fetched files in the isolated directory; the operator is responsible for protecting and securely removing that directory.

### Operator-only example (DO NOT RUN from a normal repository migration directory)

After approved operator prep, secure CLI authentication/link and a fresh independent 83-row SQL-digest JSON export:

```bash
node scripts/release/rehearse-world-v2-r18-12-linked-cli.mjs \
  --run-readonly-linked-rehearsal \
  --workspace=/secure/isolated/world-v2-r05 \
  --fresh-sql-hashes=/secure/isolated/live-83-hashes.json
```

`/secure/isolated/world-v2-r05/supabase/migrations` must initially be **empty**, but its `config.toml` and official linked project ref must already be present. The project must exactly match the existing free live test project. Do not supply or paste passwords in a chat, CI job log, local Git file, or URL.

## Verification limits and remaining release gates

The added `tests/world-v2-r18-12-linked-cli-runner.test.mjs` uses **mocked CLI** and temporary local filesystem only, never authenticates or opens remote connections, and tests safe order, all fixed flags, wrong CLI, target override, malicious/mismatched config, nonempty workspace, history digest failure, transcript failure, and default release NO-GO. The new runner itself was **not executed against real Supabase CLI**, since the connected tools have no secure authenticated CLI shell. Its report when genuinely run means the local CLI invoked linked read-only commands; it is not independent proof of remote auth or a deployment approval.

Live Auth DM/P1/passive P2 protected LOS/fog/hidden NPC revocation remains unverified. Initial R18-02 12-second signed client canary needs separate production frontend authorization, R18-04 guarded 700ms remains OFF. The frozen R05 SQL still requires **separate SQL installation approval** after a fresh 7-function/83-version/0-active-session preflight and actual local CLI single-pending report. Post-SQL 24-case Auth/privacy/performance tests and Free-tier RAM/p95 measurements remain outstanding.

**Decision: Staging engineering only; NO-GO to deploy, merge, enable recovery or install migrations.**
