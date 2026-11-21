# B10-R18-196 — exact grant provenance, foreign-key cascade and tombstone integrity (NO_GO)

21 November 2026. Exact source-only child of [R195 draft PR #304](https://github.com/xuvenz-source/ttrpgsite/pull/304), pinned SHA `0b12a69936fce26941f1c06a28100e0b192ebab7`. R195 two GitHub workflows passed on that head: isolated PG17 source-matched synthetic TRUNCATE bypass/guard and full repository lint/test/build/Edge checks. **No original/QA SQL writes, live runtime changes, active migrations, merges, deployments or paid resources.**

## Privilege provenance, independently inspected read-only in original project

A reproducible `SELECT` over PostgreSQL 17 system catalogues (`pg_class`, `aclexplode`, `pg_roles`, `pg_has_role`, `pg_constraint`, `pg_trigger`, `pg_proc`) is stored at `scripts/release/r196_readonly_membership_truncate_provenance.sql`. It returns **only numeric counts and fixed booleans**. No original SQL bodies, private migration filenames, Auth identities, campaign/member records, invite codes or credentials are exported.

| Original live finding (21 Nov 2026) | Value |
|---|---:|
| `public.campaign_members` table; RLS enabled | 1 / true |
| `service_role` superuser / BYPASSRLS / inherits roles | false / true / true |
| `service_role` inherits owner privileges | false |
| **Direct service-role TRUNCATE ACL entries** | **1** |
| TRUNCATE via PUBLIC / inherited role | **0 / 0** |
| TRUNCATE grant options | 0 |
| Enabled user-defined TRUNCATE / DELETE triggers | **0 / 0** |
| **Incoming foreign-key relationships** into membership table | **2** |
| Incoming dependent tables with effective service-role TRUNCATE | **2/2** |
| Installed functions scanned in relevant original schemas | 142 |
| Functions with a literal `TRUNCATE` word | 0 |
| Functions with literal `campaign_members` word | 22 |

**Interpretation:** because the single effective TRUNCATE privilege is directly granted to `service_role`, and no `PUBLIC`, inherited or owner privileges can supply it, the narrowly scoped `REVOKE TRUNCATE ON public.campaign_members FROM service_role` from R195 is *expected* to remove the privilege on the observed graph. This has not been executed against original or QA. The query does **not** discover external admin scripts, dynamically executed SQL or Auth/provider internal operations. User confirms they have not knowingly configured independent membership-clearing scripts; that is useful but not independently verified global coverage.

Two incoming FKs constrain ordinary `TRUNCATE campaign_members` without CASCADE, but do not eliminate the risk of authorized `TRUNCATE campaign_members CASCADE` clearing membership and dependent data. PostgreSQL [17 TRUNCATE documentation](https://www.postgresql.org/docs/17/sql-truncate.html) confirms that `TRUNCATE` does not fire row-level `ON DELETE` triggers, does fire `ON TRUNCATE` triggers, requires `TRUNCATE` privileges, and may cascade to referencing tables. [REVOKE documentation](https://www.postgresql.org/docs/17/sql-revoke.html) explains direct, PUBLIC and inherited privilege composition. **Neither RLS nor a row-level DELETE tombstone is sufficient against authorized TRUNCATE.**

## R196 source-only isolated PostgreSQL 17 matrix

`tests/world-v2-r18-196-postgres/run.sh` uses only the existing synthetic R120 membership/DM prototype and exact frozen R195 **UNAPPLIED** TRUNCATE guard. It runs exclusively on a disposable PostgreSQL 17 GitHub service with `127.0.0.1`, a unique scratch DB/user/password, explicit `GITHUB_ACTIONS`/isolation marker and hard rejection of hosted connection overrides. Creates exactly **two invented** inbound-FK tables; does not copy original schema or user data.

1. Verify non-CASCADE `TRUNCATE` fails because of incoming FK constraints, even though the simulated service role has the privilege.
2. Verify `TRUNCATE campaign_members CASCADE` can clear synthetic memberships and both synthetic dependent tables **without** creating per-row DELETE tombstones. Run in a transaction with immediate `ROLLBACK` and verify all invented rows survived.
3. Apply existing R195 candidate **only** to scratch PG17 and verify service-role TRUNCATE is revoked; direct CASCADE rejected by privilege.
4. Temporarily regrant TRUNCATE and verify R195 `BEFORE TRUNCATE FOR EACH STATEMENT` trigger rejects service-role direct CASCADE. Verify table-owner `TRUNCATE campaigns CASCADE` (which cascades *into* membership) and table-owner direct CASCADE also fail closed.
5. Verify no synthetic rows/tombstones were lost; rerun the unchanged **35-case** R120 synthetic DM removal, voluntary leave, explicit reinstatement and stale invitation rejection contract with both inbound FKs present.
6. Fail-closed unit tests deny changed role/ACL counts, altered Git source blobs, missing cascade coverage, unsafe approval escalation and any hosted changes.

All source and test evidence is fixed by Git blob SHA-1 in the R196 manifest. Passing tests are **representative synthetic checks**, not source-exact original invitation SQL tests and not real signed Supabase Auth tests.

## Limitations and mandatory gates

R195/196 prototype is not a production migration. No current installed trigger, revocation ledger or member-removal UI has been activated. Table owners or database superusers may change or disable triggers. The exact live application removal/invite/admin and service-role operational paths remain incompletely reviewed; no absence of external usage is asserted from limited function text search. A future migration must be forward-only, independently reviewed, deployed only after isolated QA-specific authorization, and include restoration/recovery and real signed DM/P1/P2/revoked/outsider tests. The two inbound FK tables in this regression are **synthetic stand-ins**, not original historical schema.

Issues [#229](https://github.com/xuvenz-source/ttrpgsite/issues/229), [#223](https://github.com/xuvenz-source/ttrpgsite/issues/223), [#220](https://github.com/xuvenz-source/ttrpgsite/issues/220), [#231](https://github.com/xuvenz-source/ttrpgsite/issues/231) and [#212](https://github.com/xuvenz-source/ttrpgsite/issues/212) remain release-blocking. All 83 private migration semantic reviews, 67 privileged function authorization graphs, signed multi-account QA, original/QA SQL approvals and production release remain **NO_GO**.
