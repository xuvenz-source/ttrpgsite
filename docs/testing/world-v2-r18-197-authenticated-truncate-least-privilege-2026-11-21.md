# B10-R18-197 — Five public tables with direct authenticated TRUNCATE grants (NO_GO)

21 November 2026. Exact child of R196 [draft PR #305](https://github.com/xuvenz-source/ttrpgsite/pull/305) head `d22674818b05ae1f40f0439e1f2be7a954c611fb`. Its dedicated two-inbound-FK PostgreSQL17 CASCADE regression and general repository source/build/security verification both succeeded. New separate release blocker: [issue #306](https://github.com/xuvenz-source/ttrpgsite/issues/306).

## Fresh original database read-only evidence

A `SELECT` over original Supabase PostgreSQL 17's `pg_catalog`, with no table rows or function SQL exported, established:

| Evidence | Count |
|---|---:|
| Public application tables | 31 |
| Public tables with effective authenticated TRUNCATE | **5** |
| Direct TRUNCATE grants to authenticated on those five | **5** |
| PUBLIC, inherited or table-owner alternate TRUNCATE paths | 0 |
| All five RLS-enabled, postgres-owned, schema usable | **5** |
| All five retain SELECT/INSERT/UPDATE/DELETE grants to authenticated | **5** each |
| Authenticated superuser / BYPASSRLS | false / false |
| Anon effective TRUNCATE on any public table | 0 |
| service_role effective TRUNCATE on public tables | 31 |

The five **public, nonsecret table identifiers**, independently confirmed without reading any contents, are:

- `public.campaign_map_views`
- `public.campaign_player_maps`
- `public.map_environments`
- `public.tabletop_macros`
- `public.tabletop_menu_preferences`

The first two are also foreign-key dependants of `public.campaign_members`. All five direct authenticated TRUNCATE grants were made by `postgres`, without a grant option. `authenticated` inherits neither table ownership nor another TRUNCATE-granting role for these objects; there are no PUBLIC alternative grants.

**PostgreSQL RLS does not restrict TRUNCATE**; the table-level privilege controls it ([PG17 row security documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [PG17 TRUNCATE](https://www.postgresql.org/docs/17/sql-truncate.html)). However, an ordinary website user cannot be assumed to possess a generic arbitrary-SQL interface. The standard Supabase Data API exposes table CRUD operations and RPCs, not an arbitrary SQL console, and no signed user exploit has been observed. The risk is an overbroad **database role privilege** potentially reachable through SQL-capable integrations or injection; independent reachability review is still required. **Do not conflate a database GRANT with proof of a remote web attack.**

## Source-only defensive candidate (UNAPPLIED)

`staging/world-v2-b10-r18-197-authenticated-truncate/unapplied-five-table-revoke.sql` contains only a transactional **REVOKE TRUNCATE** from `authenticated` on the five exact listed public tables. It does not alter `service_role` grants, RLS policies, table contents, default schema privileges, frontend code, migrations or Edge Functions. It then checks effective `has_table_privilege('authenticated', …, 'TRUNCATE')` against all five and **fails/rolls back** if any residual grant path (e.g. future inherited role or PUBLIC grant) keeps TRUNCATE effective.

Before any hosted install, inventory ordinary client methods, RPC wrappers, Edge/server roles and separate administrative scripts. The owner reports no separately configured bulk-clear process, but this does not establish absence of hidden integrations. A future release must be forward-only, reviewed against all 83 original private migration semantics and all 67 live privileged functions, and deployed exclusively to verified isolated QA with separate explicit authorization. Never insert this SQL directly into the original database.

## Isolated PostgreSQL17 verification

The new GitHub Actions runner uses a **disposable loopback-only** PG17 database with explicit isolation marker, scratch credentials and forbidden hosted connection overrides. It creates five invented table bodies using the same **public names only** and exactly two invented FK relationships to a synthetic membership row. No actual original SQL, invite, user record, configuration secret, production data or historical private migration enters CI.

1. Create five RLS-enabled public tables with one **invented** row each, explicit SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants to synthetic authenticated and service roles, and anon denied. Check authenticated SELECT reads zero rows because default-deny RLS, even though the role has table permissions.
2. Run `TRUNCATE` as **real PostgreSQL `SET ROLE authenticated`**, confirm all five invented rows disappear despite RLS; immediately **ROLLBACK** and verify the original invented rows are preserved.
3. Apply the exact staged REVOKE candidate **only to scratch PG17**; verify authenticated TRUNCATE loses effective permission and real attempts fail with SQLSTATE 42501 on all five.
4. Verify SELECT, INSERT, UPDATE and DELETE **grants** remain unchanged (their effective data access is still governed by RLS), and service_role TRUNCATE remains unchanged.
5. Add a temporary inherited group granted TRUNCATE to one table, make authenticated inherit it, and prove candidate's postcondition **fails closed** rather than silently ignoring an alternate grant. Remove the inherited role after test.
6. Source-only hostile tests reject changed SHA-pinned candidate/runner, changed table target list, changing ACL counts, premature web exploit/security approval claims, unknown JSON fields and unauthorized hosted actions.

## Remaining gates

The new issue #306 and existing #229 (`service_role` membership TRUNCATE) both remain **hosted unfixed**. Additional blockers #223 (unchanged invite rejoin), #220 (revoked sheet-owner permissions), #231 (signed Storage URL bearers), and #212 (fog-status metadata) remain separate. All **83 private historical SQL semantic reviews**, **67 live privileged RPC call-chain reviews**, real signed DM/P1/P2/removed/outsider acceptance, QA SQL and production authorization remain **NO_GO**.

**Strict boundaries:** This PR is only staging, synthetic testing and documentation. No original/QA database write, app runtime or Edge changes, active migrations, PR merges, deployments or paid resources. No owner WSL manual run required for this step.
