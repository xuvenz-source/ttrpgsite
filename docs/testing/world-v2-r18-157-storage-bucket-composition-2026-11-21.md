# B10-R18-157 — Original Storage SELECT composition and three-bucket synthetic access matrix

**21 November 2026.** Parent draft R18-156 PR #264 at exact green SHA `bbfc6a4caf20653ed96bb3217ddd1f5d1a8f6d03`. **SOURCE ONLY / NO_GO.**

## R156 operator evidence (no private SQL)

The attached sanitized R18-156 report SHA-256 `78e27c1172338ae77f6b75d2c32be33f023b7c488de8b50f88e2575e263332b9` verified all 83 original migrations and one R111 priority-sorted docket-index-29 Storage SELECT policy. Its structural indicators all matched: `TO authenticated`, bucket scope, requested `objects.name`, `battle_maps` alias, `EXISTS`, equality between the map's `storage_path` and requested object name, and the **same map alias** `campaign_id` and `id` passed to `can_view_campaign_map`. No direct auth.uid/auth.jwt, no unrestricted TRUE, no top-level OR marker. Original SQL was not uploaded, parsed into an AST or independently approved. **Index 29 is not chronological migration position 29.**

This removes the rationale for rewriting this *specific* policy merely because the R154 scanner found no direct identity function. It does NOT establish every historical revision, every join branch or every live access policy is correct.

## Original database read-only catalog analysis

All **three current** `storage.objects` **SELECT** policies are permissive. They each require a different literal private bucket; the bucket predicate and the remainder of each access check are composed with AND. Thus the three branches are bucket-disjoint in the current policy definitions even though PostgreSQL OR-composes permissive policies.

The branches are conceptually:
1. **Campaign token and artwork assets.** Requires campaign-scoped object path and current membership; an eligible DM, account owner, associated character owner, or user allowed to observe the map token may read the applicable asset. Actual token observer helper checks `auth.uid`, current map authorization, DM status, token visibility, token ownership and the point-visibility engine.
2. **Battle map images.** Uses `battle_maps.storage_path = storage.objects.name` and `can_view_campaign_map` on that same row's campaign and map ID. Underlying `battle_maps` RLS is enabled, with a separate helper-backed SELECT rule. The global unique index on `battle_maps.storage_path` prevents duplicate paths.
3. **Personal account files.** Uses the requesting user's identity and a folder-path restriction.

These are structural read-only observations; raw SQL bodies, private literal bucket names, user rows, tokens and credentials are NOT committed or exported. Other Storage INSERT/DELETE policies, service_role overrides, original 67 authenticated-executable SECURITY DEFINER paths, object movement and signed links remain open.

**Critical distinction:** already-issued signed URLs may remain usable after removing campaign membership. Fresh authenticated Storage read denial does NOT prove old bearer links have been invalidated; personal account files are separately owned and should not automatically vanish on campaign removal.

## Fictional PG17 test only

The R157 synthetic fixture extends R120/R152/R156 fictional database objects. A fake `forge_test.file_objects` table has three separate bucket categories: MAPS, TOKENS, USER. Three independent permissive SELECT policies use bucket guard plus their own map, token or user identity predicate. A token observer fixture models DM override, owner, visible token, per-player sight and active-map/override context.

The dedicated runner checks:
- Campaign A/B DM, player and outsider; own/foreign map permissions.
- Visible/hidden token assets with token owner and map sight; users cannot see unrelated campaign token art.
- Personal account assets remain owner-only even against a campaign DM.
- Player map override changes permitted map and token sight together.
- Intentionally unsafe extra permissive **unscoped membership** policy leaks hidden assets despite the three correctly scoped policies, then removal restores denial.
- Revoked campaign player loses *new* map and token asset access; the same user still owns their separate personal avatar.
- Intentionally unsafe extra **owner-only token policy** leaks a revoked user's old campaign portrait; removal restores denial.
- Same-campaign DM reinstatement restores permitted assets, not hidden or cross-campaign assets.

The intentionally unsafe policies are **negative controls in disposable PostgreSQL17 only**. They do not assert or reproduce vulnerabilities in current original Supabase policy SQL. No original migrated table, signed Supabase Auth, CDN, issued URL, old Realtime socket, browser or hosted SQL is involved.

## Operator handoff

No manual Ubuntu command is necessary to run R157's isolated tests. R158 may proceed with another read-only catalog review of Storage INSERT/DELETE / privileged call paths and then require an explicit authorization plan for **genuine signed** QA after 83 original migration semantic assessment; it must not silently bootstrap QA.

All 83 historical migration files remain SHA-matched and private, with **zero** independent security approvals. The original 67 privileged authenticated-callable chains remain unapproved. The 18 R153 signed-actor acceptance scenarios are NOT_RUN. Issues #220/#223/#229/#231 remain unresolved; original joined Realtime subscriptions and issued signed bearer links remain unverified. R127 final production decision remains a distinct human gate.

**NO_GO:** No original/QA SQL write, no migration, runtime modification, browser grant, merge, deployment or paid resource.
