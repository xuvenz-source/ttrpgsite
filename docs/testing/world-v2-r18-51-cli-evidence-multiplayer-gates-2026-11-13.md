# Tabletop Forge B10-R18-51 — CLI evidence parser and honest multiplayer/latency gate

**13 November 2026 (Australia/Melbourne) · NO-GO for release · staging-only increment.**

## Lineage and scope

Exact source parent: R18-50 draft PR #154 SHA \`22f91ea18bfeb31ed66146caf665fde67c82de57\`. The server package remains **83 original registered migrations plus exactly eight pending**: frozen original R05 \`20261111023204_world_v2_b10_integrated_motion.sql\` and seven R18-48 narrow CLI-versioned SQL files. R18-26 bbox and R18-27 Commit optimizations remain excluded on mixed performance data. Rejected R18-40 client movement is not included. No other production/frontend/SQL changes are allowed in R18-51.

R18-49 already checks an isolated linked workspace containing actual fetched historical SQL bodies and seven narrow sources. R18-50 checks a fresh live SQL-history, 10 critical function digests, actor grants and idle-lock state. **Neither tool proves that the official Supabase CLI ran or that signed-in P1/P2 behaved correctly.**

R18-51 adds the missing *independent artifact shape check* for actual \`migration list\` and \`db push --dry-run\` operator output, without itself invoking the CLI or accepting simulated success as production authorization.

## What was checked live read-only

Connected Supabase project \`lwhwgqaunxbmvyndswze\`, PostgreSQL 17.11, ACTIVE_HEALTHY at observation.

At **2026-11-13 04:57:19 UTC**: 83 remote migration registrations, newest \`20261109171247\`, R05 absent; 0 currently active movements; 0 waiting database locks; 7 observed database sessions versus configured max 60. No SQL/DDL writes. No proof of RAM headroom, network timing or multiple concurrent players.

At this R18-51 read-only database statistics snapshot (cumulative **since 5 Nov 2026 09:51:43 UTC**, not an isolated timed benchmark):

| Query phase | Historical calls | Mean DB execution | Historical max DB execution |
|---|---:|---:|---:|
| Advance | 1,770 | 63.74 ms | 2,256.44 ms |
| Commit | 517 | 290.78 ms | 3,673.67 ms |
| Begin | 615 | 25.28 ms | 743.61 ms |
| Signed visibility | 1,391 | 43.45 ms | 1,917.24 ms |

These are query-pattern grouped \`extensions.pg_stat_statements\` aggregates, not browser RTTs or current/per-function measurements. \`track_functions=none\`, so it is unjustified to attribute a share of Commit to any particular trigger. The historical long tails reinforce the need for actual user-perceived drag/arrow/multi-account profiling before promoting any optimization.

No linked official Supabase CLI binary/authentication was available in this execution environment. **The actual authenticated \`migration fetch\`, \`migration list\`, and \`db push --dry-run\` gate remains NOT DONE.** We did not invent a successful operator transcript, create a paid branch, switch Vercel production, or sign in as P1/P2.

## R18-51 source additions

- \`scripts/release/validate-world-v2-r18-51-cli-evidence.mjs\`: read-only Node checker. It requires official pinned CLI version \`2.81.3\` and separate zero exit statuses; source-verifies the exact 91-file historical+pending isolated workspace with R18-49; requires a new valid R18-50 read-only authority receipt no older than 15 minutes; parses actual CLI list output for precisely **83 matched local+remote records and 8 local-only pending**, then parses dry-run output for precisely **8 reviewed exact SQL filenames in order**, and rejects repair, migration-up, extra unknown versions, ambiguous output or possible secrets. It does not invoke CLI, network, or SQL, and reports **NO_GO**.
- \`tests/world-v2-r18-51-cli-evidence.test.mjs\`: synthetic transcript acceptance and adversarial missing/extra/reordered history, R18-26/27 reentry, accidental write messages, fake dry-run, nonzero exits, secrets and script-inertness. These tests cannot claim an actual linked production dry run.
- This document. No active \`supabase/migrations\` edits, database grants, CI workflow changes or runtime code.

## Actual operator procedure, separate from R18-51 CI

This procedure may be run only in a separately approved authenticated operator session:

1. Verify the **exact** pinned official Supabase CLI 2.81.3 binary, and read that binary's \`migration fetch --help\`, \`migration list --help\` and \`db push --help\`. Do **not** infer unsupported flags from historical documentation. In particular, \`db push\` normally operates on an already linked project, so use only flags confirmed by the installed CLI; \`--dry-run\` is mandatory.
2. Prepare a new directory **outside** Git, linked to only \`lwhwgqaunxbmvyndswze\`. Fetch the exact **83 actual** history SQL files using official CLI and obtain a fresh independent read-only migration fingerprint snapshot. Never synthesize local 83-history placeholders or edit live migration history.
3. Copy ONLY frozen R05 plus the seven R18-48 narrow pending files; run the source-identity guard in \`scripts/release/validate-world-v2-r18-49-linked-workspace.mjs\`. It must report exactly **91 total**, zero extras/symlinks/seed/roles, project match, 83 historical source digests and eight exact pending.
4. Re-run \`supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql\` read-only and privately capture the one-result JSON receipt. Run its validator promptly (within 15 minutes).
5. In the *same* isolated CLI-linked workspace, run **only** the reviewed \`migration list\` and \`db push --dry-run\` commands, strictly after checking the installed help and linked target. Record original complete standard output/standard error privately along with the official CLI version and actual exit code. Never paste credentials, DB URLs, Auth tokens, sight grants, private geometry or raw logs into PR comments.
6. Run the new R51 offline parser locally with private input file paths:

       node scripts/release/validate-world-v2-r18-51-cli-evidence.mjs \
         --workspace=/absolute/private/operator-workspace \
         --fresh-sql-digests=/absolute/private/fresh-history.json \
         --receipt=/absolute/private/fresh-readonly-receipt.json \
         --migration-list=/absolute/private/cli-migration-list.txt \
         --dry-run-output=/absolute/private/cli-db-push-dryrun.txt \
         --cli-version=2.81.3 --list-exit=0 --dry-run-exit=0

   The output must remain \`decision:NO_GO\` and \`safeToApply:false\` even when the 83+8 text and workspace match. CLI output format can change; an unexpected format is a **STOP for independent review**, never a permission to relax parsing. A passed parser checks text structure only, not authentication authenticity. A human operator must separately attest actual CLI invocation, isolated working directory, linked project and recorded exit status.
7. **STOP**. Do not execute a real \`db push\`, \`migration up\`, \`migration repair\`, SQL migration editor, \`apply_migration\`, Vercel promote or feature-flag activation in this step. Neither the parser nor a dry run is release approval.

## Missing genuine DM/P1/passive-P2 acceptance

This remains a strict, separate release gate. A sole DM, player preview or unauthenticated synthetic fixture **does not** substitute. When testers are available, assign three independent signed-in sessions (DM/P1/passive-P2) to the existing test campaign; **do not create or disclose accounts, passwords or JWTs in this workflow**.

The acceptance sequence must include: (a) DM and P1 legal fast keyboard and drag with repeated corners, (b) precise wall collision with immediate new drag/regrab, (c) DM/P1 movement observed by passive P2 with canonical-cell convergence and no board flash, (d) fog/LOS and signed recipient-private observer checks before and after character/role permission changes, (e) revoke P1 while an Advance is in flight and ensure **no unauthorized sight after revocation**, (f) reconnect/recovery of P1/P2 without exposed hidden map geometry, and (g) two-to-five-minute bounded concurrent stress with browser Advance/Commit/finalize p50/p95, release-to-confirmation and Supabase lock/connection/RAM headroom.

Capture only sanitized QA panel aggregates, counts, timestamps, final states and screenshots. Do not post full signed sight, hidden wall geometry, tokens/character IDs, session secrets or personal data. A missing or failing case is **PENDING/FAIL**, not PASS. The R18-43 atomic terminal can at best remove one closing HTTP round trip, not the sustained Advance serialization. R18-40 was a failed movement experiment and remains excluded.

## Release gates and next step

**R18-51 staging source can be validated in GitHub CI, but the actual Supabase CLI and multiplayer gates cannot be closed here.**

A future release also requires free-tier memory/lock and user-RTT signoff, explicit operator GO, exact migration/version review, server-first rollout with both atomic flags initially OFF, independent canary QA and incident containment plan. Preserve R18-35 READY production rollback source. No unauthorized SQL, upgrades, or main merge.
