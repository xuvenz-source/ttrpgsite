# B10-R18-195 — Privileged campaign-members TRUNCATE escape, scratch-only defense (NO_GO)

21 November 2026. Exact child of R194 [draft PR #303](https://github.com/xuvenz-source/ttrpgsite/pull/303), source head `01001c8fd2ca0599055fa5aaca02115f7d0132a9`, whose four-job isolated PostgreSQL 17 revocation matrix **and** general repository verification passed (2/2 workflows). No original/QA hosted SQL writes, schema bootstrap, app runtime, versioned migrations, Edge changes, merge, deploy or paid resources.

## Evidence and defect boundary

Read-only catalog of the original `public.campaign_members` confirms `postgres` owner, RLS enabled, `service_role` **effective TRUNCATE TRUE** (and DELETE/UPDATE TRUE), `authenticated` TRUNCATE FALSE and `anon` TRUNCATE FALSE. These are grant/ownership facts only; no hosted table rows or function source bodies were read. The existing R120–R122 **unapplied** membership-revocation prototype relies on per-row DELETE tombstone triggers. PostgreSQL TRUNCATE is not protected by RLS and **does not invoke row-level DELETE triggers**: a privileged bulk clear can erase members while failing to record revocation.

Official PostgreSQL references: [TRUNCATE](https://www.postgresql.org/docs/17/sql-truncate.html), [Row Security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html). The observed privilege alone does **not** establish any hosted service or actor actually used TRUNCATE. It remains an independent **security-policy and administrative-operation audit gate** [issue #229](https://github.com/xuvenz-source/ttrpgsite/issues/229).

## Narrow, explicitly UNAPPLIED candidate

`staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql` is **scratch-only** and not an active migration. It requires the existing R120/121 private revocation prototype and role `service_role`. It:

- `REVOKE TRUNCATE` **only** on `public.campaign_members` from `service_role`, preserving existing ordinary DELETE/INSERT/UPDATE grants;
- adds a private `forge_security.reject_campaign_members_truncate()` `SECURITY DEFINER` function with empty local search_path that always raises SQLSTATE `42501`;
- attaches a `BEFORE TRUNCATE FOR EACH STATEMENT` trigger, so accidental re-grants and table-owner non-bypass invocations also fail closed;
- does **not** change membership rows, invitation codes, private tombstones, RLS policies, SELECT rules, existing JOIN function, or DM membership command code.

A PostgreSQL superuser or table owner able to disable/drop triggers can bypass the second layer; this is **not** a claim of protection against deliberate privileged administrators. In a real operation `service_role` must first be audited for required admin/cleanup functionality; denial might break legitimate table-reset maintenance. Service-role policy and safe recovery must be separately reviewed before any forward-only migration is written or installed.

## Standalone isolated PostgreSQL 17 proof

The new R195 GitHub Actions scratch runner pins loopback `127.0.0.1`, PostgreSQL 17, a scratch-only role/database/password, `GITHUB_ACTIONS` marker, and forbids Supabase/hosted connection overrides. It loads the unchanged representative R120 fixture (not original private SQL or real users), provisions **synthetic** `service_role BYPASSRLS` with the same effective TRUNCATE privilege, and verifies:

1. Before the candidate, `service_role` TRUNCATE succeeds within a transaction, empties synthetic campaign members, leaves DELETE tombstone ledger unchanged, and is **rolled back** (original fixture survives).
2. After the candidate, service-role TRUNCATE permission is absent; DELETE/INSERT/UPDATE permissions remain granted; attempted TRUNCATE is denied for expected SQLSTATE.
3. A simulated **accidental TRUNCATE re-grant** still fails at the statement trigger; the original table owner is also rejected; no membership rows/tombstones are corrupted.
4. The unchanged R120 synthetic 35-scenario DM remove/leave/reinstate/invite and ACL contract is rerun after the guard to catch collateral damage.
5. New source-only hostile tests reject modified candidate/runner Git blobs, false live grant snapshots, release-approval escalation and misleading permission states.

This is a **synthetic test**, not a signed Supabase Auth test, not an original 83-history replay and not permission to install the SQL in QA or production.

## Remaining release gates

Issue #229 still requires inventory of every service/admin TRUNCATE or membership writer (including Dashboard/manual integrations), safe migration and rollback review, current grants/RLS/role membership analysis and independently signed QA. Issue #223 (old invite rejoin), #220 (removed sheet-owner privileges), #231 (already-issued signed Storage bearer links) and #212 (live fog status) remain open. All **83 original migration semantic** reviews, **67 live privileged call chains**, cross-account signed DM/P1/P2/removed/outsider QA, QA installation and owner production approval remain **NO_GO**.

R195 requires no new private owner WSL upload; it is based on earlier sanitized receipts and fresh **read-only** original catalog privileges. No original/QA data changes, live runtime code, versioned migrations, merges, Vercel deployment or paid infrastructure.
