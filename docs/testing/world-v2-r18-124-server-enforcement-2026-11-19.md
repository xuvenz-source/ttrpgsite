# B10-R18-124 — First server-authorized revocation boundary, source-only

**19 November 2026, Australia/Melbourne.** Direct child of draft PR #230 at `a016b57380d68978ce1774ee17e2caccf1f02694`. **NO_GO** for QA bootstrap, merge, deployment and production.

## Reconciled read-only evidence

Original Supabase `lwhwgqaunxbmvyndswze` retains **83 migrations**; independent QA `bgydsamxypjslergfpla` retains **0 migrations and 0 public application tables**. Only read-only catalog/function definition inspections were run on original.

- **Movement:** `public.begin_world_motion_v2` invokes `can_view_campaign_map`; `forge_world_v2.session_valid` rechecks `can_view_campaign_map` for an authenticated actor's current session, and `advance_core_v2` and `commit_world_motion_v2` invoke that validator. `publish_approved_observers` iterates present `campaign_members`. This is useful existing enforcement, but is NOT a full audit of all privileged RPCs or transaction races.
- **Fog and scenes:** `public.get_authorized_map_fog`, `get_world_scene_v2` and `get_world_observer_cursor_v2` call `can_view_campaign_map`. The V2 fog delta delegates to V2 authorized fog, which delegates to the guarded base. `can_view_campaign_map` uses current `campaign_members` by `auth.uid()`. The R18-104 metadata-oracle concern is not resolved.
- **Sheets — confirmed code defect:** `public.can_edit_campaign_sheet` checks character ownership before any independent current-membership gate. A removed owner with a valid account session can still satisfy its character-owner condition. `get_campaign_sheet_inventory` delegates to this helper. The previously staged **R18-115** unapplied replacement requires current `campaign_members` and denies removed owners. **No original DB patch was installed.**
- **Storage:** current `storage.objects` SELECT RLS policies for map artwork use membership/map permission. These policies gate issuing *new* signed URLs, not recalling already-issued signed bearer URLs. `SignedAssetUrls.js` issues 3,600-second links and `clear()` reissues them to active subscribers. Security issue #231 remains open.
- **Realtime:** current `realtime.messages` SELECT policies authorize private map Broadcast channels by current access when connecting. Supabase's Realtime Authorization documentation describes connection-time policy calculation/caching, so that is **not proof of revocation for existing connected channels**. `campaign_members` is not published in the original Realtime publication. No unreviewed membership DELETE notification should be published.

## Implemented R18-124 tranche

1. Created an isolated PostgreSQL 17 synthetic schema in `tests/world-v2-r18-124-postgres/setup.sql`, reproducing the exact *observed* old sheet permission helper logic.
2. Added an authenticated simulated SECURITY DEFINER caller, **not the real hosted privileged sheet RPC**; `verify-before.sql` demonstrates an owner remains authorized by the old helper after membership deletion.
3. Added `verify-after.sql`, which reuses the existing staged R18-115 SQL **only in disposable PostgreSQL** and verifies revoked-owner denial, current-DM permissions, cross-campaign outsider denial, null identity and reinstated owner.
4. Added localhost-only `run.sh` with synthetic credentials, hosted-environment guards and four direct ACL checks; dedicated GitHub Actions PG17 workflow and source-only Node contract tests are included.
5. No `src/` edits, no versioned SQL migration, no hosted Supabase SQL writes, no secrets, no new free-tier resources, no merge and no deployment.

This verifies an **isolated SQL hypothesis**, not all server-side revocation. The test does not exercise the original private schema, original `patch_campaign_sheet_noninventory` RPC or real signed Supabase Auth.

## Release gates still open

- Review **all 67 privileged authenticated RPCs**, including SECURITY DEFINER chains and concurrent membership removal at write/commit time. Do not add a membership network call to each movement event or frame.
- Prove that a removed player's **already-connected** Realtime Broadcast and Postgres Changes subscriptions cannot continue receiving unauthorized payloads; implement secure server-side suppression and explicit client ejection/reconnect fencing.
- Implement and test the R18-123 synchronized UI mask/unmount/asset clear sequence; verify no new signed asset URL is issued after revocation and choose a $0-compatible existing-link lifetime strategy (#231).
- Resolve #220 (sheet), #223 (membership), #229 (service_role TRUNCATE and key mutation) and #231 (signed URLs), plus R18-104 fog oracle and R18-114 UUID inventory issue.
- Complete independent review of all 83 private migration bodies, approved QA history bootstrap, real signed DM/P1/P2/outsider QA, performance budget and production release authorization.

**Required manual work right now: none.** Production remains **NO_GO**.
