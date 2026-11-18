# B10-R18-121 — Member-removal integration audit, campaign cascade and concurrent joins

**19 November 2026.** Source-only investigation and isolated PostgreSQL 17 testing. Direct parent [R18-120 draft PR #226](https://github.com/xuvenz-source/ttrpgsite/pull/226), pinned at `eb47d76dd241511d2ae15ce58fe2cf2a707609a7`. **Do not merge this PR or apply SQL to original or QA Supabase.** R18-120's SQL remains an **unapplied, scratch-only prototype**, not a versioned forward migration.

## Original hosted catalog findings (READ-ONLY metadata only)

- `public.campaign_members` has RLS enabled and a SELECT policy (`members view membership`) using `is_campaign_member(campaign_id)`; no direct DELETE policy for ordinary authenticated users was found.
- The public campaign/membership function inventory includes `create_campaign`, `join_campaign`, `is_campaign_member`, `is_campaign_dm` and other access helpers, but **no dedicated DM-removal, leave or reinstatement RPC**. This is read-only evidence of the **present** catalog, not proof of all possible external administrative operations.
- Original `campaign_members.campaign_id` has a foreign key to `campaigns(id)` with **ON DELETE CASCADE**; `campaign_members.user_id` cascades from `auth.users`. `campaign_map_views` and `campaign_player_maps` also cascade from the composite member key. Numerous other campaign-scoped tables cascade on campaign deletion. These relationships must remain valid after the future revocation design.
- The original `campaign_members` table currently has no non-internal removal trigger. Nothing was installed there.

## Application and privileged-route inspection

- `src/main.jsx` renders `src/TabletopApp.jsx`. In that 3,258-line main application, `campaign_members` is read for the campaign list, roster and refresh; campaign creation and admission are exposed via `db.rpc('create_campaign')` and `db.rpc('join_campaign')`. **No DM removal, voluntary leave or explicit reinstatement UI/RPC wiring was found in that entrypoint.**
- The tracked `supabase/functions` directory currently contains username-registration and username-update Edge Functions, which use a server-side service-role client for account management; inspection of their actual source did not identify a campaign-membership delete/write.
- **Executed source inventory:** 174 tracked app/Edge JS/JSX/TS files were traversed. Exactly two reference the `campaign_members` table: `src/TabletopApp.jsx` (roster/list reads) and `src/PersonalTokenLibrary.jsx` (membership validation read before token artwork). No direct member write matching the immediate `db.from(...).delete/insert/update/upsert` syntax was found.
- Automated R18-121 Node scanning traverses all tracked JS/JSX/TS app and Edge sources, fails on the immediate unreviewed `db.from('campaign_members').delete/insert/update/upsert` call shape, and verifies the main entrypoint's current create/join API. This guard does not detect **indirect aliases**, generated clients, external administrative scripts, future untracked integrations or operator Dashboard actions. The service-role removal path is **not proven absent**.
- Before any installation, implement the intended **DM roster removal** and **DM reinstatement** UI through reviewed server-side RPCs; distinguish voluntary leave, avoid client-selected roles, do not silently grant revoked players access via cached sheet/visibility data. R18-115's revoked-sheet-owner issue remains a separate release blocker.

## Confirmed cascade flaw in inherited R18-120 scratch prototype

A new real PostgreSQL17 FK cascade regression tried `DELETE FROM public.campaigns WHERE id=synthetic_campaign_B` with the inherited prototype. The initial isolated CI [run #44346812810](https://github.com/xuvenz-source/ttrpgsite/actions/runs/44346812810) **FAILED** with the synthetic error **`Campaign missing`** in `forge_security.stamp_campaign_member_deletion()`. The root cause is that the campaign row is already deleted by the parent statement before its member-delete FK cascade invokes the trigger, and the trigger's unconditional `SELECT ... FOR UPDATE` finds no parent.

**Repair staged only in this PR's copy of the unapplied R18-120 SQL:** if the parent is already absent, return `OLD` and permit the FK cascade; no tombstone is needed for a deleted campaign, and the private revocation ledger's FK itself cascades away. If the parent remains, the trigger **still locks it and stamps a tombstone** for an ordinary direct member deletion. This inference depends on retaining the live campaign-member FK; dropping/disabling that constraint would invalidate the safety reasoning. There is no weakening of `reject_revoked_member_insertion`, its SQLSTATE `42501` deny, or the explicit DM-only permission checks.

**Do not merge standalone R18-120 PR #226**: it contains the pre-cascade-bugfix scratch version; this R18-121 child corrects it for future review only.

## Executed isolated concurrency/cascade tests

`tests/world-v2-r18-121-postgres/run.sh` runs against a disposable PostgreSQL17 GitHub Actions service reached only through the runner's local loopback, with synthetic credentials and synthetic campaign IDs. This service is not a no-network container, but all SQL targets are fixed to loopback and preflight rejects Supabase/remote credential environment variables. The test uses the **representative synthetic** `join_campaign` function staged in R18-120, **not** the private R18-119 source-exact body.

Checks:

1. Actual FK campaign deletion of campaign B succeeds without creating an orphan tombstone.
2. Concurrent session ordering A: DM removes P1 and retains a transaction lock, P1 tries the unchanged invitation; after the removal commits, join is denied with `42501`, membership absent and revocation present.
3. Concurrent session ordering B: P2 joins and holds the campaign lock, DM removes P2 while join transaction is active; final committed membership absent and revocation present.
4. A DM removal rolled back in the same transaction leaves no ghost revocation and preserves P3's membership.
5. Campaign A deletion when P1/P2 are revoked and P3 is an active member removes **both** membership and revocation children.
6. The amended prototype reruns inherited R18-120's **35 source-only synthetic SQL behavior scenarios and nine real PostgreSQL ACL denial checks**, plus its static security contract tests.
7. A standalone Node audit checks app/Edge direct membership write patterns, SQL cascade guard and test isolation.

**Scope:** These are genuine overlapping PostgreSQL transactions with deterministic barriers, but not multi-user signed Supabase Auth, high-concurrency stress, a full migration replay or the exact private `join_campaign` source. Direct administrator DELETE racing against `join_campaign` can acquire row/campaign locks in the opposite order and may deadlock; app/service-role writer auditing, retries and high-contention tests remain REQUIRED before considering production rollout.

## Release gates and next package

- Actual DM remove/reinstate/leave user interface and full API route integration absent in inspected primary entrypoint; must be deliberately designed.
- Privileged service-role and external administrative membership modifications not exhaustively audited; review lock order and impose a transaction retry strategy for SQLSTATE `40P01` where applicable.
- Ensure campaign deletion and Auth-user cascade retention policy across the complete original schema, not only minimal scratch FKs.
- Concurrent campaign deletion versus invitation join; RLS, Realtime, fog, Storage, cached sheets and handout subscription revocation; load/memory costs and idempotency still need signed QA tests.
- Original R18-119 operator-only source-exact receipt verifies the stale generic invitation rejoin behavior; the new R18-120/121 repairs are tested with a **representative** join function only.
- Independent human semantic review of all 83 private original migrations, operator attestation, all 67 privileged callable RPC review, R18-104 fog metadata oracle, R18-114 inventory UUID churn, R18-115 revoked-sheet owner access, QA-only bootstrap authorization and signed QA DM/P1/P2/outsider acceptance are all **NO_GO**.

**No paid resources, no merge, no original/QA SQL changes and no deployment.**
