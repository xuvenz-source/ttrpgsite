# R240 — Supabase CLI v2.81.3 standalone archive with verified GitHub release SHA (NO SQL)

**23 November 2026. Source-only draft child of R239 [draft PR #349](https://github.com/xuvenz-source/ttrpgsite/pull/349) at exact head `efabd9da5f72339533bcaa920b35ccc603a26acf`, with both exact-head CI passed. No historical SQL, Docker stacks, hosted writes, production changes, merges, deployments or paid services.**

## Owner's actual npm result

Owner installed only isolated npm metadata into `$HOME/ttrpg-local-cli-v2-81-3` (outside the private original migration archive and repository). Node v22.22.1, npm v12.2.1. `npm view supabase@2.81.3 scripts` returned `postinstall: node scripts/postinstall.js`, and npm's default-deny `allowScripts` blocked that lifecycle script. `./node_modules/.bin/supabase` does **not exist** and the CLI is **not installed** by this attempt. npm audit in that isolated tool directory reports **two unresolved vulnerabilities**: moderate `supabase` and critical `tar`, including public GitHub advisories GHSA-vmf3-w455-68vh, GHSA-w8wr-v893-vjvp, GHSA-23hp-3jrh-7fpw, GHSA-8x88-c5mf-7j5w, GHSA-gvwx-54wh-qm9j and GHSA-r292-9mhp-454m. npm suggested a newer `supabase@2.122.1` as a fix, but the project's prior offline CLI verification is pinned to **2.81.3**; silently switching major CLI workflows is not approved.

**Do NOT approve the `supabase@2.81.3` npm postinstall, run `npm audit fix --force`, globally allow lifecycle scripts, or use npm's vulnerable `tar` package.** The audit identifies vulnerable **npm package dependencies**, not a proven flaw in the distinct standalone CLI executable. Conversely, a clean binary SHA check cannot establish the absence of all CLI bugs.

## Verified official external references

Official Supabase CLI docs explicitly support installing Linux packages directly from the [upstream Supabase CLI releases](https://github.com/supabase/cli/releases). The exact release [v2.81.3](https://github.com/supabase/cli/releases/tag/v2.81.3) exists as an upstream GitHub release. Modern official CLI installer source uses GitHub `supabase_<version>_linux_<arch>.tar.gz` archives (older releases may also use `supabase_linux_<arch>.tar.gz`). The immutable pinned version is mandatory; no latest/v3 fallback. `api.github.com/repos/supabase/cli/releases/tags/v2.81.3` is used only for **public release metadata**, and its matching archive asset's `digest: sha256:<64 hex>` must be present to continue. A missing SHA or unexpected archive name **fails closed**.

See [Supabase CLI installation](https://supabase.com/docs/guides/local-development/cli/getting-started), [Supabase npm security guidance](https://supabase.com/docs/guides/security/npm-security), [upstream v2.81.3 release](https://github.com/supabase/cli/releases/tag/v2.81.3) and [GitHub release assets API reference](https://docs.github.com/en/rest/releases/assets).

## R240 exact offline/online boundary

Only `scripts/release/r240_install_verified_standalone_cli.py`, executed by the **owner** in Ubuntu, will:

1. Require Linux `x86_64/amd64` or `aarch64/arm64`; no `sudo` or npm, and do **not** use the existing vulnerable `node_modules` directory.
2. Query official public GitHub API over HTTPS for the **exact release tag** v2.81.3 and select only an allowlisted Linux tar.gz name matching the owner architecture.
3. Require the release asset's **GitHub-published SHA256** and bounded compressed size. If GitHub's old release metadata lacks a SHA, **stop**; do not use an unverified archive, substitute a third-party mirror or execute installer scripts.
4. Download that exact archive from the official GitHub release URL (HTTPS; allow only official GitHub download redirect domains) into a fresh private temporary folder under the owner's home.
5. Verify the **whole compressed archive's length and SHA256** against the GitHub release asset metadata. An asset downloaded from GitHub and checked against a hash from the same GitHub release is **origin/integrity verification**, not independent reproducible-build attestation.
6. Open the tar archive read-only; select only the unique root-level regular `supabase` file with bounded decompressed size, not symlinks or arbitrary paths. Copy its bytes without calling `extractall`, check ELF magic and mark executable.
7. Move **only** that binary into a newly created owner-only `$HOME/ttrpg-cli-standalone-v2-81-3/`, refusing any preexisting destination. It never writes outside the new tooling folder and owner-home scratch path.
8. Print `R240_VERIFIED_STANDALONE_READY` **only after successful verification**. It **does not run the downloaded executable**; the owner may separately run only `--version` to confirm 2.81.3.

**Network:** reading public GitHub release metadata and downloading one release asset are explicitly expected. It does **not** contact Supabase hosted projects, import app credentials, open any private SQL or archive, initialize a project, invoke `supabase start/link/migration/db`, execute SQL, start Docker, pull Docker images, install root packages, change environment variables, merge, deploy or consume a paid resource. This is only an owner-local CLI installation method after the previous failed npm install.

## Testing and manual gate

Dedicated R240 GitHub CI uses fabricated GitHub release metadata, fake SHA256 values, intentionally corrupted/synthetic tar archives and a fake ELF byte prefix to exercise the exact allowlist, digest, size, archive traversal and non-overwrite gates. It does **not** hit the network or execute an actual CLI. Four changed source-only files only: Python installer, fictional tests, docs and narrow CI. Exact final CI must pass before owner runs anything.

Owner manual command should download the script from the **exact R240 green head** to their existing isolated tooling directory, then invoke only the Python installer and `$HOME/ttrpg-cli-standalone-v2-81-3/supabase --version`. Do not invoke the CLI in the private SQL archive or the app repository. On a `R240_NO_GO` error, report the sanitized category and **stop**, rather than bypassing checksum or retrying with latest/unsigned assets. Do not share npm debug logs, user secrets, private paths or unredacted original SQL.

The R235 12 proposed local replay prerequisites are still FALSE. Original 83 migrations, 67 privileged SECURITY DEFINER functions, signed multi-actor QA and security issues #212/#220/#223/#229/#231/#306/#340 remain **SECURITY NO_GO**. Local Supabase image download, sandbox creation, SQL execution and hosted QA/production changes require **independent approvals**.
