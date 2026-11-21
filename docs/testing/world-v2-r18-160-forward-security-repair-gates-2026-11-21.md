# B10-R18-160 — Reconcile forward security repair prerequisites (source only)

21 November 2026. Exact parent R18-159 draft PR #267 commit `ddf48efc2a53a26aeab033799e4f52898fbb3343`. **NO_GO**. This package neither installs a migration nor edits live application code.

## Existing candidate decisions

- **Issue #220 / PR #219:** reuse the existing `can_edit_campaign_sheet` current-membership guard. The revoked assigned character owner is source-confirmed vulnerable in the original and denied only in disposable PG17 after the candidate. Do not create a duplicate repair. Preserve the direct EXECUTE revocations and review every dependent privileged wrapper.
- **Issue #212 / PR #206 (PG17 proof #207):** reuse the `is_map_fog_published` guard that binds fog rules to an authorized campaign map through `can_view_campaign_map`. Do not substitute an unauthenticated or unscoped policy; re-evaluate the historical combat roster's RLS consumer when the actual QA schema exists.
- **Issue #223 / PR #226 (R120):** the proposed removed-member tombstone and DM-only reinstatement is a **product-policy proposal**, not a complete integration. The originally sourced `join_campaign` has previously been shown in a source-exact synthetic test to rejoin through an unchanged generic invite. Do not silently approve old-invite rejoin.
- **Issue #229 / PR #228 (R122):** source-only identity-key UPDATE guard is useful but insufficient. Hosted service-role TRUNCATE bypasses row DELETE triggers; role-only UPDATE, admin/service-role paths, Auth cascade, ownership and transfer routines require review before combining with tombstones.
- **Issue #231 / PR #230 (R123):** the client-side sentinel, unmount barrier and ordered cache clearing remain dormant. A previously issued 3,600-second signed Storage URL is an independent bearer-access issue; client clearing and no reissue do not revoke an already issued link. Determine a server-side and free-tier-safe mitigation and test browser/popup/subscription races.

The R18-114 inventory UUID churn issue #218 is independent and also prevents release; this package does not claim to repair it.

## Required order and boundaries

1. Independent trusted-operator review of **all 83** private historical migrations and evidence provenance; independently audit **all 67** authenticated-callable SECURITY DEFINER chains, function grants, and privileged membership writers. Green source tests do not substitute for this.
2. Approve the exact invitation/reinstatement product semantics, privileged membership TRUNCATE/UPDATE/cascade contract, and issued signed-URL mitigation. Review proposed code and rollback/fail-forward strategy; never restore a known vulnerable function as a rollback.
3. Independently attest the distinct QA-only project/CLI target, replay dependencies in an isolated approved dry run, then separately authorize QA bootstrap and **forward-only** reviewed migrations. Existing original migration history must not be edited. Candidate SQL under `staging/` must never be pushed directly.
4. Run the 18-case QA acceptance matrix (17 signed-account cases and one separately controlled privileged-writer audit) in `staging/world-v2-b10-r18-160-forward-security-repair-gates/manifest.json`: DM, P1, P2, removed P1 and outsider; verify fog, sheets/leases, invites/reinstatement, Storage ACL, new and already-issued signed URLs, stale Realtime and popups, privileged writes, and movement visibility. All are **NOT_RUN**.
5. Independently verify performance and free-tier impact, then seek separate R127 production-owner release approval. QA authorization does not authorize production.

## Manual boundary

The next release gate requires a trusted reviewer/operator with access to the **private local 83-file SQL archive**, the exact original source session, and an independently verified QA-only link. Keep raw SQL, credentials, signed tokens, private data and privileged session details outside GitHub, CI and chat. A sanitized review/attestation record may be returned without SQL contents.

**No original/QA SQL writes, migrations, source runtime change, merge, deployment, credentials, browser grant or paid infrastructure.** Tests only pin existing staging candidates and prevent mistaken release approval; they do not validate production authorization.
