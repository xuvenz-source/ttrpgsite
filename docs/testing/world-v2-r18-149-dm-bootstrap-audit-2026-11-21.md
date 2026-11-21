# B10-R18-149 — Original DM bootstrap / privileged membership INSERT source audit

21 November 2026. Source-only child of R18-148 [draft PR #256](https://github.com/xuvenz-source/ttrpgsite/pull/256), exact commit `0355eb7d2523261f3a509254a7acd401c7f181d5`. Production, original and hosted QA **NO_GO**.

## Fresh read-only original PostgreSQL inventory (no user rows or private SQL exported)

- Across 145 public/forge_world_v2 functions: 109 SECURITY DEFINER functions; 67 are executable by authenticated. This is **not** an exhaustive transitive/security audit of those 67 functions.
- Two SEC DEFINER SQL bodies contain direct INSERT into public.campaign_members: `public.create_campaign(p_name text)` and `public.join_campaign(p_invite_code text)`; both callable by authenticated and service_role. Neither original body was exported. Private-body SHA-256 and length match previously independently attested R118/R119 values.
- Exact source markers: create_campaign reads auth.uid, refers to campaigns.owner_id and inserts role 'dm'; join_campaign reads auth.uid and inserts role 'player'. Direct SQL string scans find zero SECURITY DEFINER direct membership UPDATE/DELETE/TRUNCATE among the inspected schemas, **not** proof that privileged clients, indirect calls, dynamic SQL or admin scripts don't change membership.
- `campaign_members` has role CHECK `dm|player`, foreign keys to campaigns and auth.users with ON DELETE CASCADE. Real R120/R121 synthetic cascade tests must remain compatible.
- Original public.campaigns.owner_id is required UUID. service_role **and authenticated** hold UPDATE privilege on this column; RLS is enabled, and an authenticated campaign UPDATE policy exists, so the column grant alone does **not** prove an authenticated outsider can update someone else's owner_id. service_role bypasses RLS. Existing campaign triggers concern map validation/publication, not a dedicated owner_id immutability guard.
- Ordinary authenticated has no direct campaign_members INSERT/UPDATE privilege. This privilege gap is **not evidence of an anonymous/browser DM escalation**. It concerns service/admin credential control and trusted privileged writers.

## Isolated PG17 negative-control experiment

A disposable fictional setup uses structural markers only, not the exact original 83 SQL migrations. It creates a **deliberately insufficient** owner-matching DM INSERT trigger and a fictional SECURITY DEFINER create_campaign route. It must demonstrate three results:

1. Legitimate owner creates a campaign and initial DM membership — succeeds. Generic invitation still joins as player.
2. Unmatched service_role direct DM INSERT is rejected by the simplistic owner test.
3. service_role with campaigns.owner_id UPDATE can change owner first and then INSERT its chosen DM. The transaction is rolled back; a simple owner-match guard cannot be released as a complete fix.

This experiment is **not** a recommended migration. It is a counterexample used to avoid a misleading "DM insert solved" security claim. A more comprehensive contract needs verified owner_id immutability, trusted creator/admin workflows, explicit future co-DM and transfer policy, service-role credential restrictions, auditability and exact original code integration. PostgreSQL owners and service_role remain privileged trusted authorities; triggers do not make an untrusted service key safe.

## No-GO and next handoff

No hosted SQL, source `src/` changes, versioned migration, browser API GRANT, deployment, merge or paid infrastructure. Original 83 migrations and QA 0 migrations / 0 application tables were last recorded in R146 (not rechecked here). Existing issues #220 revoked character ownership, #223 unchanged invite rejoin, #229 membership privileged mutation and #231 issued 3600-second Storage signed URL remain open. Old joined Realtime sockets, original 67 privilege call chains, signed DM/P1/P2/outsider/revoked/rejoined QA, R127 human approval and free-tier performance remain **NO_GO**.

R18-150 should define an auditable owner/DM lifecycle and server-only privileged write boundaries; a product/security reviewer must approve how co-DMs, owner transfers and trusted administrator actions work before any hosted migration.

Source snapshot: `staging/world-v2-b10-r18-149-dm-bootstrap-audit/original-function-inventory.json` (safe boolean and SHA metadata only).
