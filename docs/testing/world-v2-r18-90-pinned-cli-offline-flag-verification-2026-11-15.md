# B10-R18-90 — Original Supabase CLI 2.81.3 offline compatibility gate

**15 November 2026 · Melbourne · DRAFT PR #192 · NO LINKED PROJECT ACCESS / NO SQL APPLY / NO DEPLOY / NO PAID TIER.**

Exact parent: R18-89 draft PR #191 head `e380933f43850b7884996fa0241e36ee70db66e8`. The original read-only R18-89 live catalog evidence established that all **83/83** historical migration SQL-body digests and **10/10** critical World V2 authority function hashes match the frozen baseline; the linked database still has **83 migrations**, eight pending, and only one Supabase Free project/main database branch visible to the connected account. R57 + R77 candidates are still not installed, and no independent DM/P1/passive P2 QA data has cleared the release gate.

## What was blocked

The attached Supabase MCP/app can run read-only SQL but cannot provide an independently authenticated `supabase` **CLI session**, create an operator-signed CLI receipt, or prove that an arbitrary CLI binary is version 2.81.3. The assistant's own container also has no Supabase CLI installed, no `SUPABASE_ACCESS_TOKEN` or database credentials, and cannot resolve github.com from the container for a download. It would be incorrect to describe R18-89's live SQL-body fingerprint proof as a passed `migration fetch/list/db push --dry-run`.

The existing `staging/world-v2-b10-r18-89-readonly-qa-prerequisites/operator-cli-plan.json` remains non-executable and intentionally requires a trusted independent operator and disjoint temporary workspace. R18-90 **does not** attempt to bypass or impersonate that operator.

## New actual binary compatibility check

`.github/workflows/world-v2-r18-90-cli-offline.yml` runs **only on GitHub's disposable CI runner** using a private temporary npm prefix. It installs the exact `supabase@2.81.3` package, then calls only:

| CLI command (no remote target) | Required check |
|---|---|
| `supabase --version` | Exact `2.81.3`, not a v3 floating release |
| `supabase migration fetch --help` | The historical `--linked` flag exists |
| `supabase migration list --help` | The historical `--linked` flag exists |
| `supabase db push --help` | Both `--linked` and `--dry-run` flags exist |
| `supabase link --help` | Explicit `--project-ref` flag exists |

This is **four help surfaces plus the exact version check**, not five separate remote operations. The workflow deliberately sets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, connection URLs, `PGHOST` and `SUPABASE_YES` to empty, rejects any existing `$HOME/.supabase/access-token` and `supabase/.temp/project-ref`, and has only `contents: read` GitHub permissions. It does not run `supabase link`, `migration fetch`, `migration list` or `db push` without `--help`. It does not touch the protected QA URL, Vercel, the connected Supabase database or secrets. The binary/npm install runs only in a disposable runner directory, not the tracked source checkout.

`scripts/release/validate-world-v2-r18-90-pinned-cli-help.mjs` reads bounded, regular, local text files and rejects wrong versions, missing flags, incorrect command help, ANSI control codes, oversized payloads and possible credentials. It always prints **`decision: "NO_GO"`**, even when all help checks pass. `tests/world-v2-r18-90-pinned-cli-help.test.mjs` adversarially tests this policy and the absence of executable remote CLI operations.

**Interpretation:** A green R18-90 workflow provides real CI **v2.81.3 command compatibility**, replacing the R18-89 *assumption about help syntax* with inspected flags. It does **not** validate an authenticated linked project target, genuine 83 fetched SQL file bytes, remote history or dry-run output. Do not use it as a release approval.

## Official Supabase version context

Supabase announced the v3 command-target change on 4 November 2026. v3 defaults many commands to local and replaces/deprecates v2's `--linked` with `--remote`, which can silently change target semantics if a floating CLI is used. The QA operator plan consequently pins v2.81.3 and must inspect the actual binary's `--help` before any authenticated network command.

Primary references: <https://supabase.com/changelog/supabase-cli-v3> and <https://supabase.com/docs/reference/cli/introduction>.

## Remaining verified blockers

The official credentialed Supabase v2.81.3 CLI **link, migration fetch, migration list, and `db push --linked --dry-run` have NOT run**. The original R05 + seven narrow source-approved pending migrations **have NOT been installed**. Real signed DM/P1/passive P2 campaign ownership/fog/collision/revocation/fast regrab, browser input-to-Commit p50/p95, passive observer convergence and physical Free RAM/swap/lock load **have NOT passed**. There is no verified isolated QA database for the permanent Vercel preview, and no operator SQL/release permission. The combined R57+R77 optimization remains a source-sealed local candidate, not a hosted feature.

**Engineering R18-90 gate:** exact CLI help/version compatibility on a disposable no-secret CI runner, prior R79/R78 immutable NO-GO ledger checks, legacy PG17 signed authority/fog/Commit rollback CI and CodeQL. Record exact final commit and exact-head Actions IDs. The action itself uses no remote credentials; if its package download fails or help flags differ, mark R18-90 **BLOCKED**, inspect the failure and do not update the pin to v3 automatically.

## R18-91 objective

With exact pinned CLI help verified, prepare or obtain the **real authenticated linked CLI receipt** from an independently trusted workspace and inspect it through the already-tested R49/R50/R51 source/evidence validators, without running actual `db push` or migration repair. If credentials are unavailable, the alternative is independently reviewed and approved QA backend isolation; never infer safety from the permanent preview hostname or assume another free project/paid branch can be created without a verified cost quote.

**Release decision: NO-GO. No new SQL or deployed runtime.**
