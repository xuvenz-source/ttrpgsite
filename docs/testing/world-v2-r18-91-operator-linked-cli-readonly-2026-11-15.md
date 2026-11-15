# B10-R18-91 — Operator-only linked Supabase CLI verification gate

**15 November 2026 · Australia/Melbourne · Draft PR #193 · SOURCE/TEST STAGING ONLY · NO DEPLOY / NO DATABASE SQL APPLY.**

**Direct parent:** R18-90 draft PR #192 exact `7c28ee15d835a0f1eb916215efaea9265ec48d7a`.

## Purpose and limits

R18-89 verified the linked Supabase *stored catalog* version/name/count/SQL-body MD5 for all **83/83** historical migrations and the source hashes of **10/10** critical World V2 movement authority functions using original read-only SQL. R18-90 independently verified real Supabase CLI **2.81.3** supports `--linked`, `--dry-run` and explicit `--project-ref` on a **credential-free** GitHub Actions runner.

The remaining prerequisite is a genuinely operator-authenticated CLI history verification, including exact 83 fetched migration files, eight frozen R05/narrow pending sources, actual linked migration list, and an actual **non-applying** dry-run. This assistant's connected Supabase app does **not** supply a trusted operator shell or usable CLI credentials. It would be false to mark an authenticated dry-run complete merely because R90's `--help` check passed.

`scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs` bridges the final stages of this verification **only on the operator's own trusted workstation**. It is **not** invoked by GitHub Actions, the protected Vercel preview, the assistant or a runtime server.

## One-time operator preparation — NOT performed in this PR

1. From a trusted workstation with Node 24 and the **exact original Supabase CLI 2.81.3** installed, make a private, **non-git temporary workspace** that is not inside the source checkout and does not contain real campaign files. Authenticate privately on that workstation; **never paste an access token, database password, migration SQL, private JSON receipt, or raw CLI output in chat, GitHub, or Discord**. This runner itself never asks for credentials or stores raw output.
2. Inspect the pinned binary's `--version` and `--help`. Using the original, separately documented R18-89 protocol, initialize/link **only the temporary workspace** to project `lwhwgqaunxbmvyndswze`, and `migration fetch --linked` the original **83** migrations. Review the exact local `supabase/.temp/project-ref`; no other project is permitted.
3. Copy **only** the original source-controlled `supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql` and **seven frozen** files from `staging/world-v2-b10-r18-48-narrow-pending/supabase/migrations/` into the temporary workspace's `supabase/migrations/`. Do **not** copy excluded R18-26/R18-27 files or 90+ unapproved staging branches. The total must be **91 exactly**.
4. In the temporary workspace ensure `supabase/config.toml` has **`[db.migrations] enabled = true`** and **`[db.seed] enabled = false`**. No `roles.sql` or `seed.sql`. Original R49 will reject an unexpected file, altered SQL payload, dangerous config, symlink or wrong linked project.
5. Execute **only** the existing original **SELECT-only** R50 database audit against the intended linked project, in an operator-approved read-only SQL interface, and export the single JSON result row **privately** outside the repo. Use `supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql`. The receipt must be collected within **15 minutes** of validation. No secrets, user IDs, authored map geometry or private frames are included by the query.

## Single guarded operator run

From the original source checkout, and after manual preparation has succeeded:

```bash
node scripts/release/run-world-v2-r18-91-linked-cli-readonly.mjs \
  --workspace="/absolute/private/r91-cli-workspace" \
  --receipt="/absolute/private/r91-fresh-r50-receipt.json" \
  --cli="/absolute/path/to/pinned-2.81.3/supabase" \
  --ack-target="lwhwgqaunxbmvyndswze"
```

Use absolute real paths. The `--cli` path should resolve to the actual pinned executable, not `npx` or a floating `latest` version. **Do not run this script from a pull-request or other untrusted checkout with access to secrets.**

The runner validates, **in this order**:

1. Explicit project acknowledgment, source checkout vs private workspace separation, no unexpected DB target environment override, no symlinked/unbounded receipt.
2. Fresh original R50 receipt exact historical **83/83 SQL fingerprints and 10/10 authority functions**, private ACL, no active sessions and lock sanity. Then original R49 exact 83 downloaded SQL files plus eight frozen pending files, config, link and project identity.
3. Actual local pinned CLI `--version` and four `--help` surfaces using the original R90 parser. If a CLI binary, version or option differs, abort before the linked network request.
4. **One allowed read-only remote request:** `supabase migration list --linked`. Parse its exact 91 local / 83 remote / eight pending rows. If any row or order differs, **stop before running even the dry-run**.
5. **One allowed non-applying request:** `supabase db push --linked --dry-run`. Check the printed eight exact files, then rerun the complete original R51 verification of all receipts, source bodies, row order and CLI text.
6. Return a compact, non-secret JSON record with `decision: "NO_GO"`. Even a local successful capture cannot independently attest that the workstation and credentials belong to an authorized operator, prove a hosted multiplayer latency improvement, or approve applying SQL.

The executable uses **no shell invocation**, never offers a `link`, `migration fetch`, `migration repair`, `migration up`, `db reset` or **actual** `db push` command. It neither saves nor prints raw CLI output. CLI errors are deliberately generic; diagnose locally without uploading private receipts.

**Warning:** The isolated workspace must already have been linked/fetched by a trusted operator before the runner is invoked. R18-91 will not prepare credentials or clone a live database. A local status of PASS on original R49/R50/R51 source checks means **only that the evidence is internally consistent**, not that ChatGPT independently watched a credentialed operator run it.

## QA, release and economics

Supabase remains on the connected Free organization with only one project/main branch verified. The permanent Vercel QA URL shares the backend unless an independent URL/key/database is separately verified. R05/seven narrow pending migrations and the optional R57+R77 synchronous sight optimization are **not installed**. Local R87 balanced Commit medians identified the combined candidate as promising, not an accepted browser p95.

Do **not** apply SQL until an operator separately reviews the eight pending migrations, true post-commit R77/R57 rollback, Free physical RAM/locks, and signed independent DM/P1/passive P2 visibility, collision, revocation, rapid corner regrab and observer convergence. A separate QA backend may have additional charges; the user must approve quoted nonzero cost before creation. Do not silently spend money or push onto the shared backend.

## Acceptance and handoff

The current engineering package is complete **only if** general Node/build/lint/audit tests, original source-real PostgreSQL 17 signed authority/rollback, CodeQL and pinned CLI offline CI are green and the draft PR is directly based on R18-90. The actual operator script **must not be run in any CI job** or treated as evidence of hosted migration-list/dry-run success.

**R18-91 code acceptance vs release are separate:**

- **Code PASS** means the source-only operator capture and adversarial command/gating tests pass.
- **Authenticated linked CLI receipt: NOT COLLECTED in this conversation**. A human operator can execute the tool later without sending secrets.
- **Migration apply / QA backend / production: NO-GO.**

Next step **R18-92** should use the actual independently collected, non-sensitive operator result to evaluate whether the eight-migration narrow prerequisite can enter its own separately authorized controlled test release, or, if credentials remain unavailable, plan genuinely isolated browser/Realtime Auth QA without pretending another synthetic benchmark answers hosted p95.
