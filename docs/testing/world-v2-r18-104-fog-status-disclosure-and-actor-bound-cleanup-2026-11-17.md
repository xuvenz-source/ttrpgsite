# B10-R18-104 — Fog-status disclosure and actor-scoped motion cleanup

**17 November 2026. Source-only and strict NO_GO.**
Parent R18-103 draft PR #205, SHA 2508e16fd5256d51d751df358c7f55d3394fc604.

## Read-only live source reconciliation

The original Supabase project was queried only with SELECT, comparing SQL source bodies pulled from the frozen Git revision **on the database server**. All **four** new function definitions matched live sources byte-for-byte and by SHA-256:

| Function | Git SQL file |
| --- | --- |
| public.is_map_fog_published(uuid) | supabase/migrations/20261107110539_authoritative_fog_collision_release.sql |
| public.end_map_motion_sessions(uuid,uuid[],uuid[]) | supabase/migrations/20261108111759_unified_movement_fog_realtime_memory_20261108.sql |
| public.can_view_campaign_map(uuid,uuid) | supabase/migrations/20261106180100_private_player_maps.sql |
| public.end_map_motion_previews(uuid,uuid[],uuid[]) | supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql |

No raw live SQL, game rows, credentials, sessions or JWTs were exported. The validator re-extracts and hashes these four function bodies from Git, comparing them against the immutable metadata of R18-103 and preserving six earlier verified sources.

## Finding A — signed-user fog-status metadata disclosure

The live public.is_map_fog_published function has SQL language, boolean return type, SECURITY DEFINER and a configured empty search path. Its 102-byte body returns whether a caller-supplied map UUID matches a fog-enforced row in private forge_visibility.map_rules. It contains **no auth identity or campaign/map authorization predicate**.

Supabase grants this exposed RPC to authenticated users, not to anonymous users. Neither anon nor authenticated can directly query forge_visibility.map_rules or use its private schema. Knowing an unrelated map's UUID could therefore allow a signed user to distinguish whether fog enforcement is enabled for that map. This is a **confirmed source-level metadata disclosure path**, not a hosted cross-account exploit reproduction or leakage of fog geometry.

The live map_combats row-level security policy named **dm or nonfog viewers read combat roster** is the single detected database consumer of this function. The policy also checks public.can_view_campaign_map before allowing nonfog combat roster reads. Do **not** merely revoke authenticated EXECUTE: doing so could break a legitimate RLS policy.

The existing public.can_view_campaign_map function has independent exact live/Git source equality. It verifies the current auth.uid is a campaign member, with access for a DM or the current player's assigned/active map. Its source reads membership and assignment tables, not map_combats, avoiding a direct recursive policy dependency.

## Proposed candidate — NOT applied

The isolated **staging/world-v2-b10-r18-104-fog-guard/unapplied-fog-status-guard.sql** contains a membership-bound replacement for the fog-status function only.

It preserves the original signature, SQL/STABLE/SECURITY DEFINER configuration, empty search path and authenticated-only EXECUTE. It joins public.battle_maps to forge_visibility.map_rules by map ID **and campaign ID**, and requires public.can_view_campaign_map for that exact map before returning TRUE for fog-enforced status. Unassigned, revoked, foreign-campaign and unknown maps should return FALSE. The map-combat RLS policy is not altered.

The candidate is protected by an immutable Git blob hash and syntactic contract checks. **It has NOT been applied, compiled or exercised against either original or QA PostgreSQL.** An offline source validator is not a signed security test, SQL runtime test or release approval.

Before any application, independently recover and review original historical SQL in a private authenticated environment; separately approve an isolated QA schema bootstrap; run an independent PostgreSQL 17 candidate installation/rollback rehearsal; execute the twelve signed QA acceptance scenarios; then inspect security advisers and combat-roster policy behavior. The R05 plus seven R18-48 migrations remain excluded.

Rollback must be separately approved. Restoring the historic definition without a replacement would **reintroduce this metadata exposure**. Do not install the old definition automatically as a rollback.

## Finding B — actor binding in cleanup confirmed in live source

The matched live public.end_map_motion_sessions function binds a local actor variable to auth.uid, rejects missing identity and bad cleanup parameters, and deletes only forge_visibility.movement_sessions rows where the stored actor_id equals that actor and the map ID matches. It delegates preview cleanup to public.end_map_motion_previews, whose matched live source restricts deletion to actor_id=auth.uid and the same map. Both bound requested token/tool IDs and constrain total ID counts to 48.

That resolves the prior missing-simple-regex concern at the **source level**. It is not yet a P1-versus-P2 signed-session, revocation, race or collision test. No modification to either motion function is staged.

## Acceptance and operational boundaries

The twelve-case matrix records **NOT_RUN** statuses for anon, nonmember, DM, assigned/unassigned player, revoked member, fog-on/off, unknown UUID, map-combat RLS compatibility and foreign-player movement cleanup. The QA Supabase project bgydsamxypjslergfpla still has **0 registered migrations** and **0 public application tables**. Original project lwhwgqaunxbmvyndswze has 83 historical migrations; both databases and all deployment infrastructure were left unchanged.

**R18-104 source-only engineering verification PASS only after CI. Candidate application, signed authorization, QA bootstrap and production release remain NO_GO.**

Relevant Supabase documentation: https://supabase.com/docs/guides/database/functions
