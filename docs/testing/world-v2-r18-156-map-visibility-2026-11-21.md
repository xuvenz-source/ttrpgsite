# B10-R18-156 — Map visibility, object-path binding and delegated authorization contract

**21 November 2026.** Exact green R18-155 draft PR #263 parent `b7eff8a085db90c2eaaff718dcc1c71e94feba3c`. No original/QA writes, migrations, runtime edits or deployment. **NO_GO.**

## Operator R155 sanitized evidence

The trusted operator-local R111 index29 report verified all 83 private migration file SHA-256 fingerprints and one historical Storage `SELECT TO authenticated` policy with `bucket_id`, `name`, `campaign_id`, `EXISTS`, `battle_maps`, and `can_view_campaign_map` references, no direct `auth.uid`, no literal TRUE, no OR in the target statement. It did **not** export the SQL or certify that the policy's join or function argument mapping is correct.

Index 29 is the **R111 priority-sorted docket position**, NOT chronological migration 29, and not the ordinal of the current live `storage.objects` policy.

## Fresh original database checks — read-only

A read-only catalog inspection identified the current Storage SELECT branch matching a `battle_maps` row's `storage_path` to the requested Storage object's `name`, with `can_view_campaign_map` invoked using that row's `campaign_id` and `id`. The `battle_maps` table has RLS enabled and its SELECT policy invokes that same helper.

The helper presently checks `auth.uid()`, current `campaign_members` membership for the supplied campaign, DM role or the player-specific effective map (`campaign_player_maps` override, otherwise the campaign's active map), and a non-null map ID. The helper runs `SECURITY DEFINER` with a bound search_path. Despite that privileged execution, each authorization result still needs signed, cross-campaign validation.

Live `battle_maps.storage_path` is NOT NULL and has a unique index; aggregate read-only checks found **zero duplicated storage-path groups and zero cross-campaign shared-path groups**. These observations are not proof that all future writes will preserve constraints or that old signed URLs become invalid.

Most importantly: the live policy contains a *same-record* path equality, and the helper receives the same map row's ID/campaign. That is materially stronger evidence than the R155 keyword classification. However, **we have not proved that historical index29 contains the exact same equality**, and the other permissive Storage SELECT policies can OR-authorize the same file. Index29 cannot be marked approved just from this live observation.

## R18-156 fictional PostgreSQL17 contract

The isolated test creates an invented `forge_test.visible_maps` catalog with globally unique storage paths, an active map per campaign and a player-specific override, plus a synthetic `synthetic_can_view_campaign_map` helper based on the read-only structural behavior (not copied historical SQL). It demonstrates:

- A campaign DM can read both own active and inactive map files, but not the other campaign.
- A player sees the active map only, or their assigned override, and never another campaign's map.
- A duplicate path under another campaign is rejected by the synthetic unique constraint.
- A stale/wrong-campaign map override alone does **not** grant foreign file access because the file policy must bind the requested file's canonical campaign and map.
- A purposely introduced permissive, **unbound** helper predicate can create a cross-campaign leak; removing the unsafe predicate restores denial. It is a fictional negative control, NOT evidence of a live exploit.
- Revocation removes fresh authorized access, unchanged invitation rejoin is blocked by the previously staged synthetic R120 tombstone, and DM reinstatement restores the assigned map.

This does not execute any original migration or validate real Supabase Auth, private Storage CDN, existing signed URL expiry, Realtime joined sockets, UI token movement or production. Player map override authorization on the actual site still needs live signed QA and precise definer call-chain review.

## Next local private check

The new stdlib-only `scripts/release/r156_private_map_binding.py` runs exclusively in the restricted Ubuntu workspace. It imports the previously pinned R154 and R155 auditors, verifies all 83 SHA-256 digests, selects R111 **docket index 29**, and prints a fixed set of booleans about whether its `battle_maps` alias uses the same `storage_path = objects.name` and `can_view_campaign_map(alias.campaign_id,alias.id)` patterns. It never prints migration names, raw SQL, paths or arbitrary identifiers, never contacts a database/network and never changes approvals. An `all_expected_binding_markers_present` result is only **lexical support**; it does not constitute semantic or independent approval. If the format is different, it safely reports false rather than inventing safety.

A pinned download/run command may be provided **only after green CI**. The operator should share only the sanitized JSON; no original SQL, R111 docket, credentials or signed URLs.

## Release handoff

The original 83 migration SQL files are intact but **none has independent security approval**. The original 67 authenticated-callable privileged function paths, other Storage policies, 18 real signed multi-actor QA cases, already-issued URLs, old joined Realtime subscriptions, external administrative membership writers and issues #220/#223/#229/#231 remain open. Owner's delegation to AI authorizes engineering assessment, not false certification. R127 final production signoff remains a separate owner gate.

**Status NO_GO:** source-only draft, no merge/deploy or paid infrastructure; original and QA remain unchanged. Next R18-157 interprets the sanitized historical map-binding result and determines what exact source-level follow-up is justified.
