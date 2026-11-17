# B10-R18-100 — Private QA-only 83-history mirror and dry-run preflight

**2026-11-17 · R18-99 PR #201 exact parent `890be220775dd0fe60be927c05937a25a371cda8` · NO_GO.**

## Source and target separation

- The original `lwhwgqaunxbmvyndswze` reports **83 historical migrations**. Their frozen R18-08 body hashes have been independently verified with metadata-only SELECT, but the actual 83 bodies are **NOT YET RECOVERED** through a private authenticated operator session.
- The independent QA `bgydsamxypjslergfpla` remains healthy with **zero registered migrations and zero application tables**. Its separate Vercel QA project still has **zero deployments**.
- SQL installation to either database, paid infrastructure, Vercel deployment, copying original user/identity data and production release are disallowed here. The original 83 historical files MUST remain distinct from the eight pending R05/R18-48 migrations and optional R57/R77.

## Gate A — source-only QA mirror (implemented; not run against historical bodies)

The new `scripts/release/validate-world-v2-r18-100-qa-workspace.mjs` compares an operator-private R18-98 authenticated-source *claim* (with the R18-99 file cross-check) to **83 local QA mirror SQL files**. It verifies:

1. Source history, QA workspace and Git checkout are **three disjoint private paths**; no workspace or migration symlinks/hardlinks.
2. Every QA filename matches exactly one of the **83 frozen original version/name rows**; every SQL MD5 matches the R18-08 baseline **and** every SHA-256 matches its recovered private source file byte-for-byte.
3. The QA private workspace is linked specifically to `bgydsamxypjslergfpla`, **never the original ref**, with migrations enabled, seeds disabled, and no `seed.sql`, `roles.sql` or in-workspace `.env` files.
4. Embedded original project ref inside QA SQL is a hard blocker. Sensitive Auth/Storage/Realtime, RLS and SECURITY DEFINER logic still requires **human security/portability review**, even if every byte matches.
5. The source proof must remain `NO_GO`, since the R18-98 receipt does not independently authenticate the operator's Supabase CLI session.

If any check fails, make **no SQL changes**. Do not repair migration history, alter migration versions to force a pass, or run `db push` from the root repository.

## Gate B — operator-local *read-only migration preview* (prepared, not executed)

`scripts/release/run-world-v2-r18-100-qa-dry-run.mjs` only permits pinned **Supabase CLI 2.81.3** version/help and the command `db push --dry-run --linked`, in the independently checked QA directory. CLI output is intentionally discarded and no auth tokens or private SQL should enter CI or chat. The explicit `--dry-run` flag is essential; never replace it with `db push`. A dry run is **not** an approval to apply any SQL.

Only **after** private R18-98 source recovery, private R18-99 fingerprint comparison, human SQL security review and a private QA workspace copy (not within Git checkout), an operator may run:

```bash
node scripts/release/run-world-v2-r18-100-qa-dry-run.mjs \
  --source-workspace=/PRIVATE/ORIGINAL-HISTORY \
  --qa-workspace=/PRIVATE/QA-83-HISTORY \
  --r98-receipt=/PRIVATE/R98-RECEIPT.json \
  --cli=/ABSOLUTE/PINNED/supabase \
  --ack-qa=bgydsamxypjslergfpla \
  --ack-no-writes=DRY_RUN_ONLY
```

The source/QA private workspaces must contain `supabase/migrations/`, `supabase/config.toml` with `[db.migrations] enabled=true` and `[db.seed] enabled=false`, and `supabase/.temp/project-ref` with the correct *different* project references. **No** CI credentials, env overrides, production workspace reuse, SQL installation, OAuth setup or production deployment is part of this work package.

## Evidence and known limitations

The CLI v2 command is documented as a dry run that prints migrations without applying them, but a successful exit code cannot independently prove the hosted account, project identity, operator authorisation, data security or future install safety. The tool intentionally returns **NO_GO** with no release authorisation. The source manifest `staging/world-v2-b10-r18-100-qa-only-preflight/manifest.json` records unexecuted flags as **false**, and source CI exercises only synthetic SQL mirrors.

R18-101+ must independently attest source session/target, review SQL portability and rollback, verify real QA-only dry-run, then require separate operator approval for installation of the original 83 migrations. Eight pending migrations and full signed DM/P1/P2 browser movement QA follow separately. No application movement, fog or collision acceptance is claimed here.
