# B10-R18-151 — Tracked campaign membership writer boundary and operator handoff

21 November 2026. Strict draft child of green R18-150 PR #258, parent head f64183ad583e1712fb96c249b3e790995df77754. Source-only **NO_GO**.

## Verified tracked source scope

GitHub read-only recursive tree contained 1,368 entries, not truncated. We scanned all 56 tracked scripts/release scripts and Supabase Edge JS/TS/SH files on frozen R149 source commit 1fb7ad406ca421b51eaaa24656a0a5b6ea6550b5 (51 scripts, 5 Edge files). The exact literal .from('campaign_members') followed by insert/update/upsert/delete within the inspected chain was not found. Membership text appeared in the R118 private source inspection script and R119 offline invitation fixture; these are not evidence of a deployed membership writer. Some script/Edge files contain service_role/secret-key terms, but no literal direct member table mutations were found. No credentials or user data were collected.

The two previously identified runtime files were separately rechecked: src/TabletopApp.jsx has three membership references, all SELECT; src/PersonalTokenLibrary.jsx has one membership SELECT. R121 previously inspected 174 application/Edge JS/TS files and found no direct membership write; the currently pinned runtime source and migrations are unchanged by the R147-R151 stack. We did NOT independently re-download all 169 src files in R151, and this result is a bounded lexical scan, not a complete dynamic alias/transitive execution audit.

Important limitations: we cannot confirm external integrations, local operator scripts not checked into Git, Dashboard SQL, database administrative writes, backups/restore, production-deployed Edge code parity, Auth-user deletion cascades, dynamic SQL and service_role direct writes via aliases. A service_role key is a trusted server credential; it is not an ordinary authenticated browser token.

## What R150 can and cannot prove

R150's synthetic PostgreSQL17 candidate REVOKE INSERT on public.campaign_members FROM service_role passed tests that fictional postgres-owned SECURITY DEFINER campaign creation, player joining and DM removal still work. This is NOT approval to revoke original or QA grants; an operator must independently confirm that service_role direct membership INSERT is not used by trusted external jobs before changing privileges. An ordinary browser has no direct member INSERT grant already.

Original 83 private migrations semantic review is still outstanding. QA has 0 migrations / 0 public application tables according to R146 (not reattested this step). Historical SQL compatibility with this candidate was NOT tested. Original 67 authenticated-executable SECURITY DEFINER functions, 17 public Realtime tables/19 listeners and old socket sessions, preissued 3600-second Storage bearer URLs, R127 human signoff and genuine signed DM/P1/P2/outsider/revoked/rejoined QA are still unverified.

## Manual operator action needed before R18-152 release migration consideration

1. In your private local workspace, independently review the 83 historical migration files and report sanitized semantic approval or the unresolved blockers. Do not upload migration SQL source, credentials, invitation codes or real user rows.
2. Confirm whether any OUT-OF-REPOSITORY external tool, server, Supabase Dashboard SQL, maintenance job, backup/restore or third-party integration uses service_role to INSERT into public.campaign_members or otherwise directly mutates its identity/role. Report only the workflow names and whether INSERT is required; do not provide secrets.
3. Signed QA DM/P1/P2/outsider/revoked/rejoined testing and R127 human release approval are later gates, and require separately authorized QA bootstrap and SQL history review first. Do not touch original or QA to expedite this.

Security issues #220/#223/#229/#231 remain open. **Production NO_GO**. No original or QA SQL, versioned migration, browser grants, runtime src edits, merge, deployment or paid resource in R151.

Next R18-152 is blocked from any hosted grant change until the above private review and explicit QA migration authorization. Source-only security work may continue separately, but cannot certify release.
