# B10-R18-102 — Live privileged RPC permission inventory (NO_GO)

**17 Nov 2026 · direct parent R18-101 PR #203, SHA `7b5b38be2bd8dee99dba7765969e0c55a2f9c16b`. Source-only and read-only.**

## Exact live catalogue reconciled with provider warnings

The original Supabase `lwhwgqaunxbmvyndswze` is healthy. The current PostgreSQL catalogue has **85 `SECURITY DEFINER` functions in the `public` schema**, of which exactly **67 are callable by the `authenticated` role**. The Supabase `authenticated_security_definer_function_executable` adviser independently listed **67 warning findings**. Every one of those provider names and argument signatures matched the 67 selected live catalog rows, with no extra or missing function.

All **67** authenticated-callable functions are owned by the `postgres` role; all **67** have a configured **empty `search_path`**. **Zero** of those 67 are executable by the `anon` role or have an `EXECUTE` ACL granted through `PUBLIC`. The other **18** `public` SECURITY DEFINER functions are not directly executable by `authenticated` in the observed catalogue. The 67 warnings are **not** 67 confirmed exploits; these rights may be intentional game RPC entrypoints. Empty search path and absence of anonymous grants are encouraging but do not establish safe function execution.

Function-body **server-side text presence** counts across the 67 warnings: **60** contain direct `auth.uid()` or `auth.jwt()` tokens, **60** contain broad campaign/scope tokens, **31** contain fog/visibility tokens, and **44** contain movement/token tokens. All these regex results are heuristic. No function SQL definitions were returned to the conversation or committed to Git.

## Seven functions without direct Auth tokens

The [metadata-only indirect helper review](../../staging/world-v2-b10-r18-102-privileged-rpc-audit/indirect-auth-review.json) records probable helper calls for six of the seven (from regex name matching, **not** an authenticated call-graph proof). These are:
- `get_campaign_sheet_inventory` → `can_edit_campaign_sheet_inventory`
- `get_dm_map_npc_values` and `get_npc_token_values` → `is_campaign_dm`
- `patch_campaign_sheet_noninventory` → `can_edit_campaign_sheet`
- `preview_map_motion` → `forge_visibility.dispatch_movement_preview`
- `publish_map_environment` → `is_campaign_dm` and `forge_visibility.bump_tick`
- `is_map_fog_published` → no candidate application-helper call found by this simple regex search

Five named helpers were separately checked in read-only catalogue metadata. The movement preview dispatcher is in the private `forge_visibility` schema, not directly executable by signed-in users, and contains direct Auth and campaign-text markers. `is_campaign_dm` has direct Auth markers. None of these observations proves proper input-to-user authorization for **every path**.

The seven functions without broad campaign/scope words are `cancel_world_motion_v2`, `end_authorized_navigation_gesture`, `end_map_motion_previews`, `end_map_motion_sessions`, `get_world_visibility_v2`, `is_map_fog_published` and `preview_map_motion`. Overlap with no-direct-Auth functions is expected.

## Independent security acceptance tests still needed

Prioritize:
1. **Fog / sight isolation:** signed DM, P1, passive P2, and unauthorized account must never obtain another viewer's private `get_world_visibility_v2` or token/hidden fog state. The `is_map_fog_published` endpoint requires an explicit policy decision whether published status is safe to reveal to all authenticated accounts.
2. **Collision and movement:** `preview_map_motion` dispatcher plus all begin/advance/end/cancel sessions must reject cross-campaign, cross-player token/session IDs, blocked-wall moves, stale permission generations and fog-hidden positions. Reject changes after DM revokes rights, including rapid movement sequences.
3. **DM-only NPC and environment mutation:** `get_dm_map_npc_values`, `get_npc_token_values` and `publish_map_environment` must reject users who are not DM for the target campaign and avoid IDOR across maps.
4. **Campaign sheet controls:** `get_campaign_sheet_inventory` and `patch_campaign_sheet_noninventory` must validate exact sheet/campaign/source permissions, not merely a signed user token.
5. **Privileged helper safety:** trace full definitions and SQL call paths in a trusted private review; verify `SECURITY DEFINER` `search_path`, default and explicit `EXECUTE` grants, underlying table grants/RLS, error paths, and hidden data visibility before declaring any function safe.
6. **Revalidation:** compare provider security advisers with catalogue privileges after any separately authorized change. Retest real signed sessions; metadata-only flags and source-unit tests are insufficient.

Official guidance: [Supabase lint 0029](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable), [Database functions](https://supabase.com/docs/guides/database/functions). Separately, the original database still has 15 `rls_enabled_no_policy` informational findings and one leaked-password-protection warning from R18-101.

**R18-102 does not recover the 83 original historical SQL files, apply migration SQL, change grants, deploy QA or production, or claim signed multiplayer authorization testing.** The QA project `bgydsamxypjslergfpla` remains an empty, independent Free project. All gates stay **NO_GO**.
