# B10-R18-97 — Exact historical QA schema bootstrap preflight (NO SQL)

**16 November 2026 · source-only stage · Direct parent R18-96 [PR #198](https://github.com/xuvenz-source/ttrpgsite/pull/198), exact head `5d51d1b1e64179a0a4944e54e06b68cd6db900ea`.**

This work package establishes a *negative* release gate. The independent Supabase **Tabletop Forge QA** project (`bgydsamxypjslergfpla`) remains healthy with **0 migrations and 0 public application tables**. Existing Supabase `lwhwgqaunxbmvyndswze` is healthy, with **83 registered versions**, latest `20261109171247`. **No migrations, DDL/DML, OAuth, production campaign, QA frontend or deployment were changed.**

## Actual source and provider findings

1. Read-only `SELECT` on production migration history returned **83/83 matching version/name/statement-count/SQL-body MD5** compared with the **frozen R18-08** content-hash snapshot. This is *metadata parity*, not possession or execution of the 83 original SQL bodies. No historical SQL text or user data was requested.
2. The exact R18-96 repository root `supabase/migrations/` contains **62 .sql files**, **56** with conventional 14-digit version names and **six** names with only an eight-digit prefix (`20261106_*`). The timestamp **`20261109000500` appears twice**, making a naïve root replay ambiguous.
3. Only **20/83 historical versions** have a same-version root file; **63 historical versions are absent** from the root. Among the 56 conventional root files, **36** do not match a registered historical version. Version-matched filenames are **not** proof of identical SQL bodies; do not count these 20 as independently trusted source.
4. The **eight** separately pending narrow changes are original R05 (`20261111023204_world_v2_b10_integrated_motion.sql`) plus the **seven** R18-48 stage-only migrations, held under `staging/world-v2-b10-r18-48-narrow-pending/supabase/migrations/`. R18-26/27 were excluded; optional R18-57/R77 remain uninstalled.
5. **The root directory cannot be a safe source of truth for a new QA schema.** An ordinary root `supabase db push`, a bulk merge, `db reset`, `migration repair`, `--include-all`, or any attempt to mark missing historical versions as applied would break the audit chain.

## Reviewed next-gate procedure — not executed in R18-97

**Gate A: privately recover exact historical source.** Use a *disjoint, private and throwaway* local workspace, the original **pinned Supabase CLI v2.81.3** and explicit project identity **`lwhwgqaunxbmvyndswze`** to `migration fetch` only, following source-bound R18-49/R50/R51 protocols. The original R49/R51 validators are **hard-coded to production** and must never be silently repointed to QA. They establish *source provenance only*. Keep SQL text and credentials outside Git, CI logs and chat; record only bounded digests. Audit for historical statements that refer to production project refs, stored user records, account IDs, OAuth secrets, seed data, storage buckets/policies, realtime publications, extensions or privileged functions.

**Gate B: independently validate a QA-only SQL ordering and non-destructive dry run.** After all 83 historical SQL bodies are recovered and matched to the original read-only R18-08 digests, prepare an **83-file-only** isolated workspace. A *new, separately reviewed* QA-aware validator must hard-pin the new `bgydsamxypjslergfpla` target, verify an empty QA migration history, disable seeds and reject production overrides, and prove that the intended dry-run does not use the production R49/R51 target. Run all source-real Postgres 17 tests and review a rollback/inverse for nontransactional operations. A `--dry-run` is not permission to apply SQL; no database write in this package.

**Gate C: review any QA-only installation separately.** Require a specific release decision before applying **original 83 history** to QA. Check permissions, RLS, ACLs, SECURITY DEFINER and search paths, default EXECUTE grants, Realtime auth, Storage, Auth redirect rules, and production identity isolation. Do **not** copy live player data or reuse provider credentials. Independently review the **8 pending** R05/R48 migrations and optional R57/R77 candidate in later work packages; do not combine them with the historical bootstrap.

**Gate D: establish a functional QA frontend only after QA schema and Auth are proven.** The separate unlinked Vercel `tabletop-forge-qa` project remains undeployed. No changes to existing `ttrpgsite` env or permanent preview alias. True signed DM/P1/passive P2 movement/fog/LOS revocation, collision and hosted p95/free-tier RAM/locks still require independent acceptance.

## R18-97 receipt and guard

`staging/world-v2-b10-r18-97-qa-schema-preflight/manifest.json` contains only public project IDs and migration metadata counts, plus **false** readiness flags. `scripts/release/validate-world-v2-r18-97-qa-bootstrap.mjs` independently validates the frozen 83 metadata rows, the current root directory shape, original R18-48 pending source seal, and the unchanged R18-96 provisioning identity. **Always `NO_GO`.** The read-only database results cannot be authenticated from a static file alone; repeat them immediately before any later approved QA-only migration operation. No server secrets, raw SQL bodies or production data may be committed.

**Engineering package acceptance is source-only CI green.** The release remains **NO_GO** until future gated source recovery, QA-specific dry-run, rollback and signed-hosted verification are all completed.