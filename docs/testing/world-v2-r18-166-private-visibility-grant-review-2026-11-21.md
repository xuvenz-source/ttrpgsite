# B10-R18-166 — World V2 visibility and motion privileged-chain audit

**21 November 2026 | NO_GO | read-only original live catalog.** Exact child of all-green [R18-165 draft PR #273](https://github.com/xuvenz-source/ttrpgsite/pull/273) commit `1427f5bc5b0451491f9a5b972b0b7b62ef4bd68e`. No release writes or changes.

## Public entrypoints → private gate analysis

Twelve current function signatures, body sizes and MD5 fingerprints are pinned in `staging/world-v2-b10-r18-166-v2-visibility-private-grant-review/manifest.json`, six public and six in private `forge_world_v2`. Original bodies were inspected in memory; none are committed or echoed into GitHub/CI.

- `get_world_visibility_v2(p_map)` submits the signed `auth.uid()` as the viewer and requests persisted exploration. Its private `visibility_frame_v2` checks the requested map, actor/DM access and `viewer_on_map` role. The private `viewer_on_map` helper checks a current `campaign_members` row, the campaign's active map/player-specific map assignment, and returns a role or NULL; `visibility_frame_v2` checks that result for NULL before returning a frame. This is *source-level* current viewer authorization, not proof that stale Realtime subscriptions or issued signed assets are revoked.
- `preview_world_visibility_v2` and `preview_world_visibility_at_v2` accept a target viewer but enforce a campaign-DM check before delegating; both request `p_store_exploration = false`, avoiding a DM preview write to a player's exploration. The private frame additionally checks target viewer eligibility for the requested campaign/map. Signed cross-campaign DM, outsider and revoked-target QA remains NOT_RUN.
- `get_world_scene_v2` and `get_world_observer_cursor_v2` source paths use `can_view_campaign_map` rather than accepting client-side role claims as authority; signed map isolation remains NOT_RUN.
- `advance_world_motion_v2` delegates to private `advance_core_v2`; the inner code tests actor/session identity, `session_valid`, and permission-generation constraints. `session_valid` relies on current `can_view_campaign_map` and DM/ownership checks; observer publication and movement-vision notifications recheck session validity and target viewer eligibility. Current source structures are reassuring but do **not** establish load, races or signed session revocation behavior.

## Private-schema grants — newly documented hardening concern

Original PostgreSQL ACL inspection:
- `forge_world_v2`: **24** SECURITY DEFINER functions; zero direct authenticated/anonymous EXECUTE grants and **no** schema USAGE for either ordinary role.
- `forge_visibility`: **23** SECURITY DEFINER functions; **11** functions retain the default public EXECUTE ACL (including **7** SECURITY DEFINER); both ordinary roles lack schema USAGE. The current schema boundary prevents direct invocation by these roles, so **no current exploitable API exposure is claimed**. However, a future `GRANT USAGE`, exposed schema change, or newly privileged role could open access unexpectedly. Review a forward hardening migration to REVOKE explicit EXECUTE from PUBLIC/anon/authenticated on internal-only helpers after checking function dependencies. Do not grant schema USAGE to fix app permission issues.

This latent risk is tracked separately in [hardening issue #275](https://github.com/xuvenz-source/ttrpgsite/issues/275).\n\nThis risk is not interchangeable with existing issue #212's current exposed fog metadata oracle or issue #220's revoked character-owner vulnerability, both of which remain current release blockers.

## Fresh Supabase security advisor output

Security advisory notices currently include:
- 67 authenticated-callable public SECURITY DEFINER warnings ([linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). These are potential privilege surfaces, not 67 proven exploits.
- 15 RLS-on/no-policy info notices (mainly intentionally private tables plus registration limits; [guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). No automatic public policies should be created to clear an informational notice.
- One leaked-password-protection setting warning ([Supabase password guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Setting review is a separate owner/admin task if password authentication is enabled; not an excuse for unreviewed paid services or source changes.

## Release conditions

All new real signed DM/P1/P2/revoked/outsider QA outcomes remain NOT_RUN. Signed Storage URL bearers, stale Realtime subscriptions and the open membership revocation fixes are separate server/client security dependencies. The whole 83-history and 67-callable function audit is not complete. No production or QA SQL applied, no migration edits, no frontend runtime or deployment changes, no merge, no paid infrastructure.

AI lead remains the sole technical reviewer. Owner must separately approve any final QA/production release and residual single-reviewer process risk, but no additional reviewer is required to continue the audit.
