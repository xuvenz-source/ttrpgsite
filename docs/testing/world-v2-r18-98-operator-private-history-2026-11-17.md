# B10-R18-98 — Operator-private historical SQL recovery

**17 November 2026 · source-only, NO_GO · direct parent PR #199 at `f0c1d8e957a38be014caa72b6a483cae7522c3c8`.**

## Why this is a separate gate

The original Supabase **`lwhwgqaunxbmvyndswze`** has **83 registered migrations**. A fresh **SELECT-only** metadata query compared all 83 names, versions, statement counts and original SQL-body MD5 against the immutable R18-08 snapshot with **83 matches, zero drift**. That validates *history metadata*, not possession of SQL. The independent QA Supabase **`bgydsamxypjslergfpla`** is healthy with **zero** registered migrations and still has no installed application schema.

The Git repository's root `supabase/migrations` directory **cannot** be used for bootstrap: 63 original historical versions lack corresponding root files, the root contains malformed timestamp filenames and a duplicate version. The eight R05 + R18-48 narrow pending changes must remain separate. **Do not run `db push` from the repository root, migration repair, db reset, migration up, `--include-all`, or production migrations.** R18-98 does not do any of these.

## Source-only deliverables in this PR

- `scripts/release/validate-world-v2-r18-98-private-history.mjs`: offline, strict 83-file validator; read-only SHA-256 aggregate receipt and original CLI-fetched MD5 parity; checks the original `project-ref`, disjoint workspace, safe config, disabled seed, no extra SQL, no symlinks, and rejects a QA or arbitrary database target.
- `scripts/release/run-world-v2-r18-98-private-history-fetch.mjs`: explicitly invoked **operator-local** runner, not registered in GitHub Actions. Allowed CLI commands are **only** `--version`, `migration fetch --help`, and `migration fetch --linked`, with an exact v2.81.3 version gate. All actual fetch stdout/stderr is discarded; the only intended write is local private SQL file creation by Supabase CLI. The runner never links, pushes, repairs, resets, applies SQL, deploys, or automatically touches QA.
- `scripts/release/validate-world-v2-r18-98-source.mjs` and `staging/world-v2-b10-r18-98-private-history/manifest.json`: immutable source-only evidence. They explicitly record **`operatorAuthenticatedCliFetchCompleted=false`** and **`original83PrivateFilesMD5Verified=false`** until a separate independently verified operator capture exists.

## Private operator procedure (NOT run by ChatGPT, NOT by CI)

Run only on a trusted machine with a supported operating system, a secure temporary filesystem, and the operator's own Supabase authentication. Do not share SQL contents, database passwords, access tokens or shell logs in chat or Git. Do not use the existing repository checkout, project root, a synced folder or a Vercel build as the recovery workspace.

1. Check out the exact R18-98 staged revision for the **scripts only**. Install **Supabase CLI v2.81.3** outside the project in an operator-owned secure directory; confirm the exact version and `migration fetch --help` locally. Pin the npm package version; never use `latest`. Set `umask 077`.
2. Create a **new, private, empty** workspace separate from the source checkout, containing `supabase/migrations/`, `supabase/.temp/` and `supabase/config.toml`. Require `[db.migrations] enabled = true` and `[db.seed] enabled = false`. Do **not** add `seed.sql`, `roles.sql`, existing SQL files, user/campaign rows, or cached local migrations.
3. Authenticate privately and explicitly **link that workspace to the original SOURCE project** `lwhwgqaunxbmvyndswze` using the pinned CLI. Confirm `supabase/.temp/project-ref` contains exactly this original reference. **Never link to QA `bgydsamxypjslergfpla` for the fetch.** Do not reuse any production SQL URLs, connection overrides, CI runners or automatic yes flags. If linking modifies config or creates unexpected migration SQL files, stop and rebuild the private workspace.
4. After confirming the workspace is still empty, run the operator-local gated helper using only private absolute filesystem paths:

   ```bash
   node scripts/release/run-world-v2-r18-98-private-history-fetch.mjs \
     --workspace=/ABSOLUTE/PRIVATE/WORKSPACE \
     --cli=/ABSOLUTE/PINNED/CLI/supabase \
     --ack-source=lwhwgqaunxbmvyndswze \
     --ack-private-only=NO_UPLOAD_NO_SQL
   ```

5. The helper checks the CLI's exact **2.81.3** version and `--linked` fetch help, performs **one history fetch**, then validates **exactly 83** private SQL files against each immutable R18-08 SQL-body MD5, matching every original version and name. Extra pending SQL files, missing bodies, drifted MD5s, symlinks, unsafe config or wrong project reference fail closed. If any check fails, **do not try `migration repair` or apply SQL**. Inspect the private source locally and start a new workspace when appropriate.
6. A successful private fetch only produces a compact **NO_GO** receipt with file count, SHA-256 aggregate and the count of files needing an additional manual security/portability review. Keep recovered bodies private, encrypted at rest, with restricted access. **Even an 83/83 MD5 match is not permission to install on QA**: historical SQL might reference original project IDs, Auth/Storage/Realtime state, privileged functions, seed data or secrets. Review those risks manually without printing SQL bodies into public CI or chat.
7. Only in a **future approved work package**, construct a separate **QA-targeted** 83-file-only workspace with its own hard-pinned project-ref, verify an empty QA database, perform an authenticated **QA-only** dry run, rehearse rollback and review RLS/permissions. Do not repoint R49/R51 or the original site to QA. After 83-history bootstrap and auth approval, review pending R05 + seven R18-48 files separately. R57/R77 optional candidates remain excluded.

## Security and provenance limitations

This operator-local utility is deliberately not executed by ChatGPT because this conversation cannot furnish a trustworthy long-lived private CLI workspace or signed operator-authenticated source capture. A green CI run validates the *offline code and synthetic tests*, not 83 actual recovered bodies, not the operator's Supabase login and not hosted QA migration safety. The MD5 values reproduce the previously verified CLI historical serialization format; the SHA-256 aggregate is a compact supplemental private receipt, not an independent certificate of trust or safe SQL semantics.

**R18-98 source package acceptance:** tests, build, security and isolated source-local PostgreSQL CI succeed, while both provider projects and their environments stay unchanged.

**Release state:** always **NO_GO**. The QA database remains blank. Production, preview aliases and the original Vercel project must remain unchanged, and no paid resources may be created.
