# B10-R18-113 — Source-exact DM-only NPC reader, disposable PostgreSQL 17 authorization test

**18 November 2026. Draft-only, no hosted database writes and no release approval.** Direct parent: R18-112 PR #215 SHA `47dace25fba4b8d0c8a79d48971d0e71d038799a`. The original has 83 migration history entries; the separate QA project has zero and no application tables.

## Why this test exists

R18-112 traced `public.get_dm_map_npc_values(uuid)` to an indirect `public.is_campaign_dm` authorization helper. The NPC reader's 263-byte function body in repository `supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql` **exactly matched live original** in prior R18-103 SHA-256 read-only parity: `5e5c0657353a54f4812ee5b547e4575bf666f2e8c72a3fe1b6918cfff8293de5`. A textual helper reference is not proof that cross-campaign NPC data is restricted.

This work package executes **only that source-verified Git function** in a **new disposable local PostgreSQL 17 container within GitHub Actions**. It does not execute any of the private 83 original migration files and does not link to Supabase.

## Real source under synthetic claims

`tests/world-v2-r18-113-postgres/extract_npc_source.py` extracts the original SQL function from the verified Git migration and fails closed unless body SHA-256, exact length, prior parity receipt and function identity match. It writes a temporary SQL fixture only to a scratch directory in the isolated CI runner.

The fixture `schema.sql` creates synthetic `auth.uid()`, `is_campaign_dm`, campaign membership, maps and token tables. The **DM helper is synthetic, not an exact live-helper implementation**, and the JWT claim comes from an operator-simulated session setting, not a cryptographically signed Supabase Auth session. No production users, data or tokens are involved. Both roles are simulated real PostgreSQL roles. The `map_tokens` table has RLS enabled and no direct `SELECT` grant to `authenticated`; the source-exact NPC RPC is `SECURITY DEFINER`.

`verify-npc-access.sql` asserts all 10 synthetic scenarios fail closed or return exact authorized token identifiers and dummy private payloads:

- Campaign A DM receives only the two campaign-A NPCs. Same map's PC token and a deliberately cross-campaign-inconsistent token are excluded.
- Campaign A player, cross-campaign DM, outsider, null identity, and unknown map receive **no NPC values**.
- Campaign B DM receives only campaign-B NPC data, not campaign A's.
- Newly granted DM receives campaign-A NPC values; after membership deletion the **same actor** receives none.
- Two additional real role-level checks: `anon` cannot execute the public NPC RPC and `authenticated` cannot query `public.map_tokens.npc_values` directly.

## Guardrails and execution

The separate workflow `.github/workflows/world-v2-r18-113-isolated-npc.yml` is triggered by exact R113 staging branch changes and PRs targeting R112. It uses an isolated `postgres:17` service with a disposable fixed CI-only credential, no Supabase secrets or tokens, `contents: read` permission and an execution timeout. The test shell script requires GitHub Actions, an explicit local isolation marker, loopback `127.0.0.1`, exact scratch DB name and user, expected ephemeral password, no alternative database connection environment variables and PostgreSQL 17. It never exports SQL source or campaign data to other services.

Use CI workflow success as evidence **only of the isolated fixture**, not hosted Auth acceptance. All assertions are checked with PostgreSQL execution, not just grep against source code. No local Ubuntu manual action is needed for this stage.

## Remaining blockers

A pass cannot certify the source-exact live `is_campaign_dm` helper, live Supabase signed tokens, other 66 exposed privileged RPCs, Auth/Storage/Realtime historical migration replay, or the known cross-campaign fog-status metadata leak. The separate 83-file private SQL semantic audit from R18-111 is still pending. Real signed DM/P1/P2/outsider QA tests cannot proceed until independent source attestation, safe QA bootstrap and authorized reviewed schema installation.

**Original database: unchanged. QA: unchanged. SQL installation and production deployment: NO_GO. No paid resources or merges.**
