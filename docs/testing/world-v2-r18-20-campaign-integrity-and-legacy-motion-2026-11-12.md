# B10-R18-20 — Full campaign write-validator parity and source-real legacy movement-session authority

**12 November 2026 (Australia/Melbourne) — staging-only engineering; NO-GO for database and frontend rollout.**

## Exact release lineage

Parent **B10-R18-19** draft PR #122 at `f38da59d218389ddd0bfa7e5d2589ac117c01fd1`. Current live frontend remains R18-15 Vercel production deployment `dpl_E1P6cNfuswAMH7qAFnSLPrTWN6kQ` sourced from `7628a319b8c62bf18a4046fffc7bb09de4`. Git `main` remains R16 `90df8c960e79e8d66c322095611427da7bb09de4`. Live Supabase contains 83 historical migrations; frozen R05 `20261111023204` is **not applied**. R18-17 physical wall and R18-19 cross-map SQL candidates are also not applied, and the client still uses strict wall collision.

## Corrected diagnosis from a wider live read-only audit

R18-19 identified real shortcuts in the **legacy collision trigger in isolation** and added a candidate DM-only cross-map tool guard. This did not prove that the *complete deployed write path* allowed the same bypass: read-only production `pg_trigger` and `pg_get_functiondef` reveal separate existing validators:
- `public.validate_token_map()`, BEFORE INSERT OR UPDATE of `public.map_tokens`, rejects a token whose campaign differs from its map's campaign. It also checks character/NPC template affinity.
- `public.validate_campaign_tool_write()`, BEFORE INSERT OR UPDATE of `public.campaign_tool_issues`, rejects **every tool `campaign_id` update** as identity mutation, checks map's campaign, tool recipient/template and held-tool carrier permissions, and retains bounded map placement checks.
- `public.protect_token_fields()`, BEFORE UPDATE of `public.map_tokens`, controls player token field mutations and reserves extended edits to DMs.
- The live `battle_maps` table has DM UPDATE RLS, but **no identity-reassignment trigger**; a DM with access to both campaigns could potentially reparent a map, leaving existing piece campaign links inconsistent.
- Live table constraints contain separate campaign and map FKs, **no composite (map_id,campaign_id) FK**. Read-only data check: 7 tokens, 2 tools, **zero current map/campaign mismatches**. This is a latent integrity risk, not a discovered production data corruption or confirmed remote exploit.

Source SQL captured via SELECT-only `pg_get_functiondef` to `tests/world-v2-b10-postgres/live-source-r18-20.sql`, with explicit source MD5 hashes:
- `validate_token_map()`: `8ddb83de264171910132b2da9979f26c`
- `validate_campaign_tool_write()`: `3968fd2daec5e268c931cdcf42e9bdc7`
- `advance_map_motion_session_path(uuid,jsonb,bigint)`: `539292b1950d76909c032a056bebee79`

A second test-only file `live-validators-r18-20.sql` extracts **just the identical validator bodies** so campaign tests do not create a legacy RPC before its private session table exists. Both are read-only captured sources, *not* new migration SQL and not a replacement for the actual full migration-history reconciliation.

## New narrow SQL candidate, not applied

`supabase/candidates/world_v2_r18_20_campaign_affinity.sql` defines a private SECURITY DEFINER trigger helper `forge_visibility.guard_campaign_affinity_r18_20` with pinned empty `search_path` and no EXECUTE grant to public, anon or authenticated roles. It registers exactly two BEFORE UPDATE OF `campaign_id` triggers on **battle_maps** and **map_tokens**. Reassigning `campaign_id` is denied as a direct application UPDATE, even when the DM belongs to both campaigns; the existing trusted, userless service-role maintenance exception is preserved. Normal same-campaign map transitions and ordinary map setting updates remain allowed. No duplicate issued-tool guard is introduced, because the source-real live tool validator already rejects its campaign reassignment.

**Safety note:** this is a proposed application invariant, not an installed restriction. It intentionally prohibits a cross-campaign token/map reparenting workflow; legitimate campaign import/copy should allocate a new piece/map rather than change the parent campaign ID. Before SQL release, audit the admin/DM import and map cloning workflows for use of direct campaign-ID reassignment. Preserve genuine service-role maintenance with separate authorization validation and atomic cleanup. A correctly versioned migration must be created with a pinned authenticated CLI after reconciling all 83 live SQL bodies; never apply the standalone candidate directly or overwrite R05.

