# B10-R18-148 — Privileged campaign membership deny guards (scratch-only)

21 November 2026. Exact green source parent R18-147 draft PR #255, commit 471a7b2349e98477909ab67143e272f98f9ef548. **NO_GO for production and hosted QA.**

## Fresh original read-only metadata

A read-only query against original TTRPG Site confirmed: owner of public.campaign_members is postgres, service_role inherits no parent roles, has BYPASSRLS and effective INSERT/UPDATE/DELETE/TRUNCATE privileges, authenticated has no TRUNCATE privilege, and zero non-internal membership triggers are installed. No user rows, credentials, invitation values or SQL function bodies were queried or exported. Prior R146 snapshot recorded original **83** migrations and QA **0** migrations and **0** application tables; those counts were not reattested here.

PostgreSQL 17 documents that TRUNCATE skips row-level DELETE triggers, executes statement-level TRUNCATE triggers, and takes ACCESS EXCLUSIVE locks. R120 deletion tombstones alone cannot protect against privileged table clearing. A temporary deny trigger is defense in depth, not a substitute for removing the underlying privilege.

## Proposed isolated candidate (not an applied migration)

1. Inherit the R120/R121 private tombstone/DM remove/reinstate and R122 membership identity-key UPDATE guard unchanged.
2. In a fictional PostgreSQL17 database only, REVOKE TRUNCATE from service_role/browser roles; add a BEFORE TRUNCATE FOR EACH STATEMENT trigger that denies SQLSTATE 42501.
3. Add a narrowly scoped BEFORE UPDATE OF role trigger to reject real role changes, including privileged promotion and DM demotion. No-op updates preserve membership; a separate trusted role-transfer contract is still necessary.
4. Test that legitimate DM player removal writes a tombstone, unchanged invite rejoin remains denied, and the existing DM membership is unaffected.
5. **Negative control:** test then ROLLBACK a privileged service_role INSERT of a never-revoked identity directly with role='dm'. This is expected to succeed and is a separately unresolved escalation path. Blanket banning DM INSERT without examining create_campaign could break campaign creation.

This isolated database models R120/R122 but does **not** load the original 83 historical migrations or exact original join_campaign SQL. The service_role is invented to model current grants; owner postgres could still disable a trigger. External admin, Dashboard and service jobs are unaudited, and applying privilege changes in the hosted project is not authorized.

## Release boundary

No hosted SQL, zero runtime src/ edits, versioned migrations, broad GRANT, merge, deployment or paid infrastructure. Outstanding: issue #220 legacy revoked-owner RPC, #223 original rejoin, #229 privileged INSERT/admin and other membership paths, #231 existing 3600-second Storage bearer URLs, old joined Realtime sockets / 17 published tables / 19 listeners, original 67 privileged RPC inventory, signed DM/P1/P2/outsider/revoked/rejoined QA, free-tier DDL locking and latency, historical semantic review, R127 human approval.

### Handoff

The R18-148 result can demonstrate only fictional PostgreSQL17 controls and intentionally preserve the new-DM privileged INSERT bypass. Next proposed R18-149: review all privileged DM creation, role transfer, admin and Auth-cascade paths; specify a safe real-role authorization contract before any forward-only migration.

Sources: https://www.postgresql.org/docs/17/sql-truncate.html and https://www.postgresql.org/docs/17/sql-createtrigger.html
