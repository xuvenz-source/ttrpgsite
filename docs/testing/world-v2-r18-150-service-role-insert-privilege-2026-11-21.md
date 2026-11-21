# B10-R18-150 — Least privilege on direct service-role membership INSERT

21 November 2026. Strict child of green R18-149 draft PR #257 at 1fb7ad406ca421b51eaaa24656a0a5b6ea6550b5. Production and hosted QA **NO_GO**.

## Why this is a narrower proposal

The original service_role has effective INSERT on public.campaign_members and BYPASSRLS. R120/R121 tombstone guard and R148 role UPDATE guard do not prevent a new unrevoked ID from being directly inserted as DM. R149 proved that checking the campaign owner is not enough if a privileged writer can also update campaigns.owner_id.

But the original direct SQL writer routines create_campaign (owner DM bootstrap) and join_campaign (player invitation) are postgres-owned SECURITY DEFINER functions. This proposed **unapplied conditional** REVOKE INSERT ON TABLE public.campaign_members FROM service_role may deny direct privileged table INSERT while retaining trusted owner-executed functions. It would not broaden browser table access.

This is not an approved production patch. Direct service-role insert may be required by legitimate external administrators, migrations and maintenance scripts; this must be reviewed independently before any hosted change. The service_role secret must never be sent to the browser.

## Disposable PostgreSQL17 model

The test inherits fictional R120 revocation, R122 identity-key protection and R148 TRUNCATE/role-change denial. It proves the original-like service-role direct DM INSERT is possible before REVOKE, rolls that transaction back, applies R150 REVOKE only in the disposable database, and checks direct service_role DM/player INSERT and browser INSERT denial.

The fictional postgres-owned SECURITY DEFINER create_campaign function must still create the owner's new DM membership. Synthetic R120 join_campaign must still add a player. DM remove must preserve tombstones and an unchanged invitation must not restore a DM-removed member.

These are invented sessions and SQL functions, not original private 83-migration SQL, real signed Supabase Auth or a trusted service-role integration audit. Role service_role remains a privileged backend authority and an owner could change grants.

Original 83 migrations and QA 0 migrations/0 public application tables are carried from R146 read-only attestation, not newly measured.

## Remaining mandatory NO_GO

Issues #220 revoked character-sheet owner RPC, #223 original invite rejoin, #229 privileged administration and membership mutation, and #231 3600-second issued Storage bearer URLs remain open. Original 67 authenticated-executable privileged functions need complete transitive review, alongside 17 Realtime publications, 19 old listeners, old joined sockets, historical migrations, free-tier DDL costs, genuine DM/P1/P2/outsider/revoked/rejoined signed QA and R127 human release.

No original or QA SQL, runtime src/ change, versioned migration, broad GRANT, deployment, merge or paid infrastructure.

**Next R18-151:** reconcile the real admin/membership writer call graph before proposing any forward migration. An independent reviewer and signed QA remain mandatory.
