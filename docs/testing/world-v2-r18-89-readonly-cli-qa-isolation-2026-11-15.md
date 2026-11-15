# B10-R18-89 — Live 83-history source attestation, pinned CLI boundary and QA backend isolation

**15 November 2026 (Melbourne) · draft PR #191 · linked Supabase SELECT-only + offline source check · NO MERGE / NO SQL APPLY / NO QA ALIAS REPLACEMENT / NO PRODUCTION DEPLOYMENT.**

Direct source parent: R18-88 PR #190 exact SHA `8461b38a498eb1244407b232a1f700314a54d2fd`. R18-88 previously demonstrated the combined R57+R77 private fog + ray optimizations and atomic pre-commit rollback under local disposable PostgreSQL 17. That evidence does **not** establish production/signed-player performance.

## Live verified read-only evidence, not official CLI

Using the connected Supabase project's original source-exact `supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql` SELECT-only receipt, we freshly compared all historical rows against `staging/world-v2-b10-r18-08-remote-history-content-hashes.json`. The observation time was **2026-11-15 10:11:42 UTC**.

| Verified catalog signal | Result |
|---|---|
| Registered migration rows | **83** |
| Unique historical versions | **83** |
| Exact version/name/statement count/SQL-body MD5 matches | **83/83** |
| Critical original World V2 authority function MD5 matches | **10/10** |
| New or drifted history | **0** |
| Latest registered migration | `20261109171247` |
| R05 + seven narrow pending migrations installed | **No** |
| Atomic finalization RPC present | **No** |
| Active signed motion sessions | **0** |
| Waiting database locks | **0** at observation |
| Database sessions / configured connection limit | **7 / 60** at observation |
| Anon internal schema and movement RPC EXECUTE | **Denied** |
| Authenticated internal schema USAGE | **Denied** |

This is a *live database fingerprint comparison*, based on PostgreSQL's stored `schema_migrations.statements` representation and the frozen source. It is **not** an authenticated Supabase CLI `migration fetch`, `migration list` or `db push --dry-run` report and does not prove the 83 CLI-materialized files are identical after CLI formatting. Those are still required.

The connected organization is **Free**. At inspection, the connected account could see one Supabase project and the project's only listed database branch was `main`. This does not prove an isolated database exists elsewhere in another account; **none was verified for this site's QA URL**. Do not treat Vercel's permanent QA preview as a separately isolated backend.

## Safe operator-only CLI attestation, prepared but NOT executed

The source-only `staging/world-v2-b10-r18-89-readonly-qa-prerequisites/operator-cli-plan.json` freezes the ten-step sequence and disallows destructive commands. `scripts/release/validate-world-v2-r18-89-readonly-qa-prerequisites.mjs` rejects any fabricated success, operator approval, unsafe change of target, wrong pinned version, changed 83+8 source identity or nonexistent independent backend.

When a **separately approved, independently credentialed** operator runs this on a trusted machine, the procedure is:

1. Create a **private temporary workspace disjoint from the repository checkout**. Never run a CLI fetch, link or dry-run from the active root migration directory. Do not put access tokens, database passwords or fresh receipt files in source control.
2. Install and verify **exactly Supabase CLI 2.81.3**, not a floating installer; inspect `supabase --version`, `supabase migration fetch --help`, `supabase migration list --help` and `supabase db push --help`. Verify the `--linked` and `--dry-run` options on the actual pinned binary.
3. Link only the disposable workspace to **`lwhwgqaunxbmvyndswze`** and verify the local `supabase/.temp/project-ref` after `supabase link --project-ref ...`. `supabase migration fetch --linked` must materialize exactly **83** historical SQL files into that workspace; their 83 body MD5s must match the live R50 receipt and frozen R18-08 baseline. No independent permission to modify hosted schema follows from this.
4. Copy **only** the original frozen R05 migration and the seven R18-48 narrow staged versioned files into the same private workspace. Do not pull in the excluded mixed-performance R18-26/R18-27 migration files, custom roles, seeds or unreviewed later changes. Run the existing original `validate-world-v2-r18-49-linked-workspace.mjs` from the source checkout using its required private receipt and workspace arguments. It must verify exactly **91** source-sealed local files and the precise linked project.
5. **Only after steps 1–4 pass**, run `supabase migration list --linked` and `supabase db push --linked --dry-run` inside the temporary workspace. Capture stdout/stderr privately; no `--yes`, non-dry-run `db push`, `migration repair`, `migration up`, `db reset`, `--include-all` or role/seed mutation. Validate exact 83 applied / eight pending version rows and eight dry-run source filenames using the existing `validate-world-v2-r18-51-cli-evidence.mjs`, along with a newly collected, fresh source-real R50 read-only receipt.
6. Record exact CLI version, authenticated target identity, private capture provenance, command exit codes and whether R49/R50/R51 pass. **The result remains NO-GO** until independent multiuser QA, resource limits, rollback and operator release approval also pass.

**CLI v3 compatibility:** Supabase announced 4 November 2026 that v3 defaults database commands to local instead of linked and uses `--remote` rather than v2's `--linked`. Do not silently change targets or use a floating `supabase/setup-cli` installer. References: <https://supabase.com/changelog/supabase-cli-v3> and <https://supabase.com/docs/reference/cli/introduction>. The online docs have already changed to describe v3 in places; this project intentionally pins v2.81.3.

## Safe independent gameplay QA choices

- **Preferred within current cost constraint:** Develop a disposable, locally hosted PostgreSQL 17 + test Supabase Auth fixture containing *synthetic* campaign/map/users, with separate authenticated DM, Player 1 and passive Player 2. This remains a development harness until real browser/Realtime behavior and the complete RLS/authorization path are reproduced. It is not equivalent to a hosted project simply because SQL tests pass.
- **Potential protected hosted route:** A genuinely separate Supabase project or independently isolated branch for QA, with its own verified URL, publishable key, migration source and private test users. We have **not** provisioned one. A new project/branch may carry fees or Free-plan project limits, so obtain the organization's actual cost quote and explicit separate approval before creation. Do not silently create paid infrastructure.
- **Shared backend route (currently blocked):** A separately approved maintenance/release window may eventually apply the original eight migrations and source-sealed combined functions to shared Supabase, followed by protected QA browser testing. The "QA site" URL alone does **not** limit backend effects to QA; production-facing behavior would change. It requires operator/governance approval, tested post-commit inverse, independent signed fog/collision/revocation, p95, RAM/CPU/lock monitoring and an explicit rollback plan.

## Current decision and next milestone

**R18-89 source integrity review: 83/83 + 10/10 read-only PASS. Official linked CLI: NOT RUN. Isolated QA backend: NOT VERIFIED. User-perceived multiplayer movement: STILL UNVERIFIED AFTER OPTIMIZATION. SQL/QA/production release: NO-GO.**

R18-90 should focus on obtaining *real credentialed CLI evidence* or an independently authorized isolated QA backend; no further local synthetic wall benchmark is required. In the meantime, preserve R57/R77 sealed candidate and inverse bodies, private fog/collision authority and all original movement-rate limits. Do not merge unreviewed historical branches, mutate Supabase migration history, deploy any preview alias, or incur paid usage.

Hand-off artifacts: R89 manifest, ten-command operator plan, offline source/CLI validator, seven adversarial test groups and updated R78/R79 NO-GO ledger checks. Snapshot is point-in-time, and the offline validator does not claim independent provenance from the connected SQL receipt.
