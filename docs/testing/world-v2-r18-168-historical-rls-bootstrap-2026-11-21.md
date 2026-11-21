# B10-R18-168 — Historical RLS bootstrapping and current direct-policy cross-check

21 November 2026. Exact source-only child of R18-167 [draft PR #276](https://github.com/xuvenz-source/ttrpgsite/pull/276) at `e16320f5d15894a083f1724046fc314905012266`. **NO_GO**. This is a technical review of original stored migration SQL in memory, not a completed semantic certification or a hosted installation.

## Historical ordering hazard

The original `20261105110307 tabletop_foundation` builds seven core public tables (campaigns, membership, characters, map folders, maps, tokens and chat). The subsequent `20261105111843 tabletop_rls_permissions` enables RLS on seven core tables, defines the membership and DM helpers, and creates **19** policies. All 19 original policy declarations target `authenticated` and include a USING or WITH CHECK expression; none directly targets anon/PUBLIC. The later `20261105112628 restrict_player_character_visibility` drops `members view characters` and installs the narrower `owner or dm read characters` policy.

The SQL ordering means **a partially applied historical bootstrap must not be exposed to live/signed QA actors** between foundation table creation and the final security policies. Post-migration validation must confirm that no temporary open table grants, broad original policies, missing definer guards or pre-forward-repair RPC paths are available before admission. An interrupted replay should remain isolated and fail closed. This is an installation risk; no exploit is claimed in the currently completed original history.

## Read-only current original catalog comparison

Current original database checks show **31/31** public application tables with RLS enabled and **no** anon-selectable public tables; **77** public policies are present. In the selected core subset:

- `characters` SELECT policy `owner or dm read characters` currently combines campaign membership and owner/DM predicates. UPDATE has both USING and WITH CHECK, with membership and ownership/DM restrictions. This does **not** repair the separate privileged `can_edit_campaign_sheet` function bypass (#220), which operates as SECURITY DEFINER.
- `battle_maps` SELECT `published map or dm` now calls `can_view_campaign_map`, rather than trusting a local player-role flag.
- `map_tokens` SELECT `members view only observed tokens` calls both `can_view_campaign_map` and `can_observe_map_token`. Signed visibility and Realtime subscriptions still require QA tests.
- `campaign_members` SELECT policy is restricted to existing campaign members; no direct ordinary authenticated DELETE policy was found in prior live catalog checks. Server removal/invitation workflows remain separate blockers (#223/#229).
- `chat_messages` SELECT includes campaign membership/DM and map-view eligibility.
- `map_combats` SELECT still depends on current unguarded `is_map_fog_published` metadata status (#212) alongside campaign map authorization; R18-167's forward fix must preserve that policy's boolean API contract.

These are **policy source and current catalog observations**, not all-role signed authorization test outcomes. RLS-only safety can be bypassed by privileged RPCs, and all 67 authenticated-callable SECURITY DEFINER chains have not been approved.

## Engineering release order

1. Complete the 83 historical migrations' per-file semantic audit, source provenance, irreversible DML/trigger replay review, and the 67 privileged RPC security review.
2. Independently verify separate QA project and explicit owner QA-only bootstrap authorization. Keep QA API inaccessible to test accounts throughout baseline application and forward-repair transition.
3. Verify the entire final RLS/grants state, with no temporary broad readers or unaudited public function grants.
4. Apply only reviewed forward migrations; do not edit original applied history or install unapplied `staging/` SQL directly. Preserve secure recovery rather than reverting to a known vulnerable helper.
5. Run signed DM/P1/P2/revoked/outsider QA for direct tables, privileged APIs, fog/LOS, cross-campaign map, invitations, subscriptions and Storage. Do not release until all required cases and resource limits pass.

Current QA has no registered migrations, and this step makes **no** database, migration, app, merge, deployment or paid-infrastructure change. The AI lead performs the technical review as sole available reviewer; separate owner release/risk acceptance remains required.
