# B10-R18-210 — Original vs isolated QA schema readiness and owner authorization gate (NO_GO)

22 November 2026. Exact source-only child of [R209 draft PR #319](https://github.com/xuvenz-source/ttrpgsite/pull/319), final head `e6dcba03171764ba5ba76c7d298821c15e9cd4f2`. R209 dedicated original phase SHA and disposable mid-session revoked-actor PG17 `44923818468` and full staged frontend/lint/build/Edge `44923818494` **2/2 SUCCESS**, source-only unmerged. Do not treat R209 as real signed QA.

## Original and already-provisioned separate QA — current catalog snapshot

The **same SHA-pinned `SELECT` only** `scripts/release/r210_readonly_qa_schema_readiness.sql` was run independently on the **original project** and the already-provisioned **separate QA project**. Only numeric `pg_catalog`/schema counts were returned; no project identifiers, user records, Storage bucket names, object paths, original SQL or private WSL migration source exported to GitHub.

| Read-only count | Original | Separate QA |
|---|---:|---:|
| `public` application base/partitioned tables | 31 | **0** |
| `public` views/materialized views | 0 | 0 |
| `public` stored functions | 112 | **0** |
| `auth`, `storage`, `public` schemas present | Yes | Yes |
| Supabase migration ledger table present | Yes | **No** |

A second **read-only aggregate on QA only** returned **0 Auth users, 0 Storage buckets and 0 Storage objects**. This does **not** prove every other managed schema/configuration is a pristine clone, nor that QA/Auth/Storage integration is functional for signed clients. QA currently **has no application schema** and cannot provide realistic signed DM/P1/P2/removed/outsider gameplay, sheet, fog or Storage security acceptance yet.

## Why installing one existing R104/R115/etc. security patch directly into QA is not safe

The original has 31 public tables and 112 functions, but the isolated QA project has none. An unapplied security patch presupposing `campaign_members`, character sheets, map/fog tables, Storage policies or privileged helpers will not create a complete playable test environment. We must **first review and install an appropriate app schema in isolated QA**, including correct migration dependencies and safe Auth/Storage integrations.

The original **83 historical migration SQL sources are owner-private**, kept only under `$HOME/ttrpg-history-private` Ubuntu WSL. Existing R200/R206 owner-sanitized receipts verify **83/83 file SHA256/chronology** and **11/11 prioritized historical function body matches**, but **do not approve all 83 migration semantics, target effects, role grants, RLS, external endpoints or schema-install safety**. Never upload the 83 SQL files, private review docket, SQL fragments, credentials, Auth users, user JWTs or signed Storage URLs to this chat, GitHub, CI, deployment artifacts or Vercel.

The **next install cannot be blindly `supabase db push` of unreviewed historical SQL.** Review a minimal, dependency-complete, **existing QA only** schema installation sequence in the private local workspace before any changes. Installation may create/modifies private QA `auth` or `storage` policies, extensions and privileged functions, even though the public schema is currently empty. Ensure no impact to original, production, connected logins, active preview deployment or paid infrastructure. A schema baseline and restore plan must be established before any QA mutation.

## Separate, explicit owner approval required

R210 stages **no SQL DDL, no writes and no installer**. Owner's generic *Proceed* does not grant permission to mutate QA. The explicit consent request is:

> **Do you authorize preparing and, after a strict private 83-migration semantic preflight, installing a reviewed, minimal application schema into the already-existing separate Tabletop Forge QA Supabase project only, using exclusively verified $0 resources, with no mutations to original/production, no merge/deploy, and keeping all private migration SQL and credentials confined to your Ubuntu WSL workspace?**

If approved, follow the incremental engineering workflow in small, separately reviewable steps. First conduct the private preflight and prepare an exact QA-only installation/rollback plan **without writing SQL**. After reviewing that plan, confirm the explicit QA-only SQL-write window and owner WSL action before executing any SQL. No delegated production release authorization is implied. If not approved, continue source-only audits and synthetic PG17 tests while signed QA remains blocked.

## Gates after QA schema installation, when separately authorized

1. Verify pre-install QA project identity and 0/$0 status **without** creating paid resources; preserve preinstall catalog and managed-schema baseline, keep credentials local, block production URL/ref.
2. Privately audit all 83 historical original migration bodies/ordering and classify all relevant DDL/storage/auth policies/functions to ensure an appropriate minimal, complete and **isolated** QA schema plan. Never upload bodies or migration names; publish fixed sanitized counts and flags only.
3. Install only reviewed dependencies into existing separate QA through owner-local WSL under an explicitly approved QA-only SQL-change window, verifying checksums and fail-closed target guards; do not deploy app or Edge.
4. Postinstall read-only tables/functions/ACL/RLS/Storage policy and migration ledger integrity comparison, with expected differences documented. QA restored state remains **not** a security GO.
5. Independently authorize representative *real signed* DM/P1/P2/removed/outsider QA against QA-only generated assets and test accounts; verify mid-session revoke, fog, inventory, fresh Storage URLs and already-issued one-hour bearer behavior. Do not use original/production data.
6. Original/production migrations, merges, deploys and new paid resources require **separate explicit approval** only after all tests pass.

## Permanent blocker statement

Until the isolated QA app schema exists and representative signed QA passes, **security release NO_GO** continues for original #212 fog-status oracle, #220 revoked sheet owner, #223 invite rejoin, #229 privileged membership TRUNCATE, #231 signed Storage bearer and #306 authenticated TRUNCATE, all 67 privileged-callable function call-graph semantic reviews and all 83 original private historical migration semantic approvals.

No original/QA SQL writes, Auth/Storage writes, source app/Edge/migration/Vercel changes, PR merges, production deployment, paid infrastructure or private file exports occurred in R210.
