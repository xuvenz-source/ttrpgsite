# B10-R18-147 — Original-authorizer revocation candidate reconciliation

**21 November 2026, source-only.** Exact parent R18-146 draft PR #254,
commit `1a71cb8fd6542c5a362d3a6c6a123c4d790026b8`. Production and QA remain **NO_GO**.

## What is reused, not reimplemented

| Authority boundary | Existing candidate and evidence | Still missing |
| --- | --- | --- |
| #220: revoked assigned-character owner can pass legacy sheet RPC | R115 PR #219 `can_edit_campaign_sheet` candidate; synthetic claim/GET/mutate/PATCH denied after revocation | Original helper still unpatched; complete caller and owner/DM transitive audit, real signed QA |
| #223: removed player reuses unchanged invitation | R119 PR #225 privately source-exact synthetic behavior; R120 PR #226 + R121 PR #227 tombstone, join/delete serialization and cascade fix | Original `join_campaign` still unchanged; no installed tombstone triggers or signed actor tests |
| #229: privileged membership bypass | R122 PR #228 rejects key reassignment and prototypes DM removed roster; R120/121 cover ordinary DELETE/INSERT | `service_role` TRUNCATE still granted on original; role-only UPDATE and privileged admin/foreign-key paths not fully reviewed |
| #231: signed Storage URL and client eviction | R123 PR #230 dormant sentinel/teardown tests prove unmount must precede signed URL cache clear | Already-issued 3600-second bearer URLs, open old Realtime sockets and full runtime ejection remain unresolved |
| Tool-side revocation | R117 PR #222 synthetic tool mutation/lease authorization and direct-table ACL negatives | Not equivalent to all original elevated functions; 67-function review remains open |

The inherited parent branch already contains these five exact candidate files. R147 **does not copy, edit, apply, merge or grant** any candidate. Its audit verifies each one's Git blob identity and rejects any missing/drifted evidence or optimistic release flag.

## Critical remaining security work

1. Design a separate **scratch-only** solution for #229: either explicitly deny service-role TRUNCATE with an independently reviewed privilege plan (including grant inheritance) and/or a statement-level BEFORE TRUNCATE reject guard. Row-level DELETE tombstones never execute on TRUNCATE. Owner/superuser ALTER/DISABLE TRIGGER and legitimate maintenance/cascade workflows are different trust boundaries; do not claim triggers stop database owners.
2. Review **role-only membership UPDATE**. R122 protects `campaign_id` and `user_id` but not `role`, and the direct service-role path might grant DM powers or demote the campaign's only DM. This must have a positive authorization contract, not only a key-immutability check.
3. Verify every privileged membership mutation path, authenticated RPC caller, direct service/admin script, Auth user deletion cascade and history-replay interaction. Preserve real DM removal/reinstatement and voluntary departure semantics without relying on JWT user metadata.
4. Keep R145 default-denied revision/handout-first movement-adjacent work separate from revocation until exact trigger/lock compatibility, signed DM/P1/P2/outsider/revoked/rejoined and multi-tab tests, and free-tier CPU/latency are measured.
5. Server-side signed-user checks, old joined Realtime socket cutoff, 17 published relations/19 consumers and preissued Storage bearer link strategy remain outstanding. A client-side sentinel and local clear cannot revoke an already emitted link.

PostgreSQL semantics: TRUNCATE does not fire row-level DELETE triggers; it can fire a statement-level TRUNCATE trigger. Neither RLS nor a membership SELECT policy substitutes for a TRUNCATE privilege boundary. Explicitly audit role grants and ownership before any future forward-only SQL migration.

**No original or QA SQL writes, no versioned migration, no browser grants, no deployment, no merge, no paid resources.** Original still has 83 migrations; QA still has zero migrations and zero public application tables per the R146 read-only snapshot (not newly attested by R147). This is source evidence, not live compatibility proof.

### Handoff

- Outcome: source-only reconciliation and fail-closed identity guard, pending exact-head CI.
- Recommended R18-148: disposable PG17 privilege and role-only UPDATE guard negative-case experiment, then separate reviewer decision before any original or QA changes.
- All security issues #220, #223, #229, #231 and R127 human release gate remain OPEN / **NO_GO**.
