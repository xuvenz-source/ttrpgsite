# B10-R18-120 — Durable DM removal / reinstatement security contract

**19 November 2026, Melbourne.** Source-only **unapplied prototype** and isolated PostgreSQL 17 tests. Parent R18-119 [draft PR #225](https://github.com/xuvenz-source/ttrpgsite/pull/225), exact parent commit `61efecebdb135da3bdb522e446a52fdc92e4a6f3`. No SQL modification, migration installation, merges, deployment or paid infrastructure for either original or QA Supabase.

## Evidence and intended behavior

The operator's R18-119 sanitized receipt independently verified the **current original** `join_campaign` source SHA-256, then executed it with invented users in private no-network PostgreSQL17. In that **synthetic source-exact** replay, an actor removed from `campaign_members` successfully rejoined with the unchanged generic invite, although invalid and rotated-old codes were denied. No signed hosted authentication test, live exploit or semantic review of the full original source has occurred. The existing invitation risk is tracked in [issue #223](https://github.com/xuvenz-source/ttrpgsite/issues/223).

Proposed product policy (not approved for release):

| Action | Security invariant |
| --- | --- |
| First-time signed player enters with active invite | Join their intended campaign as `player` |
| Player uses `leave_campaign` voluntarily | Their departure is reversible with an active invite |
| DM explicitly removes a player | Their identity remains blocked, even if the old or newly rotated **generic** invite is valid |
| DM explicitly reinstates a previously removed player | Only a current DM of that same campaign may clear the block, and the user returns as `player` |
| Existing DM repeats invite join | DM remains DM; no duplicate membership or demotion |
| Privileged direct membership deletion | Fail closed by recording the revocation rather than silently making an invite usable |
| Other-campaign DM/player/outsider acts | Never remove, reinstate, mutate revocation records or read unrelated campaign details |
| Existing player leaves while revoked | No clearing another actor's tombstone |
| Anonymous role and malformed invite | Deny without membership or tombstone disclosure |

This distinguishes **voluntary departure** from **DM-imposed removal** and prevents a generic invitation from overriding the latter. Existing campaign ownership transfer and legitimate deletion/cleanup are separate product workflows and must be reviewed before a migration can be considered.

## Scratch implementation — not a versioned migration

`staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql` contains a PostgreSQL-only candidate:

- A private `forge_security.campaign_member_revocations` table keyed by campaign and actor, with RLS and no direct permissions or schema visibility for `anon` or `authenticated`.
- A membership **BEFORE DELETE** trigger that stamps a durable tombstone, even for direct administrative deletion; a membership **BEFORE INSERT** trigger that rejects a tombstoned account with SQLSTATE `42501`. Both take a campaign-row lock to coordinate with invitation joins and controller RPCs.
- Three authenticated-only `SECURITY DEFINER` RPC prototypes with `SET search_path=''`: `leave_campaign(uuid)`, `dm_remove_campaign_player(uuid,uuid)`, and `dm_reinstate_campaign_player(uuid,uuid)`.
- Role authorization is checked using `auth.uid()` and the **current** server-side `campaign_members` rows, never mutable `user_metadata`, stale JWT membership flags or client-provided role.
- A player-only voluntary leave clears **only their own** removal tombstone in the same transaction. DM-initiated removal leaves it behind. DM reinstatement requires an existing tombstone; it must not enroll an arbitrary never-member user.
- All DDL and REVOKE/GRANT changes are in one transaction. This file has no versioned migration filename and has not been applied anywhere outside ephemeral synthetic CI.

**Caution:** This is not a production migration candidate ready to install. The **current original `join_campaign` SQL body is deliberately not exported to CI**. The CI stub models the R119-observed legacy membership INSERT and duplicate behavior, and the new triggers are being verified against that representative pattern. The R119 source-exact test is separate evidence. An actual migration needs a trusted semantic review of the private source and reconciliation with all app/Edge/administrative membership modification paths.

## Executed test evidence (scratch only)

[Disposable PostgreSQL 17 workflow #44343916024](https://github.com/xuvenz-source/ttrpgsite/actions/runs/44343916024) completed **SUCCESS**. Its actual log includes `R120 PG17 CONTRACT PASS: 35/35 real SQL synthetic membership and revocation scenarios` and `R120 SCRATCH PG17 PASS: 35 scenario statements; 9 SQL permission denials`.

The behavior verified **in scratch**: a current DM can delete a player's membership; the removal tombstone persists; unchanged and rotated generic invitations cannot rejoin that account; a never-removed player can still join; a voluntary player leave clears its own tombstone for a legitimate later return; only the same campaign's DM can explicitly reinstate a removed member, without creating a new arbitrary player; duplicate DM joins retain the DM role; even direct administrator deletion creates a tombstone. Nine real database ACL probes rejected anonymous RPC calls, direct membership insert/delete and direct tombstone access.

**Scope limit:** The installed scratch `join_campaign` is a representative, non-original stub. The user's earlier R119 private source-exact receipt separately proved the current original join function permits stale-invite rejoining without this guard. This R120 test does not independently install the new guard alongside that exact private source, replay the 83 actual migrations, test concurrency or use signed Supabase Auth users. No claims of production readiness.

## Isolated tests and release gates

The R18-120 GitHub Actions workflow uses a disposable, standalone `postgres:17` CI service with fixed synthetic credentials and loopback-only connection. No Supabase project reference, key, migration or real user is connected. The SQL matrix covers 35 independent scenarios for first join, idempotent DM, removal, stale invitation denial, direct administrative delete fail-closed behavior, voluntary leave/rejoin, new player eligibility, DM-only reinstatement, cross-campaign privilege boundaries, and invalid/rotated codes. Nine direct PostgreSQL permission-denial probes validate anonymous RPC and authenticated table access restrictions.

**Not yet verified and required before approval:**

1. Independently audit how the actual application and any Edge Functions or service-role paths **remove** campaign members and whether those paths need to call explicit RPCs instead of direct DELETE. The original catalog currently exposes no authenticated `campaign_members` DELETE RLS policy or public membership-removal RPC; that is not proof that no separate privileged removal path exists.
2. Inspect the exact private original `join_campaign` and `create_campaign` bodies with an independent human reviewer. The operator must not publish private SQL, credentials, or raw logs.
3. Concurrency and rollback: demonstrate join/removal/reinstate serialization, multiple simultaneously signed users, lock-order/deadlock retry, campaign deletion cascade, existing memberships and old-code rotation. Do not reinterpret synthetic PG pass as true load testing.
4. Establish explicit product approval for whether DM removal is permanent until DM reinstatement. Review voluntary leave semantics, campaign deletion and DM ownership-transfer restrictions.
5. Guard **other** permission paths (sheet inventory, tokens, fog, Realtime, Storage, chat, handouts and stale client caches). In particular, R18-115 confirmed a separate revoked-character-owner sheet permission bug; resolving invitation reuse alone **does not fix it**.
6. Review every new `SECURITY DEFINER` grant, search_path, owner/role and tombstone RLS boundary; produce a new forward-only migration after all historical 83 SQL bodies and original-operator session provenance are independently audited.
7. Obtain explicit authorization for QA-only migration dry-run and bootstrap, then test with real signed DM/P1/P2/outsider users. **No original/production SQL release authorization.**

The existing R18-104 fog-status metadata oracle, R18-114 inventory UUID churn, R18-115 revoked-sheet-owner permissions and the remaining 67 privileged-function review all remain separate **NO_GO** gates.

**Decision:** Safe source-only design/fixture and scratch testing may proceed. **QA install, original SQL changes, merges and production deployment: NO_GO.**
