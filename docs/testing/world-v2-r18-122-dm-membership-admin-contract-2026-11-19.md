# B10-R18-122 — DM membership-management integration and privileged writer contract

**19 November 2026 (Melbourne).** Child of [R18-121 draft PR #227](https://github.com/xuvenz-source/ttrpgsite/pull/227), pinned parent `b0612076d68346c05faa148bbfc4982b178ccca9`. Source-only, no merge, no application deployment, **no original or QA SQL execution**. The R18-120/121 DB prototype and this R18-122 addition are **unapplied scratch candidates, not migrations**.

## Current source and original database facts

- R18-119 tested the exact original `join_campaign` function using synthetic private PostgreSQL17 identities; a removed player rejoined with the unchanged generic code. That behavior is a **source-level policy concern**, not evidence of a hosted exploitation.
- Read-only original `information_schema.role_table_grants` confirms `authenticated` has **SELECT** on `public.campaign_members` but **no direct INSERT, UPDATE or DELETE grant**; `service_role` has SELECT, INSERT, UPDATE, DELETE and **TRUNCATE**, among other privileges.
- Read-only original `pg_policy` has only a membership SELECT policy, not an ordinary authenticated DELETE policy. The public function inventory has no DM remove/reinstate/leave RPC today.
- The 174-file R18-121 app/Edge source scan found just two tracked membership readers: `src/TabletopApp.jsx` and `src/PersonalTokenLibrary.jsx`; neither contained an immediate direct table write. The latter verifies membership before artwork use.
- In `TabletopApp.jsx`, `fetchCampaign` and `refreshCampaignRoster` read the roster and account names; the Realtime roster subscription listens for **character** changes and uses presence/reconciliation, but does **not** explicitly subscribe to `campaign_members` membership DELETE/INSERT events.
- `src/TabletopSidebar.jsx` already has a DM tab and Campaign subsection, a natural future location for controlled roster actions. The current main UI contains no DM removal/reinstatement/voluntary leave control, and `public.join_campaign` is the current entrypoint for admission.
- Existing `get_campaign_account_names(p_campaign)` is a privileged current-membership-linked function. Removed players are **not in the active roster**. An authorized DM-only removed-player listing is therefore needed; we must not expose `auth.users` or the private revocation table via client SELECT.

## Staged source-only client contract (NOT wired into runtime)

`src/CampaignMemberAdminContract.js` exports a **dormant** `createCampaignMemberAdminContract({db,context,onReconcile})` adapter. Neither `TabletopApp.jsx` nor `TabletopSidebar.jsx` imports or calls it. `CAMPAIGN_MEMBER_ADMIN_LIVE_ENABLED` remains false.

- Four **exact** server RPC names: `dm_remove_campaign_player`, `dm_reinstate_campaign_player`, `leave_campaign`, `dm_list_removed_campaign_players`.
- Local hints check the active campaign ID, signed actor ID, DM status, active membership role and player target. Client hints are **not authorization**; every privileged SQL function must check the current `auth.uid()` and persisted DM membership itself.
- Calls `db.auth.getUser()` before any RPC and rejects an identity/campaign swap. No `service_role`, direct `campaign_members` write, JWT user_metadata decision or optimistic roster update.
- A single-flight guard prevents two actions being initiated concurrently by the same controller. RPC response `true` becomes **`server_acknowledged`** only, never an unconditional UI success. A future integration must independently verify fresh membership before claiming authorization or preserving cached map/fog/sheet state.
- A failed/unknown RPC result is **`unconfirmed`** with a sanitized error; refresh server truth before taking another action. A server `false` is `stale` and also triggers reconciliation. A context switch during RPC cannot report success in the new campaign.
- The DM-only removed-list response validates at most 100 unique synthetic-compatible UUIDs with valid removal timestamps, never uses direct ledger SELECT or exposes email/user metadata. Server-side permission remains authoritative.
- The current SDK's PostgREST transport can retry POST requests internally; the wrapper does not explicitly retry, but **that does not guarantee exactly-once delivery**. The final migration and UI design must make actions idempotent or return an authoritative reconciliation receipt, especially after ambiguous network responses.

The unmounted controller and its 15+ isolated tests stage only the integration **contract**. They do **not** implement or enable a functional DM management interface.

## Scratch-only DM revoked roster and secondary write guard

`staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql` adds:

- `public.dm_list_removed_campaign_players(p_campaign uuid)`: SECURITY DEFINER, empty `search_path`, authenticated-only EXECUTE, current-campaign DM membership verified using `auth.uid()`. It returns at most 100 `(user_id,removed_at)` rows **from that campaign only**. A non-DM, null actor or foreign-campaign DM receives uniform SQLSTATE `42501`.
- A `BEFORE UPDATE OF campaign_id,user_id` membership trigger that shares the existing R18-121 revocation guard, closing a privileged membership-key UPDATE bypass of the previous INSERT-only gate.
- **No direct grants** on the private `forge_security.campaign_member_revocations` table, no raw account-name/emails from Auth and no migration file or hosted deployment.
- The current original `service_role` has TRUNCATE privilege, which **does not fire row-level DELETE tombstone triggers**. The R18-122 prototype deliberately does not revoke a hosted grant without first auditing administrative operations. The final security design must explicitly address TRUNCATE permissions, potentially dangerous privileged UPDATE/role changes, and direct administrator key migration. Superuser ownership remains a separate operator trust boundary.
- Original `auth.users` and `campaign_members` both have FK deletion cascades. A deleted Auth user can create a revoked membership tombstone in the current prototype even when the actor can no longer sign in. The exact desired cleanup/retention rules require review before migration.

## Required UI and access-control release sequence

1. Securely review all 83 original historical migration files and independently attest original operator access; review privileged service-role and external admin membership mutation paths, not only tracked frontend code.
2. Finalize product policy: voluntary leave vs DM-enforced removal vs explicit DM reinstatement; decide revoked identity display and retention, and implement a reviewed **forward-only** migration after validation, not by editing historical SQL.
3. Verify the four server RPCs, private listing, UPDATE/DELETE/INSERT safeguards and campaign/Auth cascade behavior **against exact original SQL in private isolated testing**, then obtain explicit QA-only bootstrap authorization.
4. Implement DM roster panel under `TabletopSidebar.jsx` DM → Campaign, require a deliberate confirmation for removal, and provide DM-only reinstatement of previously removed players using the private RPC. Do not expose browser service-role credentials, other-campaign IDs or private Auth email.
5. On membership revocation, every signed client must revalidate actual membership, unload campaign content/map/fog/handouts/chat and close cached sheet/editor state. Current character-only Realtime roster notifications and client-side `isDM` flag are **not sufficient revocation enforcement**. This includes the independently confirmed R18-115 revoked character-sheet owner flaw.
6. With signed DM/P1/P2/outsider QA sessions verify invitation denial, DM role permanence, voluntary leave/rejoin, restored membership, stale subscriptions and other authorizer entrypoints. Audit SQLSTATE `40P01` lock retries/ambiguous successes, concurrent direct administrator DELETE and Auth-user cascade, reconnect behavior and zero unintended campaign-data disclosure.
7. Keep other original R18-104 fog metadata oracle, R18-114 UUID inventory churn and 67 privileged-function audit release gates blocked. No production release until all pass.

**Decision: source-only staging may proceed; QA schema installation and production deployment remain NO_GO.**