## Isolated source-real campaign test coverage

`tests/world-v2-b10-postgres/campaign-affinity-r18-20.sql` installs the final historical legacy triggers, the exact LIVE token/tool validators, and the staged R18-19 guard inside disposable PG17 `BEGIN`/`ROLLBACK`. It verifies:
- **I01–I10 baseline:** source-real validators fire; standalone mismatched token campaign is rejected; tool campaign changes (alone or with map) are rejected; a DM authorized for BOTH campaigns can *coherently* update both a token's campaign and map in an unguarded fixture; a map's campaign can be reparented without activating piece validators; foreign-campaign tool/map mismatches are rejected.
- **I11–I20 candidate:** new private campaign affinity triggers registered, dual-campaign DM cannot reparent token or map, player cross-map transfer remains blocked by the earlier existing collision trigger in proper PostgreSQL alphabetical trigger order, rejection preserves rows, normal same-campaign token map movement and map width edit remain allowed, private helper not directly callable, existing tool validator still immutable.
- All **20** assertions passed in disposable Postgres, all fixture writes rolled back. Neither this fixture nor the existing R18-19 authorization mirror constitutes actual authenticated Supabase P1/P2 testing or an executed production migration.

## Legacy movement-session source-real authority and observer-stub tests

The public `advance_map_motion_session_path` is a still-live SECURITY DEFINER SQL RPC used in the original movement system. It stores *ephemeral* `forge_visibility.movement_sessions` and `movement_preview_rates` rows rather than directly moving a canonical token. R18-19 tested the alternate `commit_map_trajectory` and V2 authority; R18-20 now reproduces this remaining legacy session path in its own disposable private fixture.

`tests/world-v2-b10-postgres/legacy-session-r18-20.sql` replays the exact captured live source with private session table column contracts gathered read-only, source-real trajectory validator, proposed R18-17 physical wall geometry, and a **TEST STUB** of `bump_viewer_ticks`. Existing B07 test-only `realtime.send` and `observer_verified_path_status` are used; the latter **does not perform real LOS** and cannot substitute for independent authenticated player security acceptance.

**S01–S20 passed**: function definer/search-path integrity; valid token and mount previews without canonical writes; replay-sequence and actor hijack denial; owner revocation; environment and rule revision invalidation; blocked solid wall and accepted shallow 0.10-cell edge; simulated excluded P2 receives zero new messages and DM hide-only receives exactly one private hide (not a token path); transient Realtime publish failure rolls back preview rate and broadcast side effects; held or revised tool rejects stale session; expiry, player collision override, malformed path and fractional positions fail closed; canonical positions and private schema remain protected.

An initial test error counted historical events against a new simulated broadcast. The corrected test explicitly executes the movement RPC **before** querying event counts and restricts checks to newly inserted event IDs; the exact-head PG17 logs show `accepted t, new events 1, P2 new 0, DM hide new 1`. This is accurate SQL evaluation ordering, not an additional permission change.

## Release blockers and follow-on work

1. **No live migration without separate explicit user approval.** R05, R18-17 wall candidate, R18-19 cross-map guard and R18-20 identity guard all remain separately staged. The full versioning/83-history CLI workflow and compatibility order require further reconciliation. Do not make any connected Supabase writes or run repo-root `db push`.
2. **No frontend release** from R18-20. Active R18-15 strict wall collision remains unchanged. The client 0.10 wall option must be enabled only after server parity is installed and verified with separate approval.
3. **Real-auth P1/P2 and actual LOS acceptance still pending.** The disposable observer status stub is not a real signed player sight test and cannot prove cross-account privacy. Keep 700ms guarded observer recovery OFF.
4. **No claim that accumulated movement lag is fixed.** Median R18-15 authority commit around 1.06s and release-to-terminal p95 around 2.38s remain future performance work. The bounded per-operation cadence metrics staged at R18-16 can help identify whether later calls degrade in an equal-workload session.
5. Validate map/campaign identity candidate against the actual DM copying/import/export workflows and authenticated service-role management. Keep the old R18-19 cross-map issued-tool guard as a **product policy decision** (DM-only vs player-owned visible same-campaign transfer) rather than treat isolated collision short-circuit as a proven public exploit.

**Disposition: STAGING-ONLY, exact-head CI required; production SQL and frontend both NO-GO.**
